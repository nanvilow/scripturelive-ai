// v0.6.3 — mNotify SMS client (replaces Arkesel).
//
// The operator migrated their Ghana SMS gateway from Arkesel to
// mNotify (https://developer.mnotify.com/). Same use case as before:
// deliver an activation code to the customer's phone the moment the
// admin confirms their MoMo payment, plus the standalone "send code"
// path on the admin Generate panel.
//
// Why mNotify: better local sender-ID approval times, native
// alphanumeric sender support, and the API surface is simpler — a
// single POST returns a JSON status code we can branch on. mNotify
// also charges per delivered SMS (no monthly minimum), matching the
// pay-as-you-go model the operator was already on.
//
// API reference: https://developer.mnotify.com/sms.php
//   POST https://api.mnotify.com/api/sms/quick?key=<API_KEY>
//   Headers:    Content-Type: application/json
//   Body JSON:  {
//                 recipient:   string[],   // E.164 without leading +
//                 sender:      string,     // sender ID, ≤ 11 chars
//                 message:     string,
//                 is_schedule: 'false',    // we never schedule
//               }
//   Response:   { code: string, status: 'success' | 'fail',
//                 message: string, summary?: { _total: number, ... } }
//
// mNotify also accepts the API key as a Bearer token in the
// Authorization header for clients that prefer that style. We send
// BOTH (`?key=` query AND `Authorization: Bearer …`) so whichever
// auth mode their backend is set to, our request authenticates. The
// dashboard treats them as equivalent — duplicating costs nothing.
//
// Env vars (consumed via baked-credentials.ts):
//   SMS_API_KEY    mNotify API key (REQUIRED for live sends)
//   SMS_SENDER     Sender ID shown on customer phones (default
//                  'ScriptureAI', max 11 chars per mNotify rules)
//   SMS_SANDBOX    set to '1' to skip the live POST and return
//                  status:'sent' for local testing without burning
//                  SMS credit. NOT a real mNotify endpoint —
//                  mNotify's own dashboard has a test toggle.
//
// Phone normalization: Ghana operator inputs phones like
// "0246798526" or "+233 24 679 8526" or "+233246798526". mNotify
// wants E.164 WITHOUT the leading '+', so we normalize to
// "233246798526" before sending. International numbers (any non-0,
// non-233 prefix) are preserved verbatim in case the operator runs
// the same install for a customer outside Ghana.
//
// Retry-once policy (per v0.6.3 spec): on transient failure
// (network error, HTTP 5xx) we retry ONCE after a 1s back-off. On
// persistent failure the caller (notifications.ts) is responsible
// for surfacing the error to the admin so they can fall back to
// reading the code aloud over the phone. We never silently swallow
// failures.

const MNOTIFY_LIVE_URL = 'https://api.mnotify.com/api/sms/quick'

export interface SmsSendResult {
  ok: boolean
  status: 'sent' | 'pending'
  error?: string
  /** Raw mNotify response body, useful for debugging audit log entries. */
  raw?: unknown
  /** Number of attempts made (1 or 2). Surfaced for the admin badge. */
  attempts?: number
}

/**
 * Normalize a phone number to mNotify's expected wire format.
 *
 *   "0246798526"        -> "233246798526"
 *   "+233 24 679 8526"  -> "233246798526"
 *   "233246798526"      -> "233246798526"
 *   "+447700900123"     -> "447700900123"  (UK kept as-is)
 *
 * If the input is empty / unparseable we return it stripped to digits
 * so the upstream call can fail loudly rather than silently send to
 * the wrong number.
 */
export function normalizeGhPhone(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('233')) return digits
  if (digits.startsWith('0')) return '233' + digits.slice(1)
  return digits
}

/**
 * Single attempt at the mNotify quick-send endpoint.
 * Returns a structured result the caller can branch on.
 */
async function attemptSend(args: {
  url: string
  apiKey: string
  sender: string
  recipient: string
  message: string
}): Promise<SmsSendResult> {
  try {
    const res = await fetch(args.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // mNotify accepts EITHER ?key= OR a Bearer header. We send
        // both so the request authenticates regardless of their
        // backend's preferred auth path.
        Authorization: `Bearer ${args.apiKey}`,
      },
      body: JSON.stringify({
        recipient: [args.recipient],
        sender: args.sender,
        message: args.message,
        is_schedule: 'false',
      }),
    })
    const text = await res.text()
    let json: unknown = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      /* mNotify sometimes returns plain-text error pages on 5xx */
    }

    if (!res.ok) {
      return {
        ok: false,
        status: 'pending',
        error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
        raw: json ?? text,
      }
    }

    // mNotify returns HTTP 200 even on logical failures (insufficient
    // balance, suspended sender, invalid number). The body's `status`
    // field tells us whether the SMS was actually queued. The `code`
    // field is a numeric string — '2000' is success, anything else is
    // an error. We branch on both for safety.
    const obj = (json && typeof json === 'object') ? json as Record<string, unknown> : {}
    const status = String(obj.status ?? '')
    const code = String(obj.code ?? '')
    if (status === 'success' || code === '2000') {
      return { ok: true, status: 'sent', raw: json }
    }
    const errMsg = String(obj.message ?? text.slice(0, 200))
    return {
      ok: false,
      status: 'pending',
      error: `mNotify status=${status} code=${code}: ${errMsg}`,
      raw: json,
    }
  } catch (e) {
    return {
      ok: false,
      status: 'pending',
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

/**
 * Fire-and-await a single SMS via mNotify with a one-time retry.
 *
 * Returns a SmsSendResult. The caller is responsible for recording
 * the outcome in the NotificationRecord audit log AND for surfacing
 * persistent failures to the admin (so they can fall back to reading
 * the activation code aloud over WhatsApp or phone).
 */
export async function sendMnotifySms(args: {
  to: string
  message: string
}): Promise<SmsSendResult> {
  // v0.5.54 — env-var-or-baked. See baked-credentials.ts header.
  const { getSmsApiKey, getSmsSender, getSmsSandbox } = await import('../baked-credentials')
  const apiKey = getSmsApiKey()
  if (!apiKey) {
    return { ok: false, status: 'pending', error: 'SMS_API_KEY not configured', attempts: 0 }
  }
  const sender = (getSmsSender() || 'ScriptureAI').slice(0, 11)
  const recipient = normalizeGhPhone(args.to)
  if (!recipient) {
    return { ok: false, status: 'pending', error: `Invalid recipient phone: "${args.to}"`, attempts: 0 }
  }

  // SMS_SANDBOX=1 short-circuits the network call so devs can build
  // and click through the admin flow without burning live SMS credit.
  if (getSmsSandbox() === '1') {
    // eslint-disable-next-line no-console
    console.log('[mnotify-sms] SANDBOX — skip live send. recipient =', recipient, ' bytes =', args.message.length)
    return { ok: true, status: 'sent', raw: { sandbox: true }, attempts: 0 }
  }

  const url = `${MNOTIFY_LIVE_URL}?key=${encodeURIComponent(apiKey)}`

  // eslint-disable-next-line no-console
  console.log(
    '[mnotify-sms] sending to',
    recipient,
    '  sender =',
    sender,
    '  bytes =',
    args.message.length,
  )

  // Attempt #1.
  let result = await attemptSend({ url, apiKey, sender, recipient, message: args.message })
  if (result.ok) {
    // eslint-disable-next-line no-console
    console.log('[mnotify-sms] SUCCESS — delivered to', recipient, '  attempt = 1')
    return { ...result, attempts: 1 }
  }

  // Retry-once on what looks like a transient failure. Logical
  // mNotify failures (invalid sender ID, low balance) won't change
  // on a retry, but those are rare enough that the cheap re-POST is
  // worth the defensive paint.
  // eslint-disable-next-line no-console
  console.warn('[mnotify-sms] attempt 1 FAILED — will retry once.  to =', recipient, '  err =', result.error)
  await new Promise((r) => setTimeout(r, 1000))
  result = await attemptSend({ url, apiKey, sender, recipient, message: args.message })
  if (result.ok) {
    // eslint-disable-next-line no-console
    console.log('[mnotify-sms] SUCCESS on retry — delivered to', recipient, '  attempt = 2')
    return { ...result, attempts: 2 }
  }
  // eslint-disable-next-line no-console
  console.error('[mnotify-sms] FINAL FAILURE — to =', recipient, '  err =', result.error)
  return { ...result, attempts: 2 }
}

/**
 * v0.6.3 — Backwards-compatibility re-export.
 *
 * Older call sites (admin/confirm, admin/generate, tests) imported
 * `sendArkeselSms`. Now that we've migrated to mNotify the function
 * is renamed `sendMnotifySms`, but we keep an aliased export so any
 * straggler import keeps compiling. The alias logs a deprecation
 * note the first time it's hit so we can remove it cleanly later.
 */
let _arkeselWarnedOnce = false
export async function sendArkeselSms(args: { to: string; message: string }): Promise<SmsSendResult> {
  if (!_arkeselWarnedOnce) {
    _arkeselWarnedOnce = true
    // eslint-disable-next-line no-console
    console.warn('[sms] sendArkeselSms() is a v0.6.3 compatibility alias for sendMnotifySms() — please update the call site.')
  }
  return sendMnotifySms(args)
}

/**
 * v0.6.3 — keep the old type alias export so any straggler import of
 * the previous result type still resolves. It's structurally
 * identical to the new SmsSendResult shape.
 */
export type ArkeselSendResult = SmsSendResult
