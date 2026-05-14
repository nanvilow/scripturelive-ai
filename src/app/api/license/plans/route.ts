// v0.5.48 — GET /api/license/plans
//
// Public endpoint returning the EFFECTIVE plan list (compiled
// defaults overlaid with any owner price overrides set in Admin
// Settings). Consumed by the customer subscription modal so
// price changes apply without a redeploy.

import { NextResponse } from 'next/server'
import { getEffectivePlans } from '@/lib/licensing/plans'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  // v0.7.64 — Filter out plans flagged `hidden` (currently 2M–6M).
  // The customer-facing modal must not list tiers we no longer sell,
  // but the underlying PLANS catalogue still contains them so old
  // activation codes minted with those codes (SL-2M-…, etc.) keep
  // validating via findPlan(). Admin endpoints read PLANS directly
  // and continue to see the full list.
  return NextResponse.json(
    { plans: getEffectivePlans().filter((p) => !p.hidden) },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
