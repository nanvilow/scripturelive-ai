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
    const totalInstalls = validInstalls.length

    // ── 2. Heartbeats (sessions today, top features, avg session) ──
    const hbKeys = await dbList('hb:')
    // Filter by ts in the key (cheap) before fetching the body.
    //
    // v0.7.17 — Use min(todayStart, fiveMinAgo) as the cutoff so
    // the activeNow KPI doesn't under-count in the first 5 min
    // after midnight. Without this, a heartbeat that landed at
    // 23:58 yesterday would be excluded at 00:01 today even
    // though it's well within the 5-minute "active" window.
    const hbCutoffMs = Math.min(todayStart, fiveMinAgo)
    const recentHbKeys = hbKeys.filter((k) => {
      const ts = k.slice(3, k.lastIndexOf(':'))
      return Date.parse(ts) >= hbCutoffMs
    })
    const heartbeats = await pMap(recentHbKeys, 16, async (k) => {
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
    // v0.7.17 — Per-install MAX heartbeat timestamp + most recent
    // heartbeat metadata (appVersion). The activeNow KPI and the
    // installsList drilldown both prefer this signal over the
    // inst:* row's lastSeenAt, because the heartbeat write
    // (`hb:{ts}:{rand}`) is a fresh key that always lands, while
    // the inst:* upsert is a read-modify-write that can lose
    // updates under concurrent load. Symptom before this fix:
    // active-now KPI under-counted, App ver column showed the
    // version from the install ping rather than from the most
    // recent heartbeat (so a client that upgraded mid-session
    // appeared stuck on the old version).
    const lastHbMs = new Map<string, number>()
    const lastHbAppVersion = new Map<string, string>()

    for (const h of validHbs) {
      const tMs = Date.parse(h.ts)
      // v0.7.17 — Heartbeat list now includes the prior day's
      // last-5-min window for accurate post-midnight activeNow,
      // so gate the today-only aggregates (distinctInstallsToday,
      // featureCounts, sessions) on the heartbeat actually
      // landing in today's date range. lastHbMs is intentionally
      // NOT gated — it powers the 5-minute activeNow window.
      const isToday = Number.isFinite(tMs) && tMs >= todayStart
      if (isToday) distinctInstallsToday.add(h.installId)
      if (Number.isFinite(tMs)) {
        const cur = lastHbMs.get(h.installId) ?? 0
        if (tMs > cur) {
          lastHbMs.set(h.installId, tMs)
          if (h.appVersion) lastHbAppVersion.set(h.installId, h.appVersion)
        }
      }
      // Top features (today only)
      if (isToday && h.features) {
        for (const [k, v] of Object.entries(h.features)) {
          const n =
            typeof v === 'number' ? v : typeof v === 'boolean' && v ? 1 : 0
          if (n > 0) featureCounts[k] = (featureCounts[k] ?? 0) + n
        }
      }
      // Per-session aggregates (today only, only when sessionId present)
      if (isToday && h.sessionId) {
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

    // v0.7.17 — activeNow = distinct installs whose effective
    // last-activity (max of inst:lastSeenAt and most-recent
    // hb.ts) is within the 5 min window. Counting via the union
    // catches both:
    //   (a) installs that just sent the install ping but haven't
    //       heartbeat yet (only inst:lastSeenAt is recent), and
    //   (b) installs whose inst:* upsert lost a write but whose
    //       hb:* row landed (only hb.ts is recent).
    // The previous implementation only checked (a) which is why
    // the KPI under-counted active customers under load.
    const activeIds = new Set<string>()
    for (const [installId, ms] of lastHbMs) {
      if (ms >= fiveMinAgo) activeIds.add(installId)
    }
    for (const r of validInstalls) {
      const t = Date.parse(r.lastSeenAt)
      if (Number.isFinite(t) && t >= fiveMinAgo) activeIds.add(r.installId)
    }
    const activeNow = activeIds.size

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
    //
    // v0.7.17 — Use the EFFECTIVE last-seen timestamp (max of the
    // inst:* row's lastSeenAt and the most recent hb.ts seen
    // today) for both sorting AND the Last seen column the admin
    // sees. Same fallback for App ver: prefer the most recent
    // heartbeat's version so a customer who upgrades mid-session
    // doesn't show the stale version they had at install time.
    // Without this, when the inst:* upsert lost a write under
    // load, the dashboard would show "Last seen 2h ago" for an
    // install that was actively heartbeating right now.
    const installsList = validInstalls
      .slice()
      .map((r) => {
        const instMs = Date.parse(r.lastSeenAt) || 0
        const hbMs = lastHbMs.get(r.installId) ?? 0
        const effectiveMs = Math.max(instMs, hbMs)
        const effectiveLastSeenAt = effectiveMs > 0
          ? new Date(effectiveMs).toISOString()
          : r.lastSeenAt
        const effectiveAppVersion =
          (hbMs > instMs && lastHbAppVersion.get(r.installId)) ||
          r.appVersion ||
          lastHbAppVersion.get(r.installId) ||
          null
        return {
          installId: r.installId.slice(0, 12),
          firstSeenAt: r.firstSeenAt,
          lastSeenAt: effectiveLastSeenAt,
          appVersion: effectiveAppVersion,
          os: r.os ?? null,
          countryCode: r.countryCode ?? null,
          _sortMs: effectiveMs,
        }
      })
      .sort((a, b) => b._sortMs - a._sortMs)
      .slice(0, 100)
      .map(({ _sortMs: _, ...rest }) => rest)

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
