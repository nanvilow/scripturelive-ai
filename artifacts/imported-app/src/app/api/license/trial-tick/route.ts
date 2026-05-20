// v0.7.194 — No-op trial tick endpoint.
//
// Pre-v0.7.194 this endpoint added `deltaMs` of mic-listening time
// into the persisted `trialMsUsed`. The trial model was activity-
// gated: only seconds the user was actively detecting consumed the
// trial budget; refresh / overnight wait / never opening AI Detection
// did NOT consume it.
//
// v0.7.194 changes the trial to a wall-clock 72-hour window from
// firstLaunchAt — the countdown runs continuously regardless of
// usage. `trialMsUsed` is no longer consulted by computeStatus().
//
// We keep this endpoint as a 200-returning no-op for backward
// compatibility: any old desktop build still pinging this URL gets
// a clean response and the server simply returns the current
// wall-clock status. New builds (v0.7.194+) stop pinging entirely
// (see license-provider.tsx — the activity-tick effect was replaced
// with a 60-second status poller).
//
// Body: { deltaMs: number } — accepted but ignored
// Resp: { ok: true, status: SubscriptionStatus }

import { NextRequest, NextResponse } from 'next/server'
import { computeStatus } from '@/lib/licensing/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest) {
  // Body intentionally not parsed — any payload is acceptable and
  // ignored. We always return the current wall-clock status so old
  // clients can still update their UI from the response.
  const status = computeStatus()
  return NextResponse.json({ ok: true, status })
}
