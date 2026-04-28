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
import { listAdminCodes } from '@/lib/licensing/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const includeDeleted = url.searchParams.get('includeDeleted') === '1'
  const all = listAdminCodes({ includeDeleted: true })
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
