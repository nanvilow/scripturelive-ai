// POST /api/license/admin/confirm
//
// Body: { ref: string }     ← payment reference the customer typed in
//                              their MoMo transaction
// Resp: { payment, activation, notifications: { email, whatsapp } }
//
// Step 3 of the customer flow (admin step). The owner has just received
// MoMo on their phone, opens the in-app Admin Panel via Ctrl+Shift+P,
// types the 3-digit reference the customer used, and clicks Confirm.
// We:
//   1. validate the ref (exists, not expired, not already consumed)
//   2. mark it PAID
//   3. mint an activation code (SL-{plan}-XXXXXX)
//   4. send notifications to nanvilow@gmail.com + a wa.me deep-link
//      to the operator's WhatsApp; both also get logged in-file so
//      they're visible in the admin panel even if SMTP isn't wired.
//
// Idempotent: re-confirming the same ref returns the SAME activation
// code (and `newlyGenerated: false`), so accidental double-clicks
// don't proliferate codes.

import { NextRequest, NextResponse } from 'next/server'
import { findPlan } from '@/lib/licensing/plans'
import { confirmPaymentAndIssueActivation } from '@/lib/licensing/storage'
import { notifyEmail, notifyWhatsApp, notifySms } from '@/lib/licensing/notifications'
import { requireAdmin } from '@/lib/licensing/admin-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const guard = requireAdmin(req)
  if (guard) return guard
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 }) }
  const ref = String((body as Record<string, unknown>)?.ref ?? '').trim()
  if (!/^\d{3,4}$/.test(ref)) return NextResponse.json({ error: 'ref must be a 3- or 4-digit code' }, { status: 400 })

  let result
  try {
    result = confirmPaymentAndIssueActivation(ref, (planCode) => {
      const p = findPlan(planCode)
      return p ? { days: p.days } : null
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }

  const { payment, activation, newlyGenerated } = result
  const plan = findPlan(payment.planCode)
  const planLabel = plan?.label ?? payment.planCode

  // Notifications — best-effort, never block the admin response.
  let emailNote: { id: string; status: string; error?: string } | null = null
  let waNote: { id: string; waLink: string } | null = null
  let smsNote: { id: string; status: string; error?: string; to: string } | null = null
  // v0.6.2 — customer email is now first-class. Operator complaint:
  // "test email works but the customer never gets an email." Reason:
  // admin/confirm only ever sent the OWNER an email + the customer
  // an SMS — there was no customer email path at all. Fixed below.
  let customerEmailNote: { id: string; status: string; error?: string; to: string } | null = null
  try {
    if (newlyGenerated) {
      // ── Customer activation SMS via Arkesel ──────────────────────
      // Spec: "ScriptureLive AI: Activation successful. Code:
      // SL-1M-83KF92. Enjoy 31 days of seamless live scripture display."
      // Sent BEFORE the operator notifications so a slow Gmail SMTP
      // doesn't delay the customer's receipt. Errors are recorded
      // in the audit log; they never block the response.
      try {
        const customerSmsBody =
          `ScriptureLive AI: Activation successful. Code: ${activation.code}. ` +
          `Enjoy ${activation.days} days of seamless live scripture display.`
        const s = await notifySms({
          to: payment.whatsapp,
          subject: `[ScriptureLive] Activation code for ${planLabel}`,
          body: customerSmsBody,
        })
        smsNote = { id: s.id, status: s.status, error: s.error, to: s.to }
      } catch (e) {
        // notifySms swallows internally, but belt-and-braces.
        // eslint-disable-next-line no-console
        console.error('[admin/confirm] customer SMS failed:', e)
      }

      // v0.6.2 — Customer activation email. Mirrors the SMS body so
      // the customer has a written copy of the code in their inbox
      // (SMS can be lost or garbled by carrier, especially across
      // borders). Only fires when the customer supplied an email at
      // payment time — silently skipped otherwise.
      if (payment.email && /@/.test(payment.email)) {
        try {
          const customerSubject = `Your ScriptureLive AI activation code (${planLabel})`
          const customerBody = [
            'Hello,',
            '',
            'Your ScriptureLive AI payment has been confirmed. Your activation code is:',
            '',
            `    ${activation.code}`,
            '',
            `Plan:        ${planLabel}`,
            `Duration:    ${activation.days} day(s)`,
            `Reference:   ${payment.ref}`,
            '',
            'Open ScriptureLive AI on your PC, paste this code into the activation prompt, and click Activate. The code is single-use and will bind to your install.',
            '',
            'Thank you for choosing ScriptureLive AI.',
            '— WassMedia',
          ].join('\n')
          const ce = await notifyEmail({
            to: payment.email,
            subject: customerSubject,
            body: customerBody,
          })
          customerEmailNote = { id: ce.id, status: ce.status, error: ce.error, to: ce.to }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('[admin/confirm] customer email failed:', e)
        }
      }

      const ownerSubject = `[ScriptureLive] Payment confirmed — ${planLabel} (${payment.email})`
      const ownerBody = [
        'A new ScriptureLive AI subscription has been activated.',
        '',
        `Plan:               ${planLabel} (${payment.planCode}, ${activation.days} days)`,
        `Amount:             GHS ${payment.amountGhs.toLocaleString()}`,
        `Payment reference:  ${payment.ref}`,
        `Customer email:     ${payment.email}`,
        `Customer WhatsApp:  ${payment.whatsapp}`,
        '',
        `Activation code:    ${activation.code}`,
        '',
        `Generated at:       ${activation.generatedAt}`,
      ].join('\n')

      const e = await notifyEmail({ subject: ownerSubject, body: ownerBody })
      emailNote = { id: e.id, status: e.status, error: e.error }

      const w = await notifyWhatsApp({ subject: ownerSubject, body: ownerBody })
      waNote = { id: w.id, waLink: w.waLink }
    }
  } catch {
    // notifications already log themselves to the audit file
  }

  return NextResponse.json({
    payment: {
      ref: payment.ref,
      planCode: payment.planCode,
      planLabel,
      amountGhs: payment.amountGhs,
      email: payment.email,
      whatsapp: payment.whatsapp,
      status: payment.status,
      paidAt: payment.paidAt,
    },
    activation: {
      code: activation.code,
      days: activation.days,
      generatedAt: activation.generatedAt,
    },
    newlyGenerated,
    notifications: {
      email: emailNote,
      whatsapp: waNote,
      sms: smsNote,
      customerEmail: customerEmailNote,
    },
  })
}
