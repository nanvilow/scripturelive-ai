// v0.5.47 — Arkesel SMS client.
//
// Sends SMS via the Arkesel v2 API (Ghana SMS gateway). Used to
// deliver the activation code to the customer's phone immediately
// after the admin confirms their MoMo payment.
//
// Why Arkesel: it's the most widely used SMS gateway in Ghana,
// supports alphanumeric sender IDs, and has a simple pay-as-you-go
// API (no monthly minimum). Operator account + sender ID approval
// happens out-of-band through arkesel.com — this file only deals
// with the wire protocol.
//
// API reference: https://developers.arkesel.com/#/sms/send_sms
//   POST https://sms.arkesel.com/api/v2/sms/send
//   Headers:    api-key: <SMS_API_KEY>
//   Body JSON:  {
//                 sender:    string,        // sender ID, ≤ 11 chars
//                 message:   string,
//                 recipients: string[],     // E.164 without leading +
//                 sandbox?:  boolean,       // true = no charge, no delivery
//               }
//   Response:   { status: 'success' | 'error', data?: ..., message?: ... }
//
// Env vars:
//   SMS_API_KEY    Arkesel API key (REQUIRED for live sends)
//   SMS_SENDER     Sender ID shown on customer phones (default
//                  'ScriptureAI', max 11 chars per Arkesel rules)
//   SMS_SANDBOX    set to '1' to call the Arkesel sandbox endpoint
//                  (no charge, no real delivery — useful for tests)
//
// Phone normalization: Ghana operator inputs phones like
// "0246798526" or "+233 24 679 8526" or "+233246798526". Arkesel
// wants E.164 WITHOUT the leading '+', so we normalize to
// "233246798526" before sending. International numbers (any non-0,
// non-233 prefix) are preserved verbatim.

const ARKESEL_LIVE_URL = 'https://sms.arkesel.com/api/v2/sms/send'
const ARKESEL_SANDBOX_URL = 'https://sms.arkesel.com/api/v2/sms/send?sandbox=true'

export interface ArkeselSendResult {
  ok: boolean
  status: 'sent' | 'pending'
  error?: string
  /** Raw Arkesel response body, useful for debugging audit log entries. */
  raw?: unknown
}

/**
 * Normalize a phone number to Arkesel's expected wire format.
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

export async function sendArkeselSms(args: {
  to: string
  message: string
}): Promise<ArkeselSendResult> {
  // v0.5.54 — env-var-or-baked. See baked-credentials.ts header.
  const { getSmsApiKey, getSmsSender, getSmsSandbox } = await import('../baked-credentials')
  const apiKey = getSmsApiKey()
  if (!apiKey) {
    return { ok: false, status: 'pending', error: 'SMS_API_KEY not configured' }
  }
  const sender = (getSmsSender() || 'ScriptureAI').slice(0, 11)
  const recipient = normalizeGhPhone(args.to)
  if (!recipient) {
    return { ok: false, status: 'pending', error: `Invalid recipient phone: "${args.to}"` }
  }
  const url = getSmsSandbox() === '1' ? ARKESEL_SANDBOX_URL : ARKESEL_LIVE_URL

  try {
    // eslint-disable-next-line no-console
    console.log(
      '[arkesel-sms] sending to',
      recipient,
      '  sender =',
      sender,
      '  sandbox =',
      process.env.SMS_SANDBOX === '1',
      '  bytes =',
      args.message.length,
    )
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender,
        message: args.message,
        recipients: [recipient],
      }),
    })
    const text = await res.text()
    let json: unknown = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      /* arkesel sometimes returns plain text on errors */
    }

    if (!res.ok) {
      const err = `HTTP ${res.status}: ${text.slice(0, 200)}`
      // eslint-disable-next-line no-console
      console.error('[arkesel-sms] FAILED — to =', recipient, ' error =', err)
      return { ok: false, status: 'pending', error: err, raw: json ?? text }
    }

    // Arkesel responds 200 even on logical failures (insufficient
    // balance, suspended sender, invalid number). Inspect status
    // field to tell apart.
    const arkeselStatus =
      json && typeof json === 'object' && 'status' in json
        ? String((json as Record<string, unknown>).status)
        : null

    if (arkeselStatus && arkeselStatus !== 'success') {
      const err = `Arkesel status=${arkeselStatus}: ${text.slice(0, 200)}`
      // eslint-disable-next-line no-console
      console.error('[arkesel-sms] FAILED — to =', recipient, ' error =', err)
      return { ok: false, status: 'pending', error: err, raw: json }
    }

    // eslint-disable-next-line no-console
    console.log('[arkesel-sms] SUCCESS — delivered to', recipient)
    return { ok: true, status: 'sent', raw: json ?? text }
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e)
    // eslint-disable-next-line no-console
    console.error('[arkesel-sms] CRASHED — to =', recipient, ' error =', err)
    return { ok: false, status: 'pending', error: err }
  }
}
