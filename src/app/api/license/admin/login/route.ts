// v0.7.1 — Admin login. Exchanges the operator password for an
// HttpOnly session cookie that gates every other /api/license/admin/*
// endpoint. The cookie is auto-sent by the browser on same-origin
// fetches, so the modal just calls /login once and everything else
// "just works" until the 12-hour TTL elapses.
//
// Body: { password: string }
// Resp: 200 { ok: true, expiresAt } + Set-Cookie
//       401 { error } when the password doesn't match

import { NextRequest, NextResponse } from 'next/server'
import { passwordMatches, createSession, buildSessionCookie } from '@/lib/licensing/admin-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
  }
  const password = String((body as Record<string, unknown>)?.password ?? '')
  if (!password) return NextResponse.json({ error: 'password required' }, { status: 400 })
  if (!passwordMatches(password)) {
    // Generic message — don't reveal whether the password is unset
    // or the wrong value.
    return NextResponse.json({ error: 'Invalid admin password' }, { status: 401 })
  }
  const { token, expiresAt } = createSession()
  const res = NextResponse.json({ ok: true, expiresAt })
  res.headers.append('Set-Cookie', buildSessionCookie(token, expiresAt))
  return res
}
