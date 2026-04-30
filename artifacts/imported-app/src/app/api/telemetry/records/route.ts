// GET /api/telemetry/records
//
// v0.7.15 — Aggregate that powers the operator's admin Records
// dashboard. Replaces the dead api-server endpoint that v0.7.13
// shipped against. Same response shape so the existing admin
// component renders unchanged.
//
// Output:
//   {
//     ok: boolean,
//     generatedAt: ISO,
//     activeNow: number,         // installs lastSeenAt within 5 min
//     totalInstalls: number,     // distinct install IDs seen ever
//     sessionsToday: number,     // distinct installIds with ≥1 hb today
//     avgSessionMs?: number,     // avg(maxTs - minTs) per
//                                // (installId, sessionId), today,
//                                // sessions with ≥2 heartbeats
//     errorsToday: number,
//     topFeatures: [{name,count}],
//     recentErrors: [{...}],     // last 24h, max 20
//     systemStatus: {server,ai,ndi},
//   }
//
// Auth: master-key header (gate at telemetry-store.masterKeyOK).

import { NextRequest, NextResponse } from 'next/server'
import {
  dbGet,
  dbList,
  masterKeyOK,
  type ErrorRow,
  type HeartbeatRow,
  type InstallRow,
} from '@/lib/telemetry-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RecordsResponse {
  ok: boolean
  generatedAt: string
  activeNow: number
  totalInstalls: number
  sessionsToday: number
  avgSessionMs?: number
  errorsToday: number
  topFeatures: { name: string; count: number }[]
  /** v0.7.16 — Errors EXCLUDING errorType==='user_report'. Those go
   *  to userReports below so the admin can see them as their own
   *  panel (not buried with system errors). */
  recentErrors: {
    id: number | string
    errorType: string
    message: string
    ts: string
    installId: string
    code?: string
    appVersion?: string
  }[]
  /** v0.7.16 — User-submitted "Report an issue" entries from the
   *  in-app Report button + lock-overlay. Last 24 h, max 50.
   *  Sorted desc (newest first). */
  userReports: {
    id: number | string
    message: string
    ts: string
    installId: string
    code?: string
    appVersion?: string
  }[]
  /** v0.7.16 — Top 100 installs by lastSeenAt desc. Powers the
   *  "Active now" + "Total installs" drilldown dialogs. Active set
   *  is filtered client-side via lastSeenAt within 5 min of the
   *  generatedAt timestamp. */
  installs: {
    installId: string
    firstSeenAt: string
    lastSeenAt: string
    appVersion?: string | null
    os?: string | null
    countryCode?: string | null
  }[]
  /** v0.7.16 — Today's session aggregates derived from heartbeats.
   *  Sorted by endTs desc (most recently active first). Powers the
   *  Sessions Today + Avg Session drilldown dialogs. */
  sessionsList: {
    installId: string
    sessionId: string
    startTs: string
    endTs: string
    durationMs: number
    hbCount: number
  }[]
  systemStatus: {
    server: 'ok' | 'idle' | 'down'
    ai: 'ok' | 'idle' | 'down'
    ndi: 'ok' | 'idle' | 'down'
  }
  error?: string
}

async function safeParse<T>(raw: string | null): Promise<T | null> {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/** Bounded-concurrency map. REPLIT_DB doesn't enjoy thousands of
 *  parallel sockets opening at once; 16 is empirically smooth for
 *  the operator's volumes. */
async function pMap<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++
      if (i >= items.length) return
      out[i] = await fn(items[i]!)
    }
  })
  await Promise.all(workers)
  return out
}

export async function GET(req: NextRequest) {
  if (!masterKeyOK(req)) {
    return NextResponse.json({ ok: false, error: 'auth' }, { status: 401 })
  }
  const now = new Date()
  const fiveMinAgo = now.getTime() - 5 * 60 * 1000
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const dayAgo = now.getTime() - 24 * 60 * 60 * 1000

  try {
    // ── 1. Installs (active-now + total-installs) ─────────────────
    const instKeys = await dbList('inst:')
    const installs = await pMap(instKeys, 16, async (k) => {
      const row = await safeParse<InstallRow>(await dbGet(k).catch(() => null))
      return row
    })
    const validInstalls = installs.filter((r): r is InstallRow => !!r)
    const activeNow = validInstalls.filter((r) => {
      const t = Date.parse(r.lastSeenAt)
      return Number.isFinite(t) && t >= fiveMinAgo
    }).length
    const totalInstalls = validInstalls.length

    // ── 2. Heartbeats (sessions today, top features, avg session) ──
    const hbKeys = await dbList('hb:')
    // Filter by ts in the key (cheap) before fetching the body.
    const todayHbKeys = hbKeys.filter((k) => {
      const ts = k.slice(3, k.lastIndexOf(':'))
      return Date.parse(ts) >= todayStart
    })
    const heartbeats = await pMap(todayHbKeys, 16, async (k) => {
      return await safeParse<HeartbeatRow>(await dbGet(k).catch(() => null))
    })
    const validHbs = heartbeats.filter((r): r is HeartbeatRow => !!r)

    const distinctInstallsToday = new Set<string>()
    const featureCounts: Record<string, number> = {}
    // Map keyed by `${installId}::${sessionId}` → { min, max, count }
    const sessions = new Map<
      string,
      { min: number; max: number; count: number }
    >()

    for (const h of validHbs) {
      distinctInstallsToday.add(h.installId)
      // Top features
      if (h.features) {
        for (const [k, v] of Object.entries(h.features)) {
          const n =
            typeof v === 'number' ? v : typeof v === 'boolean' && v ? 1 : 0
          if (n > 0) featureCounts[k] = (featureCounts[k] ?? 0) + n
        }
      }
      // Per-session aggregates (only when sessionId present)
      if (h.sessionId) {
        const tMs = Date.parse(h.ts)
        if (!Number.isFinite(tMs)) continue
        const key = `${h.installId}::${h.sessionId}`
        const cur = sessions.get(key)
        if (cur) {
          if (tMs < cur.min) cur.min = tMs
          if (tMs > cur.max) cur.max = tMs
          cur.count += 1
        } else {
          sessions.set(key, { min: tMs, max: tMs, count: 1 })
        }
      }
    }

    const sessionsToday = distinctInstallsToday.size
    const topFeatures = Object.entries(featureCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }))

    let avgSessionMs: number | undefined
    {
      const completed = [...sessions.values()].filter((s) => s.count >= 2)
      if (completed.length > 0) {
        const totalMs = completed.reduce(
          (sum, s) => sum + Math.max(0, s.max - s.min),
          0,
        )
        avgSessionMs = Math.round(totalMs / completed.length)
      }
    }

    // ── 3. Errors (today count + recent 24h list) ──────────────────
    const errKeys = await dbList('err:')
    const dayAgoKeys = errKeys.filter((k) => {
      const ts = k.slice(4, k.lastIndexOf(':'))
      return Date.parse(ts) >= dayAgo
    })
    const errs = await pMap(dayAgoKeys, 16, async (k) => {
      return await safeParse<ErrorRow>(await dbGet(k).catch(() => null))
    })
    const validErrs = errs.filter((r): r is ErrorRow => !!r)

    const errorsToday = validErrs.filter(
      (r) => Date.parse(r.ts) >= todayStart,
    ).length

    // v0.7.16 — Split user-submitted reports out of the system error
    // stream so the admin Records dashboard can display them in their
    // own panel (and so a noisy SMTP loop can't push real customer
    // complaints off the visible list).
    const sortedErrs = validErrs.sort(
      (a, b) => Date.parse(b.ts) - Date.parse(a.ts),
    )
    const recentErrors = sortedErrs
      .filter((e) => e.errorType !== 'user_report')
      .slice(0, 20)
      .map((e) => ({
        id: e.id,
        errorType: e.errorType,
        message: e.message,
        ts: e.ts,
        installId: e.installId.slice(0, 8),
        code: e.code ?? undefined,
        appVersion: e.appVersion ?? undefined,
      }))
    const userReports = sortedErrs
      .filter((e) => e.errorType === 'user_report')
      .slice(0, 50)
      .map((e) => ({
        id: e.id,
        message: e.message,
        ts: e.ts,
        installId: e.installId.slice(0, 8),
        code: e.code ?? undefined,
        appVersion: e.appVersion ?? undefined,
      }))

    // v0.7.16 — Top 100 installs by lastSeenAt (most-recently-seen
    // first). Also surfaces firstSeenAt + appVersion + os to power
    // the drilldown dialogs the operator opens by clicking on the
    // Active Now / Total Installs KPI cards.
    const installsList = validInstalls
      .slice()
      .sort(
        (a, b) =>
          (Date.parse(b.lastSeenAt) || 0) -
          (Date.parse(a.lastSeenAt) || 0),
      )
      .slice(0, 100)
      .map((r) => ({
        installId: r.installId.slice(0, 12),
        firstSeenAt: r.firstSeenAt,
        lastSeenAt: r.lastSeenAt,
        appVersion: r.appVersion ?? null,
        os: r.os ?? null,
        countryCode: r.countryCode ?? null,
      }))

    // v0.7.16 — Per-session list (today only, all sessions including
    // single-poll ones — the avg KPI excludes 1-poll sessions but
    // the drilldown shows everything so the operator can tell the
    // difference between "5-min sessions" and "instant abandons").
    const sessionsList = [...sessions.entries()]
      .map(([key, agg]) => {
        const [installId, sessionId] = key.split('::')
        return {
          installId: (installId ?? 'unknown').slice(0, 12),
          sessionId: (sessionId ?? '').slice(0, 12),
          startTs: new Date(agg.min).toISOString(),
          endTs: new Date(agg.max).toISOString(),
          durationMs: Math.max(0, agg.max - agg.min),
          hbCount: agg.count,
        }
      })
      .sort((a, b) => Date.parse(b.endTs) - Date.parse(a.endTs))
      .slice(0, 200)

    const body: RecordsResponse = {
      ok: true,
      generatedAt: now.toISOString(),
      activeNow,
      totalInstalls,
      sessionsToday,
      avgSessionMs,
      errorsToday,
      topFeatures,
      recentErrors,
      userReports,
      installs: installsList,
      sessionsList,
      systemStatus: {
        server: 'ok',
        ai: activeNow > 0 ? 'ok' : 'idle',
        ndi: activeNow > 0 ? 'ok' : 'idle',
      },
    }
    return NextResponse.json(body, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    console.error('[telemetry/records] failed', err)
    return NextResponse.json(
      { ok: false, error: 'internal' },
      { status: 500 },
    )
  }
}
