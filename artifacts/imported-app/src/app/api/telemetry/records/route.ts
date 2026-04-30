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
  recentErrors: {
    id: number | string
    errorType: string
    message: string
    ts: string
    installId: string
    code?: string
    appVersion?: string
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

    const recentErrors = validErrs
      .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
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
