// v0.5.53 — Admin-only: remove an activation code from the Recent
// Activations table. Useful for clearing test rows or codes that
// were minted to the wrong customer. The active subscription on
// THIS install is unaffected; this only touches the audit log.
//
// Body: { code: string }
// Resp: { ok: true } | { error }

import { NextRequest, NextResponse } from 'next/server'
import { deleteActivationByCode } from '@/lib/licensing/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
  }
  const code = String((body as Record<string, unknown>)?.code ?? '').trim()
  if (!code) return NextResponse.json({ error: 'code is required' }, { status: 400 })
  const removed = deleteActivationByCode(code)
  if (!removed) return NextResponse.json({ error: 'No activation with that code' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
