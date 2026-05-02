// v0.5.53 — Admin-only: remove an activation code from the Recent
// Activations table. Useful for clearing test rows or codes that
// were minted to the wrong customer. The active subscription on
// THIS install is unaffected unless `permanent` is true and the
// row was already in the bin.
//
// v0.7.0 — Default behavior is now SOFT-DELETE (move to 7-day bin)
// per operator request: "Store all deleted code in the bin for 1
// week until maybe I want to delete it." Pass `permanent: true` to
// force a hard delete (used by the bin's "Delete forever" action).
//
// Body: { code: string, permanent?: boolean }
// Resp: { ok: true, mode: 'soft'|'hard' } | { error }

import { NextRequest, NextResponse } from 'next/server'
import { deleteActivationByCode, softDeleteActivationByCode } from '@/lib/licensing/storage'
import { requireAdmin } from '@/lib/licensing/admin-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const guard = requireAdmin(req)
  if (guard) return guard
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
  }
  const code = String((body as Record<string, unknown>)?.code ?? '').trim()
  const permanent = (body as Record<string, unknown>)?.permanent === true
  if (!code) return NextResponse.json({ error: 'code is required' }, { status: 400 })
  if (permanent) {
    const removed = deleteActivationByCode(code)
    if (!removed) return NextResponse.json({ error: 'No activation with that code' }, { status: 404 })
    return NextResponse.json({ ok: true, mode: 'hard' as const })
  }
  const ok = softDeleteActivationByCode(code)
  if (!ok) return NextResponse.json({ error: 'No activation with that code' }, { status: 404 })
  return NextResponse.json({ ok: true, mode: 'soft' as const })
}
