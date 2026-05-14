// v0.7.5 — Activity-gated trial counter (Apr 29, 2026).
//
// The renderer pings this endpoint every few seconds while the mic is
// actively detecting (and once on stop, with the final partial delta).
// We add `deltaMs` into the persisted `trialMsUsed`; when the cumulative
// total exceeds the install's trialDurationMs the next /status call
// will return state: 'trial_expired' and lockdown kicks in.
//
// This endpoint is intentionally UNAUTHENTICATED — the trial timer is
// per-install (not per-user), and there's no login flow before trial
// expiry. The worst a malicious caller can do is consume their OWN
// trial faster, which is fine.
//
// Body: { deltaMs: number } — milliseconds elapsed since the last tick
// Resp: { ok: true, status: SubscriptionStatus }

import { NextRequest, NextResponse } from 'next/server'
import { addTrialUsage } from '@/lib/licensing/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
  }
  const deltaMs = Number((body as Record<string, unknown>)?.deltaMs)
  if (!Number.isFinite(deltaMs) || deltaMs < 0) {
    return NextResponse.json({ error: 'deltaMs must be a non-negative number' }, { status: 400 })
  }
  const status = addTrialUsage(deltaMs)
  return NextResponse.json({ ok: true, status })
}
