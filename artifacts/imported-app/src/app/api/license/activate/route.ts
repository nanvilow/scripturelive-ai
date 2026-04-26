// POST /api/license/activate
//
// Body: { code: string }    ← the SL-{plan}-XXXXXX activation code
//                              (or the master code) the customer typed
// Resp: { status, activated, receipt }
//
// Step 4 of the customer flow. Customer pastes the activation code
// the operator sent them (after confirming MoMo). We:
//   1. find the code in the activationCodes ledger
//   2. reject if missing, already used, or master mismatch
//   3. mark used + create the activeSubscription row
//   4. return the new SubscriptionStatus + a receipt the front-end
//      can show / let the customer copy / forward to themselves
//   5. fire a customer-receipt notification (email + wa.me link)

import { NextRequest, NextResponse } from 'next/server'
import { activateCode } from '@/lib/licensing/storage'
import { findPlan } from '@/lib/licensing/plans'
import { notifyEmail, whatsappLink } from '@/lib/licensing/notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 }) }
  const code = String((body as Record<string, unknown>)?.code ?? '').trim().toUpperCase()
  if (!code) return NextResponse.json({ error: 'Activation code required' }, { status: 400 })

  let result
  try { result = activateCode(code) }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 }) }

  const { status, activated } = result
  const plan = findPlan(activated.planCode)
  const planLabel = activated.isMaster ? 'Master (lifetime)' : (plan?.label ?? activated.planCode)

  // Customer + owner receipts
  const receiptEmail = activated.generatedFor?.email
  const receiptWhats = activated.generatedFor?.whatsapp
  const receiptLines = [
    'ScriptureLive AI — Subscription Receipt',
    '',
    `Activation code:  ${activated.code}`,
    `Plan:             ${planLabel}`,
    `Days granted:     ${activated.days}`,
    `Activated at:     ${activated.usedAt ?? new Date().toISOString()}`,
    activated.subscriptionExpiresAt ? `Expires:          ${activated.subscriptionExpiresAt}` : '',
    '',
    'Thank you for choosing ScriptureLive AI.',
  ].filter(Boolean).join('\n')

  let customerEmailNote = null
  let waLink: string | null = null
  try {
    if (receiptEmail) {
      const e = await notifyEmail({
        to: receiptEmail,
        subject: `Your ScriptureLive AI activation — ${planLabel}`,
        body: receiptLines,
      })
      customerEmailNote = { id: e.id, status: e.status, error: e.error }
    }
    if (receiptWhats) {
      waLink = whatsappLink(receiptWhats, receiptLines)
    }
    // Always tell the owner too (mirrors confirm step in case they
    // miss it).
    await notifyEmail({
      subject: `[ScriptureLive] Activation used — ${activated.code}`,
      body: receiptLines + `\n\nCustomer email:    ${receiptEmail ?? '(unknown)'}\nCustomer WhatsApp: ${receiptWhats ?? '(unknown)'}`,
    })
  } catch { /* receipts best-effort */ }

  return NextResponse.json({
    status: {
      state: status.state,
      daysLeft: status.daysLeft,
      msLeft: Math.min(status.msLeft, Number.MAX_SAFE_INTEGER),
      isMaster: status.isMaster,
      activeSubscription: status.activeSubscription,
    },
    activated: {
      code: activated.code,
      planCode: activated.planCode,
      planLabel,
      days: activated.days,
      usedAt: activated.usedAt,
      subscriptionExpiresAt: activated.subscriptionExpiresAt,
      isMaster: !!activated.isMaster,
    },
    receipt: {
      text: receiptLines,
      customerEmailNote,
      whatsappLink: waLink,
    },
  })
}
