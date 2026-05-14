// v0.7.1 — Admin session probe. The admin modal hits this on open
// to decide whether to show the password gate or jump straight to
// the dashboard. Returns 200 when the cookie is valid, 401 when
// not — handler body is intentionally tiny so it can be polled
// cheaply without trimming server resources.
//
// Resp: 200 { authenticated: true }
//       401 { error, code: 'ADMIN_AUTH_REQUIRED' }

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/licensing/admin-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const guard = requireAdmin(req)
  if (guard) return guard
  return NextResponse.json({ authenticated: true })
}
