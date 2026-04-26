// v0.5.48 — POST /api/license/deactivate
//
// Customer-side helper. Clears the active subscription so the same
// activation code can be moved to a different install. We do NOT
// invalidate or "refund" the activation code itself — once it's been
// consumed, it's spent. Deactivation just unbinds it from this
// device, which is what the operator wants when they're swapping
// PCs and don't want to wait for the original sub to expire.

import { NextResponse } from 'next/server'
import { deactivateSubscription } from '@/lib/licensing/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const status = deactivateSubscription()
  return NextResponse.json(
    { ok: true, status },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
