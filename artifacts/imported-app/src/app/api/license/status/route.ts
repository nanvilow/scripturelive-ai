// GET /api/license/status
//
// Polled by the front-end every ~30 s and on focus. Returns the
// current subscription state, days/ms remaining, trial status, and
// the install id. v0.5.48 also returns a `subscription` block with
// human-friendly plan label, expires ISO, days remaining, the
// activation code, and the originating payment ref so the customer
// Settings → License row can render without a second roundtrip.

import { NextResponse } from 'next/server'
import { computeStatus, getFile } from '@/lib/licensing/storage'
import { findPlan } from '@/lib/licensing/plans'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const s = computeStatus()
  const file = getFile()

  // Build the customer-facing subscription summary if there's an
  // active sub. Master codes get the "Lifetime" label so the row
  // doesn't print a year-3000 expiry that confuses operators.
  let subscription:
    | {
        planCode: string
        planLabel: string
        days: number
        activatedAt: string
        expiresAt: string
        daysLeft: number
        isMaster: boolean
        activationCode: string
        paymentRef?: string
      }
    | null = null

  if (s.activeSubscription) {
    const plan = findPlan(s.activeSubscription.planCode)
    const activation = file.activationCodes.find(
      (a) => a.code === s.activeSubscription!.activationCode,
    )
    subscription = {
      planCode: s.activeSubscription.planCode,
      planLabel: s.activeSubscription.isMaster
        ? 'Lifetime (Master)'
        : plan?.label ?? s.activeSubscription.planCode,
      days: s.activeSubscription.days,
      activatedAt: s.activeSubscription.activatedAt,
      expiresAt: s.activeSubscription.expiresAt,
      daysLeft: s.activeSubscription.isMaster ? 36500 : s.daysLeft,
      isMaster: s.activeSubscription.isMaster,
      activationCode: s.activeSubscription.activationCode,
      paymentRef: activation?.generatedFor?.paymentRef,
    }
  }

  return NextResponse.json(
    {
      state: s.state,
      daysLeft: s.daysLeft,
      msLeft: Math.min(s.msLeft, Number.MAX_SAFE_INTEGER),
      isMaster: s.isMaster,
      activeSubscription: s.activeSubscription,
      trial: s.trial,
      installId: s.installId,
      subscription,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
