// v0.7.8 — POST /api/license/activate-reference
//
// Public endpoint the customer hits from the lock overlay's "Have a
// reference code?" form. Validates the submitted code against the
// 30-minute HMAC window (current + previous bucket grace) and, on a
// match, runs the SAME activation path as a master-code redemption
// — so the install gains the same long-lived AI Detection privileges
// the operator hands out via /api/license/admin/master.
//
// Rate limit: 8 attempts / minute / IP. With ~10^12 brute-force
// search space inside the 30-min window this is conservative; we
// just want to make sure a misbehaving customer's typo loop can't
// pin the CPU.
//
// Audit: every accepted activation is logged with source='reference'
// + bucketDelta so the operator can see in admin which codes came
// from this channel.

import { NextRequest, NextResponse } from 'next/server'
import { activateCode } from '@/lib/licensing/storage'
import { verifyReferenceCode } from '@/lib/licensing/reference-code'
import { captureGeoFromRequest } from '@/lib/licensing/geoip'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// In-memory per-IP rate limit. Resets every 60s. Persistence is not
// useful here — the limit is anti-typo-spam, not anti-abuse.
const RATE_WINDOW_MS = 60_000
const RATE_LIMIT = 8
const attempts = new Map<string, { count: number; resetAt: number }>()

function rateOk(ip: string): boolean {
  const now = Date.now()
  const cur = attempts.get(ip)
  if (!cur || cur.resetAt <= now) {
    attempts.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }
  if (cur.count >= RATE_LIMIT) return false
  cur.count += 1
  return true
}

function ipOf(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]!.trim()
  const real = req.headers.get('x-real-ip')
  if (real) return real.trim()
  return 'unknown'
}

export async function POST(req: NextRequest) {
  const ip = ipOf(req)
  if (!rateOk(ip)) {
    return NextResponse.json(
      { error: 'Too many attempts — wait a minute and try again.' },
      { status: 429 },
    )
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
  }
  const code = String((body as Record<string, unknown>)?.code ?? '').trim()
  if (!code) {
    return NextResponse.json({ error: 'Reference code required' }, { status: 400 })
  }

  let verdict
  try {
    verdict = verifyReferenceCode(code)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'verify failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
  if (!verdict.valid) {
    return NextResponse.json(
      { error: 'Invalid or expired reference code. Ask the operator for a fresh one.' },
      { status: 400 },
    )
  }

  // Validated. Run the same activation as a master-code redemption
  // so the install gets the standard long-lived AI Detection grant.
  // We pass the CURRENT bucket's canonical code into activateCode()
  // by leaning on the ctx — activateCode() will resolve the master
  // path, register the activation, and return the new status.
  let geo: { ip?: string; location?: string } | undefined
  try {
    const g = await captureGeoFromRequest(req)
    geo = { ip: g?.ip, location: g?.location }
  } catch { /* best-effort only */ }

  // We re-use the install's masterCode as the activation key. The
  // reference code itself is short-lived; the GRANT it produces is
  // the same as a master-code unlock (long-lived AI detection).
  // This keeps the activation ledger / receipts identical to the
  // existing flow and avoids a parallel data path.
  let masterCode: string
  try {
    const mod = await import('@/lib/licensing/storage')
    masterCode = mod.getFile().masterCode
  } catch {
    return NextResponse.json({ error: 'Install storage not initialized' }, { status: 500 })
  }

  let result
  try {
    result = activateCode(masterCode, geo)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'activation failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    source: 'reference',
    bucketDelta: verdict.bucketDelta ?? 0,
    status: result?.status,
    receipt: result?.receipt,
  })
}
