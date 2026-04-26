// GET /api/license/status
//
// Polled by the front-end every ~30 s and on focus. Returns the
// current subscription state, days/ms remaining, trial status, and
// the install id. Response shape is intentionally small so the
// LicenseProvider can React-render without ceremony.

import { NextResponse } from 'next/server'
import { computeStatus } from '@/lib/licensing/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const s = computeStatus()
  return NextResponse.json({
    state: s.state,           // 'active' | 'trial' | 'trial_expired' | 'expired' | 'never_activated'
    daysLeft: s.daysLeft,
    msLeft: Math.min(s.msLeft, Number.MAX_SAFE_INTEGER),
    isMaster: s.isMaster,
    activeSubscription: s.activeSubscription,
    trial: s.trial,
    installId: s.installId,
  }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
