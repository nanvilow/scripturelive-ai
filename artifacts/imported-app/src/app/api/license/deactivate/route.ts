// v0.5.48 — POST /api/license/deactivate
// v0.7.11 — accepts { transfer?: boolean }; transfer=true preserves the
//           remaining time and returns the activation code so the
//           customer can move the license to a new install.
//
// Customer-side helper. Two modes:
//
//   1. transfer = false (default, legacy behaviour kept for
//      lock-overlay's "Cancel Subscription" button): clears the
//      active subscription on this device. The activation code stays
//      isUsed:true; once consumed it's spent. Use when the customer
//      truly wants to abandon this license (e.g. lock overlay
//      cleanup after an aborted activation attempt).
//
//   2. transfer = true: invokes transferActiveSubscription(), which
//      flips the activation row back to isUsed:false, sets
//      transferredAt, and PRESERVES subscriptionExpiresAt so the
//      next install inherits the original remaining time. Returns
//      the activation code in the response so the UI can show it
//      with a Copy button. Refuses for master codes (already valid
//      everywhere) and already-expired subs (no time to transfer).

import { NextRequest, NextResponse } from 'next/server'
import {
  deactivateSubscription,
  transferActiveSubscription,
} from '@/lib/licensing/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // Accept both empty body (legacy callers) and JSON body.
  let transfer = false
  try {
    const body = (await req.json().catch(() => null)) as
      | { transfer?: boolean }
      | null
    transfer = body?.transfer === true
  } catch {
    // No body — legacy lock-overlay path. Defaults to plain deactivate.
  }

  if (transfer) {
    try {
      const result = transferActiveSubscription()
      return NextResponse.json(
        {
          ok: true,
          transferred: true,
          status: result.status,
          code: result.code,
          expiresAt: result.expiresAt,
          msLeft: result.msLeft,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      )
    } catch (e) {
      return NextResponse.json(
        {
          ok: false,
          transferred: false,
          error: e instanceof Error ? e.message : 'Failed to transfer subscription',
        },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      )
    }
  }

  const status = deactivateSubscription()
  return NextResponse.json(
    { ok: true, transferred: false, status },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
