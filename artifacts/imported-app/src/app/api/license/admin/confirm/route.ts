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
import { notifyEmail, notifyWhatsApp } from '@/lib/licensing/notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
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
  let emailNote = null
  let waNote: { id: string; waLink: string } | null = null
  try {
    if (newlyGenerated) {
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
    notifications: { email: emailNote, whatsapp: waNote },
  })
}
