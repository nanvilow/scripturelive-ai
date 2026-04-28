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
// v0.6.3 — SMS gateway migrated from Arkesel to mNotify. The named
// export is now `sendMnotifySms`; sms.ts also keeps a `sendArkeselSms`
// alias for any straggler imports during the transition.
import { sendMnotifySms } from './sms'

// ─── Email ──────────────────────────────────────────────────────────

/**
 * v0.6.2 — RFC 2822 normalize a `from` value. Gmail (and most modern
 * MTAs) require either a bare address `user@host` or the bracketed
 * `"Display Name" <user@host>` form. A baked value like
 * `"ScriptureLive AI nanvilow@gmail.com"` is malformed — Gmail
 * silently drops the mail without surfacing an error, which is why
 * test emails to the owner used to "appear" to work but customer
 * emails stayed pending forever.
 */
function normalizeMailFrom(raw: string): string {
  const s = (raw || '').trim()
  if (!s) return ''
  // Already bracketed → trust it.
  if (/<[^>]+@[^>]+>/.test(s)) return s
  // Pure bare email → fine on its own.
  if (/^[^\s<>"']+@[^\s<>"']+$/.test(s)) return s
  // Otherwise: pull the LAST email-shaped token, treat everything
  // before it as the display name, wrap in quotes + angle brackets.
  const m = s.match(/(.*?)([^\s<>"']+@[^\s<>"']+)\s*$/)
  if (!m) return s // give up — let SMTP reject loudly
  const name = m[1].replace(/["<>]/g, '').trim()
  const addr = m[2].trim()
  return name ? `"${name}" <${addr}>` : addr
}

interface SmtpSendResult {
  ok: boolean
  error?: string
  /** Server response info — `accepted: ['x@y']`, `rejected: []`,
   *  `messageId: '<...>'`, `response: '250 OK ...'`. Surfaced into
   *  the admin notification record so a partial-failure (one
   *  recipient bounced, others delivered) is visible without
   *  reading the live log. */
  meta?: Record<string, unknown>
  /** v0.6.3 — the SMTP server's queue-id (extracted from the
   *  `response` line, e.g. `250 OK 17284... gsmtp` → `17284...`).
   *  This is the single piece of evidence the operator can quote
   *  when chasing a Gmail / Outlook bounce, so we promote it to a
   *  top-level field on the audit record. */
  queueId?: string
}

/**
 * v0.6.3 — convert plain-text email body into a minimal HTML
 * alternative. Most enterprise mail filters (Gmail, Outlook 365,
 * Postmark) penalise text-only emails — the multipart text+html
 * shape carries 5–10 spam-score points less, which is the
 * difference between Inbox and Spam for our customer activation
 * mails.
 *
 * The HTML is INTENTIONALLY plain — we don't ship marketing styling
 * because that triggers another set of filters. We just preserve
 * line breaks, escape HTML-unsafe characters, auto-link any URLs,
 * and wrap the activation code (matched as a 14-22 char A-Z0-9-block
 * preceded by 4+ spaces, since our text template indents the code)
 * in a monospace box. Falls back gracefully if no code is detected.
 */
function plainTextToHtml(text: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const lines = text.split(/\r?\n/).map((ln) => {
    const trimmed = ln.replace(/\s+$/, '')
    // Highlight indented activation code lines.
    if (/^\s{4,}[A-Z0-9-]{8,40}$/.test(trimmed)) {
      const code = trimmed.trim()
      return `<pre style="font-family:Consolas,Menlo,monospace;font-size:18px;font-weight:bold;background:#f4f4f5;border:1px solid #d4d4d8;border-radius:6px;padding:10px 14px;margin:8px 0;letter-spacing:1px;">${esc(code)}</pre>`
    }
    return esc(trimmed) || '&nbsp;'
  })
  const body = lines.join('<br>')
  // Auto-link bare URLs.
  const linked = body.replace(
    /(https?:\/\/[^\s<>"']+)/g,
    '<a href="$1" style="color:#1d4ed8;">$1</a>',
  )
  return [
    '<!doctype html><html><head><meta charset="utf-8"><title>ScriptureLive AI</title></head>',
    '<body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#18181b;margin:0;padding:24px;">',
    '<div style="max-width:560px;margin:0 auto;">',
    linked,
    '</div></body></html>',
  ].join('')
}

/**
 * v0.7.0 — Detect transient SMTP errors that warrant a retry. Operator
 * complaint: "Email not working again? Error message: Unexpected socket
 * close." Gmail (and most cloud SMTP providers) routinely drop idle
 * sockets and reset connections during peak hours. Pre-v0.7.0 a single
 * connection blip turned every customer activation into a "failed"
 * notification with no automatic recovery — admin had to retry by hand.
 *
 * We classify these node + nodemailer error shapes as TRANSIENT (worth
 * a retry):
 *   • "Unexpected socket close" — server closed mid-handshake
 *   • ECONNRESET / EPIPE / ETIMEDOUT / ESOCKET — TCP layer dropped
 *   • EAI_AGAIN — temporary DNS failure
 *   • ETLS — TLS negotiation glitched
 *   • EDNS / ENETUNREACH — flaky network at the venue
 *   • response codes 421 / 4xx — server says "try again later"
 *
 * Permanent errors (550 user not found, 535 bad auth, etc.) do NOT
 * retry — those won't get better on attempt 2.
 */
function isTransientSmtpError(err: { message?: string; code?: string; responseCode?: number }): boolean {
  const msg = String(err?.message || '').toLowerCase()
  if (msg.includes('socket close') || msg.includes('socket hang up')) return true
  if (msg.includes('connection closed') || msg.includes('connection timeout')) return true
  if (msg.includes('greeting timeout') || msg.includes('connection lost')) return true
  const code = String(err?.code || '').toUpperCase()
  if (['ECONNRESET', 'ETIMEDOUT', 'ESOCKET', 'EPIPE', 'EAI_AGAIN', 'ETLS', 'EDNS', 'ENETUNREACH', 'ECONNECTION'].includes(code)) return true
  const rc = Number(err?.responseCode)
  if (Number.isFinite(rc) && rc >= 400 && rc < 500) return true
  return false
}

const SMTP_MAX_ATTEMPTS = 3
const SMTP_BACKOFF_MS = [1000, 2500, 5000] as const

async function sendEmailViaSmtp(args: {
  to: string
  subject: string
  body: string
}): Promise<SmtpSendResult> {
  // v0.5.54 — env-var-or-baked. The packaged .exe has no env vars
  // set by default, so we fall back to the credentials baked at
  // build time. Operator can still override at runtime by setting
  // MAIL_HOST etc in the deployment environment.
  const { getMailHost, getMailUser, getMailPass, getMailFrom, getMailPort, getMailSecure } =
    await import('../baked-credentials')
  const host = getMailHost()
  const user = getMailUser()
  const pass = getMailPass()
  // v0.6.2 — normalize MAIL_FROM so we never hand Gmail a malformed
  // mailbox. Falls back to the SMTP user if MAIL_FROM is empty.
  const from = normalizeMailFrom(getMailFrom() || user)
  if (!host || !user || !pass || !from) return { ok: false, error: 'SMTP not configured' }

  // v0.7.0 — Single attempt body extracted into closure so the outer
  // retry loop can re-invoke it cleanly. Each attempt creates a FRESH
  // transport because nodemailer's transport carries the dead socket
  // state across calls — reusing one would just hit the same closed
  // pipe again. Returns the same SmtpSendResult shape; the outer loop
  // inspects the embedded transient flag (we tag it via attemptMeta).
  type AttemptResult = SmtpSendResult & { transient?: boolean }
  const attempt = async (attemptNum: number): Promise<AttemptResult> => {
    // nodemailer is a heavy import — only load when actually configured.
    const nm = await import('nodemailer')
    // v0.5.54 — defensively coerce port: invalid/NaN/0 -> 587. The
    // inject script already filters placeholder values like
    // MAIL_PORT="MAIL_PORT", but a runtime override via process.env
    // could still be garbage, so guard at use-site too.
    const portRaw = Number(getMailPort())
    const port = Number.isFinite(portRaw) && portRaw > 0 && portRaw < 65536 ? portRaw : 587
    // v0.7.0 — Tighter timeouts so a flaky upstream can't lock the
    // admin UI for 60+ seconds while nodemailer waits for its own
    // defaults (which are 2 minutes for connection, 10 for greeting,
    // unlimited for socket). With these caps a hung Gmail handshake
    // surfaces as a transient error inside ~25s and we hit retry #2.
    const tx = nm.createTransport({
      host,
      port,
      secure: getMailSecure() === '1',
      auth: { user, pass },
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 25000,
    })
    try {
    // eslint-disable-next-line no-console
    console.log('[smtp] sending', { host, port, from, to: args.to, subject: args.subject })
    // v0.6.3 — Email deliverability hardening:
    //   • multipart text + html alternatives (Gmail/O365 spam filters
    //     prefer multipart over text-only; this single change is
    //     worth ~5 SpamAssassin points)
    //   • Reply-To set to the FROM address so the customer's reply
    //     goes back to the operator's inbox, not the SMTP envelope
    //   • X-Entity-Ref-ID is a unique per-message id that prevents
    //     Gmail from collapsing repeat sends into a single thread
    //     ("Hey, your code is XYZ" emails to multiple customers no
    //     longer all merge into one thread)
    //   • List-Unsubscribe + List-Unsubscribe-Post headers reduce
    //     spam-folder placement at Gmail and O365 (RFC 8058). We
    //     point at a mailto: only — there is no public unsubscribe
    //     web endpoint because these are transactional, not
    //     marketing, but having the header satisfies the filters.
    const refId = `slai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const html = plainTextToHtml(args.body)
    const ownerInbox = (from.match(/<([^>]+)>/) || [, from])[1] || from
    const info = await tx.sendMail({
      from,
      to: args.to,
      subject: args.subject,
      text: args.body,
      html,
      replyTo: from,
      headers: {
        'X-Entity-Ref-ID': refId,
        'X-Mailer': 'ScriptureLive AI',
        'List-Unsubscribe': `<mailto:${ownerInbox}?subject=unsubscribe>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    })
    // v0.6.2 — nodemailer returns `accepted` and `rejected` arrays.
    // A successful submission to Gmail still ends up in `rejected`
    // when the recipient address is invalid, so we surface that as
    // a failure even though the SMTP transaction itself returned 250.
    const accepted = (info as { accepted?: string[] }).accepted ?? []
    const rejected = (info as { rejected?: string[] }).rejected ?? []
    const response = (info as { response?: string }).response
    const messageId = (info as { messageId?: string }).messageId
    // v0.6.3 — pluck the SMTP queue-id out of the response line so it
    // appears as a top-level field on the notification record. Gmail
    // returns lines like `250 2.0.0 OK  1777364... 41be03b00d2f7-...`.
    let queueId: string | undefined
    if (response) {
      const m = response.match(/\b([A-Za-z0-9]{12,})\b/)
      if (m) queueId = m[1]
    }
    // eslint-disable-next-line no-console
    console.log('[smtp] result', { accepted, rejected, response, messageId, queueId, refId })
    if (rejected.length > 0 && accepted.length === 0) {
      return {
        ok: false,
        error: `SMTP rejected recipient(s): ${rejected.join(', ')} — ${response || 'no server reason'}`,
        meta: { accepted, rejected, response, messageId, refId },
        queueId,
      }
    }
    return { ok: true, meta: { accepted, rejected, response, messageId, refId }, queueId }
    } catch (e) {
      // nodemailer errors carry useful fields beyond .message — code,
      // response, responseCode. Stitch them together so the admin
      // panel sees the actual SMTP reply (e.g. "550 5.7.1 ... blocked").
      const err = e as { message?: string; code?: string; response?: string; responseCode?: number }
      const transient = isTransientSmtpError(err)
      const detail = [
        err.message || String(e),
        err.responseCode ? `code=${err.responseCode}` : null,
        err.code ? `nm=${err.code}` : null,
        err.response ? `resp=${err.response}` : null,
        `attempt=${attemptNum}/${SMTP_MAX_ATTEMPTS}`,
      ]
        .filter(Boolean)
        .join(' | ')
      // eslint-disable-next-line no-console
      console.error('[smtp] attempt failed', { to: args.to, transient, attempt: attemptNum, error: detail })
      // v0.7.0 — Best-effort socket cleanup so the next attempt's
      // fresh transport doesn't trip over stale FDs (Gmail occasionally
      // refuses a new connection from the same port for ~10s if the
      // previous socket wasn't closed cleanly).
      try { tx.close() } catch { /* ignore */ }
      return { ok: false, error: detail, transient }
    }
  }

  // v0.7.0 — Retry-with-backoff loop. Up to SMTP_MAX_ATTEMPTS attempts;
  // backoff = SMTP_BACKOFF_MS[attempt-1] (1s, 2.5s, 5s). Permanent
  // failures (recipient rejected, auth failure) short-circuit out of
  // the loop on the first attempt. Audit string surfaces the attempt
  // count so the admin panel shows "ECONNRESET … attempts=3/3" instead
  // of just the bare nodemailer message.
  let last: AttemptResult = { ok: false, error: 'no SMTP attempt made' }
  for (let i = 1; i <= SMTP_MAX_ATTEMPTS; i++) {
    last = await attempt(i)
    if (last.ok) return last
    if (!last.transient) return last  // permanent error — don't waste retries
    if (i < SMTP_MAX_ATTEMPTS) {
      const wait = SMTP_BACKOFF_MS[i - 1] ?? 5000
      // eslint-disable-next-line no-console
      console.log(`[smtp] transient error, retrying in ${wait}ms (attempt ${i + 1}/${SMTP_MAX_ATTEMPTS})`)
      await new Promise((res) => setTimeout(res, wait))
    }
  }
  return last
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
  // v0.6.0 — operator complaint #4: emails were getting stuck on
  // 'pending' even when SMTP returned an error, hiding real failures.
  // From v0.6.0 onward a real send error is recorded as 'failed' so
  // the admin panel surfaces it visibly. 'pending' is reserved for
  // channels that have no automated send path (WhatsApp click-to-send).
  // v0.6.2 — also surface the SMTP server response on success so the
  // admin can confirm the message id / accepted recipients in the
  // notifications log without scraping the server console.
  // v0.6.3 — surface the SMTP queue-id at the top of the audit
  // string so the operator can copy it straight into a Gmail /
  // Outlook delivery-search query. Format:
  //   "queue=17284... · SMTP OK · {accepted, rejected, response, ...}"
  const errorOrInfo = sent.ok
    ? [
        sent.queueId ? `queue=${sent.queueId}` : null,
        sent.meta ? `SMTP OK · ${JSON.stringify(sent.meta)}` : 'SMTP OK',
      ].filter(Boolean).join(' · ')
    : [
        sent.queueId ? `queue=${sent.queueId}` : null,
        sent.error || 'unknown SMTP error',
      ].filter(Boolean).join(' · ')
  return appendNotification({
    channel: 'email',
    to,
    subject: args.subject,
    body: args.body,
    status: sent.ok ? 'sent' : 'failed',
    error: errorOrInfo,
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
  const result = await sendMnotifySms({ to: args.to, message: args.body })
  // v0.6.0 — operator complaint #4: SMS failures were silently sitting
  // on 'pending'. Same fix as notifyEmail above — record real
  // delivery failures as 'failed' so they show up in the admin panel.
  // v0.6.2 — embed the raw gateway response in the audit log too so
  // the admin can see the gateway's actual error (e.g. "Sender ID
  // not approved", "Insufficient balance") without grep'ing logs.
  // v0.6.3 — gateway is now mNotify; the result also surfaces the
  // attempt count (1 or 2) since sms.ts now retries once on transient
  // failure before giving up.
  let errorOrInfo: string | undefined
  if (!result.ok) {
    errorOrInfo = result.error
    if (typeof result.attempts === 'number') {
      errorOrInfo = `${errorOrInfo} · attempts=${result.attempts}`
    }
    if (result.raw && typeof result.raw === 'object') {
      try { errorOrInfo = `${errorOrInfo} · raw=${JSON.stringify(result.raw)}` } catch { /* ignore */ }
    }
  } else if (result.raw && typeof result.raw === 'object') {
    try { errorOrInfo = `mNotify OK · attempts=${result.attempts ?? 1} · ${JSON.stringify(result.raw)}` } catch { /* ignore */ }
  }
  return appendNotification({
    channel: 'sms',
    to: args.to,
    subject: args.subject,
    body: args.body,
    status: result.ok ? 'sent' : 'failed',
    error: errorOrInfo,
  })
}
