// v0.7.145 — Cloud-side endpoint: claim an admin-issued activation
// code on behalf of a remote customer install.
//
// Lives ONLY on the cloud deployment at scripturelive.replit.app.
// Customer installs call it from src/lib/licensing/cloud-sync.ts when
// their local activate route can't find the code in their own ledger
// (which happens whenever admin minted the code on a different PC).
//
// Body: { code: string, installId: string }
// Resp: { ok: true, activation: ActivationCodeRecord } on success
//       { error: string } with 4xx on missing/already-claimed/etc.
//
// Auth model: the activation code IS the bearer secret (32 chars of
// entropy minted by generateActivationCode). Knowing the code is the
// right to claim it. We additionally lock the code to the requesting
// installId on first claim so a second customer who somehow learns
// the same code can't double-spend it.

import { NextRequest, NextResponse } from 'next/server'
import { claimActivationForCustomer } from '@/lib/licensing/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    let body: unknown
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 }) }
    const b = body as Record<string, unknown>
    const code = String(b?.code ?? '').trim().toUpperCase()
    const installId = String(b?.installId ?? '').trim()
    if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 })
    if (!installId) return NextResponse.json({ error: 'installId required' }, { status: 400 })

    let result
    try {
      result = claimActivationForCustomer(code, installId)
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : String(e) },
        { status: 409 },
      )
    }
    if (!result) {
      return NextResponse.json({ error: 'Code not recognised on the central server' }, { status: 404 })
    }
    return NextResponse.json(result)
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[cloud/claim-activation] unhandled error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Cloud claim failed' },
      { status: 500 },
    )
  }
}
