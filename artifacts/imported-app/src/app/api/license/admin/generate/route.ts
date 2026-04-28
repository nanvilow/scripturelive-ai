// v0.5.48 — POST /api/license/admin/generate
//
// Owner-only. Mints a NEW activation code without going through the
// MoMo payment flow. Used for:
//   • free trials / promotional codes
//   • cash / bank-transfer customers (paid out of band)
//   • partnership grants ("give Cathedral Lagos 1 year free")
//
// Body: {
//   planCode:  string   // '1M' | '2M' | … | '1Y' | 'CUSTOM'
//   days?:     number   // optional override; required if planCode = CUSTOM
//   note?:     string   // free-text label, e.g. "Pastor John — Lagos"
//   email?:    string   // optional contact for record-keeping
//   whatsapp?: string
// }
//
// Resp: { ok: true, activation: { code, planCode, days, generatedAt, generatedFor } }
//
// The mint is irreversible (we never delete activation rows). The
// recipient still has to type the code into the activation modal on
// their PC — that's what binds the code to a specific install.

import { NextRequest, NextResponse } from 'next/server'
import { findPlan } from '@/lib/licensing/plans'
import { generateStandaloneActivation } from '@/lib/licensing/storage'
import { partsToDays } from '@/lib/format-duration'
import { notifyEmail, notifySms } from '@/lib/licensing/notifications'
import { requireAdmin } from '@/lib/licensing/admin-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Body {
  planCode?: string
  days?: number
  // v0.6.3 — months is a convenience input (1 month = 30 days). The
  // operator enters whole months on the admin UI; we fold them into
  // the days bucket so downstream lists keep their day-display.
  months?: number
  // v0.6.0 — optional sub-day granularity {hours, minutes}.
  // v0.6.3 — these now contribute to BOTH a rounded `days` value
  // (legacy display) AND a precise `durationMs` value (real expiry).
  // The activation engine prefers `durationMs` when present, so a
  // 20-minute code now actually expires in 20 minutes. Pre-v0.6.3
  // calls that only set `days` keep working unchanged.
  hours?: number
  minutes?: number
  note?: string
  email?: string
  whatsapp?: string
}

export async function POST(req: NextRequest) {
  const guard = requireAdmin(req)
  if (guard) return guard
  let body: Body
  try { body = (await req.json()) as Body } catch { return bad('Body must be JSON') }

  const planCode = String(body.planCode ?? '').trim().toUpperCase()
  if (!planCode) return bad('planCode is required')

  // Custom plan code lets the owner mint an arbitrary-duration code
  // not tied to one of the 7 standard plans.
  const isCustom = planCode === 'CUSTOM'
  if (!isCustom && !findPlan(planCode)) {
    return bad(`Unknown planCode "${planCode}". Use one of the published plans or 'CUSTOM'.`)
  }

  // Duration parsing. CUSTOM requires explicit duration; standard
  // plans accept an optional override (e.g. give a 1M plan 45 days
  // as a goodwill bump).
  //
  // v0.6.3 — we now build TWO numbers in lockstep:
  //   • `days`       — the rounded-up day count (legacy display field
  //                    used by admin lists, CSV exports, email body)
  //   • `durationMs` — the EXACT millisecond duration (used by the
  //                    activation engine for real expiry math)
  // This is the fix for the "20-minute code shows as 1 day" report:
  // the storage engine used to multiply days × 86 400 000, so any
  // sub-day duration was inflated. Now activateCode() prefers
  // durationMs whenever the record carries it.
  let monthsRaw = 0
  let daysRaw = 0
  let hoursRaw = 0
  let minutesRaw = 0

  if (body.months != null) {
    const n = Math.floor(Number(body.months))
    if (!Number.isFinite(n) || n < 0 || n > 1200) {
      return bad('months must be an integer between 0 and 1200')
    }
    monthsRaw = n
  }
  if (body.days != null) {
    const n = Math.floor(Number(body.days))
    if (!Number.isFinite(n) || n < 0 || n > 36500) {
      return bad('days must be an integer between 0 and 36500')
    }
    daysRaw = n
  }
  if (body.hours != null) {
    const n = Math.floor(Number(body.hours))
    // v0.6.3 — accept any non-negative integer; UI may submit 24+ if
    // the operator typed e.g. "30" hours. We'll fold into the ms total.
    if (!Number.isFinite(n) || n < 0 || n > 100000) {
      return bad('hours must be a non-negative integer ≤ 100000')
    }
    hoursRaw = n
  }
  if (body.minutes != null) {
    const n = Math.floor(Number(body.minutes))
    if (!Number.isFinite(n) || n < 0 || n > 100000) {
      return bad('minutes must be a non-negative integer ≤ 100000')
    }
    minutesRaw = n
  }

  // Compute precise ms (real source of truth for expiry).
  const totalMs =
    monthsRaw * 30 * 86400000 +
    daysRaw * 86400000 +
    hoursRaw * 3600000 +
    minutesRaw * 60000

  // Decide what to pass to the storage engine.
  //   • If the operator supplied any duration parts (months/days/
  //     hours/minutes>0) we use the computed values.
  //   • Otherwise standard plans fall back to the plan's canonical
  //     days inside generateStandaloneActivation (durationMs stays
  //     undefined → activateCode() uses days*86400000 as before).
  const hasAnyDuration = monthsRaw > 0 || daysRaw > 0 || hoursRaw > 0 || minutesRaw > 0
  let days: number | undefined
  let durationMs: number | undefined

  if (hasAnyDuration) {
    if (totalMs < 60_000) {
      return bad('total duration must be at least 1 minute')
    }
    if (totalMs > 36500 * 86400000) {
      return bad('total duration must be at most ~100 years')
    }
    durationMs = totalMs
    // Keep `days` as the rounded-UP display value so admin lists +
    // emails read like before ("3 day(s)" for a 2d-12h code, etc.).
    // Use partsToDays from format-duration so the rounding rule stays
    // centralised.
    days = partsToDays(monthsRaw * 30 + daysRaw, hoursRaw, minutesRaw)
  }

  if (isCustom && !hasAnyDuration) {
    return bad("CUSTOM plan requires explicit duration (months / days / hours / minutes)")
  }

  try {
    const activation = generateStandaloneActivation(
      {
        planCode,
        days,
        durationMs,
        note: body.note,
        email: body.email,
        whatsapp: body.whatsapp,
      },
      (code) => {
        const p = findPlan(code)
        return p ? { days: p.days } : null
      },
    )

    // v0.6.2 — auto-deliver the freshly minted code to the customer
    // when the operator filled in email and/or WhatsApp on the
    // generate form. Previously the operator had to copy-paste the
    // code into a separate channel by hand, which is error-prone
    // ("did I send it to the right number?") and slow during a
    // live event. Both deliveries are best-effort: failures are
    // recorded in the audit log but never block the response.
    let emailNote: { id: string; status: string; error?: string; to: string } | null = null
    let smsNote: { id: string; status: string; error?: string; to: string } | null = null
    const planLabel = findPlan(activation.planCode)?.label ?? activation.planCode

    // v0.6.3 — humanise the duration in customer-facing copy so a
    // 20-minute test code reads "20 minutes" instead of the legacy
    // "1 day(s)" inflation. We use the precise durationMs the
    // storage engine just persisted; falls back to days when the
    // operator picked a stock plan with no sub-day parts.
    const { formatTotalAsDhmString } = await import('@/lib/format-duration')
    const effectiveMs = activation.durationMs ?? activation.days * 86400000
    const humanDuration = formatTotalAsDhmString(effectiveMs) || `${activation.days} day(s)`

    if (body.email && /@/.test(body.email)) {
      try {
        const subject = `Your ScriptureLive AI activation code (${planLabel})`
        const text = [
          'Hello,',
          '',
          'Your ScriptureLive AI activation code is ready:',
          '',
          `    ${activation.code}`,
          '',
          `Plan:        ${planLabel}`,
          `Duration:    ${humanDuration}`,
          body.note ? `Issued for:  ${body.note}` : '',
          '',
          'Open ScriptureLive AI on your PC, paste this code into the activation prompt, and click Activate. The code is single-use and will bind to your install.',
          '',
          'Thank you for choosing ScriptureLive AI.',
          '— WassMedia',
        ].filter(Boolean).join('\n')
        const e = await notifyEmail({ to: body.email.trim(), subject, body: text })
        emailNote = { id: e.id, status: e.status, error: e.error, to: e.to }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[admin/generate] customer email failed:', err)
      }
    }

    if (body.whatsapp && body.whatsapp.replace(/\D/g, '').length >= 9) {
      try {
        const sms = `ScriptureLive AI: Your activation code is ${activation.code}. ` +
          `Enjoy ${humanDuration} of seamless live scripture display.`
        const s = await notifySms({
          to: body.whatsapp.trim(),
          subject: `[ScriptureLive] Activation code for ${planLabel}`,
          body: sms,
        })
        smsNote = { id: s.id, status: s.status, error: s.error, to: s.to }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[admin/generate] customer SMS failed:', err)
      }
    }

    return NextResponse.json(
      {
        ok: true,
        activation: {
          code: activation.code,
          planCode: activation.planCode,
          days: activation.days,
          generatedAt: activation.generatedAt,
          generatedFor: activation.generatedFor,
        },
        notifications: { email: emailNote, sms: smsNote },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (e) {
    return bad(e instanceof Error ? e.message : String(e))
  }
}

function bad(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 })
}
