// POST /api/license/admin/confirm
//
// Body: { ref: string }     ← payment reference the customer typed in
//                              their MoMo transaction
// Resp: { payment, activation, notifications: { email, whatsapp, sms } }
//
// Step 3 of the customer flow (admin step). The owner has just received
// MoMo on their phone, opens the in-app Admin Panel via Ctrl+Shift+P,
// types the 3-digit reference the customer used, and clicks Confirm.
// We:
//   1. validate the ref (exists, not expired, not already consumed)
//   2. mark it PAID
//   3. mint an activation code (SL-{plan}-XXXXXX)
//   4. fire customer + owner notifications (email + SMS + wa.me link)
//
// Idempotent: re-confirming the same ref returns the SAME activation
// code (and `newlyGenerated: false`), so accidental double-clicks
// don't proliferate codes.
//
// v0.7.5 — Notifications are now FIRE-AND-FORGET (T506). Pre-v0.7.5
// the response waited for SMTP + mNotify to finish, so the operator
// would click "Confirm" and stare at a spinner for 5-10 seconds while
// 3 deliveries happened sequentially. The customer's SMS is the most
// time-sensitive piece, but EVERYTHING is best-effort — the audit
// log captures success/failure for every send. The operator now sees
// "PAID, code minted" within ~150ms; deliveries land seconds later
// and surface in the Notifications panel via the next reload.

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

  // ── Schedule notifications (fire-and-forget) ────────────────────
  // Re-confirms (newlyGenerated=false) skip the deliveries — those
  // already went out the first time and we don't want to spam the
  // customer if the operator double-clicks Confirm.
  if (newlyGenerated) {
    const customerSmsBody =
      `ScriptureLive AI: Activation successful. Code: ${activation.code}. ` +
      `Enjoy ${activation.days} days of seamless live scripture display.`

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

    const customerEmailSubject = `Your ScriptureLive AI activation code (${planLabel})`
    const customerEmailBody = [
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

    setImmediate(() => {
      // Customer SMS — most time-sensitive, fires first.
      void notifySms({
        to: payment.whatsapp,
        subject: `[ScriptureLive] Activation code for ${planLabel}`,
        body: customerSmsBody,
      }).catch((e) => console.error('[admin/confirm] customer SMS failed:', e))

      // Customer email — written copy of the code in their inbox.
      if (payment.email && /@/.test(payment.email)) {
        void notifyEmail({
          to: payment.email,
          subject: customerEmailSubject,
          body: customerEmailBody,
        }).catch((e) => console.error('[admin/confirm] customer email failed:', e))
      }

      // Owner notifications — for the audit trail.
      void notifyEmail({ subject: ownerSubject, body: ownerBody })
        .catch((e) => console.error('[admin/confirm] owner email failed:', e))
      void notifyWhatsApp({ subject: ownerSubject, body: ownerBody })
        .catch((e) => console.error('[admin/confirm] owner WA failed:', e))
    })
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
    // v0.7.5 — Notifications now dispatch async; the response no longer
    // includes per-delivery ids. The operator can refresh the panel a
    // few seconds later and see the new rows in the Notifications
    // section (audit log) with their final status.
    notifications: {
      queued: newlyGenerated,
    },
  })
}
