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

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Body {
  planCode?: string
  days?: number
  // v0.6.0 — optional sub-day granularity. Server adds these into the
  // days field via partsToDays() (rounds UP so a "1 hour" code still
  // gets a full day on the integer-days storage path). The activation
  // record still records the rounded days for backwards compatibility
  // with admin lists / CSV exports built before v0.6.
  hours?: number
  minutes?: number
  note?: string
  email?: string
  whatsapp?: string
}

export async function POST(req: NextRequest) {
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

  // Days validation. CUSTOM requires explicit duration; standard
  // plans accept an optional override (e.g. give a 1M plan 45 days
  // as a goodwill bump).
  let days: number | undefined
  if (body.days != null) {
    const n = Math.floor(Number(body.days))
    if (!Number.isFinite(n) || n < 0 || n > 36500) {
      return bad('days must be an integer between 0 and 36500')
    }
    if (n > 0) days = n
  }

  // v0.6.0 — fold optional hours / minutes into the days total. The
  // operator can pass any combo (3 days + 4 hours + 30 min, or just
  // 6 hours, etc). partsToDays rounds UP to satisfy the integer-day
  // contract on the existing storage path.
  let hours = 0
  let minutes = 0
  if (body.hours != null) {
    const n = Math.floor(Number(body.hours))
    if (!Number.isFinite(n) || n < 0 || n > 23) {
      return bad('hours must be an integer between 0 and 23')
    }
    hours = n
  }
  if (body.minutes != null) {
    const n = Math.floor(Number(body.minutes))
    if (!Number.isFinite(n) || n < 0 || n > 59) {
      return bad('minutes must be an integer between 0 and 59')
    }
    minutes = n
  }
  if (hours > 0 || minutes > 0) {
    // Combine ALL three parts into a single total day count so a
    // request like {days:0, hours:6} becomes 1 day (rounded up) and
    // {days:3, hours:4, minutes:30} becomes 4 days. We never
    // *shrink* a value the operator typed.
    days = partsToDays(days ?? 0, hours, minutes)
  }
  if (days != null && (days < 1 || days > 36500)) {
    return bad('total duration must round to between 1 and 36500 days')
  }
  if (isCustom && days == null) {
    return bad("CUSTOM plan requires explicit duration (days / hours / minutes)")
  }

  try {
    const activation = generateStandaloneActivation(
      {
        planCode,
        days,
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
          `Duration:    ${activation.days} day(s)`,
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
          `Enjoy ${activation.days} days of seamless live scripture display.`
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
