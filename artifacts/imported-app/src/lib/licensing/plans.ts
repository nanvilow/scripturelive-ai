// v1 licensing — plan catalogue.
//
// Operator-supplied price list (Ghana cedis, GHS). Each plan has a
// short code that becomes part of the activation code (SL-{CODE}-…)
// and a human-friendly label rendered in the subscription modal.
// `days` is the number of calendar days the activation grants.
//
// DO NOT renumber or re-letter existing codes — they are baked into
// every activation code we generate, and changing them retroactively
// would invalidate codes already in the wild.

export type PlanCode = '1M' | '2M' | '3M' | '4M' | '5M' | '6M' | '1Y'

export interface Plan {
  code: PlanCode
  label: string
  amountGhs: number
  days: number
  /** Optional "% off" badge shown on the plan card. */
  discountLabel?: string
}

export const PLANS: readonly Plan[] = [
  { code: '1M', label: '1 Month',  amountGhs: 200,  days: 31 },
  { code: '2M', label: '2 Months', amountGhs: 350,  days: 62 },
  { code: '3M', label: '3 Months', amountGhs: 550,  days: 93 },
  { code: '4M', label: '4 Months', amountGhs: 750,  days: 124 },
  { code: '5M', label: '5 Months', amountGhs: 900,  days: 155 },
  { code: '6M', label: '6 Months', amountGhs: 1200, days: 186 },
  { code: '1Y', label: '1 Year',   amountGhs: 1800, days: 365, discountLabel: '25% Off' },
] as const

export function findPlan(code: string): Plan | null {
  return PLANS.find((p) => p.code === code) ?? null
}

export function isPlanCode(s: unknown): s is PlanCode {
  return typeof s === 'string' && PLANS.some((p) => p.code === s)
}

// MoMo recipient — operator-supplied. Hard-coded as the v1 default
// but overridable at runtime via Admin Settings (v0.5.48).
export const MOMO_RECIPIENT = {
  name: 'Richard Kwesi Attieku',
  number: '0530686367',
} as const

// Where receipts and notifications are sent (defaults; overridable).
export const NOTIFICATION_EMAIL = 'nanvilow@gmail.com'
export const NOTIFICATION_WHATSAPP = '0246798526'

// ─── Runtime resolution helpers (v0.5.48) ────────────────────────────
// All three of these consult the owner-saved RuntimeConfig (Admin
// Settings tab) before falling back to the compiled-in defaults
// above. Server routes that need prices, contact numbers, or trial
// length should call these functions instead of reading the
// constants directly so the owner's saved overrides apply.

/** Live plan list with any per-plan price overrides applied. */
export function getEffectivePlans(): Plan[] {
  // Lazy-import to avoid circular dependency between plans.ts and
  // storage.ts (storage.ts imports types from this file in some
  // commits; require-at-call keeps the import graph acyclic).
  let overrides: Partial<Record<string, number>> | undefined
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getConfig } = require('./storage') as typeof import('./storage')
    overrides = getConfig()?.planPriceOverrides
  } catch { /* storage not available (e.g. pure-client bundle) */ }
  return PLANS.map((p) => {
    const o = overrides?.[p.code]
    return typeof o === 'number' && o > 0 ? { ...p, amountGhs: o } : { ...p }
  })
}

/** Effective MoMo recipient (config overrides applied). */
export function getEffectiveMoMo(): { name: string; number: string } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getConfig } = require('./storage') as typeof import('./storage')
    const c = getConfig()
    return {
      name: c?.momoName?.trim() || MOMO_RECIPIENT.name,
      number: c?.momoNumber?.trim() || MOMO_RECIPIENT.number,
    }
  } catch {
    return { ...MOMO_RECIPIENT }
  }
}

/** Effective notification destinations (config overrides applied). */
export function getEffectiveNotificationTargets(): { email: string; whatsapp: string } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getConfig } = require('./storage') as typeof import('./storage')
    const c = getConfig()
    return {
      email: c?.notifyEmail?.trim() || NOTIFICATION_EMAIL,
      whatsapp: c?.whatsappNumber?.trim() || NOTIFICATION_WHATSAPP,
    }
  } catch {
    return { email: NOTIFICATION_EMAIL, whatsapp: NOTIFICATION_WHATSAPP }
  }
}
