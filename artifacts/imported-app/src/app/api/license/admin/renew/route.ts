// v0.7.0 — Admin: renew (extend) an activation code from the
// dashboard. For a USED code we add `addDays` to the existing
// subscriptionExpiresAt (or to "now" if already expired) so the
// customer instantly sees more time. For a NEVER-USED code we
// simply increase the granted day count so first activation
// produces the larger window. Renewal also lifts any prior
// cancel/soft-delete — clearly the operator wants the code live.
//
// Body: { code: string, addDays: number }
// Resp: { ok: true, code, subscriptionExpiresAt?, days } | { error }

import { NextRequest, NextResponse } from 'next/server'
import { renewActivationByCode } from '@/lib/licensing/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
  }
  const code = String((body as Record<string, unknown>)?.code ?? '').trim()
  const addDaysRaw = (body as Record<string, unknown>)?.addDays
  const addDays = Number(addDaysRaw)
  if (!code) return NextResponse.json({ error: 'code is required' }, { status: 400 })
  if (!Number.isFinite(addDays) || addDays <= 0 || addDays > 36500) {
    return NextResponse.json({ error: 'addDays must be a positive number (1..36500)' }, { status: 400 })
  }
  const updated = renewActivationByCode(code, addDays)
  if (!updated) return NextResponse.json({ error: 'No activation with that code' }, { status: 404 })
  return NextResponse.json({
    ok: true,
    code: updated.code,
    subscriptionExpiresAt: updated.subscriptionExpiresAt,
    days: updated.days,
  })
}
