// v0.7.1 — Admin logout. Revokes the current session token (so even
// a stolen cookie stops working) and clears the cookie on the
// caller. Always returns 200, even if the cookie is missing/expired
// — logout should be idempotent.
//
// Body: (none)
// Resp: 200 { ok: true } + Set-Cookie clearing the cookie

import { NextRequest, NextResponse } from 'next/server'
import { destroySession, readSessionToken, buildClearCookie } from '@/lib/licensing/admin-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const token = readSessionToken(req)
  destroySession(token)
  const res = NextResponse.json({ ok: true })
  res.headers.append('Set-Cookie', buildClearCookie())
  return res
}
