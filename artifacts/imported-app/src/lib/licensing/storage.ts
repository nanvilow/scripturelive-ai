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
  generatedFor?: { email?: string; whatsapp?: string; paymentRef?: string }
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
