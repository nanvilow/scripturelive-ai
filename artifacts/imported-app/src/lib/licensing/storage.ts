// v1 licensing — file-backed storage.
//
// Everything licensing-related lives in a single JSON file written
// atomically (write-temp → rename). On the customer's Windows install
// this file lives at  %USERPROFILE%\.scripturelive\license.json, and
// in the Replit dev preview / Linux it lives at  ~/.scripturelive/
// license.json. We deliberately do NOT use the existing Prisma DB
// because licensing must survive every kind of reset the customer
// might run on the SQLite app DB and because we need it to load
// before any DB connection has opened.
//
// The file is ~1-100 KB even after years of use; we hold the entire
// thing in memory between requests and serialise per write.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  generateActivationCode,
  generateMasterCode,
  generatePaymentRef,
} from './codes'
// v0.7.179 — Pin per-PC masterCode to the baked cloud admin code so
// every install's local Master Code (visible in Admin Panel) matches
// the cloud's masterCode out-of-the-box → cross-device sync auto-
// resolves to "connected" with no operator setup. See freshFile() +
// load() + the self-heal block for the full chain.
import { BAKED_CLOUD_ADMIN_CODE } from '@/lib/baked-credentials'

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────
export type PaymentStatus = 'WAITING_PAYMENT' | 'PAID' | 'EXPIRED' | 'CONSUMED'

export interface PaymentCodeRecord {
  ref: string
  planCode: string
  amountGhs: number
  email: string
  whatsapp: string
  status: PaymentStatus
  createdAt: string   // ISO
  expiresAt: string   // ISO  (createdAt + 15 min)
  paidAt?: string     // ISO  (set when admin confirms)
  /** activation code generated for this payment, if any */
  activationCode?: string
}

export interface ActivationCodeRecord {
  code: string
  planCode: string
  days: number
  /** v0.6.3 — exact duration in milliseconds. When present, the
   *  activation engine uses THIS for expiry math instead of
   *  `days * 86400000`, preserving sub-day granularity (a 20-minute
   *  code expires 20 minutes after activation, not 1 day later).
   *  Older records minted before v0.6.3 don't carry this field — the
   *  activation engine falls back to `days * 86400000` for them so
   *  no operator history breaks. */
  durationMs?: number
  generatedAt: string   // ISO
  /** v0.5.48 — `note` is a free-text label entered by the owner when
   *  generating a code by hand from the Admin → Generate panel
   *  (e.g. "Cathedral Lagos — Pastor John"). It does NOT affect
   *  licensing logic; it's stored purely so the owner can identify
   *  who an issued code belongs to in the Recent Activations list. */
  generatedFor?: { email?: string; whatsapp?: string; paymentRef?: string; note?: string }
  isUsed: boolean
  usedAt?: string       // ISO
  /** populated when the user activates: when the resulting subscription expires */
  subscriptionExpiresAt?: string
  /** master codes never expire and may be re-used (isUsed stays false) */
  isMaster?: boolean

  // ─── v0.7.0 — Activation-code admin dashboard ────────────────────
  // Operator request: a single place to keep records of every code,
  // see who's using it from where, cancel/renew at will, and restore
  // accidental deletions for up to a week. Each new field is OPTIONAL
  // so the upgrade is safe — older records load and display fine.
  /** Buyer's phone number (ITU-formatted, no +). Mirrors
   *  generatedFor.whatsapp when present, but kept distinct so the
   *  admin panel can show a guaranteed phone column even when
   *  generatedFor was never populated (legacy paid codes). */
  buyerPhone?: string
  /** Set when admin cancels the code from the dashboard. A cancelled
   *  code can no longer activate AND any active subscription using
   *  it is terminated. */
  cancelledAt?: string
  /** Free-text reason captured at cancel time so the audit trail is
   *  meaningful (e.g. "chargeback", "test code", "duplicate sale"). */
  cancelReason?: string
  /** Last time we observed this code's installation pinging the
   *  license server (license/status, license/activate, NDI heartbeat).
   *  Refreshed on every status check so admin can see liveness. */
  lastSeenAt?: string
  /** Public IP we observed the install from. Stored so admin can
   *  cross-check geo lookups and follow-up on disputed regions. */
  lastSeenIp?: string
  /** Coarse geolocation derived from lastSeenIp via the free
   *  ip-api.com endpoint (no key required for non-commercial use,
   *  45 req/min limit). Format: "City, RegionName, Country (CC)".
   *  Empty string when geo lookup failed; absent on never-used codes. */
  lastSeenLocation?: string
  /** Soft-delete timestamp. The dashboard's "delete" button sets this
   *  instead of removing the record. The bin retains the row for
   *  exactly 90 days (v0.7.3 — was 7 days); on the next storage read
   *  after that window passes the row is purged. Operator can Restore
   *  at any time before the purge. */
  softDeletedAt?: string
  /** v0.7.153 — Restore timestamp. Set by restoreActivationByCode
   *  whenever an operator brings a soft-deleted row back. Without
   *  this field the cross-device merge can't tell "remote restored
   *  AFTER local soft-deleted" from "remote never knew about the
   *  soft-delete" — laterIso(local.softDeletedAt, undefined) just
   *  preserves local. With it, the merge picks
   *  max(softDeletedAt, softDeleteRestoredAt) per side and the side
   *  with the strictly-later timestamp wins. */
  softDeleteRestoredAt?: string

  // ─── v0.7.11 — Transferable activation (move-to-another-PC) ──────
  // Pastebin item #6 followup: the v0.5.48 "Deactivate on this PC"
  // button only nulled the local activeSubscription, leaving the
  // activation row stuck at isUsed=true so the same code refused to
  // activate anywhere else. Customers swapping PCs lost remaining
  // days. v0.7.11 adds a true transfer path: transferActivationByCode
  // flips isUsed back to false, sets transferredAt, and PRESERVES
  // subscriptionExpiresAt as the absolute deadline so the new install
  // inherits the original remaining time (no extension, no reset).
  /** Last time the operator transferred this code off a device. When
   *  set together with `isUsed === false`, activateCode() treats the
   *  next activation as a transfer-in and reuses the existing
   *  subscriptionExpiresAt instead of computing a fresh deadline. */
  transferredAt?: string
  /** Total transfer events ever recorded for this code. Useful for the
   *  admin dashboard to spot codes ping-ponging across installs. */
  transferCount?: number
  /** First-ever activation timestamp. Set on the first activateCode()
   *  pass and preserved across transfers so the audit trail keeps
   *  pointing at the original activation moment. `usedAt` continues
   *  to track the MOST RECENT activation. */
  originalActivatedAt?: string
}

export interface NotificationRecord {
  id: string
  ts: string
  channel: 'email' | 'whatsapp' | 'sms'
  to: string
  subject: string
  body: string
  /** 'sent' = SMTP/etc accepted, 'pending' = queued for owner, 'failed' = error */
  status: 'sent' | 'pending' | 'failed'
  error?: string
}

export interface ActiveSubscription {
  activationCode: string
  planCode: string
  days: number
  /** v0.6.3 — exact duration in milliseconds copied from the
   *  activation record. Kept alongside `days` so older code paths
   *  that still read `days` for display rounding keep working, while
   *  new precision-sensitive paths (msLeft, expiresAt) use this. */
  durationMs?: number
  activatedAt: string
  expiresAt: string
  isMaster: boolean
}

/**
 * Owner-controlled runtime configuration (v0.5.48). Lets the owner
 * tweak prices, contact numbers, trial duration, and admin password
 * from the in-app Admin Settings tab WITHOUT redeploying. All fields
 * are optional — when undefined the licensing layer falls back to
 * the compiled-in defaults (PLANS, MOMO_RECIPIENT, NOTIFICATION_*,
 * TRIAL_DURATION_MS, ADMIN_PASSWORD).
 */
export interface RuntimeConfig {
  /** Owner-set admin gate password (replaces the compiled default) */
  adminPassword?: string
  /** Trial length in minutes (1..1440). Default 60. */
  trialMinutes?: number
  /** Override the MoMo recipient phone number */
  momoNumber?: string
  /** Override the MoMo recipient name (shown to customers in the modal) */
  momoName?: string
  /** Override the WhatsApp number printed in payment receipts + admin */
  whatsappNumber?: string
  /** Override the email address that admin notifications go to */
  notifyEmail?: string
  /** v0.6.6 — Admin's PERSONAL phone for receiving payment-code SMS
   *  alerts. Distinct from momoNumber/whatsappNumber. Defaults to the
   *  compiled-in ADMIN_NOTIFICATION_PHONE if unset. */
  adminPhone?: string
  /** Per-plan price override map: { '1M': 250, '6M': 1100, ... } */
  planPriceOverrides?: Partial<Record<string, number>>
  /** v0.5.52 — Override the BAKED OpenAI Whisper key. When empty,
   *  the renderer uses NEXT_PUBLIC_SCRIPTURELIVE_OPENAI_KEY. */
  adminOpenAIKey?: string
  /** v0.5.52 — Override the BAKED Deepgram key. When empty,
   *  the renderer uses NEXT_PUBLIC_SCRIPTURELIVE_DEEPGRAM_KEY. */
  adminDeepgramKey?: string
  /** v0.7.29 (introduced) / v0.7.32 (default flipped to ON).
   *  When the resolved value is true, the speech-provider invokes
   *  the LLM voice intent classifier (src/lib/voice/llm-classifier.ts)
   *  as a FALLBACK after the regex classifier returns null or
   *  low-confidence AND the utterance passes the command-likeness
   *  gate (src/lib/voice/llm-gate.ts).
   *
   *  IMPORTANT: read this field via `isLlmClassifierEnabled(cfg)`
   *  (below) — never inline-check `cfg.enableLlmClassifier === true`,
   *  because as of v0.7.32 the semantics are "ON unless explicitly
   *  set to false". A missing/undefined value MUST be treated as ON.
   *  The kill switch in Admin Modal → Cloud Keys persists `false`
   *  when an operator unticks it; the absence of the field means
   *  "operator never touched it → use the default (ON)". */
  enableLlmClassifier?: boolean
  /** v0.7.29 — Per-PC override for the LLM classifier confidence
   *  floor (1..100). Below this threshold, classifyIntent returns
   *  null and the dispatcher does NOT fire a command. Default 70
   *  (set in llm-classifier.ts as DEFAULT_CONFIDENCE_FLOOR).
   *  Operators reporting too many false-positive commands can raise
   *  this; operators reporting missed commands can lower it. */
  llmClassifierConfidenceFloor?: number
  /** v0.7.153 — Cross-device admin sync credential. Operator pastes
   *  the cloud install's `masterCode` here once (visible on the
   *  cloud's Admin → Overview tab) to pair this desktop install
   *  with the cloud's shared admin ledger. When set (or when the
   *  SCRIPTURELIVE_CLOUD_ADMIN_CODE env var is set), every admin
   *  read pulls the cloud snapshot first and every admin write
   *  pushes the local snapshot back, so admin actions on the phone
   *  and on the desktop converge on the same record store.
   *  Strictly per-PC — never synced to the cloud (would create a
   *  trust loop). */
  cloudAdminCode?: string
  /** Last time the owner saved this config (ISO) — for audit display */
  updatedAt?: string
}

export interface LicenseFile {
  schemaVersion: 1
  installId: string
  firstLaunchAt: string
  trialDurationMs: number
  masterCode: string
  /** has the master code been emailed to the owner yet? */
  masterCodeEmailedAt?: string
  activeSubscription: ActiveSubscription | null
  paymentCodes: PaymentCodeRecord[]
  activationCodes: ActivationCodeRecord[]
  notifications: NotificationRecord[]
  /** Owner-controlled runtime config (v0.5.48) */
  config?: RuntimeConfig
  /** v0.7.5 — Activity-gated trial accounting (Apr 29, 2026).
   *  Replaces the v1 calendar-based trial (firstLaunchAt +
   *  trialDurationMs vs wall-clock now). We sum the elapsed
   *  listening time the user accrues while the mic is actually
   *  ON into `trialMsUsed`. The trial is "expired" the moment
   *  `trialMsUsed >= trialDurationMs`. Refresh, overnight wait,
   *  or the app sitting idle do NOT consume trial — only active
   *  listening does. The renderer pings POST /api/license/trial-tick
   *  every few seconds while the mic is running. */
  trialMsUsed?: number
  /** v0.7.7 — Pending admin password reset (forgot-password flow).
   *  When the operator clicks "Forgot password" we mint a 6-digit
   *  one-time code, send it via SMS to ADMIN_NOTIFICATION_PHONE
   *  and email to NOTIFICATION_EMAIL, and stash it here with a
   *  15-minute TTL. The login route accepts the code as a valid
   *  password until consumed (success) or expired. */
  pendingAdminReset?: { code: string; expiresAt: string }
  /** v0.7.13 — One-shot flag tracking whether we've sent the initial
   *  install ping to the central telemetry backend
   *  (https://scripturelive.replit.app/api/telemetry/install). Set
   *  the first time GET /api/license/status fires after install or
   *  upgrade, so the admin Records dashboard sees this install in
   *  its total-installs count. Heartbeats keep the lastSeenAt
   *  bumped, so we never re-send the install ping. */
  telemetryInstallPingedAt?: string
  /** v0.7.15 — Sticky flag: TRUE the moment any non-master activation
   *  code has ever been activated on this device. Survives reinstall
   *  because license.json lives at ~/.scripturelive/license.json and
   *  Inno Setup's uninstaller does NOT touch the user's home folder.
   *  Used by computeStatus() to refuse the free trial after an
   *  activation has already been seen — operators were uninstalling
   *  + reinstalling to "reset" their 60-minute trial, which had become
   *  a routine workaround. The trial is now strictly first-time only. */
  everActivated?: boolean
  /** v0.7.15 — Sticky lockdown flag set by deactivateSubscription().
   *  TRUE → computeStatus() must return state='expired' until a NEW
   *  activation lands (which clears it). Operator request: a
   *  Deactivated device must immediately go to the lock screen and
   *  refuse to fall back to the trial budget. Note the trial budget
   *  itself stays intact — re-activating later resets the lockdown
   *  but does not refund trial time the user already burned. */
  lockdownAfterDeactivation?: boolean

  // ─── v0.7.153 — Hard-delete tombstones ───────────────────────────
  // Pure union-by-key cross-device merge would resurrect any record
  // hard-deleted on one device the moment a stale snapshot from
  // another device merges back in. We instead append a tombstone
  // (key + deletedAt) on every hard delete and keep it for the cap
  // period. The cross-device merger checks each incoming record
  // against local tombstones BEFORE adding it, AND merges incoming
  // tombstones into the local set so a delete propagates to every
  // device. Each array is capped at 1000 most-recent.
  deletedPaymentRefs?: { ref: string; deletedAt: string }[]
  deletedActivationCodes?: { code: string; deletedAt: string }[]
  deletedNotificationIds?: { id: string; deletedAt: string }[]
}

// ─────────────────────────────────────────────────────────────────────
// Path
// ─────────────────────────────────────────────────────────────────────
function storageDir(): string {
  // Honour an explicit override (used by tests).
  const override = process.env.SCRIPTURELIVE_LICENSE_DIR
  if (override) return override
  return path.join(os.homedir(), '.scripturelive')
}

function storagePath(): string {
  return path.join(storageDir(), 'license.json')
}

// ─────────────────────────────────────────────────────────────────────
// Initialise / load
// ─────────────────────────────────────────────────────────────────────
// v0.7.15 — Trial trimmed from 60 min → 30 min. Operator analytics
// from v0.7.13/14 telemetry showed every churned trial user burned
// the full 60 min, then uninstalled to reset and tried again. Half
// the budget keeps "evaluation" honest while still giving the user
// time to demo a service. Combined with `everActivated` lockout below,
// the reinstall-to-reset workaround is now closed.
//
// v0.7.19 — Bumped 30 min → 180 min (3 hours) per operator request.
// v0.7.22 — Tightened 180 min → 70 min per operator request.
//   Rationale (operator-reported): 3 hours was too generous and gave
//   trial users effectively a full Sunday service of free use. 70 min
//   is enough to walk through the install, see verses appear during a
//   short test, and decide whether to subscribe — without being long
//   enough to cover an entire service. The `everActivated` lockout
//   still prevents the reinstall-to-reset workaround.
//
// upgradeStaleTrialDuration() (called from load()) lifts any
// previously-persisted `trialDurationMs` that's BELOW this number to
// the new value, but ONLY for trials that haven't yet been activated
// and haven't yet expired. The migration is one-way (smaller → bigger);
// it deliberately does NOT shrink an existing trial that's longer than
// the new constant, so anyone who started a v0.7.19/v0.7.20/v0.7.21
// trial keeps their already-allocated 180-minute budget rather than
// having time yanked away mid-evaluation.
// v0.7.194 — Trial model changed from activity-gated minutes to
// wall-clock days. The countdown now runs continuously from
// firstLaunchAt; closing the app, sleeping the PC, or never opening
// AI Detection do NOT pause it. Server-side computeStatus() compares
// Date.now() against firstLaunchAt + TRIAL_DURATION_MS on every call.
// trialMsUsed is no longer consulted (kept on the LicenseFile interface
// for backward read compat — old installs whose persisted JSON still
// has it just ignore it). See computeStatus() below + load() migration
// block which RESETS firstLaunchAt for any non-activated install on
// upgrade so existing operators who installed weeks ago get a fresh
// 3-day window starting from when they install v0.7.194.
const TRIAL_DURATION_MS = 3 * 24 * 60 * 60 * 1000 // 72 hours
// v0.7.3 — Bumped from 15 min → 7 days. Operator's bug report:
// "Active subscriptions are killed... it deletes active codes by
// itself while I didn't give that command." The 15-minute window
// was firing on payment codes the operator generated and hadn't
// gotten around to following up on yet, marking them EXPIRED so
// the buyer's MoMo deposit couldn't be confirmed against them.
// 7 days is enough cushion to cover a long weekend without a
// flood of stale "WAITING_PAYMENT" rows.
//
// v0.7.11 — Tightened from 7 days → 30 minutes per operator request.
// Customers were holding on to a generated payment code for days
// without following through, then trying to "use" it after the
// MoMo wallet had moved on, leading to support load. 30 minutes is
// enough time for a real customer to open MoMo, type the code as
// the reference, and confirm the transfer — anything longer is
// almost certainly a stale lead. Customers who took too long get
// a clear "code expired, start a new payment" prompt and can
// generate a fresh code in seconds.
const PAYMENT_CODE_TTL_MS = 30 * 60 * 1000 // 30 minutes

let cache: LicenseFile | null = null

// v0.7.172 — Cloud-side masterCode override.
//
// Background: the cloud deployment at scripturelive.replit.app holds
// its OWN license.json, and `f.masterCode` is the shared secret that
// `/api/license/cloud/admin-snapshot` and `/admin-merge` compare
// against `cloudAdminCode` submitted by every desktop install. Since
// v0.7.161 every desktop install bakes
// BAKED_CLOUD_ADMIN_CODE = "SL-MASTER-HETEVT56-HCKTTS74" (rotated v0.7.173) so cross-
// device sync works out-of-the-box with NO operator setup.
//
// Problem (uncovered v0.7.172): the cloud was deployed BEFORE
// v0.7.161 existed and its `f.masterCode` was generated by
// `generateMasterCode()` on first boot to a random value that does
// NOT equal the baked constant. Result: every desktop install (which
// auths with the baked value) gets HTTP 401 "cloudAdminCode does
// not match" → admin-snapshot returns null → admin-ledger never
// merges → operator-visible symptom: phone and desktop don't sync.
//
// Fix: any process can pin its `masterCode` to a known value via the
// SCRIPTURELIVE_MASTER_CODE env var. On the cloud deployment we set
// this secret to "SL-MASTER-HETEVT56-HCKTTS74" (rotated v0.7.173) — the override is
// applied in BOTH freshFile() (first ever boot) and load() (every
// subsequent boot) so even an already-deployed cloud with a stale
// random masterCode is silently re-pinned to the baked value on its
// next restart, with no manual data migration.
//
// On desktop installs the env var is NOT set, so this is a no-op and
// the per-install masterCode (random, kept inside the operator's
// own ~/.scripturelive/license.json — the operator's local admin
// password) continues to work exactly as before. The override is a
// pure cloud-side mechanism.
function envMasterCodeOverride(): string | null {
  const v = process.env.SCRIPTURELIVE_MASTER_CODE?.trim()
  return v && v.length > 0 ? v : null
}

function freshFile(): LicenseFile {
  const now = new Date().toISOString()
  return {
    schemaVersion: 1,
    installId: crypto.randomUUID(),
    firstLaunchAt: now,
    trialDurationMs: TRIAL_DURATION_MS,
    // v0.7.179 — Pin every fresh install's masterCode to the baked
    // cloud admin code (SL-MASTER-HETEVT56-HCKTTS74). Operator
    // request: "change the master code to default for every installed
    // app, same as the phone master code so the cloud can sync."
    // Result: the per-PC Master Code visible in Admin Panel matches
    // the cloud's masterCode out-of-the-box, so the cross-device sync
    // badge resolves to "connected" without any manual setup. Env
    // override (cloud deployments) still wins. Random fallback only
    // ever fires if BOTH env and baked are empty (impossible in the
    // shipped build — baked-credentials.ts always exports a literal).
    masterCode: envMasterCodeOverride() ?? (BAKED_CLOUD_ADMIN_CODE || generateMasterCode()),
    activeSubscription: null,
    paymentCodes: [],
    activationCodes: [],
    notifications: [],
  }
}

function ensureDir() {
  const dir = storageDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
}

// v0.7.11 — One-shot upgrade migration for stale MoMo wallet numbers.
// The MoMo recipient was migrated from the old 0530686367 wallet to
// the current 0246798526 wallet a couple of releases back; the
// compiled-in default in plans.ts already points at the new number,
// but operators who customised the recipient via the in-app Admin
// Settings screen still have the OLD value persisted in their
// license.json (config.momoNumber === '0530686367') — and the
// payment modal renders that persisted value, so customers were
// being asked to send MoMo to a wallet the church no longer owns.
//
// This migration silently rewrites every persisted '0530686367' to
// '0246798526' on load, then persist() flushes the corrected file
// back to disk on the next mutation. We touch all three phone-
// number fields (momoNumber, whatsappNumber, adminPhone) so any
// surface that still pointed at the dead wallet — payment modal,
// WhatsApp escalation footer, admin SMS alerts — switches over in
// one go on first launch of v0.7.11. No-op for installs that never
// customised these fields (compiled defaults already correct) and
// no-op for installs that already moved off 0530686367.
const STALE_MOMO_NUMBER = '0530686367'
const NEW_MOMO_NUMBER = '0246798526'
function migrateStaleConfigNumbers(config: RuntimeConfig | undefined): RuntimeConfig | undefined {
  if (!config) return config
  let changed = false
  const next: RuntimeConfig = { ...config }
  if (next.momoNumber?.replace(/\D/g, '') === STALE_MOMO_NUMBER) {
    next.momoNumber = NEW_MOMO_NUMBER
    changed = true
  }
  if (next.whatsappNumber?.replace(/\D/g, '') === STALE_MOMO_NUMBER) {
    next.whatsappNumber = NEW_MOMO_NUMBER
    changed = true
  }
  if (next.adminPhone?.replace(/\D/g, '') === STALE_MOMO_NUMBER) {
    next.adminPhone = NEW_MOMO_NUMBER
    changed = true
  }
  if (changed) {
    // eslint-disable-next-line no-console
    console.log('[licensing] migrated stale MoMo wallet number from', STALE_MOMO_NUMBER, '→', NEW_MOMO_NUMBER)
  }
  return next
}

// v0.7.153 — Sanitise + cap a tombstone array read off disk. Drops
// entries missing the primary key or deletedAt, dedupes on the key
// (latest deletedAt wins), then keeps the most-recent N up to the
// process-wide cap. Defensive against hand-edited license.json.
function hydrateTombstones<K extends 'ref' | 'code' | 'id'>(
  raw: unknown,
  key: K,
): ({ deletedAt: string } & Record<K, string>)[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const map = new Map<string, { deletedAt: string } & Record<K, string>>()
  for (const t of raw) {
    if (!t || typeof t !== 'object') continue
    const rec = t as Record<string, unknown>
    const k = rec[key]
    const deletedAt = rec.deletedAt
    if (typeof k !== 'string' || !k) continue
    if (typeof deletedAt !== 'string' || !deletedAt) continue
    const cur = map.get(k)
    if (!cur || Date.parse(deletedAt) > Date.parse(cur.deletedAt)) {
      map.set(k, { [key]: k, deletedAt } as { deletedAt: string } & Record<K, string>)
    }
  }
  let arr = Array.from(map.values())
  if (arr.length > 1000) {
    arr.sort((a, b) => a.deletedAt.localeCompare(b.deletedAt))
    arr = arr.slice(-1000)
  }
  return arr.length > 0 ? arr : undefined
}

function load(): LicenseFile {
  if (cache) return cache
  ensureDir()
  const p = storagePath()
  if (!fs.existsSync(p)) {
    const fresh = freshFile()
    persist(fresh)
    cache = fresh
    return fresh
  }
  try {
    const raw = fs.readFileSync(p, 'utf8')
    const parsed = JSON.parse(raw) as Partial<LicenseFile>
    if (parsed.schemaVersion !== 1) throw new Error(`Unknown licensing schemaVersion ${parsed.schemaVersion}`)
    // Heal any missing arrays — we keep the file backwards-compatible.
    cache = {
      schemaVersion: 1,
      installId: parsed.installId ?? crypto.randomUUID(),
      firstLaunchAt: parsed.firstLaunchAt ?? new Date().toISOString(),
      trialDurationMs: parsed.trialDurationMs ?? TRIAL_DURATION_MS,
      // v0.7.172 — env override wins over persisted value so the
      // cloud deployment can be re-pinned to the baked masterCode
      // by setting SCRIPTURELIVE_MASTER_CODE without any data
      // migration. See envMasterCodeOverride() comment block above.
      // The mismatch-detection block below this object literal will
      // immediately persist() the new value if it differs from disk.
      // v0.7.179 — Same baked-default chain as freshFile() above. If
      // the persisted file has a stale random masterCode (any install
      // created before v0.7.179 — value like "SL-MASTER-XXX-YYY"
      // generated by generateMasterCode()), the self-heal block below
      // re-pins it to BAKED_CLOUD_ADMIN_CODE on this load and persists
      // the corrected file back to disk. Env override still wins for
      // cloud deployments.
      masterCode: envMasterCodeOverride() ?? parsed.masterCode ?? BAKED_CLOUD_ADMIN_CODE ?? generateMasterCode(),
      masterCodeEmailedAt: parsed.masterCodeEmailedAt,
      activeSubscription: parsed.activeSubscription ?? null,
      paymentCodes: parsed.paymentCodes ?? [],
      activationCodes: parsed.activationCodes ?? [],
      notifications: parsed.notifications ?? [],
      config: migrateStaleConfigNumbers(parsed.config),
      // v0.7.5 — hydrate trial-usage counter from disk so the activity-
      // gated trial survives process restarts. Without this, every cold
      // start would silently reset the trial back to 0 minutes used.
      trialMsUsed: parsed.trialMsUsed ?? 0,
      // v0.7.7 — hydrate pending admin-reset OTP. Cleared on consume
      // or expiry from passwordMatches() so a stale entry can't linger.
      pendingAdminReset: parsed.pendingAdminReset,
      // v0.7.13 — hydrate telemetry-install one-shot flag.
      telemetryInstallPingedAt: parsed.telemetryInstallPingedAt,
      // v0.7.15 — hydrate sticky lockdown / ever-activated flags.
      // license.json lives at ~/.scripturelive/ and survives uninstall
      // by Inno Setup, so these flags persist across reinstalls — that
      // is the whole point. Default falsy for fresh installs.
      everActivated: parsed.everActivated === true ? true : undefined,
      lockdownAfterDeactivation: parsed.lockdownAfterDeactivation === true ? true : undefined,
      // v0.7.153 — Hydrate hard-delete tombstones from disk so a
      // restart can't drop them and let stale snapshots resurrect
      // previously-deleted records. Each array is sanitised to drop
      // malformed entries (defensive against hand-edited license.json)
      // and capped to the most-recent 1000 immediately on load.
      deletedPaymentRefs: hydrateTombstones(parsed.deletedPaymentRefs, 'ref'),
      deletedActivationCodes: hydrateTombstones(parsed.deletedActivationCodes, 'code'),
      deletedNotificationIds: hydrateTombstones(parsed.deletedNotificationIds, 'id'),
    }
    // v0.7.172 — Self-heal cloud masterCode mismatch on load.
    // If SCRIPTURELIVE_MASTER_CODE is set (cloud deployment) and the
    // persisted file still has the old random masterCode, persist the
    // override back to disk immediately so subsequent reads (and any
    // post-restart admin diagnostic that opens license.json directly)
    // see the correct value. No-op on desktop installs where the env
    // var is unset (envMasterCodeOverride() returns null and the
    // condition short-circuits). Idempotent: once persisted, the next
    // boot finds parsed.masterCode === envMasterCodeOverride() and
    // skips the persist call entirely.
    {
      const override = envMasterCodeOverride()
      if (override && parsed.masterCode !== override) {
        // eslint-disable-next-line no-console
        console.log(
          '[licensing] re-pinning masterCode from persisted value to SCRIPTURELIVE_MASTER_CODE override (v0.7.172 cross-device-sync fix)',
        )
        persist(cache)
      } else if (!override && BAKED_CLOUD_ADMIN_CODE && parsed.masterCode && parsed.masterCode !== BAKED_CLOUD_ADMIN_CODE) {
        // v0.7.179 — Self-heal stale random masterCodes on existing
        // installs. Any install created before v0.7.179 has a per-PC
        // random masterCode (e.g. SL-MASTER-KQM64N9F-D9QWEDXZ) which
        // does NOT match the cloud's masterCode (= BAKED_CLOUD_ADMIN
        // _CODE), so cross-device sync shows "wrong key — set up".
        // On first boot of v0.7.179 we silently re-pin the persisted
        // masterCode to the baked value and persist() the corrected
        // file back to disk. Subsequent boots find them equal and
        // skip the persist call. No-op for cloud (envMasterCodeOver
        // ride wins above) and no-op for fresh installs (persisted
        // value created by freshFile() already equals baked).
        //
        // Side-effect intentionally accepted: if the operator had
        // memorised their old random masterCode as their local
        // admin password, that password no longer works after this
        // upgrade — they must use the baked code SL-MASTER-HETEVT
        // 56-HCKTTS74 (or the per-PC adminPassword config field) to
        // regain admin access. We accept this trade-off because (a)
        // the new masterCode is shown verbatim in the Admin Panel
        // → Install + Master section so it's discoverable, and (b)
        // the operator explicitly requested this default change.
        cache.masterCode = BAKED_CLOUD_ADMIN_CODE
        // eslint-disable-next-line no-console
        console.log(
          '[licensing] re-pinning persisted random masterCode to BAKED_CLOUD_ADMIN_CODE (v0.7.179 cross-device-sync default)',
        )
        persist(cache)
      }
    }
    // v0.7.194 — Wall-clock trial migration. The trial model changed
    // from activity-gated minutes (v0.7.5–v0.7.193: trialMsUsed
    // accumulated only while the mic was on, refresh/overnight wait
    // did not consume it) to wall-clock 72 hours from firstLaunchAt.
    //
    // Operator pick (most generous): every install that has NEVER
    // activated a paid subscription gets a FRESH 3-day window starting
    // from this v0.7.194 install moment. Without this reset, an
    // operator whose firstLaunchAt was set weeks ago would land on
    // v0.7.194 and immediately be expired (because Date.now() is
    // already > firstLaunchAt + 72h), with no way to evaluate.
    //
    // Guards (each load-bearing):
    //   (a) everActivated !== true — never touch installs that have
    //       ever been on a paid subscription. Resetting firstLaunchAt
    //       on a paid install would have no observable effect (the
    //       paid subscription wins over trial in computeStatus()),
    //       but we keep the guard so we don't silently rewrite a
    //       provenance timestamp some downstream tooling might trust.
    //   (b) !activeSubscription — defensive double-check.
    //   (c) trialDurationMs < TRIAL_DURATION_MS — IDEMPOTENCY GATE.
    //       Once we've lifted an install to the v0.7.194 budget the
    //       persisted value already equals TRIAL_DURATION_MS, so this
    //       branch will not run again on subsequent boots. Without
    //       this guard the firstLaunchAt would get re-stamped on
    //       every app start, infinitely extending the trial.
    if (
      cache.trialDurationMs < TRIAL_DURATION_MS &&
      cache.everActivated !== true &&
      !cache.activeSubscription
    ) {
      const newFirstLaunchAt = new Date().toISOString()
      // eslint-disable-next-line no-console
      console.log(
        '[licensing] migrating to wall-clock trial: firstLaunchAt',
        cache.firstLaunchAt,
        '→',
        newFirstLaunchAt,
        '+ trialDurationMs',
        cache.trialDurationMs,
        '→',
        TRIAL_DURATION_MS,
        '(v0.7.194 wall-clock 3-day reset)',
      )
      cache.firstLaunchAt = newFirstLaunchAt
      cache.trialDurationMs = TRIAL_DURATION_MS
      // Reset stale activity counter so any leftover read of the
      // legacy field doesn't accidentally show "trial used" when we've
      // just granted a fresh window.
      cache.trialMsUsed = 0
      persist(cache)
    }
    return cache
  } catch (e) {
    // Corrupt file — back it up and start fresh so the app stays usable.
    try {
      const backup = p + '.corrupt-' + Date.now() + '.bak'
      fs.copyFileSync(p, backup)
      // eslint-disable-next-line no-console
      console.error('[licensing] license.json was corrupt, backed up to', backup, e)
    } catch { /* ignore */ }
    const fresh = freshFile()
    persist(fresh)
    cache = fresh
    return fresh
  }
}

function persist(file: LicenseFile) {
  ensureDir()
  const p = storagePath()
  // v0.7.96 — TOTAL-DISK-DECOUPLING FIX for the recurring "This page
  // couldn't load" Chromium error after Deactivate / Activate / Move.
  //
  // History of attempts:
  //   v0.7.83 — installed did-fail-load auto-recovery (3-strike retry).
  //   v0.7.84 — auto-restart Next child on exit (5-in-60 limit).
  //   v0.7.86 — sync busy-spin retry inside persist() on EPERM/EBUSY.
  //   v0.7.87 — never show Chromium's "page couldn't load".
  //   v0.7.89 — sticky auto-live + crash mask on ALL windows.
  //   v0.7.90 — fixed reload()-loops-the-mask bug; track lastTargetURL.
  //   v0.7.95 — moved busy-spin off event loop; cache update first.
  //
  // The operator continued to report "This page couldn't load" after
  // v0.7.95. The screenshot is consistently the standard Chromium
  // chrome-error page in the main window. The remaining root cause:
  //
  //   ANY synchronous disk I/O on the route-handler hot path can stall
  //   the bundled single-process Next server long enough — under
  //   Windows AV / OneDrive contention, slow HDD, full disk, or simply
  //   a writeFileSync of a multi-MB licence file — that the renderer's
  //   queued navigation (tab switch, focus refresh, prefetch hard-
  //   reload fallback) times out and Chromium paints the error page
  //   BEFORE our did-fail-load handler can take over.
  //
  // v0.7.96's contract is therefore stricter:
  //
  //   • persist() does ZERO synchronous disk I/O. The in-memory `cache`
  //     is updated, a fire-and-forget async write is scheduled via
  //     setImmediate, and the function returns immediately.
  //   • persist() NEVER throws under any condition. Disk failures
  //     (EPERM, EBUSY, EACCES, ENOSPC, EROFS, EIO, EMFILE, ENOENT…)
  //     are caught and retried asynchronously. The in-memory cache
  //     is the source of truth for the running process; the disk
  //     file is reconciled in the background.
  //   • Retries are unlimited (capped only at 60s of attempts) because
  //     a transient AV lock that lasts longer than our previous 5-shot
  //     budget should not silently desync the file. Backoff plateaus
  //     at 1s after the initial exponential ramp.
  //
  // Crash-safety: the prior architecture relied on synchronous write
  // so a power loss mid-route would leave a coherent file on disk.
  // The new model accepts that a process kill between cache update
  // and disk flush may lose ONE persist() — the next persist() (which
  // for licensing is always within seconds: status poll, trial tick,
  // heartbeat) reapplies the latest cache. For the operator-facing
  // flows this matters here, the worst case is "deactivate didn't
  // stick across a kill" → operator deactivates again. Acceptable.
  cache = file
  const data = JSON.stringify(file, null, 2)
  enqueuePersist(p, data)
  // v0.7.153 — Schedule a debounced fan-out to the cloud admin ledger
  // so cross-device admin records stay in sync. The push is fire-and-
  // forget and short-circuits when the cloud sync credential is not
  // configured OR when we're running ON the cloud (REPLIT_DEPLOYMENT_ID
  // set — the cloud IS the source of truth, no point pushing to itself).
  scheduleCloudAdminPush(file)
}

// ─── v0.7.153 — Debounced cloud admin push ──────────────────────────
//
// Every persist() schedules a push 1.5s after the LAST persist() call,
// so a burst of admin writes (e.g. confirm-payment which mutates two
// rows in two persists) collapses into a single network call. The
// dynamic import avoids a static cycle between storage.ts and
// cloud-sync.ts.

const CLOUD_PUSH_DEBOUNCE_MS = 1500
let cloudPushTimer: NodeJS.Timeout | null = null

function scheduleCloudAdminPush(_file: LicenseFile): void {
  if (process.env.REPLIT_DEPLOYMENT_ID) return // cloud — no self-push
  // applyAdminLedgerSnapshot() sets this before persisting an inbound
  // cloud snapshot — we just received it, no point pushing it back.
  if (_suppressNextPush) {
    _suppressNextPush = false
    return
  }
  if (cloudPushTimer) clearTimeout(cloudPushTimer)
  cloudPushTimer = setTimeout(() => {
    cloudPushTimer = null
    void runCloudAdminPush()
  }, CLOUD_PUSH_DEBOUNCE_MS)
  // Allow the process to exit even if a push is pending — these are
  // background syncs, not critical foreground work.
  if (typeof cloudPushTimer.unref === 'function') cloudPushTimer.unref()
}

async function runCloudAdminPush(): Promise<void> {
  try {
    const f = cache ?? load()
    const snapshot = extractAdminLedgerSnapshot(f)
    const { cloudPushAdminLedger } = await import('./cloud-sync')
    cloudPushAdminLedger({
      installId: f.installId,
      config: f.config ?? null,
      snapshot,
    })
  } catch (e) {
    // Never let a sync error escape — the in-memory cache + on-disk
    // file remain authoritative for this install.
    // eslint-disable-next-line no-console
    console.error('[licensing] cloud admin push failed:', e)
  }
}

/** Test-only: drain any pending debounced cloud push so an integration
 *  test can deterministically assert post-write sync. NOT exposed via
 *  the public surface; only imported by *.test.ts files. */
export async function __flushCloudAdminPushForTests(): Promise<void> {
  if (cloudPushTimer) {
    clearTimeout(cloudPushTimer)
    cloudPushTimer = null
  }
  await runCloudAdminPush()
}

// v0.7.96 — Single-flight async writer with latest-data wins.
//
// The architect review of v0.7.96 flagged a race in the first pass:
// each persist() spawned its OWN retry chain, so two overlapping
// persist() calls could let the OLDER chain win the rename race
// (e.g. older chain succeeds on retry attempt 3 AFTER the newer
// chain has already landed its first write). The on-disk file would
// then disagree with the in-memory cache.
//
// Fix: per-path single-flight scheduler. Every persist() call simply
// updates a `pending` slot for the path. A single in-flight scheduler
// runs at most one writeFileSync+renameSync at a time, ALWAYS writing
// the latest pending data (not a stale snapshot). When a write
// succeeds AND there's no newer pending data, the chain ends. When a
// write fails, the same scheduler retries — but on the next attempt
// it writes whatever is in `pending` AT THAT MOMENT, so a freshly
// arrived persist() during the retry window is honored, and an
// already-superseded write never lands.
//
// Crash-safety: the in-memory cache is the source of truth for the
// running process (every read goes through `load()` which prefers
// `cache`). The disk file is a recovery copy used only on a fresh
// process boot. If the process is killed between cache update and
// successful flush we may lose the LAST persist() — the next
// persist() (next status poll, trial tick, heartbeat — at most ~30s
// away) reapplies the latest cache.
const PERSIST_DEADLINE_MS = 60_000

interface PendingPersist {
  data: string
  startedAt: number
  attempt: number
  inflight: boolean
  timer: NodeJS.Timeout | null
}

const PENDING: Map<string, PendingPersist> = new Map()

function enqueuePersist(finalPath: string, data: string): void {
  const existing = PENDING.get(finalPath)
  if (existing) {
    // Supersede any older queued data with the latest. Keep the
    // existing startedAt/attempt counters so we still honor the
    // 60s deadline relative to when the current trouble started.
    existing.data = data
    if (!existing.inflight && !existing.timer) {
      // No write in flight (we just finished one) — kick a fresh
      // tick so the new data lands ASAP.
      existing.timer = setTimeout(() => runPersistOnce(finalPath), 0)
    }
    return
  }
  const slot: PendingPersist = {
    data,
    startedAt: Date.now(),
    attempt: 0,
    inflight: false,
    timer: setTimeout(() => runPersistOnce(finalPath), 0),
  }
  PENDING.set(finalPath, slot)
}

function runPersistOnce(finalPath: string): void {
  const slot = PENDING.get(finalPath)
  if (!slot) return
  slot.timer = null
  slot.inflight = true

  if (Date.now() - slot.startedAt > PERSIST_DEADLINE_MS) {
    // eslint-disable-next-line no-console
    console.error(
      `[licensing] persist disk write gave up after ${slot.attempt} attempts over ${Math.round((Date.now() - slot.startedAt) / 1000)}s — in-memory cache is correct, will reconcile on next persist`,
    )
    PENDING.delete(finalPath)
    return
  }

  // Snapshot the latest pending data RIGHT NOW so the write reflects
  // the most recent persist() call, even if newer ones queued while
  // we were waiting on setImmediate / setTimeout.
  const dataAtWriteTime = slot.data
  const tmp = finalPath + '.tmp.' + process.pid + '.' + Date.now() + '.' + slot.attempt
  try {
    fs.writeFileSync(tmp, dataAtWriteTime, { mode: 0o600 })
    fs.renameSync(tmp, finalPath)
    if (slot.attempt > 0) {
      // eslint-disable-next-line no-console
      console.warn(`[licensing] persist disk write recovered on attempt ${slot.attempt + 1}`)
    }
    slot.inflight = false
    // If newer data arrived AFTER we snapshotted but BEFORE the
    // write finished, schedule another write so the freshest data
    // lands. Otherwise we're done.
    if (slot.data !== dataAtWriteTime) {
      slot.attempt = 0 // fresh chain — the disk is healthy again
      slot.startedAt = Date.now()
      slot.timer = setTimeout(() => runPersistOnce(finalPath), 0)
    } else {
      PENDING.delete(finalPath)
    }
    return
  } catch (e) {
    try { fs.unlinkSync(tmp) } catch { /* ignore */ }
    // eslint-disable-next-line no-console
    console.warn(`[licensing] persist attempt ${slot.attempt + 1} failed (${(e as NodeJS.ErrnoException)?.code ?? 'unknown'}) — retrying`)
    slot.inflight = false
    slot.attempt += 1
    // Backoff: 50, 100, 200, 400, 800 ms then plateau at 1000ms.
    const delay = Math.min(50 * Math.pow(2, slot.attempt - 1), 1000)
    slot.timer = setTimeout(() => runPersistOnce(finalPath), delay)
  }
}

// Test-only hook: lets tests await a stable point where every
// queued persist has either succeeded or hit the deadline. NOT
// exposed via the public surface; only imported by *.test.ts files.
export function __awaitPendingPersistsForTests(): Promise<void> {
  return new Promise((resolve) => {
    const tick = (): void => {
      if (PENDING.size === 0) { resolve(); return }
      setTimeout(tick, 25)
    }
    tick()
  })
}

// ─────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────
export function getFile(): LicenseFile {
  return load()
}

export function getStoragePath(): string {
  return storagePath()
}

/** Sweep expired payment codes. Called on every status read. */
export function sweepExpired(now = Date.now()): LicenseFile {
  const f = load()
  let changed = false
  for (const pc of f.paymentCodes) {
    if (pc.status === 'WAITING_PAYMENT' && new Date(pc.expiresAt).getTime() < now) {
      pc.status = 'EXPIRED'
      changed = true
    }
  }
  if (changed) persist(f)
  return f
}

export interface SubscriptionStatus {
  state: 'active' | 'trial' | 'trial_expired' | 'expired' | 'never_activated'
  daysLeft: number
  msLeft: number
  isMaster: boolean
  activeSubscription: ActiveSubscription | null
  trial: { startedAt: string; expiresAt: string; expired: boolean; msLeft: number }
  installId: string
}

export function computeStatus(now = Date.now()): SubscriptionStatus {
  const f = sweepExpired(now)
  // v0.7.194 — Wall-clock trial. The trial budget is TRIAL_DURATION_MS
  // (72 hours) of REAL-WORLD time from firstLaunchAt. The countdown
  // runs continuously regardless of whether the user is using the app;
  // closing the app, sleeping the PC, or never opening AI Detection
  // do NOT pause it. trialMsUsed is no longer consulted (the field is
  // still present on LicenseFile for backward read compat with old
  // persisted state from v0.7.5–v0.7.193).
  //
  // v0.7.194-hotfix.1 — Defensive NaN guards. If `firstLaunchAt` is
  // malformed (corrupted JSON, hand-edited, or pre-schema state) or
  // `trialDurationMs` is non-finite, `new Date(...).getTime()` returns
  // NaN and any later `new Date(NaN).toISOString()` would throw
  // RangeError, 500-ing /api/license/status. Fall back to safe defaults
  // (now / TRIAL_DURATION_MS) so computeStatus() always returns a
  // valid status object.
  const rawStartedAt = new Date(f.firstLaunchAt).getTime()
  const startedAtMs = Number.isFinite(rawStartedAt) ? rawStartedAt : now
  const safeDuration = Number.isFinite(f.trialDurationMs) ? f.trialDurationMs : TRIAL_DURATION_MS
  const trialEndMs = startedAtMs + safeDuration
  const trialMsLeft = Math.max(0, trialEndMs - now)
  const trialEnd = trialEndMs
  const trialExpired = trialMsLeft === 0

  // Active subscription wins over trial.
  if (f.activeSubscription) {
    const expMs = new Date(f.activeSubscription.expiresAt).getTime()
    const left = Math.max(0, expMs - now)
    if (left > 0 || f.activeSubscription.isMaster) {
      return {
        state: 'active',
        daysLeft: f.activeSubscription.isMaster ? 36500 : Math.ceil(left / 86400000),
        msLeft: f.activeSubscription.isMaster ? Number.MAX_SAFE_INTEGER : left,
        isMaster: f.activeSubscription.isMaster,
        activeSubscription: f.activeSubscription,
        trial: {
          startedAt: f.firstLaunchAt,
          expiresAt: new Date(trialEnd).toISOString(),
          expired: trialExpired,
          msLeft: trialMsLeft,
        },
        installId: f.installId,
      }
    }
    // Subscription expired — clear it so future status calls return cleanly.
    f.activeSubscription = null
    persist(f)
  }

  // v0.7.15 — Two sticky overrides that block the trial fallback even
  // when there's no active subscription:
  //
  //  • lockdownAfterDeactivation: set by deactivateSubscription().
  //    The operator wants Deactivate to put the device into the lock
  //    overlay immediately and stay there until a NEW activation lands.
  //    No silent grace period back to "trial".
  //
  //  • everActivated: set the first time activateCode() succeeds with
  //    any non-master code. The trial budget is meant to be a single
  //    one-time evaluation; once a customer has paid (or used a free
  //    code), the trial is permanently consumed even if they later
  //    deactivate, and even if they uninstall + reinstall (license.json
  //    lives at ~/.scripturelive/ which the Inno Setup uninstaller
  //    leaves alone). So a freshly-installed binary on a PC that has
  //    EVER activated still goes straight to the lock screen.
  //
  // Both flags map to state='expired' (not 'trial' / 'trial_expired'),
  // which is what the lock-overlay UI keys off.
  const blockedByLockdown = f.lockdownAfterDeactivation === true
  const blockedByEverActivated = f.everActivated === true
  if (!trialExpired && !blockedByLockdown && !blockedByEverActivated) {
    return {
      state: 'trial',
      daysLeft: 0,
      msLeft: trialMsLeft,
      isMaster: false,
      activeSubscription: null,
      trial: {
        startedAt: f.firstLaunchAt,
        expiresAt: new Date(trialEnd).toISOString(),
        expired: false,
        msLeft: trialMsLeft,
      },
      installId: f.installId,
    }
  }

  // No active sub, trial used up (or trial blocked by sticky flags).
  // v0.7.15 — OR in the persistent everActivated/lockdownAfterDeactivation
  // flags so a deactivated device (which flips activationCodes[].isUsed
  // back to false during transfer-out) still reports state='expired'
  // and not 'trial_expired'. The lock overlay UI keys off 'expired'
  // for the "Renew or activate" message; 'trial_expired' would tell
  // the user they're still in evaluation mode, which is exactly the
  // wrong message after they've already paid.
  const everActivated =
    f.activationCodes.some((a) => a.isUsed)
    || f.everActivated === true
    || f.lockdownAfterDeactivation === true
  return {
    state: everActivated ? 'expired' : 'trial_expired',
    daysLeft: 0,
    msLeft: 0,
    isMaster: false,
    activeSubscription: null,
    trial: {
      startedAt: f.firstLaunchAt,
      expiresAt: new Date(trialEnd).toISOString(),
      expired: true,
      msLeft: 0,
    },
    installId: f.installId,
  }
}

// ─── Payment-code allocation ─────────────────────────────────────────
export function createPaymentCode(input: {
  planCode: string
  amountGhs: number
  email: string
  whatsapp: string
}): PaymentCodeRecord {
  const f = load()
  const now = new Date()
  // Sweep stale entries first so we don't burn 3-digit space.
  sweepExpired(now.getTime())
  const taken = new Set(
    f.paymentCodes
      .filter((p) => p.status === 'WAITING_PAYMENT')
      .map((p) => p.ref),
  )
  const ref = generatePaymentRef((r) => taken.has(r))
  const rec: PaymentCodeRecord = {
    ref,
    planCode: input.planCode,
    amountGhs: input.amountGhs,
    email: input.email,
    whatsapp: input.whatsapp,
    status: 'WAITING_PAYMENT',
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + PAYMENT_CODE_TTL_MS).toISOString(),
  }
  f.paymentCodes.push(rec)
  persist(f)
  return rec
}

export function findPaymentCode(ref: string): PaymentCodeRecord | null {
  const f = load()
  return f.paymentCodes.find((p) => p.ref === ref) ?? null
}

// ─── Admin: confirm payment & generate activation ────────────────────
export interface AdminConfirmResult {
  payment: PaymentCodeRecord
  activation: ActivationCodeRecord
  newlyGenerated: boolean
}

export function confirmPaymentAndIssueActivation(
  ref: string,
  planLookup: (planCode: string) => { days: number } | null,
): AdminConfirmResult {
  const f = sweepExpired()
  const payment = f.paymentCodes.find((p) => p.ref === ref)
  if (!payment) throw new Error(`Payment reference ${ref} not found`)
  if (payment.status === 'EXPIRED') {
    throw new Error(`Payment reference ${ref} has expired (15-minute window). Ask the customer to start a new payment.`)
  }
  // Idempotent: re-confirming returns the existing activation.
  if (payment.status === 'PAID' && payment.activationCode) {
    const existing = f.activationCodes.find((a) => a.code === payment.activationCode)
    if (existing) return { payment, activation: existing, newlyGenerated: false }
  }
  if (payment.status === 'CONSUMED') {
    throw new Error(`Payment ${ref} was already used to activate a subscription.`)
  }

  const plan = planLookup(payment.planCode)
  if (!plan) throw new Error(`Unknown plan ${payment.planCode}`)

  const taken = new Set(f.activationCodes.map((a) => a.code))
  const code = generateActivationCode(payment.planCode, (c) => taken.has(c))
  const activation: ActivationCodeRecord = {
    code,
    planCode: payment.planCode,
    days: plan.days,
    generatedAt: new Date().toISOString(),
    generatedFor: { email: payment.email, whatsapp: payment.whatsapp, paymentRef: ref },
    isUsed: false,
  }
  f.activationCodes.push(activation)
  payment.status = 'PAID'
  payment.paidAt = new Date().toISOString()
  payment.activationCode = code
  persist(f)
  return { payment, activation, newlyGenerated: true }
}

// ─── Owner: generate an activation code by hand (v0.5.48) ────────────
/**
 * Mint a brand-new activation code without going through a payment
 * reference. Used by the Admin → Generate Activation Code panel so
 * the owner can issue codes for free trials, partnerships, or
 * customers who paid out-of-band (cash, bank transfer, etc.).
 *
 * Days may be supplied directly (custom duration) — pass any
 * integer between 1 and 36500. If omitted, falls back to the plan's
 * canonical days. The code is recorded as `isUsed: false` so the
 * recipient still has to type it into the activation modal on their
 * PC; that's what binds the activation to a specific install.
 */
export interface GenerateActivationArgs {
  planCode: string
  /** Optional override; defaults to the plan's canonical days. */
  days?: number
  /** v0.6.3 — exact duration in milliseconds. When supplied, the
   *  activation engine uses THIS for expiry math instead of `days`,
   *  so the operator can mint sub-day codes (20-minute test codes,
   *  4-hour Sunday-service codes, 30-minute conference codes) without
   *  the legacy day-rounding inflating them to 1 day. `days` is still
   *  required (used as the rounded-up display value in admin lists,
   *  CSV exports, and notification emails) but `durationMs` wins
   *  whenever it's set on the activation record. */
  durationMs?: number
  /** Owner-supplied label (e.g. customer name + church). */
  note?: string
  /** Optional contact email/WhatsApp for record-keeping. */
  email?: string
  whatsapp?: string
}

export function generateStandaloneActivation(
  args: GenerateActivationArgs,
  planLookup: (code: string) => { days: number } | null,
): ActivationCodeRecord {
  const planCode = args.planCode.trim().toUpperCase()
  if (!planCode) throw new Error('planCode is required')

  const plan = planLookup(planCode)
  // For "CUSTOM" we don't require a plan to exist — operator is
  // explicitly choosing the duration.
  let days: number
  if (typeof args.days === 'number' && Number.isFinite(args.days)) {
    days = Math.max(1, Math.min(36500, Math.floor(args.days)))
  } else if (plan) {
    days = plan.days
  } else {
    throw new Error(`Unknown planCode "${planCode}" and no custom days supplied`)
  }

  // v0.6.3 — the admin generate route now also passes a precise
  // millisecond duration computed from {months, days, hours, minutes}.
  // We keep `days` (rounded UP for legacy display columns) AND store
  // the exact ms so activateCode() can compute a minute-accurate
  // expiry. When durationMs is omitted the activation falls back to
  // days*86400000 — preserving v0.6.2 behaviour.
  let durationMs: number | undefined
  if (typeof args.durationMs === 'number' && Number.isFinite(args.durationMs) && args.durationMs > 0) {
    // 1 minute floor, ~100-year ceiling — same bounds as days
    durationMs = Math.max(60_000, Math.min(36500 * 86400000, Math.floor(args.durationMs)))
  }

  const f = load()
  const taken = new Set(f.activationCodes.map((a) => a.code))
  const code = generateActivationCode(planCode, (c) => taken.has(c))

  const generatedFor: ActivationCodeRecord['generatedFor'] = {}
  if (args.email?.trim()) generatedFor.email = args.email.trim()
  if (args.whatsapp?.trim()) generatedFor.whatsapp = args.whatsapp.trim()
  if (args.note?.trim()) generatedFor.note = args.note.trim()

  const activation: ActivationCodeRecord = {
    code,
    planCode,
    days,
    durationMs,
    generatedAt: new Date().toISOString(),
    generatedFor: Object.keys(generatedFor).length ? generatedFor : undefined,
    isUsed: false,
  }
  f.activationCodes.push(activation)
  persist(f)
  return activation
}

// ─── v0.6.5 — Code-class peek (no mutation) ─────────────────────────
// Lets the activate route reject codes pasted into the WRONG box
// before activateCode() consumes them. Operator's two-box UX (Step 3
// "Enter activation code after payment" + the bottom "Generated &
// Master Code" box) had no enforcement: a master code pasted into
// the paid box would silently activate, and a paid activation
// pasted into the master box looked like a "code not recognised"
// error to non-admins. Returns:
//   'master'      — exactly matches f.masterCode OR is recorded with
//                   isMaster=true (legacy admin-emitted masters).
//   'paid'        — recorded activation with generatedFor.paymentRef
//                   set (came out of confirmPayment + customer paid).
//   'standalone'  — recorded activation with no paymentRef (came out
//                   of generateStandaloneActivation, i.e. admin gave
//                   it for free / on credit / for testing).
//   'unknown'     — code is not in the ledger at all (typo / forged).
//                   Caller falls back to activateCode() which raises
//                   the existing "not recognised" error.
export type ActivationSource = 'master' | 'paid' | 'standalone' | 'unknown'
export function peekActivationSource(rawCode: string): ActivationSource {
  const code = rawCode.trim().toUpperCase()
  const f = load()
  if (code === f.masterCode) return 'master'
  const a = f.activationCodes.find((x) => x.code === code)
  if (!a) return 'unknown'
  if (a.isMaster) return 'master'
  if (a.generatedFor?.paymentRef) return 'paid'
  return 'standalone'
}

// ─── User: activate a code ───────────────────────────────────────────
export interface ActivateResult {
  status: SubscriptionStatus
  activated: ActivationCodeRecord
}

export function activateCode(rawCode: string, ctx?: { ip?: string; location?: string }): ActivateResult {
  const f = load()
  const code = rawCode.trim().toUpperCase()

  // Master code check first
  if (code === f.masterCode) {
    const activation: ActivationCodeRecord = {
      code,
      planCode: 'MASTER',
      days: 36500,
      generatedAt: f.firstLaunchAt,
      isUsed: true,
      usedAt: new Date().toISOString(),
      isMaster: true,
      subscriptionExpiresAt: new Date(Date.now() + 36500 * 86400000).toISOString(),
    }
    f.activeSubscription = {
      activationCode: code,
      planCode: 'MASTER',
      days: 36500,
      activatedAt: activation.usedAt!,
      expiresAt: activation.subscriptionExpiresAt!,
      isMaster: true,
    }
    // Don't push the master to the activationCodes list more than once
    if (!f.activationCodes.some((a) => a.code === code)) f.activationCodes.push(activation)
    // v0.7.15 — Master activation is the operator's own override; we do
    // NOT set everActivated for it (the operator should still see "trial"
    // on a fresh customer install they're testing). But we DO clear any
    // stale lockdownAfterDeactivation flag because the operator chose
    // to (re-)activate this device.
    f.lockdownAfterDeactivation = undefined
    persist(f)
    return { status: computeStatus(), activated: activation }
  }

  const activation = f.activationCodes.find((a) => a.code === code)
  if (!activation) throw new Error('Activation code not recognised. Please check and re-enter.')
  // v0.7.11 — A code that was previously activated and then transferred
  // off a device sits as { isUsed:false, transferredAt:set,
  // subscriptionExpiresAt:<original deadline> }. We allow re-activation
  // but PRESERVE the original deadline so the customer doesn't get a
  // free renewal by toggling devices. The only rejection is when that
  // deadline has already passed.
  const isTransferIn = !activation.isUsed && !!activation.transferredAt
  if (activation.isUsed) throw new Error('This activation code has already been used.')
  // v0.7.0 — admin can cancel a code from the dashboard. Cancelled
  // codes refuse to activate even if they were never used. The error
  // string mirrors the bin so customers calling support hear the
  // same wording the admin sees.
  if (activation.cancelledAt) {
    throw new Error('This activation code has been cancelled by the operator. Please contact support.')
  }
  if (activation.softDeletedAt) {
    throw new Error('This activation code is no longer valid. Please contact support.')
  }

  const now = new Date()
  let expires: Date
  if (isTransferIn && activation.subscriptionExpiresAt) {
    // Transfer-in: reuse the existing absolute deadline. If it's
    // already in the past, refuse with a clear error so the customer
    // doesn't pay for a "transfer" that gives them zero time.
    const prev = Date.parse(activation.subscriptionExpiresAt)
    if (!Number.isFinite(prev) || prev <= now.getTime()) {
      throw new Error('This activation code\'s remaining time has expired. Please purchase a new code.')
    }
    expires = new Date(prev)
  } else {
    // v0.6.3 — prefer the exact ms duration (set by the admin generate
    // route from {months,days,hours,minutes}) so a 20-minute code expires
    // in 20 minutes, not 24 hours. Pre-v0.6.3 records have no durationMs
    // → fall back to the legacy day-precision arithmetic so historical
    // codes activate identically.
    const durationMs = (typeof activation.durationMs === 'number' && activation.durationMs > 0)
      ? activation.durationMs
      : activation.days * 86400000
    expires = new Date(now.getTime() + durationMs)
  }
  activation.isUsed = true
  activation.usedAt = now.toISOString()
  activation.subscriptionExpiresAt = expires.toISOString()
  // v0.7.11 — Stamp the original activation moment on the very first
  // activateCode() pass; preserve it across transfers so the dashboard
  // can always show "first activated DD MMM YYYY".
  if (!activation.originalActivatedAt) {
    activation.originalActivatedAt = activation.usedAt
  }

  // Mark the originating payment as consumed for clean audit trail.
  if (activation.generatedFor?.paymentRef) {
    const pay = f.paymentCodes.find((p) => p.ref === activation.generatedFor!.paymentRef)
    if (pay) pay.status = 'CONSUMED'
  }

  f.activeSubscription = {
    activationCode: code,
    planCode: activation.planCode,
    days: activation.days,
    // v0.6.3 — carry the exact ms duration onto the active subscription
    // so countdown math anywhere downstream stays minute-accurate.
    durationMs: typeof activation.durationMs === 'number' ? activation.durationMs : undefined,
    activatedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    isMaster: false,
  }
  // v0.7.0 — capture geo on activation so the admin dashboard can
  // show "where this code is being used from" right away. The IP
  // and human-readable location come in via ctx (set by the activate
  // route from x-forwarded-for + ip-api.com lookup). Best-effort:
  // we don't fail activation just because geo lookup fizzled.
  if (ctx?.ip) activation.lastSeenIp = ctx.ip
  if (ctx?.location) activation.lastSeenLocation = ctx.location
  activation.lastSeenAt = now.toISOString()
  // v0.7.0 — also mirror generatedFor.whatsapp into buyerPhone so the
  // dashboard's Buyer column is populated for every paid code without
  // having to hunt through the nested generatedFor blob.
  if (!activation.buyerPhone && activation.generatedFor?.whatsapp) {
    activation.buyerPhone = activation.generatedFor.whatsapp
  }
  // v0.7.15 — Sticky everActivated. The first time any non-master code
  // activates this device, mark the file so a future trial-fallback path
  // in computeStatus() refuses to grant the free hour. Survives uninstall
  // because license.json is in ~/.scripturelive/. Also clear any stale
  // lockdownAfterDeactivation flag because the customer has just (re-)
  // activated, which is the one thing that exits the lock screen.
  f.everActivated = true
  f.lockdownAfterDeactivation = undefined
  persist(f)
  return { status: computeStatus(), activated: activation }
}

// ─── v0.7.0 — Activation-code admin dashboard helpers ───────────────
// Operator request: see all codes with their status, location, buyer
// phone; cancel/renew without leaving the panel; soft-delete to a
// 90-day bin (v0.7.3 — was 7) instead of hard-delete. These helpers
// back the /api/license/admin/codes + /cancel + /renew + /restore routes.

/** v0.7.3 — Bumped soft-delete window from 7 days → 90 days.
 *  Operator's bug report explicitly flagged "deletes active codes
 *  by itself" — the 7-day auto-purge was happening before they
 *  remembered to restore. 90 days gives them a full quarter to
 *  notice and Restore from the bin before anything is gone for
 *  good. The bin row still shows a "Purges in N days" countdown. */
const BIN_RETENTION_MS = 90 * 24 * 60 * 60 * 1000

/** Periodic sweep — purges any soft-deleted activation codes whose
 *  softDeletedAt is older than BIN_RETENTION_MS. Called from
 *  computeActivationStatus + the codes-list endpoint so the bin
 *  cleans itself without a cron. Returns the number of rows purged. */
export function purgeExpiredBin(now = Date.now()): number {
  const f = load()
  const cutoff = now - BIN_RETENTION_MS
  const before = f.activationCodes.length
  f.activationCodes = f.activationCodes.filter((a) => {
    if (!a.softDeletedAt) return true
    const ts = Date.parse(a.softDeletedAt)
    if (!Number.isFinite(ts)) return true  // bad date → keep, surface for manual review
    return ts >= cutoff
  })
  const removed = before - f.activationCodes.length
  if (removed > 0) persist(f)
  return removed
}

export type CodeStatus =
  | 'never-used'
  | 'active'
  | 'expired'
  | 'used'
  | 'cancelled'
  | 'deleted'
  | 'master'

/** v0.7.0 — Computed lifecycle status for a single activation code.
 *  Order of precedence matters: deleted/cancelled wins over expired
 *  wins over active so a cancelled-then-also-expired code reads as
 *  CANCELLED in the dashboard (the cancel was the operator's
 *  intent). */
export function computeCodeStatus(a: ActivationCodeRecord, now = Date.now()): CodeStatus {
  if (a.softDeletedAt) return 'deleted'
  if (a.cancelledAt) return 'cancelled'
  if (a.isMaster) return 'master'
  if (!a.isUsed) return 'never-used'
  // Used codes — check expiry against subscriptionExpiresAt.
  if (a.subscriptionExpiresAt) {
    const exp = Date.parse(a.subscriptionExpiresAt)
    if (Number.isFinite(exp)) {
      return exp > now ? 'active' : 'expired'
    }
  }
  return 'used'
}

/** Snapshot of the activation list enriched with computed status,
 *  days remaining, and a stable buyerPhone field. Used by the
 *  /api/license/admin/codes endpoint to power the dashboard. */
export interface AdminCodeRow {
  code: string
  planCode: string
  days: number
  durationMs?: number
  generatedAt: string
  generatedFor?: ActivationCodeRecord['generatedFor']
  buyerPhone?: string
  isMaster: boolean
  isUsed: boolean
  usedAt?: string
  subscriptionExpiresAt?: string
  cancelledAt?: string
  cancelReason?: string
  lastSeenAt?: string
  lastSeenIp?: string
  lastSeenLocation?: string
  softDeletedAt?: string
  // computed
  status: CodeStatus
  /** Days remaining (active codes) or days since expiry (negative).
   *  Null for never-used / cancelled / deleted codes. */
  daysRemaining: number | null
  /** Milliseconds remaining until purge from bin (deleted only). */
  binMsRemaining: number | null
}

export function listAdminCodes(opts: { includeDeleted?: boolean } = {}): AdminCodeRow[] {
  purgeExpiredBin()  // self-cleaning
  const f = load()
  const now = Date.now()
  return [...f.activationCodes]
    .filter((a) => opts.includeDeleted || !a.softDeletedAt)
    .sort((a, b) => (b.generatedAt || '').localeCompare(a.generatedAt || ''))
    .map((a) => {
      const status = computeCodeStatus(a, now)
      let daysRemaining: number | null = null
      if (status === 'active' && a.subscriptionExpiresAt) {
        const exp = Date.parse(a.subscriptionExpiresAt)
        if (Number.isFinite(exp)) daysRemaining = Math.max(0, Math.round((exp - now) / 86400000))
      } else if (status === 'expired' && a.subscriptionExpiresAt) {
        const exp = Date.parse(a.subscriptionExpiresAt)
        if (Number.isFinite(exp)) daysRemaining = Math.round((exp - now) / 86400000)
      }
      let binMsRemaining: number | null = null
      if (a.softDeletedAt) {
        const ts = Date.parse(a.softDeletedAt)
        if (Number.isFinite(ts)) binMsRemaining = Math.max(0, ts + BIN_RETENTION_MS - now)
      }
      const buyerPhone = a.buyerPhone || a.generatedFor?.whatsapp
      return {
        code: a.code,
        planCode: a.planCode,
        days: a.days,
        durationMs: a.durationMs,
        generatedAt: a.generatedAt,
        generatedFor: a.generatedFor,
        buyerPhone,
        isMaster: !!a.isMaster,
        isUsed: a.isUsed,
        usedAt: a.usedAt,
        subscriptionExpiresAt: a.subscriptionExpiresAt,
        cancelledAt: a.cancelledAt,
        cancelReason: a.cancelReason,
        lastSeenAt: a.lastSeenAt,
        lastSeenIp: a.lastSeenIp,
        lastSeenLocation: a.lastSeenLocation,
        softDeletedAt: a.softDeletedAt,
        status,
        daysRemaining,
        binMsRemaining,
      }
    })
}

/** Cancel an activation code. If it's currently the active
 *  subscription on this device, also clear the active subscription
 *  so the user immediately drops back to the trial / no-license
 *  state. Returns the updated record, or null if not found. */
export function cancelActivationByCode(code: string, reason?: string): ActivationCodeRecord | null {
  const f = load()
  const a = f.activationCodes.find((r) => r.code === code)
  if (!a) return null
  a.cancelledAt = new Date().toISOString()
  if (reason) a.cancelReason = reason
  // If this code is the active subscription, kill that too.
  if (f.activeSubscription?.activationCode === code) {
    f.activeSubscription = null
  }
  persist(f)
  return a
}

/** Renew an activation code by adding `addDays` to its existing
 *  expiry (or, for never-used codes, increasing the granted days
 *  count so it'll start with the larger window when activated).
 *  Returns the updated record, or null if not found. Lifts a
 *  cancellation if one was set — the operator clearly wants the code
 *  active again. */
export function renewActivationByCode(code: string, addDays: number): ActivationCodeRecord | null {
  const f = load()
  const a = f.activationCodes.find((r) => r.code === code)
  if (!a) return null
  const ms = Math.max(0, Math.floor(addDays * 86400000))
  if (a.isUsed && a.subscriptionExpiresAt) {
    const cur = Date.parse(a.subscriptionExpiresAt)
    const base = Number.isFinite(cur) && cur > Date.now() ? cur : Date.now()
    a.subscriptionExpiresAt = new Date(base + ms).toISOString()
    // Mirror to active subscription if this code is the active one
    // on THIS device (admin's PC, or operator running both roles).
    if (f.activeSubscription?.activationCode === code) {
      f.activeSubscription.expiresAt = a.subscriptionExpiresAt
    } else {
      // v0.7.118 — Operator escalation: "i tried renewing a code but
      // when activating it gives error: This activation code has
      // already been used."
      //
      // Pre-118 behaviour: renewActivationByCode only extended the
      // expiry timestamp on a USED row. The `isUsed:true` flag stayed
      // set, so when the paying customer typed the renewed code into
      // their app, activateCode() hit its `if (activation.isUsed)
      // throw 'This activation code has already been used.'` guard
      // and rejected — the customer paid for renewal but couldn't
      // activate. Almost every renewal path goes through this branch
      // because the admin operator is running the dashboard on a
      // DIFFERENT device than the customer (or the code's previous
      // device has since been wiped/reinstalled), so the row is not
      // f.activeSubscription on the admin PC.
      //
      // Fix: flip the row into the same "transfer-in" state that
      // deactivateSubscription() uses (v0.7.12 LOSSLESS deactivate
      // pattern). activateCode() already has a transfer-in branch
      // (line 1089) that recognises { isUsed:false, transferredAt:set,
      // subscriptionExpiresAt:<future> } and grants exactly the
      // preserved deadline — which, after our extend above, is the
      // renewed deadline. Customer types code, gets the time they
      // paid for, no error.
      a.isUsed = false
      a.transferredAt = new Date().toISOString()
      a.transferCount = (a.transferCount ?? 0) + 1
    }
  } else {
    // Never-used code: extend the GRANTED days so the bigger window
    // applies on first activation.
    a.days = a.days + Math.max(0, Math.round(addDays))
    if (typeof a.durationMs === 'number') a.durationMs = a.durationMs + ms
  }
  // Renewal lifts any cancel/soft-delete so the code is usable again.
  delete a.cancelledAt
  delete a.cancelReason
  delete a.softDeletedAt
  persist(f)
  return a
}

/** Move a code into the soft-delete bin (90-day retention as of v0.7.3
 *  — was 7-day). The code refuses activation while in the bin and is
 *  auto-purged after the retention window. Returns true if the code
 *  was found. */
export function softDeleteActivationByCode(code: string): boolean {
  const f = load()
  const a = f.activationCodes.find((r) => r.code === code)
  if (!a) return false
  a.softDeletedAt = new Date().toISOString()
  if (f.activeSubscription?.activationCode === code) {
    f.activeSubscription = null
  }
  persist(f)
  return true
}

/** Restore a soft-deleted code from the bin. Returns true if found
 *  and was in the bin. */
export function restoreActivationByCode(code: string): boolean {
  const f = load()
  const a = f.activationCodes.find((r) => r.code === code)
  if (!a || !a.softDeletedAt) return false
  delete a.softDeletedAt
  // v0.7.153 — Stamp the restore so a stale remote `softDeletedAt`
  // arriving via cloud merge doesn't silently re-bin the row. The
  // merger picks max(softDeletedAt, softDeleteRestoredAt) per side
  // and the strictly-later timestamp wins.
  a.softDeleteRestoredAt = new Date().toISOString()
  persist(f)
  return true
}

/** Record a heartbeat (last-seen IP + location + timestamp) for a
 *  code without changing its activation/expiry state. Called from
 *  /api/license/status so admin can see liveness in real time. */
export function recordCodeHeartbeat(code: string, ctx: { ip?: string; location?: string }): boolean {
  const f = load()
  const a = f.activationCodes.find((r) => r.code === code)
  if (!a) return false
  a.lastSeenAt = new Date().toISOString()
  if (ctx.ip) a.lastSeenIp = ctx.ip
  if (ctx.location) a.lastSeenLocation = ctx.location
  if (!a.buyerPhone && a.generatedFor?.whatsapp) a.buyerPhone = a.generatedFor.whatsapp
  persist(f)
  return true
}

// ─── Notifications: append to log + return for sending ──────────────
export function appendNotification(rec: Omit<NotificationRecord, 'id' | 'ts'>): NotificationRecord {
  const f = load()
  const note: NotificationRecord = {
    ...rec,
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
  }
  f.notifications.push(note)
  // Cap at 500 most-recent so the file doesn't grow forever.
  if (f.notifications.length > 500) f.notifications = f.notifications.slice(-500)
  persist(f)
  return note
}

// ─── Owner runtime config (v0.5.48) ──────────────────────────────────
/** Returns the owner-saved config, or `undefined` if never saved. */
export function getConfig(): RuntimeConfig | undefined {
  return load().config
}

/**
 * Save (merge) owner-supplied config. Pass partial fields — anything
 * left undefined is preserved from the existing config. Pass `null`
 * for a field to clear an override (the licensing layer will then
 * fall back to the compiled default for that field).
 */
export function saveConfig(patch: Partial<Record<keyof RuntimeConfig, unknown>>): RuntimeConfig {
  const f = load()
  const current: RuntimeConfig = { ...(f.config ?? {}) }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) {
      delete (current as Record<string, unknown>)[k]
    } else if (v !== undefined) {
      ;(current as Record<string, unknown>)[k] = v
    }
  }
  current.updatedAt = new Date().toISOString()
  f.config = current
  // If trialMinutes was set, also sync the on-disk trialDurationMs so
  // the next computeStatus() picks it up (existing trial windows that
  // already started keep their absolute end-time anchored at the
  // firstLaunchAt + new trialDurationMs computation).
  if (typeof current.trialMinutes === 'number' && current.trialMinutes > 0) {
    f.trialDurationMs = Math.min(24 * 60, Math.max(1, current.trialMinutes)) * 60 * 1000
  }
  persist(f)
  return current
}

/** Owner-managed deactivation — clears the active subscription on
 *  this device.
 *
 *  v0.7.12 — Operator escalation: customers were re-typing their code
 *  after Deactivate (or after the lock-overlay's Cancel Subscription)
 *  expecting it to come back, then hitting "This activation code has
 *  already been used." The legacy behaviour permanently burned the
 *  code, but in practice almost no customer wanted that — they just
 *  wanted to take a break / restart / clear state, then resume on
 *  the SAME or another PC with the time they'd already paid for.
 *
 *  New behaviour: deactivate is now LOSSLESS. We flip the activation
 *  row to {isUsed:false, transferredAt:now, subscriptionExpiresAt:
 *  unchanged}, exactly like transferActiveSubscription(). That means:
 *
 *    • activateCode() recognises the row as a transfer-in and
 *      re-grants the SAME remaining time (no renewal, no extension).
 *    • The customer can re-type the code in any "Enter activation
 *      code" field on this PC or another — no new button needed.
 *    • Already-expired codes still refuse to re-activate (the
 *      transfer-in branch in activateCode rejects past deadlines).
 *
 *  The master code is special — it never wears out, so we just null
 *  the active sub mirror. Codes whose deadline has already passed
 *  are not flipped (no point making them "reusable" when activateCode
 *  would reject them anyway, and we don't want stale rows accumulating
 *  transferredAt timestamps).
 */
export function deactivateSubscription(): SubscriptionStatus {
  const f = load()
  if (!f.activeSubscription) return computeStatus()
  // v0.7.15 — Sticky lockdown. Operator's spec: pressing Deactivate
  // must drop the device into the lock overlay immediately and keep
  // it there until a NEW activation lands. Pre-v0.7.15 the device
  // would silently fall back to the trial budget (or "trial_expired"
  // once the budget was gone), which was misleading — the customer
  // had already paid for time but the screen now said "evaluation".
  // computeStatus() returns state='expired' whenever this flag is
  // set, and activateCode() (both branches above) clears it on
  // successful re-activation. Set BEFORE we null the active sub so
  // an exception in persist() leaves a coherent file state.
  f.lockdownAfterDeactivation = true
  // Master never gets flipped — it's always valid everywhere.
  if (!f.activeSubscription.isMaster) {
    const code = f.activeSubscription.activationCode
    const a = f.activationCodes.find((r) => r.code === code)
    if (a && a.isUsed && a.subscriptionExpiresAt) {
      const expiresMs = Date.parse(a.subscriptionExpiresAt)
      // Only flip rows whose deadline is still in the future. Past-
      // deadline codes stay isUsed:true (they're spent anyway).
      if (Number.isFinite(expiresMs) && expiresMs > Date.now()) {
        a.isUsed = false
        a.transferredAt = new Date().toISOString()
        a.transferCount = (a.transferCount ?? 0) + 1
        // Keep usedAt + subscriptionExpiresAt + originalActivatedAt
        // intact — activateCode() reads them on the transfer-in
        // branch to enforce the original deadline.
      }
    }
  }
  f.activeSubscription = null
  persist(f)
  return computeStatus()
}

// ─── v0.7.11 — Transferable deactivation (move-to-another-PC) ────────
// Pastebin item #6 follow-up. The pre-v0.7.11 deactivateSubscription()
// only nulled the local active sub; the activation row stayed
// isUsed:true so the customer's code refused to re-activate anywhere.
// transferActivationByCode flips isUsed back to false, sets
// transferredAt, and PRESERVES subscriptionExpiresAt so the next
// install inherits the original remaining time. activateCode() above
// recognises rows with { isUsed:false, transferredAt:set } as
// transfer-ins and reuses the existing deadline (no extension).
//
// Failure modes handled by the caller (the route, then the UI toast):
//  - no active sub                  -> { ok:false, error }
//  - active sub maps to no row       -> { ok:false, error }
//  - master code (cannot transfer)   -> { ok:false, error }
export interface TransferResult {
  status: SubscriptionStatus
  /** The activation code the customer should type into the new PC. */
  code: string
  /** ISO timestamp when the preserved subscription will expire. */
  expiresAt: string
  /** Convenience for the UI — milliseconds until expiry, never negative. */
  msLeft: number
}

export function transferActiveSubscription(): TransferResult {
  const f = load()
  if (!f.activeSubscription) {
    throw new Error('No active subscription to transfer.')
  }
  if (f.activeSubscription.isMaster) {
    throw new Error('The master code cannot be transferred. It is already valid on every install.')
  }
  const code = f.activeSubscription.activationCode
  const a = f.activationCodes.find((r) => r.code === code)
  if (!a) {
    // Defensive: active sub points at a row that no longer exists.
    // Drop the orphaned sub so the user is not stuck and surface the
    // error so the operator notices the data inconsistency.
    f.activeSubscription = null
    persist(f)
    throw new Error('Activation record not found for the active subscription. The local subscription has been cleared; please contact support to recover the code.')
  }
  // Carry the preserved deadline. Prefer the row's authoritative value
  // (set on every activateCode pass) and fall back to the active sub's
  // mirror only if the row somehow lacks it.
  const expiresAt = a.subscriptionExpiresAt ?? f.activeSubscription.expiresAt
  const expiresMs = Date.parse(expiresAt)
  if (!Number.isFinite(expiresMs) || expiresMs <= Date.now()) {
    throw new Error('This subscription has already expired — there is no remaining time to transfer.')
  }
  // Flip the row back to "available" while keeping every audit field
  // (originalActivatedAt, lastSeen*, generatedFor, payment ref) so the
  // admin dashboard still shows the full history.
  a.isUsed = false
  a.transferredAt = new Date().toISOString()
  a.transferCount = (a.transferCount ?? 0) + 1
  // Keep usedAt + subscriptionExpiresAt as-is; activateCode reads them
  // on the transfer-in branch and refuses if expiresAt is in the past.
  f.activeSubscription = null
  // v0.7.15 — Same sticky lockdown as deactivateSubscription(). The
  // customer chose to move this code to another PC; this PC must
  // therefore go to the lock screen immediately, not silently fall
  // back to whatever trial budget happens to be left.
  f.lockdownAfterDeactivation = true
  persist(f)
  return {
    status: computeStatus(),
    code,
    expiresAt,
    msLeft: Math.max(0, expiresMs - Date.now()),
  }
}

export function markMasterEmailed(): void {
  const f = load()
  if (!f.masterCodeEmailedAt) {
    f.masterCodeEmailedAt = new Date().toISOString()
    persist(f)
  }
}

// ─────────────────────────────────────────────────────────────────────
// v0.5.53 — Admin-panel delete operations. Each returns true if a
// matching record was found and removed, false otherwise. The owner
// sometimes needs to clear stale rows (test payments, expired
// activations, dismissed notifications) so the panel stays focused on
// what's actionable now.
// ─────────────────────────────────────────────────────────────────────
export function deletePaymentByRef(ref: string): boolean {
  const f = load()
  const before = f.paymentCodes.length
  f.paymentCodes = f.paymentCodes.filter((p) => p.ref !== ref)
  if (f.paymentCodes.length === before) return false
  appendPaymentTombstone(f, ref)
  persist(f)
  return true
}

export function deleteActivationByCode(code: string): boolean {
  const f = load()
  const before = f.activationCodes.length
  f.activationCodes = f.activationCodes.filter((a) => a.code !== code)
  if (f.activationCodes.length === before) return false
  appendActivationTombstone(f, code)
  persist(f)
  return true
}

// v0.5.57 — Look up a single notification record by id. Used by the
// Admin "Resend" endpoint to recover the original channel + recipient
// + body so the operator can retry a queued/failed delivery without
// hand-copying the audit log row.
export function getNotificationById(id: string): NotificationRecord | undefined {
  return load().notifications.find((n) => n.id === id)
}

export function deleteNotificationById(id: string): boolean {
  const f = load()
  const before = f.notifications.length
  f.notifications = f.notifications.filter((n) => n.id !== id)
  if (f.notifications.length === before) return false
  appendNotificationTombstone(f, id)
  persist(f)
  return true
}

// ─────────────────────────────────────────────────────────────────────
// v0.7.5 — Activity-gated trial tick (Apr 29, 2026)
//
// The renderer pings POST /api/license/trial-tick every few seconds
// while the mic is actively running. We add the elapsed delta into
// `trialMsUsed`, clamped to [0, trialDurationMs] so a runaway client
// can't push the counter past the cap (which would make daysLeft
// look negative on the next status read). Returns the fresh status
// so the caller can update the UI without a second round-trip.
//
// Tick is silently ignored when:
//   - an active subscription is in force (trial doesn't apply)
//   - the trial is already exhausted (no point counting further)
//   - delta is non-positive / non-finite (clock skew / tab restored)
// ─────────────────────────────────────────────────────────────────────
export function addTrialUsage(deltaMs: number): SubscriptionStatus {
  const delta = Math.max(0, Math.floor(Number(deltaMs)))
  if (!Number.isFinite(delta) || delta === 0) return computeStatus()
  const f = load()
  // No-op when an active subscription covers the user — trial is
  // dormant in that case.
  if (f.activeSubscription) {
    const expMs = new Date(f.activeSubscription.expiresAt).getTime()
    if (f.activeSubscription.isMaster || expMs > Date.now()) return computeStatus()
  }
  const cap = f.trialDurationMs
  const before = Math.max(0, Math.min(cap, f.trialMsUsed ?? 0))
  if (before >= cap) return computeStatus()
  // Single-tick safety: never let one ping consume more than 5 minutes
  // of trial. Protects against a tab being suspended for hours and
  // then firing one giant catch-up tick on resume.
  const safeDelta = Math.min(delta, 5 * 60_000)
  const next = Math.min(cap, before + safeDelta)
  if (next !== before) {
    f.trialMsUsed = next
    persist(f)
  }
  return computeStatus()
}

// ─────────────────────────────────────────────────────────────────────
// v0.7.5 — Bulk-delete helpers for the admin dashboard "Select +
// Delete all" bar. Each accepts an array of identifiers and returns
// the count actually removed so the UI can toast e.g. "3 of 4
// removed (1 already gone)".
// ─────────────────────────────────────────────────────────────────────
export function deletePaymentsByRefs(refs: string[]): number {
  const f = load()
  const set = new Set(refs.map((r) => r.trim()).filter(Boolean))
  if (set.size === 0) return 0
  const before = f.paymentCodes.length
  f.paymentCodes = f.paymentCodes.filter((p) => !set.has(p.ref))
  const removed = before - f.paymentCodes.length
  if (removed > 0) {
    for (const ref of set) appendPaymentTombstone(f, ref)
    persist(f)
  }
  return removed
}

export function deleteActivationsByCodes(codes: string[]): number {
  const f = load()
  const set = new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean))
  if (set.size === 0) return 0
  const before = f.activationCodes.length
  f.activationCodes = f.activationCodes.filter((a) => !set.has(a.code))
  const removed = before - f.activationCodes.length
  if (removed > 0) {
    for (const code of set) appendActivationTombstone(f, code)
    persist(f)
  }
  return removed
}

export function deleteNotificationsByIds(ids: string[]): number {
  const f = load()
  const set = new Set(ids.map((i) => i.trim()).filter(Boolean))
  if (set.size === 0) return 0
  const before = f.notifications.length
  f.notifications = f.notifications.filter((n) => !set.has(n.id))
  const removed = before - f.notifications.length
  if (removed > 0) {
    for (const id of set) appendNotificationTombstone(f, id)
    persist(f)
  }
  return removed
}

export function softDeleteActivationsByCodes(codes: string[]): number {
  const f = load()
  const set = new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean))
  if (set.size === 0) return 0
  let removed = 0
  const stamp = new Date().toISOString()
  for (const a of f.activationCodes) {
    if (set.has(a.code) && !a.softDeletedAt) {
      a.softDeletedAt = stamp
      if (f.activeSubscription?.activationCode === a.code) {
        f.activeSubscription = null
      }
      removed++
    }
  }
  if (removed > 0) persist(f)
  return removed
}

// ─────────────────────────────────────────────────────────────────────
// v0.7.7 — Admin password "Forgot password" reset OTP helpers.
// The admin login route accepts the OTP as a one-shot password until
// it is either consumed (success) or expires (15 min).
// ─────────────────────────────────────────────────────────────────────
const ADMIN_RESET_TTL_MS = 15 * 60 * 1000

/** Mint a fresh 6-digit OTP and persist it. Returns the code (in
 *  plain) so the caller can SMS/email it to the operator. Replaces
 *  any prior pending reset so a follow-up "Forgot password" click
 *  always invalidates the previous code. */
export function setPendingAdminReset(): { code: string; expiresAt: string } {
  const f = load()
  // 6-digit numeric, zero-padded. Easy to read off SMS/email.
  const code = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')
  const expiresAt = new Date(Date.now() + ADMIN_RESET_TTL_MS).toISOString()
  f.pendingAdminReset = { code, expiresAt }
  persist(f)
  return { code, expiresAt }
}

/** Returns the live (unexpired) pending reset code or null. Used by
 *  passwordMatches() in admin-auth to decide if the supplied password
 *  is actually a one-time reset. Sweeps expired entries on read. */
export function getPendingAdminReset(): { code: string; expiresAt: string } | null {
  const f = load()
  const r = f.pendingAdminReset
  if (!r) return null
  if (new Date(r.expiresAt).getTime() <= Date.now()) {
    f.pendingAdminReset = undefined
    persist(f)
    return null
  }
  return r
}

/** Consume (delete) the pending reset code after a successful login. */
// v0.7.13 — Telemetry one-shot install ping bookkeeping. Returns true
// the very first time it's called for this license.json (so the
// caller knows it should now POST /api/telemetry/install). All
// subsequent calls return false. The flag persists in license.json
// so reinstalls (which mint a new installId) re-ping cleanly.
export function shouldSendTelemetryInstallPing(): boolean {
  const f = load()
  return !f.telemetryInstallPingedAt
}

export function markTelemetryInstallPinged(): void {
  const f = load()
  if (f.telemetryInstallPingedAt) return
  f.telemetryInstallPingedAt = new Date().toISOString()
  persist(f)
}

export function consumePendingAdminReset(): void {
  const f = load()
  if (f.pendingAdminReset) {
    f.pendingAdminReset = undefined
    persist(f)
  }
}

/** Test-only: reset the entire file. Guarded against prod use. */
export function __testReset(): void {
  if (process.env.NODE_ENV === 'production' && !process.env.SCRIPTURELIVE_LICENSE_DIR) {
    throw new Error('Refusing to reset license file in production')
  }
  cache = null
  const p = storagePath()
  if (fs.existsSync(p)) fs.unlinkSync(p)
}

// ─── v0.7.145 — Cross-machine cloud sync helpers ─────────────────────
//
// See src/lib/licensing/cloud-sync.ts for the renderer-callable
// helpers that POST to the cloud. The two functions below are the
// SERVER-side counterparts that run ON the cloud deployment to
// service incoming customer requests.
//
// All three of these are no-ops on a customer install (the customer
// install never receives /api/license/cloud/* requests because the
// cloud-sync helper short-circuits on customer machines), but we
// export them unconditionally so the same codebase ships to both.

/**
 * v0.7.145 — Atomically claim an admin-issued activation code on
 * behalf of a remote customer install. Called by the cloud-side
 * /api/license/cloud/claim-activation route.
 *
 * Returns:
 *   • the row, marked isUsed=true and stamped with claimedByInstall
 *   • null if the code doesn't exist
 *   • throws if the code is already claimed by a DIFFERENT install
 *     (so the customer sees an actionable error instead of silently
 *     getting an unusable mirror)
 */
export interface CloudClaimResult {
  ok: true
  activation: ActivationCodeRecord
}
export function claimActivationForCustomer(
  rawCode: string,
  installId: string,
): CloudClaimResult | null {
  const code = rawCode.trim().toUpperCase()
  if (!code || !installId) return null
  const f = load()
  const row = f.activationCodes.find((a) => a.code === code)
  if (!row) return null
  // Soft-deleted / cancelled rows can't be claimed.
  if (row.softDeletedAt || row.cancelledAt) return null
  // Already claimed: idempotent if same install, error if different.
  // We piggyback on lastSeenLocation as a structured marker
  // ("CLOUD-CLAIMED:<installId>") so we don't need to extend the
  // ActivationCodeRecord schema for this single use case.
  const claimedBy = (row.lastSeenLocation ?? '').startsWith('CLOUD-CLAIMED:')
    ? row.lastSeenLocation!.slice('CLOUD-CLAIMED:'.length)
    : null
  if (claimedBy && claimedBy !== installId) {
    throw new Error(`Code already claimed by a different install (${claimedBy.slice(0, 8)}…). Ask admin to issue a new code.`)
  }
  // Master codes are reusable by design — never lock them.
  if (!row.isMaster) {
    if (row.isUsed && claimedBy !== installId) {
      throw new Error('Code has already been used to activate a subscription on another PC.')
    }
    row.isUsed = true
    row.usedAt = row.usedAt ?? new Date().toISOString()
  }
  row.lastSeenAt = new Date().toISOString()
  row.lastSeenLocation = `CLOUD-CLAIMED:${installId}`
  persist(f)
  return { ok: true, activation: { ...row } }
}

/**
 * v0.7.145 — Append a customer-side payment-code record to the cloud
 * ledger so the admin dashboard's "Recent Payments" sees it. Idempotent
 * by ref; an existing ref is left untouched. Called by the cloud-side
 * /api/license/cloud/mirror-payment route.
 */
export function mergePaymentFromCustomer(
  rec: PaymentCodeRecord,
  installId: string,
): { ok: true; merged: boolean } {
  if (!rec || !rec.ref) return { ok: true, merged: false }
  const f = load()
  if (f.paymentCodes.some((p) => p.ref === rec.ref)) {
    return { ok: true, merged: false }
  }
  // We don't trust customer-supplied status flips beyond the initial
  // WAITING_PAYMENT — cloud admin still confirms via the dashboard.
  f.paymentCodes.push({
    ...rec,
    status: 'WAITING_PAYMENT',
    // Stash the originating install in the email field's mirror
    // location? No — keep email/whatsapp pristine for the admin UI.
    // Track install via a structured prefix in paymentRef? No —
    // use an unused field on the record. We use a SIDECAR note in
    // the existing email field is too risky. Instead we just append.
  })
  persist(f)
  // eslint-disable-next-line no-console
  console.log(`[cloud-sync] merged payment ref ${rec.ref} from install ${installId.slice(0, 8)}…`)
  return { ok: true, merged: true }
}

/**
 * v0.7.145 — Append a cloud-claimed activation row to the local
 * customer ledger so the existing local activateCode() finds it on
 * the very next call. Idempotent by code; if the local ledger
 * already has a row for this code we leave it alone (don't reset
 * isUsed back to false on a re-claim).
 */
export function mergeActivationFromCloud(rec: ActivationCodeRecord): boolean {
  if (!rec || !rec.code) return false
  const f = load()
  if (f.activationCodes.some((a) => a.code === rec.code)) return false
  // Mirror as un-used locally so the local activateCode() path runs
  // its full bookkeeping (isUsed flip, subscriptionExpiresAt mint,
  // notifications, etc.) on first activation.
  f.activationCodes.push({
    ...rec,
    isUsed: false,
    usedAt: undefined,
    subscriptionExpiresAt: undefined,
    lastSeenAt: undefined,
    lastSeenIp: undefined,
    lastSeenLocation: undefined,
  })
  persist(f)
  return true
}

// ─── v0.7.153 — Cross-device admin ledger snapshot helpers ──────────

import type { AdminLedgerSnapshot } from './cloud-sync'

const TOMBSTONE_CAP = 1000

function appendPaymentTombstone(f: LicenseFile, ref: string): void {
  if (!ref) return
  const arr = (f.deletedPaymentRefs ??= [])
  arr.push({ ref, deletedAt: new Date().toISOString() })
  if (arr.length > TOMBSTONE_CAP) f.deletedPaymentRefs = arr.slice(-TOMBSTONE_CAP)
}

function appendActivationTombstone(f: LicenseFile, code: string): void {
  if (!code) return
  const arr = (f.deletedActivationCodes ??= [])
  arr.push({ code, deletedAt: new Date().toISOString() })
  if (arr.length > TOMBSTONE_CAP) f.deletedActivationCodes = arr.slice(-TOMBSTONE_CAP)
}

function appendNotificationTombstone(f: LicenseFile, id: string): void {
  if (!id) return
  const arr = (f.deletedNotificationIds ??= [])
  arr.push({ id, deletedAt: new Date().toISOString() })
  if (arr.length > TOMBSTONE_CAP) f.deletedNotificationIds = arr.slice(-TOMBSTONE_CAP)
}

/** Per-PC config keys that must NEVER leak across the cloud sync —
 *  they describe the local installation, not the shared admin store. */
const LOCAL_ONLY_CONFIG_KEYS: ReadonlySet<keyof RuntimeConfig> = new Set([
  'cloudAdminCode',
  'adminPassword',
  'adminOpenAIKey',
  'adminDeepgramKey',
])

/** Extract the slice of the local ledger that is shared with the
 *  cross-device admin store. Strips per-PC subscription state, master
 *  code, install id, trial counters, telemetry flags, etc. */
export function extractAdminLedgerSnapshot(file?: LicenseFile): AdminLedgerSnapshot {
  const f = file ?? load()
  const cfg = f.config
  let scrubbedConfig: Partial<RuntimeConfig> | undefined
  if (cfg) {
    scrubbedConfig = {}
    for (const [k, v] of Object.entries(cfg)) {
      if (LOCAL_ONLY_CONFIG_KEYS.has(k as keyof RuntimeConfig)) continue
      ;(scrubbedConfig as Record<string, unknown>)[k] = v
    }
  }
  return {
    paymentCodes: f.paymentCodes.map((p) => ({ ...p })),
    activationCodes: f.activationCodes.map((a) => ({ ...a })),
    notifications: f.notifications.map((n) => ({ ...n })),
    config: scrubbedConfig,
    deletedPaymentRefs: (f.deletedPaymentRefs ?? []).map((t) => ({ ...t })),
    deletedActivationCodes: (f.deletedActivationCodes ?? []).map((t) => ({ ...t })),
    deletedNotificationIds: (f.deletedNotificationIds ?? []).map((t) => ({ ...t })),
  }
}

/** Latest-write-wins helper: pick whichever of two ISO timestamps is
 *  later, falling back to a defined value when only one is present. */
function laterIso(a?: string, b?: string): string | undefined {
  if (!a) return b
  if (!b) return a
  return Date.parse(a) >= Date.parse(b) ? a : b
}

/** Merge an incoming admin snapshot into the local ledger. Returns
 *  the count of records actually changed (added or mutated). Designed
 *  so a periodic pull from cloud is idempotent — re-applying the same
 *  snapshot returns 0.
 *
 *  Merge rules:
 *   • paymentCodes — union by `ref`. New refs are appended. Existing
 *     refs gain the LATER `paidAt` and the LATER `status` upgrade
 *     (CONSUMED > PAID > WAITING_PAYMENT > EXPIRED order). The first
 *     non-empty `activationCode` wins (codes never get re-issued).
 *   • activationCodes — union by `code`. New codes appended. Existing
 *     codes pick up the LATER `lastSeenAt`/`lastSeenIp`/
 *     `lastSeenLocation`, the LATER `cancelledAt`, the LATER
 *     `softDeletedAt` (or `undefined` when remote restored it after
 *     local was newer), and the higher `transferCount`.
 *   • notifications — union by `id` (UUID). New ids appended; existing
 *     ids left unchanged. Capped at 500 most-recent by ts after merge.
 *   • config — shallow merge, REMOTE wins on collision (cloud is the
 *     source of truth for shared admin settings). LOCAL_ONLY keys
 *     are never touched.
 */
export function applyAdminLedgerSnapshot(snap: AdminLedgerSnapshot): number {
  const f = load()
  let changed = 0

  // ── tombstones (merge BEFORE record union) ─────────────────────
  // Build local tombstone maps keyed by primary key → latest
  // deletedAt seen for that key. Each incoming record is rejected
  // when a local tombstone exists for its key. Incoming tombstones
  // are merged into the local set AND used to drop any local row
  // they cover (so a delete on phone propagates to desktop).
  const paymentTombs = mergeTombstones<'ref'>(
    f.deletedPaymentRefs ?? [],
    snap.deletedPaymentRefs ?? [],
    'ref',
  )
  const activationTombs = mergeTombstones<'code'>(
    f.deletedActivationCodes ?? [],
    snap.deletedActivationCodes ?? [],
    'code',
  )
  const notificationTombs = mergeTombstones<'id'>(
    f.deletedNotificationIds ?? [],
    snap.deletedNotificationIds ?? [],
    'id',
  )
  if (paymentTombs.added > 0) {
    f.deletedPaymentRefs = paymentTombs.merged
    const ids = new Set(paymentTombs.merged.map((t) => t.ref))
    const before = f.paymentCodes.length
    f.paymentCodes = f.paymentCodes.filter((p) => !ids.has(p.ref))
    changed += paymentTombs.added + (before - f.paymentCodes.length)
  }
  if (activationTombs.added > 0) {
    f.deletedActivationCodes = activationTombs.merged
    const ids = new Set(activationTombs.merged.map((t) => t.code))
    const before = f.activationCodes.length
    f.activationCodes = f.activationCodes.filter((a) => !ids.has(a.code))
    changed += activationTombs.added + (before - f.activationCodes.length)
  }
  if (notificationTombs.added > 0) {
    f.deletedNotificationIds = notificationTombs.merged
    const ids = new Set(notificationTombs.merged.map((t) => t.id))
    const before = f.notifications.length
    f.notifications = f.notifications.filter((n) => !ids.has(n.id))
    changed += notificationTombs.added + (before - f.notifications.length)
  }
  const paymentTombSet = new Set((f.deletedPaymentRefs ?? []).map((t) => t.ref))
  const activationTombSet = new Set((f.deletedActivationCodes ?? []).map((t) => t.code))
  const notificationTombSet = new Set((f.deletedNotificationIds ?? []).map((t) => t.id))

  // ── paymentCodes ───────────────────────────────────────────────
  const paymentByRef = new Map(f.paymentCodes.map((p) => [p.ref, p]))
  const STATUS_RANK: Record<PaymentStatus, number> = {
    EXPIRED: 0,
    WAITING_PAYMENT: 1,
    PAID: 2,
    CONSUMED: 3,
  }
  for (const inc of snap.paymentCodes ?? []) {
    if (!inc?.ref) continue
    if (paymentTombSet.has(inc.ref)) continue // hard-deleted; no resurrection
    const cur = paymentByRef.get(inc.ref)
    if (!cur) {
      f.paymentCodes.push({ ...inc })
      paymentByRef.set(inc.ref, inc)
      changed += 1
      continue
    }
    let mutated = false
    // Higher status wins (CONSUMED > PAID > WAITING_PAYMENT > EXPIRED).
    if (STATUS_RANK[inc.status] > STATUS_RANK[cur.status]) {
      cur.status = inc.status
      mutated = true
    }
    const newPaid = laterIso(cur.paidAt, inc.paidAt)
    if (newPaid !== cur.paidAt) { cur.paidAt = newPaid; mutated = true }
    if (!cur.activationCode && inc.activationCode) {
      cur.activationCode = inc.activationCode
      mutated = true
    }
    if (mutated) changed += 1
  }

  // ── activationCodes ────────────────────────────────────────────
  const actByCode = new Map(f.activationCodes.map((a) => [a.code, a]))
  for (const inc of snap.activationCodes ?? []) {
    if (!inc?.code) continue
    if (activationTombSet.has(inc.code)) continue // hard-deleted; no resurrection
    const cur = actByCode.get(inc.code)
    if (!cur) {
      // New code from cloud: mirror as un-claimed locally so the
      // local activateCode() runs full bookkeeping if the user pastes
      // it into THIS install. Same shape as mergeActivationFromCloud.
      f.activationCodes.push({
        ...inc,
        isUsed: false,
        usedAt: undefined,
        subscriptionExpiresAt: undefined,
      })
      actByCode.set(inc.code, inc)
      changed += 1
      continue
    }
    let mutated = false
    const newSeen = laterIso(cur.lastSeenAt, inc.lastSeenAt)
    if (newSeen !== cur.lastSeenAt) { cur.lastSeenAt = newSeen; mutated = true }
    if (inc.lastSeenIp && cur.lastSeenIp !== inc.lastSeenIp && newSeen === inc.lastSeenAt) {
      cur.lastSeenIp = inc.lastSeenIp; mutated = true
    }
    if (inc.lastSeenLocation && cur.lastSeenLocation !== inc.lastSeenLocation && newSeen === inc.lastSeenAt) {
      cur.lastSeenLocation = inc.lastSeenLocation; mutated = true
    }
    const newCancel = laterIso(cur.cancelledAt, inc.cancelledAt)
    if (newCancel !== cur.cancelledAt) { cur.cancelledAt = newCancel; mutated = true }
    if (inc.cancelReason && !cur.cancelReason) { cur.cancelReason = inc.cancelReason; mutated = true }
    // Soft-delete tri-state: take the later of {softDeletedAt,
    // softDeleteRestoredAt} per side, then resolve. Whichever side
    // has the strictly-later "last action" timestamp dictates the
    // current bin status. Without this, a stale incoming
    // `softDeletedAt` would silently re-bin a locally-restored row.
    const incSoft = laterIso(cur.softDeletedAt, inc.softDeletedAt)
    if (incSoft !== cur.softDeletedAt) { cur.softDeletedAt = incSoft; mutated = true }
    const incRestored = laterIso(cur.softDeleteRestoredAt, inc.softDeleteRestoredAt)
    if (incRestored !== cur.softDeleteRestoredAt) {
      cur.softDeleteRestoredAt = incRestored
      mutated = true
    }
    if (cur.softDeletedAt && cur.softDeleteRestoredAt) {
      if (Date.parse(cur.softDeleteRestoredAt) >= Date.parse(cur.softDeletedAt)) {
        // Restore wins → clear bin status.
        delete cur.softDeletedAt
      }
    }
    const incXfer = inc.transferCount ?? 0
    const curXfer = cur.transferCount ?? 0
    if (incXfer > curXfer) { cur.transferCount = incXfer; mutated = true }

    // v0.7.166 — Activation LIFECYCLE fields (isUsed / usedAt /
    // subscriptionExpiresAt) MUST propagate cross-device. The
    // original v0.7.153 merge intentionally skipped these because
    // the lifecycle was thought to be per-device. That assumption
    // breaks the operator's mental model: a code activated on
    // device-A still reads as NEVER-USED on device-B because the
    // cloud row never adopted device-A's flip. Operator screenshots
    // showed desktop "1 ACTIVE / 3 UNUSED" vs phone "0 ACTIVE /
    // 4 UNUSED" for the SAME 5-code ledger — exactly this drift.
    //
    // Merge rules:
    //   • isUsed is monotonic (false → true wins, never the reverse).
    //     The only legitimate "un-use" is operator cancel/restore
    //     which goes through cancelledAt / softDeletedAt — both of
    //     those are already merged above.
    //   • usedAt: take the LATER ISO. A re-activation after a
    //     transfer or restore writes a fresher usedAt; we want the
    //     most recent one to surface.
    //   • subscriptionExpiresAt: take the LATER ISO. A renewal
    //     extends expiry; we never want a stale shorter window from
    //     one device to overwrite a longer remote-renewed one.
    //   • lastSeenLocation already carries the "CLOUD-CLAIMED:<id>"
    //     marker for cross-device claims (see line ~2042) and is
    //     already merged above via the lastSeenAt latest-write rule.
    if (!cur.isUsed && inc.isUsed) {
      cur.isUsed = true
      mutated = true
    }
    const newUsedAt = laterIso(cur.usedAt, inc.usedAt)
    if (newUsedAt !== cur.usedAt) { cur.usedAt = newUsedAt; mutated = true }
    const newExp = laterIso(cur.subscriptionExpiresAt, inc.subscriptionExpiresAt)
    if (newExp !== cur.subscriptionExpiresAt) {
      cur.subscriptionExpiresAt = newExp
      mutated = true
    }

    if (mutated) changed += 1
  }

  // ── notifications ──────────────────────────────────────────────
  const noteIds = new Set(f.notifications.map((n) => n.id))
  for (const inc of snap.notifications ?? []) {
    if (!inc?.id || noteIds.has(inc.id)) continue
    if (notificationTombSet.has(inc.id)) continue // hard-deleted; no resurrection
    f.notifications.push({ ...inc })
    noteIds.add(inc.id)
    changed += 1
  }
  if (f.notifications.length > 500) {
    f.notifications.sort((a, b) => (a.ts ?? '').localeCompare(b.ts ?? ''))
    f.notifications = f.notifications.slice(-500)
  }

  // ── config (shared subset, wall-clock LWW via updatedAt) ───────
  // Architect (v0.7.153 review) flagged that "remote always wins"
  // amounts to arrival-order LWW: a stale offline desktop pushing
  // hours later silently overwrites newer cloud settings. We now
  // gate the merge on a strict updatedAt comparison — incoming
  // config is applied only when its updatedAt is STRICTLY newer
  // than the local one (or when local has none yet). LOCAL_ONLY
  // keys are still preserved.
  if (snap.config) {
    const localCfg = f.config
    const incUpdated = snap.config.updatedAt
    const localUpdated = localCfg?.updatedAt
    const incNewer = incUpdated
      ? !localUpdated || Date.parse(incUpdated) > Date.parse(localUpdated)
      : false
    if (incNewer || !localCfg) {
      const next: RuntimeConfig = { ...(localCfg ?? {}) }
      let cfgMutated = false
      for (const [k, v] of Object.entries(snap.config)) {
        if (LOCAL_ONLY_CONFIG_KEYS.has(k as keyof RuntimeConfig)) continue
        if (v === undefined) continue
        const prior = (next as Record<string, unknown>)[k]
        if (JSON.stringify(prior) !== JSON.stringify(v)) {
          ;(next as Record<string, unknown>)[k] = v
          cfgMutated = true
        }
      }
      if (cfgMutated) {
        // Preserve the incoming wall-clock — that's the timestamp
        // the next merge round will compare against, and overwriting
        // it with `now()` would convert true LWW back into arrival-
        // order LWW.
        if (incUpdated) next.updatedAt = incUpdated
        f.config = next
        changed += 1
      }
    }
  }

  if (changed > 0) {
    // Persist to disk but suppress the cloud push that persist() would
    // schedule — we just RECEIVED a cloud snapshot; pushing it back
    // would be a wasteful (though harmless) round-trip.
    suppressNextCloudPush()
    persist(f)
  }
  return changed
}

let _suppressNextPush = false
function suppressNextCloudPush(): void { _suppressNextPush = true }

/** Merge two tombstone arrays keyed by `K`. Latest deletedAt per
 *  key wins; result is bounded to TOMBSTONE_CAP most-recent.
 *  Returns the merged array AND the count of keys that are new to
 *  local (so the caller knows how many records to evict + counts
 *  toward `changed`). */
function mergeTombstones<K extends 'ref' | 'code' | 'id'>(
  localArr: ReadonlyArray<{ deletedAt: string } & Record<K, string>>,
  incomingArr: ReadonlyArray<{ deletedAt: string } & Record<K, string>>,
  key: K,
): { merged: ({ deletedAt: string } & Record<K, string>)[]; added: number } {
  const map = new Map<string, { deletedAt: string } & Record<K, string>>()
  let added = 0
  for (const t of localArr) {
    if (!t || !t[key]) continue
    map.set(t[key], { ...t })
  }
  for (const t of incomingArr) {
    if (!t || !t[key]) continue
    const k = t[key]
    const cur = map.get(k)
    if (!cur) {
      map.set(k, { ...t })
      added += 1
    } else if (Date.parse(t.deletedAt) > Date.parse(cur.deletedAt)) {
      map.set(k, { ...t })
    }
  }
  let merged = Array.from(map.values())
  if (merged.length > TOMBSTONE_CAP) {
    merged.sort((a, b) => a.deletedAt.localeCompare(b.deletedAt))
    merged = merged.slice(-TOMBSTONE_CAP)
  }
  return { merged, added }
}

// v0.7.32 — Single source of truth for the LLM-classifier on/off
// decision. The flag is "ON unless explicitly set to false", so a
// fresh install (no config file or no field) gets the LLM fallback
// automatically. Operators who experience regressions can untick the
// kill switch in Admin Modal → Cloud Keys, which persists `false`,
// and only that explicit false value disables the path.
//
// Every callsite (server routes, admin modal hydration, future
// renderer reads) MUST use this helper rather than open-coding the
// `=== true` check, or the default-on contract will silently break.
//
// Accepts a partial config so callers can pass either a full
// `RuntimeConfig`, the admin-config endpoint's response shape, or
// `null`/`undefined` (treated the same as a missing field → ON).
export function isLlmClassifierEnabled(
  cfg?: { enableLlmClassifier?: boolean | null } | null,
): boolean {
  return cfg?.enableLlmClassifier !== false
}
