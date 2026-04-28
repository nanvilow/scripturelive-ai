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
import { activateCode, peekActivationSource } from '@/lib/licensing/storage'
import { findPlan } from '@/lib/licensing/plans'
import { isMasterCode } from '@/lib/licensing/codes'
import { notifyEmail, whatsappLink } from '@/lib/licensing/notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 }) }
  const code = String((body as Record<string, unknown>)?.code ?? '').trim().toUpperCase()
  if (!code) return NextResponse.json({ error: 'Activation code required' }, { status: 400 })

  // v0.6.5 — Code-class cross-rejection. The subscription modal has
  // two activation entry boxes (Step 3 = paid activation, Bottom =
  // generated/master). Pre-v0.6.5 either box accepted any valid
  // code, so customers routinely pasted the wrong one and got
  // confusing "code not recognised" errors. Frontend now passes
  // `expectedType` ('activation' | 'master') and we reject up front
  // with a precise, copy-paste-able message that names the OTHER box.
  // Note: we do BOTH a format-prefix check (catches SL-MASTER-* even
  // before storage lookup) AND a storage classify (paid vs standalone)
  // so a typed-but-unsaved code still gets the right verdict.
  const expectedRaw = String((body as Record<string, unknown>)?.expectedType ?? '').toLowerCase()
  if (expectedRaw === 'activation' || expectedRaw === 'master') {
    if (isMasterCode(code) && expectedRaw !== 'master') {
      return NextResponse.json({
        error: 'This is a master/generated code. Use the bottom box ("Enter your generated and master code") to activate it.',
      }, { status: 400 })
    }
    if (!isMasterCode(code)) {
      const src = peekActivationSource(code)
      if (src === 'master' && expectedRaw !== 'master') {
        return NextResponse.json({
          error: 'This is a master/generated code. Use the bottom box ("Enter your generated and master code") to activate it.',
        }, { status: 400 })
      }
      if (src === 'paid' && expectedRaw === 'master') {
        return NextResponse.json({
          error: 'This is a paid activation code. Use the top box ("Enter activation code after payment") to activate it.',
        }, { status: 400 })
      }
      if (src === 'standalone' && expectedRaw === 'activation') {
        return NextResponse.json({
          error: 'This is a generated (admin-issued) code, not a paid activation code. Use the bottom box ("Enter your generated and master code") to activate it.',
        }, { status: 400 })
      }
      // src === 'unknown' falls through — activateCode() raises the
      // standard "code not recognised" error so typos look the same
      // regardless of which box they land in.
    }
  }

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
