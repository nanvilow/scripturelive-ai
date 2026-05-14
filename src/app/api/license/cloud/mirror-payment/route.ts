// v0.7.145 — Cloud-side endpoint: accept a payment-code record from
// a remote customer install and append it to the cloud's ledger so
// admin's "Recent Payments" panel sees it.
//
// Lives ONLY on the cloud deployment at scripturelive.replit.app.
// Customer installs fire this from src/lib/licensing/cloud-sync.ts
// every time createPaymentCode succeeds locally.
//
// Body: { installId: string, payment: PaymentCodeRecord }
// Resp: { ok: true, merged: boolean }
//
// Idempotent by payment.ref — re-mirroring a previously seen ref is
// a no-op (merged=false). Status is forced back to WAITING_PAYMENT
// inside the merge helper so a customer-side install can't trick the
// cloud into thinking a payment is already PAID.

import { NextRequest, NextResponse } from 'next/server'
import { mergePaymentFromCustomer } from '@/lib/licensing/storage'
import type { PaymentCodeRecord } from '@/lib/licensing/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    let body: unknown
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 }) }
    const b = body as Record<string, unknown>
    const installId = String(b?.installId ?? '').trim()
    const payment = b?.payment as PaymentCodeRecord | undefined
    if (!installId) return NextResponse.json({ error: 'installId required' }, { status: 400 })
    if (!payment || typeof payment !== 'object' || !payment.ref) {
      return NextResponse.json({ error: 'payment.ref required' }, { status: 400 })
    }
    const result = mergePaymentFromCustomer(payment, installId)
    return NextResponse.json(result)
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[cloud/mirror-payment] unhandled error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Cloud mirror failed' },
      { status: 500 },
    )
  }
}
