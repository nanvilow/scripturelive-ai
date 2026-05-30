// POST /api/telemetry/deepgram-usage
//
// v0.7.265 — LOCAL forwarder for per-user Deepgram usage. The renderer
// (use-deepgram-streaming.ts) measures how long the Deepgram socket
// stays open and POSTs the streamed-ms delta here, same-origin (no
// CORS). This server-side route resolves the activation code currently
// powering THIS device's subscription and forwards the delta to the
// cloud accumulator (/api/telemetry/usage) via telemetry-client. We
// resolve the code server-side so the renderer never has to know it,
// and we only report when a real activation code is active (trial usage
// can't be attributed to any ledger row).

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getFile } from '@/lib/licensing/storage'
import { reportDeepgramUsage } from '@/lib/licensing/telemetry-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  ms: z.number().positive().max(6 * 60 * 60 * 1000),
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
    const file = getFile()
    const code = file.activeSubscription?.activationCode
    if (code) {
      void reportDeepgramUsage({
        installId: file.installId,
        code,
        deltaMs: parsed.data.ms,
      })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[telemetry/deepgram-usage] failed', err)
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }
}
