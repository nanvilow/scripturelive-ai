// v0.7.0 — Admin: full activation-code dashboard list.
//
// Operator request: "create a place in the admin panel where admins
// can keep records of all activation codes to know the active ones
// and the ones being used in real time while the users are on the
// app, displaying days of purchase, duration remaining, expiration
// date, never-been-used status, expired status, and error codes."
//
// Returns every code in the ledger (NOT capped at 30 like the legacy
// /list endpoint) with computed status, daysRemaining, location, and
// soft-delete metadata, partitioned into `active` (visible) and
// `bin` (soft-deleted, 7-day retention) buckets.
//
// Query: ?includeDeleted=1 to include the bin in the response
// Resp: { codes: AdminCodeRow[], bin: AdminCodeRow[], stats: {...} }

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/licensing/admin-auth'
import { getFile, listAdminCodes } from '@/lib/licensing/storage'
import { fetchCodesLastSeen } from '@/lib/licensing/telemetry-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const guard = requireAdmin(req)
  if (guard) return guard
  const url = new URL(req.url)
  const includeDeleted = url.searchParams.get('includeDeleted') === '1'
  const all = listAdminCodes({ includeDeleted: true })

  // v0.7.13 — Merge AUTHORITATIVE last-seen data from the central
  // telemetry backend. Pre-v0.7.13, lastSeenAt was only ever updated
  // on the device that activated the code, so the operator's admin
  // panel showed "1d ago" forever for codes activated on a customer
  // PC. The customer's Electron app now phones home every ~30s with
  // its installId + active code, and we look up the most-recent
  // heartbeat per code here. Fire-and-forget — if telemetry is down
  // the admin still sees the local (stale) values.
  try {
    const codeKeys = all.map((c) => c.code).filter(Boolean)
    if (codeKeys.length > 0) {
      const masterKey = getFile().masterCode
      const fresh = await fetchCodesLastSeen(codeKeys, masterKey)
      for (const row of all) {
        const m = fresh[row.code]
        if (!m) continue
        // Always prefer the central value when it is newer than the
        // local one — protects against clock skew on customer PCs.
        const localTs = row.lastSeenAt ? Date.parse(row.lastSeenAt) : 0
        const centralTs = Date.parse(m.lastSeenAt)
        if (Number.isFinite(centralTs) && centralTs > localTs) {
          row.lastSeenAt = m.lastSeenAt
          if (m.lastSeenLocation) row.lastSeenLocation = m.lastSeenLocation
          if (m.lastSeenIp) row.lastSeenIp = m.lastSeenIp
        }
      }
    }
  } catch {
    /* never break the codes endpoint over telemetry failures */
  }

  const codes = all.filter((c) => !c.softDeletedAt)
  const bin = includeDeleted ? all.filter((c) => c.softDeletedAt) : []
  const stats = {
    total: codes.length,
    active: codes.filter((c) => c.status === 'active').length,
    neverUsed: codes.filter((c) => c.status === 'never-used').length,
    expired: codes.filter((c) => c.status === 'expired').length,
    cancelled: codes.filter((c) => c.status === 'cancelled').length,
    used: codes.filter((c) => c.status === 'used').length,
    master: codes.filter((c) => c.status === 'master').length,
    inBin: all.filter((c) => c.softDeletedAt).length,
  }
  return NextResponse.json({ codes, bin, stats }, { headers: { 'Cache-Control': 'no-store' } })
}
