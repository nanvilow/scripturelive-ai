// v0.5.47 — Manual Arkesel SMS test endpoint.
//
// Companion to /api/license/test-email — fires a one-off test SMS so
// the operator can verify SMS_API_KEY + SMS_SENDER work without
// having to push a real customer through the full payment flow.
//
// POST  /api/license/test-sms
//   Body (optional): { "to": "0246798526" }
//     - If "to" is omitted, sends to NOTIFICATION_WHATSAPP
//       (operator's number, 0246798526). The phone is normalized
//       to E.164-without-plus by the SMS module.
//   Returns { ok: true|false, status: 'sent'|'pending', note }
//
// To run a *charge-free* test, set SMS_SANDBOX=1 in the deployment
// secrets — the SMS module will hit Arkesel's sandbox endpoint
// instead.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/licensing/admin-auth'
import { notifySms } from '@/lib/licensing/notifications'
import { NOTIFICATION_WHATSAPP } from '@/lib/licensing/plans'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const guard = requireAdmin(req)
  if (guard) return guard
  let to: string | undefined
  try {
    const body = (await req.json().catch(() => ({}))) as { to?: string }
    if (typeof body.to === 'string' && body.to.trim()) to = body.to.trim()
  } catch {
    /* empty body is fine */
  }

  const recipient = to || NOTIFICATION_WHATSAPP
  const ts = new Date().toISOString()
  const note = await notifySms({
    to: recipient,
    subject: `[ScriptureLive] Manual SMS test ${ts}`,
    body:
      `ScriptureLive AI: SMS test successful at ${ts}. ` +
      `If you received this, your Arkesel SMS_API_KEY and SMS_SENDER are configured correctly.`,
  })

  return NextResponse.json({
    ok: note.status === 'sent',
    status: note.status,
    note,
  })
}
