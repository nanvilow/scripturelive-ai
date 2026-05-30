// POST /api/telemetry/usage
//
// v0.7.265 — CLOUD accumulator for per-user Deepgram AI-detection
// usage. Each desktop install streams audio to Deepgram in the
// renderer; its local /api/telemetry/deepgram-usage route resolves the
// activation code currently powering the subscription and forwards the
// streamed-ms delta HERE (to the cloud), where we add it to the
// per-code ledger total. The admin dashboard reads that total and
// multiplies by the owner-set price/min to show estimated cost per
// user.
//
// Single-accumulator model: only the cloud increments; the cross-device
// admin merge takes MAX so secondary admin devices never regress it.
// Unauthenticated like the heartbeat (same trust model + best-effort);
// addDeepgramUsage no-ops for codes not in the ledger and caps each
// report at 30 minutes.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { addDeepgramUsage } from '@/lib/licensing/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  installId: z.string().min(1).max(128).optional(),
  code: z.string().min(1).max(64),
  // Upper bound is generous (6h) — addDeepgramUsage applies the real
  // 30-min-per-report cap; this just rejects obviously bogus payloads.
  deltaMs: z.number().positive().max(6 * 60 * 60 * 1000),
})

export async function POST(req: NextRequest) {
  let parsed
  try {
    parsed = schema.safeParse(await req.json())
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 })
  }
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 })
  }
  try {
    const ok = addDeepgramUsage(parsed.data.code, parsed.data.deltaMs)
    return NextResponse.json({ ok })
  } catch (err) {
    console.error('[telemetry/usage] failed', err)
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }
}
