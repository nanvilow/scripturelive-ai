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
  return NextResponse.json(
    { plans: getEffectivePlans() },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
