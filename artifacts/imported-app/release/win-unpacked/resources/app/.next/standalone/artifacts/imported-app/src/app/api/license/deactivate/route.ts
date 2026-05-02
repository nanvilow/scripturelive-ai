// v0.5.48 — POST /api/license/deactivate
// v0.7.11 — accepts { transfer?: boolean }; transfer=true preserves the
//           remaining time and returns the activation code so the
//           customer can move the license to a new install.
// v0.7.12 — Both modes are now LOSSLESS: deactivateSubscription()
//           also flips the row back to isUsed:false with transferredAt
//           set (same shape transferActiveSubscription produces), so
//           the customer can re-enter the same code in any "Enter
//           activation code" field on this or another PC and have
//           their remaining time restored. The only difference between
//           the two modes is whether the activation code is returned
//           in the response body for display.
//
// Customer-side helper. Two modes:
//
//   1. transfer = false (default, used by lock-overlay's "Cancel
//      Subscription" and Settings' "Deactivate on this PC"): clears
//      the active subscription AND releases the activation row so it
//      can be re-entered later. Does NOT echo the code back — the
//      customer is expected to remember / look it up themselves.
//
//   2. transfer = true: invokes transferActiveSubscription(), which
//      releases the row identically AND returns the activation code
//      in the response so the UI can show it with a Copy button.
//      Refuses for master codes (already valid everywhere) and
//      already-expired subs (no time to transfer).

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
