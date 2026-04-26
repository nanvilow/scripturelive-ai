// v0.5.53 — Admin-only: remove a stale or test payment row from the
// Recent Payments table. We do NOT cascade into activations because a
// confirmed payment may have already minted (and emailed) a code; the
// admin can delete the activation row separately if they really want
// the entire history gone.
//
// Body: { ref: string }
// Resp: { ok: true } | { error }

import { NextRequest, NextResponse } from 'next/server'
import { deletePaymentByRef } from '@/lib/licensing/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
  }
  const ref = String((body as Record<string, unknown>)?.ref ?? '').trim()
  if (!ref) return NextResponse.json({ error: 'ref is required' }, { status: 400 })
  const removed = deletePaymentByRef(ref)
  if (!removed) return NextResponse.json({ error: 'No payment with that ref' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
