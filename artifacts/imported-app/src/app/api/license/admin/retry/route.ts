// v0.5.57 — Admin "Resend" endpoint.
//
// Re-sends a previously queued/failed notification by id. Used by
// the Admin Panel "Resend" button on each pending/failed row in the
// Notifications log so the operator can retry after fixing SMTP
// or SMS_API_KEY without having to manually copy/paste the body.
//
// POST  /api/license/admin/retry
//   Body: { "id": "<notification-id>" }
//   Returns: { ok, status, note }
//
// We look up the original notification record (by id) to recover
// the channel + recipient + body, then re-dispatch through the same
// notify* helper that produced the original row. The helper appends
// a fresh row to the audit log; the original 'pending'/'failed' row
// stays put for history.

import { NextRequest, NextResponse } from 'next/server'
import { notifyEmail, notifySms, notifyWhatsApp } from '@/lib/licensing/notifications'
import { getNotificationById } from '@/lib/licensing/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let id: string | undefined
  try {
    const body = (await req.json().catch(() => ({}))) as { id?: string }
    if (typeof body.id === 'string' && body.id.trim()) id = body.id.trim()
  } catch {
    /* empty body */
  }
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }
  const original = getNotificationById(id)
  if (!original) {
    return NextResponse.json({ error: 'Notification not found' }, { status: 404 })
  }

  // The wa.me link is appended to the WhatsApp body inside the
  // original notify call; for resend we strip the trailing link so
  // the wa.me wrapper doesn't double-encode it on the next pass.
  let body = original.body
  if (original.channel === 'whatsapp') {
    body = body.replace(/\n\nhttps:\/\/wa\.me\/.*$/s, '')
  }

  let note
  if (original.channel === 'email') {
    note = await notifyEmail({ to: original.to, subject: original.subject, body })
  } else if (original.channel === 'sms') {
    note = await notifySms({ to: original.to, subject: original.subject, body })
  } else {
    note = await notifyWhatsApp({ to: original.to, subject: original.subject, body })
  }
  return NextResponse.json({
    ok: note.status === 'sent',
    status: note.status,
    note,
  })
}
