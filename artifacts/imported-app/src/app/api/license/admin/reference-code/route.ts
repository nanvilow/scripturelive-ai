// v0.7.8 — POST /api/license/admin/reference-code
//
// Admin-gated endpoint that mints a fresh reference code for the
// current 30-minute window. The operator clicks "Generate Reference
// Code" in the Admin → Activation tab, the UI calls this endpoint,
// and the response includes the code itself plus an absolute
// `expiresAt` so the UI can render a live mm:ss countdown.
//
// No persistence — reference codes are HMAC-derived and offline-
// validatable (see src/lib/licensing/reference-code.ts), so there's
// nothing to store. Idempotent within a 30-min window: calling this
// twice in the same bucket returns the SAME code.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/licensing/admin-auth'
import { mintReferenceCode, REFERENCE_BUCKET_MS } from '@/lib/licensing/reference-code'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const guard = requireAdmin(req)
  if (guard) return guard
  try {
    const minted = mintReferenceCode()
    return NextResponse.json({
      code: minted.code,
      expiresAt: minted.expiresAt,
      secondsRemaining: minted.secondsRemaining,
      bucketMs: REFERENCE_BUCKET_MS,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'mint failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// Allow GET for the admin UI to refresh the countdown without
// re-minting (it just re-reads the current bucket — same code).
export async function GET(req: NextRequest) {
  return POST(req)
}
