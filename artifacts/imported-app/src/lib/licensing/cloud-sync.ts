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

import type {
  ActivationCodeRecord,
  PaymentCodeRecord,
  NotificationRecord,
  RuntimeConfig,
} from './storage'

// v0.7.153 — Cross-device admin-panel sync.
//
// Every install (the cloud at scripturelive.replit.app + every
// desktop install) holds its own ~/.scripturelive/license.json.
// Pre-v0.7.153 admin actions on one install were invisible on every
// other — the operator could confirm a payment on their phone and
// see no record of it on the desktop ten minutes later, and vice
// versa. The single cloud ledger is now treated as the canonical
// admin record store: every admin write fans out a snapshot push
// from the writing install, and every admin read pulls the latest
// snapshot from the cloud and merges it into the local cache before
// answering.
//
// Auth: the cloud's own `masterCode` is the shared secret. Each
// desktop install pairs to the cloud once by saving that string as
// `cloudAdminCode` in its RuntimeConfig (or via the
// SCRIPTURELIVE_CLOUD_ADMIN_CODE env var). Without it the helpers
// below no-op. The cloud refuses any request whose supplied code
// does not match its own masterCode (constant-time compare).
//
// Snapshot shape is intentionally narrow: only the rows the admin
// dashboard actually displays. Active-subscription state, master
// code, install id, trial counters, etc. stay strictly local —
// they describe the THIS-DEVICE installation, not the cross-device
// admin record store.

export interface AdminLedgerSnapshot {
  paymentCodes: PaymentCodeRecord[]
  activationCodes: ActivationCodeRecord[]
  notifications: NotificationRecord[]
  /** Subset of RuntimeConfig that operators expect to see synced
   *  across devices (prices, contact numbers, trial duration, …).
   *  Per-PC fields like `cloudAdminCode` and the local
   *  `adminPassword` are deliberately stripped before push. */
  config?: Partial<RuntimeConfig>
  /** Tombstone arrays so cross-device merge cannot resurrect
   *  hard-deleted records. Each entry is { primary-key, deletedAt }.
   *  See storage.ts `applyAdminLedgerSnapshot` for the merge rule. */
  deletedPaymentRefs?: { ref: string; deletedAt: string }[]
  deletedActivationCodes?: { code: string; deletedAt: string }[]
  deletedNotificationIds?: { id: string; deletedAt: string }[]
}

// v0.7.264 — Completes the v0.7.256 Hetzner migration. v0.7.256 flipped
// the transcribe/telemetry defaults AND the cloud-sync-test DIAGNOSTIC
// route to cloud.scriptureliveai.com, but MISSED this file — the one
// that performs the ACTUAL admin-ledger pull/push, activation claim, and
// payment mirror. Desktop installs (where SCRIPTURELIVE_CLOUD_BASE is
// unset) therefore read/wrote real admin records against the dead
// scripturelive.replit.app while the "Cross-device sync: connected"
// badge (driven by cloud-sync-test) pointed at Hetzner — so records
// showed differently on every PC. Default now matches the canonical
// store. Env override (read inline in cloudBase() per request) still wins.
const DEFAULT_CLOUD_BASE = 'https://cloud.scriptureliveai.com'

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

/** Resolve the shared admin-sync credential. Operator-set value in
 *  RuntimeConfig wins; env var override exists so test rigs and
 *  emergency relockdown don't need a UI. Returns null when sync is
 *  unconfigured — every admin-sync helper short-circuits on null. */
function adminSyncCode(localConfig?: { cloudAdminCode?: string } | null): string | null {
  const cfg = localConfig?.cloudAdminCode?.trim()
  if (cfg) return cfg
  const env = process.env.SCRIPTURELIVE_CLOUD_ADMIN_CODE?.trim()
  if (env) return env
  // v0.7.161 — Build-baked masterCode fallback. Lets every desktop
  // install auto-sync admin records with the cloud out-of-the-box,
  // with no per-PC operator setup. Per-PC license overrides + env
  // vars still win (so an operator can repoint a single PC at a
  // different cloud install if needed).
  try {
    // Lazy require to avoid circular import on initial module load.
    const { getCloudAdminCode } = require('@/lib/baked-credentials') as { getCloudAdminCode: () => string }
    const baked = getCloudAdminCode()?.trim()
    if (baked) return baked
  } catch { /* baked file missing — fall through */ }
  return null
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

// ─── v0.7.153 — Admin-ledger pull / push ────────────────────────────

/** Pull the cloud's full admin snapshot. Returns null when the cloud
 *  is unreachable, the credential is missing/wrong, or we're running
 *  ON the cloud (self-loop). Caller treats null as "no remote
 *  changes available right now — keep using local cache". */
export async function cloudPullAdminLedger(opts: {
  installId: string
  config?: { cloudAdminCode?: string } | null
  timeoutMs?: number
}): Promise<AdminLedgerSnapshot | null> {
  const base = cloudBase()
  if (!base) return null
  const code = adminSyncCode(opts.config)
  if (!code) return null
  try {
    const r = await fetch(`${base}/api/license/cloud/admin-snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cloudAdminCode: code, installId: opts.installId }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
    })
    if (!r.ok) return null
    const j = (await r.json()) as { ok?: boolean; snapshot?: AdminLedgerSnapshot }
    if (!j?.ok || !j.snapshot) return null
    return j.snapshot
  } catch {
    return null
  }
}

/** Fire-and-forget push of the local admin snapshot to the cloud.
 *  No return value — failures are logged and swallowed. The cloud
 *  side merges by primary key; redundant pushes are cheap and
 *  idempotent. */
export function cloudPushAdminLedger(opts: {
  installId: string
  config?: { cloudAdminCode?: string } | null
  snapshot: AdminLedgerSnapshot
}): void {
  const base = cloudBase()
  if (!base) return
  const code = adminSyncCode(opts.config)
  if (!code) return
  setImmediate(() => {
    void fetch(`${base}/api/license/cloud/admin-merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cloudAdminCode: code,
        installId: opts.installId,
        snapshot: opts.snapshot,
      }),
      signal: AbortSignal.timeout(8000),
    }).catch((e) => {
      // eslint-disable-next-line no-console
      console.error('[cloud-sync] admin-merge failed:', e)
    })
  })
}

/** Awaitable variant used by the cloud-merge route handler when it
 *  needs to know the merged result (e.g. to echo it back). Same
 *  contract as cloudPullAdminLedger but POSTs the snapshot. */
export async function cloudPushAdminLedgerAwait(opts: {
  installId: string
  config?: { cloudAdminCode?: string } | null
  snapshot: AdminLedgerSnapshot
  timeoutMs?: number
}): Promise<AdminLedgerSnapshot | null> {
  const base = cloudBase()
  if (!base) return null
  const code = adminSyncCode(opts.config)
  if (!code) return null
  try {
    const r = await fetch(`${base}/api/license/cloud/admin-merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cloudAdminCode: code,
        installId: opts.installId,
        snapshot: opts.snapshot,
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
    })
    if (!r.ok) return null
    const j = (await r.json()) as { ok?: boolean; snapshot?: AdminLedgerSnapshot }
    if (!j?.ok || !j.snapshot) return null
    return j.snapshot
  } catch {
    return null
  }
}

/** True iff this process is the cloud-deployed instance — used by
 *  storage.ts to skip the auto-push debounce loop on the cloud (it
 *  IS the source of truth, no need to push back to itself). */
export function isCloudInstance(): boolean {
  return !!process.env.REPLIT_DEPLOYMENT_ID
}
