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
import { activateCode, peekActivationSource, mergeActivationFromCloud, getFile } from '@/lib/licensing/storage'
import { findPlan } from '@/lib/licensing/plans'
import { isMasterCode } from '@/lib/licensing/codes'
import { notifyEmail, whatsappLink } from '@/lib/licensing/notifications'
import { captureGeoFromRequest } from '@/lib/licensing/geoip'
import { cloudClaimActivation } from '@/lib/licensing/cloud-sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // v0.7.96 — Top-level try/catch around the WHOLE route. Same
  // protection we added to /api/license/deactivate in v0.7.95: any
  // unhandled throw inside a Next.js App-Router POST handler kills
  // the request without a response body, which the renderer's
  // fetch() surfaces as a network error and Chromium can paint as
  // chrome-error://chromewebdata. Returning a JSON 500 keeps the
  // renderer happy (toast.error) and means the bundled Next server
  // never falls into the auto-restart path that briefly orphans the
  // window.
  try {
    return await activateImpl(req)
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[license/activate] unhandled error in route handler:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Activation failed unexpectedly. Please try again.' },
      { status: 500 },
    )
  }
}

async function activateImpl(req: NextRequest) {
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
      // v0.7.121 — REMOVED stale `standalone + activation` cross-rejection.
      // The two-box UI it was guarding against was retired in v0.7.75 in
      // favour of a single unified activation input that auto-detects
      // master codes by SL-MASTER prefix and otherwise sends
      // expectedType='activation'. With one input, ALL non-master codes
      // (paid AND admin-issued/standalone) must activate from the same
      // box. Operator escalation: "i tried activating an admin-generated
      // code and it errored 'This is a generated (admin-issued) code,
      // not a paid activation code. Use the bottom box…' but there IS
      // no bottom box anymore." Master/paid cross-checks above are
      // unchanged — only the standalone rejection is dropped.
    }
  }

  // v0.7.0 — Capture client IP + free geo lookup so the admin
  // dashboard can show where each code was activated from. Best-
  // effort; if the lookup fails we still record the IP. Kept
  // INLINE because it gates ledger write (we want the geo on the
  // record at activation time, not 3 seconds later).
  const geoCtx = await captureGeoFromRequest(req).catch(() => ({}))

  // v0.7.145 — Cross-machine activation. activateCode() ONLY knows
  // about codes that exist in THIS install's local ledger. Admin
  // codes minted on a different PC (admin's PC, or the cloud admin
  // dashboard) are unknown locally → "not recognised" error.
  //
  // Recovery: when activateCode throws, we ask the cloud whether IT
  // knows the code. Cloud atomically claims it for this installId,
  // returns the row, we mirror it into the local ledger, then re-run
  // activateCode locally. Subsequent activations of the same code on
  // this install hit the local row directly (no cloud round-trip).
  //
  // Master codes (SL-MASTER-…) are exempt from the cloud round-trip
  // because they're machine-baked at build time, not minted by admin.
  let result
  try { result = activateCode(code, geoCtx) }
  catch (e) {
    const localErr = e instanceof Error ? e.message : String(e)
    const looksUnknown = /not recognis|not found|unknown|invalid/i.test(localErr)
    if (!looksUnknown || isMasterCode(code)) {
      return NextResponse.json({ error: localErr }, { status: 400 })
    }
    // Try cloud lookup. cloudClaimActivation is a no-op (returns null)
    // when called from the cloud itself or when SCRIPTURELIVE_CLOUD_BASE
    // is empty — so this branch is only meaningful on customer installs.
    let installId = ''
    try { installId = getFile().installId } catch { /* fresh install — should not happen post-getFile init */ }
    if (!installId) {
      return NextResponse.json({ error: localErr }, { status: 400 })
    }
    let cloudRow
    try {
      cloudRow = await cloudClaimActivation(code, installId)
    } catch (cloudErr) {
      // Network failure → return original local error (don't confuse
      // the customer with two stacked failures).
      console.error('[license/activate] cloud claim threw:', cloudErr)
      return NextResponse.json({ error: localErr }, { status: 400 })
    }
    if (!cloudRow) {
      return NextResponse.json(
        { error: 'Activation code not recognised. If admin generated it on another PC, ensure your computer has internet — we sync codes from the central server. Otherwise check the code and try again.' },
        { status: 400 },
      )
    }
    mergeActivationFromCloud(cloudRow)
    // Retry locally now that the row exists. If THIS still fails we
    // surface the real error from activateCode.
    try { result = activateCode(code, geoCtx) }
    catch (retryErr) {
      return NextResponse.json(
        { error: retryErr instanceof Error ? retryErr.message : String(retryErr) },
        { status: 400 },
      )
    }
  }

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
