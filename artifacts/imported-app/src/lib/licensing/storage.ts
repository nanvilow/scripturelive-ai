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
// 30 min was too short to evaluate the app over a real Sunday service
// (which can run 90–150 minutes by itself). 3 hours covers a full
// service plus pre/post-service walkthrough so the operator can
// genuinely decide whether to subscribe. The `everActivated` lockout
// still prevents the reinstall-to-reset workaround.
//
// upgradeStaleTrialDuration() (called from load()) lifts any
// previously-persisted `trialDurationMs` that's BELOW this number to
// the new value, but ONLY for trials that haven't yet been activated
// and haven't yet expired — so an operator that's mid-trial when they
// install v0.7.19 gets the full new budget instead of being stuck on
// the smaller window from the previous release.
const TRIAL_DURATION_MS = 180 * 60 * 1000 // 180 min (3 h)
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

function freshFile(): LicenseFile {
  const now = new Date().toISOString()
  return {
    schemaVersion: 1,
    installId: crypto.randomUUID(),
    firstLaunchAt: now,
    trialDurationMs: TRIAL_DURATION_MS,
    masterCode: generateMasterCode(),
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
      masterCode: parsed.masterCode ?? generateMasterCode(),
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
    }
    // v0.7.19 — Trial bump migration. If the persisted trial budget is
    // smaller than the current TRIAL_DURATION_MS, AND the user has not
    // yet activated a paid subscription, AND the trial they were on
    // hadn't already expired, lift it. This ensures operators
    // mid-trial when v0.7.19 lands get the full 180 min budget
    // instead of being capped at the old (30 min) ceiling.
    //
    // Guards we deliberately apply (each one is load-bearing):
    //   (a) trialDurationMs < TRIAL_DURATION_MS — only need to act
    //       when the persisted budget is actually smaller than the
    //       new ceiling. Idempotent: once lifted, this branch never
    //       runs again.
    //   (b) everActivated !== true — never touch installs that have
    //       ever been on a paid subscription. Sticky-lockdown after
    //       paid-sub-ends is a separate post-paid behaviour and we
    //       must not silently extend any window in that flow.
    //   (c) !activeSubscription — defensive double-check; if a
    //       subscription is somehow still flagged active, leave the
    //       trial counter alone.
    //   (d) trialMsUsed < cache.trialDurationMs — CRITICAL. The
    //       activity-gated trial considers the user expired/locked
    //       once trialMsUsed >= trialDurationMs. Without this guard,
    //       a user whose 30-min trial already ran out (and who
    //       therefore should be locked) would be silently re-opened
    //       to a fresh 150 min when 0.7.19 first launches. We only
    //       lift trials that are still in progress at migration time.
    if (
      cache.trialDurationMs < TRIAL_DURATION_MS &&
      cache.everActivated !== true &&
      !cache.activeSubscription &&
      cache.trialMsUsed < cache.trialDurationMs
    ) {
      // eslint-disable-next-line no-console
      console.log(
        '[licensing] migrating trialDurationMs',
        cache.trialDurationMs,
        '→',
        TRIAL_DURATION_MS,
        '(v0.7.19 trial bump)',
      )
      cache.trialDurationMs = TRIAL_DURATION_MS
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
  const tmp = p + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(file, null, 2), { mode: 0o600 })
  fs.renameSync(tmp, p)
  cache = file
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
  // v0.7.5 — Activity-gated trial. The trial budget is `trialDurationMs`
  // total LISTENING time (mic actually running). `trialMsUsed` accumulates
  // only while the user is actively detecting; refresh / overnight wait
  // do not consume it. We synthesise a startedAt/expiresAt pair so the
  // existing UI countdown widget keeps rendering — expiresAt is just a
  // projection of "if you started listening continuously RIGHT NOW, the
  // trial would run out at..." (i.e. now + remaining budget).
  const trialUsed = Math.max(0, Math.min(f.trialDurationMs, f.trialMsUsed ?? 0))
  const trialMsLeft = Math.max(0, f.trialDurationMs - trialUsed)
  const trialEnd = now + trialMsLeft
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
    // Mirror to active subscription if this code is the active one.
    if (f.activeSubscription?.activationCode === code) {
      f.activeSubscription.expiresAt = a.subscriptionExpiresAt
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
  persist(f)
  return true
}

export function deleteActivationByCode(code: string): boolean {
  const f = load()
  const before = f.activationCodes.length
  f.activationCodes = f.activationCodes.filter((a) => a.code !== code)
  if (f.activationCodes.length === before) return false
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
  if (removed > 0) persist(f)
  return removed
}

export function deleteActivationsByCodes(codes: string[]): number {
  const f = load()
  const set = new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean))
  if (set.size === 0) return 0
  const before = f.activationCodes.length
  f.activationCodes = f.activationCodes.filter((a) => !set.has(a.code))
  const removed = before - f.activationCodes.length
  if (removed > 0) persist(f)
  return removed
}

export function deleteNotificationsByIds(ids: string[]): number {
  const f = load()
  const set = new Set(ids.map((i) => i.trim()).filter(Boolean))
  if (set.size === 0) return 0
  const before = f.notifications.length
  f.notifications = f.notifications.filter((n) => !set.has(n.id))
  const removed = before - f.notifications.length
  if (removed > 0) persist(f)
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
