// POST /api/telemetry/heartbeat
//
// v0.7.15 — Per-poll desktop heartbeat. Every running install posts
// here ~every 30 s while the app is open. Two side effects:
//
//   1. Append a new `hb:{tsIso}:{rand}` row carrying the heartbeat
//      payload + anonymized client IP. Powers the records aggregate
//      (sessionsToday, avg-session-duration KPI, top features).
//   2. Bump the matching `inst:{installId}` row's lastSeenAt so the
//      activeNow / totalInstalls counters stay accurate even for
//      pre-v0.7.13 installs that never sent the install ping.
//   3. Update the per-code `code:{code}` projection so the admin
//      codes table can show accurate Last-Seen data via the
//      /telemetry/codes-last-seen endpoint.
//
// All three writes are best-effort; we still return 200 if any one
// fails so the desktop client never retries forever on a transient
// upstream blip.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  clientIpFrom,
  dbGet,
  dbSet,
  randSuffix,
  type CodeLastSeenRow,
  type HeartbeatRow,
  type InstallRow,
} from '@/lib/telemetry-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  installId: z.string().min(8).max(128),
  sessionId: z.string().min(8).max(128).optional(),
  code: z.string().max(64).optional(),
  appVersion: z.string().max(32).optional(),
  location: z.string().max(128).optional(),
  features: z.record(z.string(), z.unknown()).optional(),
})

export async function POST(req: NextRequest) {
  let parsed
  try {
    const body = await req.json()
    parsed = schema.safeParse(body)
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 })
  }
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 })
  }
  const p = parsed.data
  const now = new Date()
  const tsIso = now.toISOString()
  const ipAnon = clientIpFrom(req)
  try {
    // 1. Append heartbeat row.
    const hb: HeartbeatRow = {
      installId: p.installId,
      sessionId: p.sessionId ?? null,
      code: p.code ?? null,
      appVersion: p.appVersion ?? null,
      ipAnon,
      location: p.location ?? null,
      features: (p.features as Record<string, unknown> | undefined) ?? null,
      ts: tsIso,
    }
    await dbSet(`hb:${tsIso}:${randSuffix()}`, JSON.stringify(hb))

    // 2. Upsert install row's lastSeenAt.
    const instKey = `inst:${p.installId}`
    const existingInst = await dbGet(instKey).catch(() => null)
    let inst: InstallRow
    if (existingInst) {
      try {
        const prev = JSON.parse(existingInst) as InstallRow
        inst = {
          ...prev,
          lastSeenAt: tsIso,
          appVersion: p.appVersion ?? prev.appVersion ?? null,
        }
      } catch {
        inst = {
          installId: p.installId,
          firstSeenAt: tsIso,
          lastSeenAt: tsIso,
          appVersion: p.appVersion ?? null,
        }
      }
    } else {
      inst = {
        installId: p.installId,
        firstSeenAt: tsIso,
        lastSeenAt: tsIso,
        appVersion: p.appVersion ?? null,
      }
    }
    await dbSet(instKey, JSON.stringify(inst)).catch(() => undefined)

    // 3. Per-code last-seen projection (only when a code is present;
    // not every heartbeat carries one — pre-activation pings won't).
    if (p.code) {
      const codeRow: CodeLastSeenRow = {
        code: p.code,
        lastSeenAt: tsIso,
        lastSeenLocation: p.location ?? null,
        lastSeenIp: ipAnon,
        installId: p.installId,
      }
      await dbSet(`code:${p.code}`, JSON.stringify(codeRow)).catch(() => undefined)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[telemetry/heartbeat] failed', err)
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }
}
