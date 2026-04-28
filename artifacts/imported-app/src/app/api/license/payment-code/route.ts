// POST /api/license/payment-code
//
// Body: { planCode: '1M' | '2M' | ... | '1Y', email: string, whatsapp: string }
// Resp: { ref, planCode, amountGhs, expiresAt, momoRecipient }
//
// Step 1 of the customer flow: customer picks a plan in the
// subscription modal, the front-end calls this endpoint, we mint a
// 3-digit reference code, and the customer types it into the MoMo
// "reference" field when paying.

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
  // v0.5.48 — pull the effective plan (may have an owner-set price
  // override) instead of the compiled-in default. `findPlan` is still
  // the source of truth for the canonical label/days; we only swap
  // amountGhs from the effective list.
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

  // v0.6.6 — Fire admin alerts immediately on payment-code creation.
  // Pre-v0.6.6 the admin only learned about a pending payment when
  // they checked email or opened the admin panel; the operator wants
  // a phone-buzz so they can keep an eye out for the matching MoMo
  // deposit. SMS goes to ADMIN_NOTIFICATION_PHONE (overridable via
  // RuntimeConfig.adminPhone). Email goes to the existing
  // notifyEmail target. Both fire-and-forget — failure must NOT
  // block the customer's payment-code creation, so we wrap each in
  // its own try/catch and let the audit log record the result.
  const adminPhone = getEffectiveAdminPhone()
  const adminEmail = getEffectiveNotificationTargets().email
  const alertBody =
    `ScriptureLive: new payment ref ${rec.ref} for ${plan.label} ` +
    `(GHS ${rec.amountGhs}). Customer ${email} / ${whatsapp}. ` +
    `Confirm in admin panel once MoMo deposit lands.`
  // SMS — admin's personal phone (mNotify gateway, body-only payload).
  try {
    await notifySms({
      to: adminPhone,
      subject: `New payment ref ${rec.ref}`,
      body: alertBody,
    })
  } catch (e) { console.error('[payment-code] admin SMS failed:', e) }
  // Email — admin's notification address (full details in the body).
  try {
    await notifyEmail({
      to: adminEmail,
      subject: `New payment ref ${rec.ref} — ${plan.label}`,
      body:
        alertBody +
        `\n\nDetails:\n` +
        `  Reference: ${rec.ref}\n` +
        `  Plan:      ${plan.label} (${plan.code})\n` +
        `  Amount:    GHS ${rec.amountGhs}\n` +
        `  Customer:  ${email}\n` +
        `  WhatsApp:  ${whatsapp}\n` +
        `  Created:   ${rec.createdAt}\n` +
        `  Expires:   ${rec.expiresAt}\n`,
    })
  } catch (e) { console.error('[payment-code] admin email failed:', e) }

  return NextResponse.json({
    ref: rec.ref,
    planCode: rec.planCode,
    planLabel: plan.label,
    amountGhs: rec.amountGhs,
    createdAt: rec.createdAt,
    expiresAt: rec.expiresAt,
    // Owner-overridable MoMo recipient (Admin Settings tab).
    momoRecipient: getEffectiveMoMo(),
  })
}

function bad(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 })
}
