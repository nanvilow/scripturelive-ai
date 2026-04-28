// v0.7.0 — Admin: cancel an activation code from the dashboard.
// Cancelled codes refuse to activate and the active subscription
// using them (if any) is killed immediately so the user drops back
// to the trial state on the next status poll.
//
// Body: { code: string, reason?: string }
// Resp: { ok: true } | { error }

import { NextRequest, NextResponse } from 'next/server'
import { cancelActivationByCode } from '@/lib/licensing/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
  }
  const code = String((body as Record<string, unknown>)?.code ?? '').trim()
  const reason = String((body as Record<string, unknown>)?.reason ?? '').trim()
  if (!code) return NextResponse.json({ error: 'code is required' }, { status: 400 })
  const updated = cancelActivationByCode(code, reason || undefined)
  if (!updated) return NextResponse.json({ error: 'No activation with that code' }, { status: 404 })
  return NextResponse.json({ ok: true, code: updated.code, cancelledAt: updated.cancelledAt })
}
