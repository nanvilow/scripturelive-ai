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
  /** Per-plan price override map: { '1M': 250, '6M': 1100, ... } */
  planPriceOverrides?: Partial<Record<string, number>>
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
const TRIAL_DURATION_MS = 60 * 60 * 1000 // 1 hour
const PAYMENT_CODE_TTL_MS = 15 * 60 * 1000 // 15 minutes

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
      config: parsed.config ?? undefined,
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
  const trialEnd = new Date(f.firstLaunchAt).getTime() + f.trialDurationMs
  const trialMsLeft = Math.max(0, trialEnd - now)
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

  if (!trialExpired) {
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

  // No active sub, trial used up, never activated anything.
  const everActivated = f.activationCodes.some((a) => a.isUsed)
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
    generatedAt: new Date().toISOString(),
    generatedFor: Object.keys(generatedFor).length ? generatedFor : undefined,
    isUsed: false,
  }
  f.activationCodes.push(activation)
  persist(f)
  return activation
}

// ─── User: activate a code ───────────────────────────────────────────
export interface ActivateResult {
  status: SubscriptionStatus
  activated: ActivationCodeRecord
}

export function activateCode(rawCode: string): ActivateResult {
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
    persist(f)
    return { status: computeStatus(), activated: activation }
  }

  const activation = f.activationCodes.find((a) => a.code === code)
  if (!activation) throw new Error('Activation code not recognised. Please check and re-enter.')
  if (activation.isUsed) throw new Error('This activation code has already been used.')

  const now = new Date()
  const expires = new Date(now.getTime() + activation.days * 86400000)
  activation.isUsed = true
  activation.usedAt = now.toISOString()
  activation.subscriptionExpiresAt = expires.toISOString()

  // Mark the originating payment as consumed for clean audit trail.
  if (activation.generatedFor?.paymentRef) {
    const pay = f.paymentCodes.find((p) => p.ref === activation.generatedFor!.paymentRef)
    if (pay) pay.status = 'CONSUMED'
  }

  f.activeSubscription = {
    activationCode: code,
    planCode: activation.planCode,
    days: activation.days,
    activatedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    isMaster: false,
  }
  persist(f)
  return { status: computeStatus(), activated: activation }
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

/** Owner-managed deactivation — clears the active subscription so the
 *  same activation code can be moved to a different install. We do
 *  NOT mark the activation as unused; once consumed, an activation is
 *  spent. This just lets the operator detach it from this device. */
export function deactivateSubscription(): SubscriptionStatus {
  const f = load()
  if (f.activeSubscription) {
    f.activeSubscription = null
    persist(f)
  }
  return computeStatus()
}

export function markMasterEmailed(): void {
  const f = load()
  if (!f.masterCodeEmailedAt) {
    f.masterCodeEmailedAt = new Date().toISOString()
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
