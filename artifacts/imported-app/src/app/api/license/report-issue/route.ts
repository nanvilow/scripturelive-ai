// POST /api/license/report-issue
//
// v0.7.14 — Customer-facing "Report Issue" button on the lock
// overlay (and any future "something's wrong" surfaces) posts here.
// We forward the user's free-text description to the central
// /api/telemetry/error endpoint as errorType='user_report' so the
// operator's admin Records dashboard surfaces it in the recent-
// errors panel.
//
// Body: { message: string, context?: string }
//   message   — required, the user's description, up to 1500 chars
//   context   — optional, current page / state hint from the caller
//
// Resp: { ok: true } on success; we always return ok even if
// telemetry fails because the user must NOT be left wondering
// whether their report went through. The fire-and-forget POST
// pattern + our 4s timeout means the worst case is a silent drop;
// the user's message lives only in the central log either way.

import { NextRequest, NextResponse } from 'next/server'
import { getFile } from '@/lib/licensing/storage'
import { pingError } from '@/lib/licensing/telemetry-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Body {
  message?: unknown
  context?: unknown
}

export async function POST(req: NextRequest) {
  let raw: Body
  try {
    raw = (await req.json()) as Body
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  const message = String(raw.message ?? '').trim()
  if (!message) {
    return NextResponse.json({ ok: false, error: 'message_required' }, { status: 400 })
  }
  if (message.length > 1500) {
    return NextResponse.json({ ok: false, error: 'message_too_long' }, { status: 400 })
  }

  const context = typeof raw.context === 'string' ? raw.context.slice(0, 200) : undefined

  try {
    const f = getFile()
    void pingError({
      installId: f.installId,
      code: f.activeSubscription?.activationCode,
      errorType: 'user_report',
      message: context ? `[${context}] ${message}` : message,
    })
  } catch {
    /* never block a user report — fall through to ok */
  }

  return NextResponse.json({ ok: true })
}
