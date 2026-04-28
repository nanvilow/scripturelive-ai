// v0.7.0 — Admin: restore an activation code from the soft-delete
// bin. The 7-day retention window resets and the code becomes
// activatable again. Only succeeds if the code is currently in
// the bin.
//
// Body: { code: string }
// Resp: { ok: true } | { error }

import { NextRequest, NextResponse } from 'next/server'
import { restoreActivationByCode } from '@/lib/licensing/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
  }
  const code = String((body as Record<string, unknown>)?.code ?? '').trim()
  if (!code) return NextResponse.json({ error: 'code is required' }, { status: 400 })
  const ok = restoreActivationByCode(code)
  if (!ok) return NextResponse.json({ error: 'Code not found in bin' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
