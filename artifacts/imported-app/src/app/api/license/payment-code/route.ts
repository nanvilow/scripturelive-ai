// POST /api/license/payment-code
//
// Body: { planCode: '1M' | '2M' | ... | '1Y', email: string, whatsapp: string }
// Resp: { ref, planCode, amountGhs, expiresAt, momoRecipient }
//
// Step 1 of the customer flow: customer picks a plan in the
// subscription modal, the front-end calls this endpoint, we mint a
// 3-digit reference code, and the customer types it into the MoMo
// "reference" field when paying.
//
// v0.7.5 — Two changes (Apr 29, 2026):
//   1. Notifications are fire-and-forget (T506). Pre-v0.7.5 the
//      response waited for SMTP + mNotify before returning, which
//      could push response time past 5 seconds and made the customer
//      think the page had hung. Now we build the response object,
//      schedule the notifications via setImmediate, and return
//      instantly. Failures land in console + the audit log.
//   2. Customer SMS overhaul (T507). The customer now also gets an
//      SMS with the MoMo number, name, amount, and reference so they
//      can complete payment without flipping back to the modal.

import { NextRequest, NextResponse } from 'next/server'
import {
  findPlan,
  isPlanCode,
  getEffectivePlans,
  getEffectiveMoMo,
  getEffectiveAdminPhone,
  getEffectiveNotificationTargets,
} from '@/lib/licensing/plans'
import { createPaymentCode } from '@/lib/licensing/storage'
import { notifySms, notifyEmail } from '@/lib/licensing/notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch { return bad('Body must be JSON') }
  const b = body as Record<string, unknown>
  const planCode = String(b.planCode ?? '').trim().toUpperCase()
  const email = String(b.email ?? '').trim()
  const whatsapp = String(b.whatsapp ?? '').trim()

  if (!isPlanCode(planCode)) return bad(`Unknown planCode "${planCode}"`)
  // Pull the effective plan (may have an owner-set price override).
  const effective = getEffectivePlans().find((p) => p.code === planCode)
  const plan = effective ?? findPlan(planCode)!
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad('Valid email required')
  if (!whatsapp || whatsapp.replace(/\D/g, '').length < 7) return bad('Valid WhatsApp number required')

  const rec = createPaymentCode({
    planCode,
    amountGhs: plan.amountGhs,
    email,
    whatsapp,
  })

  // Build the customer-facing response NOW so we can return
  // immediately. Notifications are deferred to setImmediate below.
  const momoRecipient = getEffectiveMoMo()
  const adminPhone = getEffectiveAdminPhone()
  const adminEmail = getEffectiveNotificationTargets().email

  // ── Customer SMS (T507) ───────────────────────────────────────────
  // Tells the buyer how to actually pay. mNotify costs ~1 GHp per
  // segment so we keep this terse enough to fit one segment.
  const customerSms =
    `ScriptureLive AI: To pay GHS ${rec.amountGhs} for ${plan.label}, ` +
    `MoMo to ${momoRecipient.name} on ${momoRecipient.number}. ` +
    `Use REFERENCE ${rec.ref}. We confirm within minutes and SMS your activation code.`

  // ── Admin alert SMS (existing, now also lists the customer) ──────
  const adminAlertBody =
    `ScriptureLive: new payment ref ${rec.ref} for ${plan.label} ` +
    `(GHS ${rec.amountGhs}). Customer ${email} / ${whatsapp}. ` +
    `Confirm in admin panel once MoMo deposit lands.`

  // Fire-and-forget: schedule on the next tick so the response is
  // already on the wire by the time SMTP/mNotify start dialing out.
  setImmediate(() => {
    // Customer SMS (payment instructions).
    void notifySms({
      to: whatsapp,
      subject: `[ScriptureLive] Payment instructions — ref ${rec.ref}`,
      body: customerSms,
    }).catch((e) => console.error('[payment-code] customer SMS failed:', e))

    // Admin alert SMS.
    void notifySms({
      to: adminPhone,
      subject: `New payment ref ${rec.ref}`,
      body: adminAlertBody,
    }).catch((e) => console.error('[payment-code] admin SMS failed:', e))

    // Admin alert email (full details for the audit trail).
    void notifyEmail({
      to: adminEmail,
      subject: `New payment ref ${rec.ref} — ${plan.label}`,
      body:
        adminAlertBody +
        `\n\nDetails:\n` +
        `  Reference: ${rec.ref}\n` +
        `  Plan:      ${plan.label} (${plan.code})\n` +
        `  Amount:    GHS ${rec.amountGhs}\n` +
        `  Customer:  ${email}\n` +
        `  WhatsApp:  ${whatsapp}\n` +
        `  Created:   ${rec.createdAt}\n` +
        `  Expires:   ${rec.expiresAt}\n`,
    }).catch((e) => console.error('[payment-code] admin email failed:', e))
  })

  return NextResponse.json({
    ref: rec.ref,
    planCode: rec.planCode,
    planLabel: plan.label,
    amountGhs: rec.amountGhs,
    createdAt: rec.createdAt,
    expiresAt: rec.expiresAt,
    momoRecipient,
  })
}

function bad(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 })
}
