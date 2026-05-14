// POST /api/telemetry/codes-last-seen
//
// v0.7.15 — Admin batch endpoint. The operator's admin Codes tab
// posts a list of activation codes (up to 500 per call) and gets
// back the most-recent heartbeat metadata for each. Powers the
// "Last seen" column in the codes table — accurate even for codes
// activated on customer PCs the operator's own machine has never
// directly heard from.
//
// Auth: master-key header (delegated upstream — see telemetry-store
// masterKeyOK). The operator's local /api/license/admin/list route
// proxies to here with the install's master code.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { dbGet, masterKeyOK, type CodeLastSeenRow } from '@/lib/telemetry-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  codes: z.array(z.string().min(1).max(64)).max(500),
})

export async function POST(req: NextRequest) {
  if (!masterKeyOK(req)) {
    return NextResponse.json({ ok: false, error: 'auth' }, { status: 401 })
  }
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
  const codes = parsed.data.codes
  if (codes.length === 0) {
    return NextResponse.json({ ok: true, codes: {} })
  }
  try {
    const out: Record<
      string,
      { lastSeenAt: string; lastSeenLocation?: string; lastSeenIp?: string }
    > = {}
    // Parallel reads — REPLIT_DB tolerates moderate concurrency well
    // and the operator's caller batches at most 500 codes per request.
    await Promise.all(
      codes.map(async (code) => {
        try {
          const raw = await dbGet(`code:${code}`)
          if (!raw) return
          const row = JSON.parse(raw) as CodeLastSeenRow
          out[code] = {
            lastSeenAt: row.lastSeenAt,
            lastSeenLocation: row.lastSeenLocation ?? undefined,
            lastSeenIp: row.lastSeenIp ?? undefined,
          }
        } catch {
          // best-effort — skip malformed rows
        }
      }),
    )
    return NextResponse.json({ ok: true, codes: out })
  } catch (err) {
    console.error('[telemetry/codes-last-seen] failed', err)
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }
}
