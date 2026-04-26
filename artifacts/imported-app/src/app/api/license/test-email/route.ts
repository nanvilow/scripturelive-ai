// v0.5.46 — Manual SMTP test endpoint.
//
// Companion to instrumentation.ts: gives the operator a way to fire
// a fresh test email at any time without restarting the server.
// Useful after they update MAIL_PASS in deployment secrets and want
// to verify without a redeploy round-trip (in dev), or to re-prove
// SMTP works during a service.
//
// POST  /api/license/test-email
//   Body (optional): { "to": "someone@example.com" }
//   - If "to" is omitted, sends to NOTIFICATION_EMAIL (nanvilow@gmail.com).
//   - Returns { ok: true, status: 'sent' | 'pending', note: NotificationRecord }
//   - Never throws; SMTP failure is reported in the response body.

import { NextRequest, NextResponse } from 'next/server'
import { notifyEmail } from '@/lib/licensing/notifications'
import { NOTIFICATION_EMAIL } from '@/lib/licensing/plans'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let to: string | undefined
  try {
    const body = (await req.json().catch(() => ({}))) as { to?: string }
    if (typeof body.to === 'string' && body.to.trim()) to = body.to.trim()
  } catch {
    /* empty body is fine */
  }

  const recipient = to || NOTIFICATION_EMAIL
  const ts = new Date().toISOString()
  const note = await notifyEmail({
    to: recipient,
    subject: `ScriptureLive AI - manual test email (${ts})`,
    body: [
      'This is a MANUAL test email triggered from /api/license/test-email.',
      '',
      `Server time: ${ts}`,
      `Recipient:   ${recipient}`,
      '',
      'If you received this, your SMTP configuration is working correctly.',
      '',
      '-- ScriptureLive AI',
    ].join('\n'),
  })

  return NextResponse.json({
    ok: note.status === 'sent',
    status: note.status,
    note,
  })
}
