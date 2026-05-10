// v0.7.145 — Cloud sync helpers for cross-machine activation + payments.
//
// Background: each Electron install ships its own bundled Next.js
// server with its own ~/.scripturelive/license.json. Codes generated
// by an admin on PC A never reach customer's PC B because nothing is
// shared. Same for payments: a customer's payment-code lands in their
// own local ledger, never in the admin's "Recent Payments" view.
//
// This module bridges the two by talking to the canonical cloud
// deployment at scripturelive.replit.app:
//
//   • cloudClaimActivation(code, installId) — atomically claim an
//     admin-generated code on the cloud so it's marked used + stamped
//     to this installId, then return the activation metadata so the
//     local activate route can mirror it into the local ledger and
//     finish the activation locally.
//
//   • cloudMirrorPayment(rec) — fire-and-forget POST that pushes a
//     freshly created customer payment-code record up to the cloud
//     ledger so the admin dashboard's "Recent Payments" sees it.
//
// Both helpers are NO-OPS when:
//   • we're already running ON the cloud (avoid self-loop)
//   • SCRIPTURELIVE_CLOUD_BASE is set to the empty string (dev opt-out)
//
// Failures NEVER throw — callers treat null / false as "skip".

import type { ActivationCodeRecord, PaymentCodeRecord } from './storage'

const DEFAULT_CLOUD_BASE = 'https://scripturelive.replit.app'

/** Resolve the cloud base URL. Empty string = disabled (dev). */
function cloudBase(): string | null {
  const raw = process.env.SCRIPTURELIVE_CLOUD_BASE
  if (raw === '') return null
  const base = (raw ?? DEFAULT_CLOUD_BASE).replace(/\/+$/, '')
  // Best-effort self-loop guard: when the cloud-deployed copy of
  // this same codebase boots, REPLIT_DEPLOYMENT_ID is set. We MUST
  // NOT have the cloud talk to itself for activation lookups (would
  // recurse forever). Customers' Electron installs never set this
  // env var — process.env.REPLIT_DEPLOYMENT_ID is undefined there.
  if (process.env.REPLIT_DEPLOYMENT_ID) return null
  return base
}

/**
 * Atomically claim an admin-generated activation code on the cloud.
 *
 * Returns the cloud's ActivationCodeRecord (or null if not found / not
 * reachable / already claimed by a different install). When non-null,
 * the caller should append this row to the local activationCodes
 * array and immediately invoke the existing local activateCode() so
 * the local subscription is created exactly the same way as if the
 * code had been minted locally.
 */
export async function cloudClaimActivation(
  code: string,
  installId: string,
): Promise<ActivationCodeRecord | null> {
  const base = cloudBase()
  if (!base) return null
  try {
    const r = await fetch(`${base}/api/license/cloud/claim-activation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, installId }),
      // 8s ceiling so the activate route never hangs the renderer.
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return null
    const j = (await r.json()) as { ok?: boolean; activation?: ActivationCodeRecord }
    if (!j?.ok || !j.activation) return null
    return j.activation
  } catch {
    return null
  }
}

/**
 * Push a freshly minted local payment-code up to the cloud so the
 * admin dashboard sees it under "Recent Payments". Fire-and-forget;
 * a failure does not affect the customer-facing response.
 */
export function cloudMirrorPayment(rec: PaymentCodeRecord, installId: string): void {
  const base = cloudBase()
  if (!base) return
  // Don't await — this is best-effort. setImmediate so the response
  // is already on the wire when we start dialing.
  setImmediate(() => {
    void fetch(`${base}/api/license/cloud/mirror-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ installId, payment: rec }),
      signal: AbortSignal.timeout(8000),
    }).catch((e) => {
      // eslint-disable-next-line no-console
      console.error('[cloud-sync] mirror-payment failed:', e)
    })
  })
}
