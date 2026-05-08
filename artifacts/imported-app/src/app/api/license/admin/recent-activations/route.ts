// v0.7.122 — Admin-side real-time activation feed.
//
// Operator request: "Implement a real-time notification system that
// alerts both the user and admin whenever a code is activated
// successfully."
//
// USER side: handled in src/components/license/activation-success-dialog.tsx
// ADMIN side (this endpoint): returns every activation row whose
//   `usedAt` falls within the last `windowHours` (default 24h),
//   sorted newest-first. The admin panel polls this every 10s and
//   surfaces unseen entries as a highlighted banner; the operator
//   marks them seen by acknowledging the banner.
//
// Pure read endpoint — no mutation. Safe to poll.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/licensing/admin-auth'
import { listAdminCodes } from '@/lib/licensing/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export interface RecentActivation {
  activationCode: string
  planCode: string
  days: number
  activatedAt: string
  expiresAt: string | null
  installId?: string | null
  paymentRef?: string | null
}

export async function GET(req: NextRequest) {
  const guard = requireAdmin(req)
  if (guard) return guard

  const url = new URL(req.url)
  const windowHoursRaw = url.searchParams.get('windowHours')
  const windowHours = (() => {
    const n = Number(windowHoursRaw)
    if (!Number.isFinite(n) || n <= 0) return 24
    return Math.min(24 * 30, n) // hard cap at 30 days
  })()
  const cutoffMs = Date.now() - windowHours * 60 * 60 * 1000

  const all = listAdminCodes({ includeDeleted: false })
  const recent: RecentActivation[] = []
  for (const row of all) {
    if (!row.usedAt) continue
    const usedAtMs = Date.parse(row.usedAt)
    if (!Number.isFinite(usedAtMs)) continue
    if (usedAtMs < cutoffMs) continue
    recent.push({
      activationCode: row.code,
      planCode: row.planCode,
      days: row.days,
      activatedAt: row.usedAt,
      expiresAt: row.subscriptionExpiresAt ?? null,
      installId: row.installId ?? null,
      paymentRef: row.paymentRef ?? null,
    })
  }
  recent.sort((a, b) => Date.parse(b.activatedAt) - Date.parse(a.activatedAt))

  return NextResponse.json({
    activations: recent,
    windowHours,
    serverTime: new Date().toISOString(),
  })
}
