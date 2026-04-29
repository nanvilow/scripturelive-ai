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
//   5. fire customer + owner receipt notifications
//
// v0.7.5 — Receipt notifications are now FIRE-AND-FORGET (T506).
// Pre-v0.7.5 the customer saw a 3-5s spinner after clicking
// Activate while we waited for SMTP. Now we return as soon as the
// ledger write succeeds; the receipt email lands a few seconds
// later. Failures are still recorded in the audit log.

import { NextRequest, NextResponse } from 'next/server'
import { activateCode, peekActivationSource } from '@/lib/licensing/storage'
import { findPlan } from '@/lib/licensing/plans'
import { isMasterCode } from '@/lib/licensing/codes'
import { notifyEmail, whatsappLink } from '@/lib/licensing/notifications'
import { captureGeoFromRequest } from '@/lib/licensing/geoip'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 }) }
  const code = String((body as Record<string, unknown>)?.code ?? '').trim().toUpperCase()
  if (!code) return NextResponse.json({ error: 'Activation code required' }, { status: 400 })

  // v0.6.5 — Code-class cross-rejection. (Unchanged from v0.7.4.)
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
    }
  }

  // v0.7.0 — Capture client IP + free geo lookup so the admin
  // dashboard can show where each code was activated from. Best-
  // effort; if the lookup fails we still record the IP. Kept
  // INLINE because it gates ledger write (we want the geo on the
  // record at activation time, not 3 seconds later).
  const geoCtx = await captureGeoFromRequest(req).catch(() => ({}))

  let result
  try { result = activateCode(code, geoCtx) }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 }) }

  const { status, activated } = result
  const plan = findPlan(activated.planCode)
  const planLabel = activated.isMaster ? 'Master (lifetime)' : (plan?.label ?? activated.planCode)

  // Build receipt text now (used in response AND notifications).
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

  // wa.me link is synthetic (just URL composition) so we keep it
  // inline — no network call.
  const waLink = receiptWhats ? whatsappLink(receiptWhats, receiptLines) : null

  // ── Fire-and-forget receipt emails ───────────────────────────────
  setImmediate(() => {
    if (receiptEmail) {
      void notifyEmail({
        to: receiptEmail,
        subject: `Your ScriptureLive AI activation — ${planLabel}`,
        body: receiptLines,
      }).catch((e) => console.error('[activate] customer receipt email failed:', e))
    }
    // Always tell the owner too (mirrors confirm step in case they
    // miss it). No `to` → uses configured owner notify email.
    void notifyEmail({
      subject: `[ScriptureLive] Activation used — ${activated.code}`,
      body: receiptLines + `\n\nCustomer email:    ${receiptEmail ?? '(unknown)'}\nCustomer WhatsApp: ${receiptWhats ?? '(unknown)'}`,
    }).catch((e) => console.error('[activate] owner receipt email failed:', e))
  })

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
      // v0.7.5 — Customer email is now async; the response no longer
      // surfaces a per-delivery id. The audit log records the result.
      customerEmailNote: null,
      whatsappLink: waLink,
    },
  })
}
