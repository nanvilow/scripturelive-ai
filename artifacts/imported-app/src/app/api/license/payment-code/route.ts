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
} from '@/lib/licensing/plans'
import { createPaymentCode } from '@/lib/licensing/storage'

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
