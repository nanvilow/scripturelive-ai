// v1 licensing — notification dispatch.
//
// The spec requires email + WhatsApp receipts for the operator
// (nanvilow@gmail.com / 0246798526) at three moments:
//   1. master code generated on first run
//   2. payment confirmed by admin
//   3. activation generated
// AND a customer receipt at activation time.
//
// We do NOT depend on a third-party billing API (operator was explicit
// about this), but email/WhatsApp delivery is a separate question. We
// support the following dispatch backends, in order of preference:
//
//   • SMTP (nodemailer) — used when MAIL_HOST + MAIL_USER + MAIL_PASS
//                         are present in process.env.
//   • Pending queue     — fallback when no SMTP creds. The notification
//                         is appended to the licensing file with status
//                         'pending', and surfaces in the in-app admin
//                         panel so the operator can copy-paste it into
//                         their own email client / WhatsApp.
//
// WhatsApp: we never attempt to call the WhatsApp Business API (paid,
// requires Meta approval). Instead we generate a wa.me link the
// operator can click to open WhatsApp Web with the body pre-filled.
// Customers get the same link as part of the receipt modal in-app.

import { appendNotification, NotificationRecord } from './storage'
import {
  NOTIFICATION_EMAIL,
  NOTIFICATION_WHATSAPP,
  getEffectiveNotificationTargets,
} from './plans'
import { sendArkeselSms } from './sms'

// ─── Email ──────────────────────────────────────────────────────────
async function sendEmailViaSmtp(args: {
  to: string
  subject: string
  body: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const host = process.env.MAIL_HOST
  const user = process.env.MAIL_USER
  const pass = process.env.MAIL_PASS
  const from = process.env.MAIL_FROM || user
  if (!host || !user || !pass || !from) return { ok: false, error: 'SMTP not configured' }
  try {
    // nodemailer is a heavy import — only load when actually configured.
    const nm = await import('nodemailer')
    const tx = nm.createTransport({
      host,
      port: Number(process.env.MAIL_PORT || 587),
      secure: process.env.MAIL_SECURE === '1',
      auth: { user, pass },
    })
    await tx.sendMail({ from, to: args.to, subject: args.subject, text: args.body })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function notifyEmail(args: {
  to?: string
  subject: string
  body: string
}): Promise<NotificationRecord> {
  // v0.5.48 — owner can override the notify-email destination from
  // Admin Settings; fall back to the compiled NOTIFICATION_EMAIL.
  const to = args.to ?? getEffectiveNotificationTargets().email ?? NOTIFICATION_EMAIL
  const sent = await sendEmailViaSmtp({ to, subject: args.subject, body: args.body })
  return appendNotification({
    channel: 'email',
    to,
    subject: args.subject,
    body: args.body,
    status: sent.ok ? 'sent' : 'pending',
    error: sent.ok ? undefined : sent.error,
  })
}

// ─── WhatsApp ───────────────────────────────────────────────────────
function waUrl(rawNumber: string, body: string): string {
  // wa.me wants the full international number with no leading +.
  // 0246798526 -> 233246798526
  let num = rawNumber.replace(/\D/g, '')
  if (num.startsWith('0')) num = '233' + num.slice(1)
  return `https://wa.me/${num}?text=${encodeURIComponent(body)}`
}

export async function notifyWhatsApp(args: {
  to?: string
  subject: string
  body: string
}): Promise<NotificationRecord & { waLink: string }> {
  // We always queue WhatsApp as 'pending' because we never have a
  // server-side WhatsApp account; the wa.me link is the delivery method.
  // v0.5.48 — owner can override the notify-WhatsApp destination
  // from Admin Settings; fall back to the compiled NOTIFICATION_WHATSAPP.
  const to = args.to ?? getEffectiveNotificationTargets().whatsapp ?? NOTIFICATION_WHATSAPP
  const link = waUrl(to, args.body)
  const note = appendNotification({
    channel: 'whatsapp',
    to,
    subject: args.subject,
    body: args.body + '\n\n' + link,
    status: 'pending',
  })
  return { ...note, waLink: link }
}

export function whatsappLink(toRaw: string, body: string): string {
  return waUrl(toRaw, body)
}

// ─── SMS (Arkesel) ──────────────────────────────────────────────────
//
// Used to deliver the activation code straight to the customer's
// phone the moment the admin confirms their MoMo payment. The
// `subject` field mirrors email/whatsapp for audit log consistency
// but is NOT included in the actual SMS body — Arkesel charges per
// segment so we keep the wire payload tight (just `body`).
//
// On success: appends a 'sent' notification with channel='sms'.
// On failure: appends a 'pending' notification carrying the error
// message; the operator will see it in the admin panel and can
// re-send by hand if needed.
export async function notifySms(args: {
  to: string
  subject: string
  body: string
}): Promise<NotificationRecord> {
  const result = await sendArkeselSms({ to: args.to, message: args.body })
  return appendNotification({
    channel: 'sms',
    to: args.to,
    subject: args.subject,
    body: args.body,
    status: result.ok ? 'sent' : 'pending',
    error: result.ok ? undefined : result.error,
  })
}
