// v1 licensing — plan catalogue.
//
// The canonical plan list (codes, labels, prices, durations) now
// lives in the shared `@workspace/pricing` lib so the public
// marketing site and this desktop app cannot drift apart on price.
// We re-export the static catalogue and lookup helpers below so
// every existing import (`@/lib/licensing/plans`) keeps working
// unchanged. Runtime helpers that depend on this app's storage
// layer (overrides from Admin Settings, MoMo recipient, etc.) stay
// here because the marketing site has no notion of them.
//
// DO NOT renumber or re-letter existing codes — they are baked into
// every activation code we generate, and changing them retroactively
// would invalidate codes already in the wild.

import { PLANS, findPlan, isPlanCode, getPurchasablePlans, type Plan, type PlanCode } from '@workspace/pricing'
import { getConfig } from './storage'

export { PLANS, findPlan, isPlanCode, getPurchasablePlans }
export type { Plan, PlanCode }

// MoMo recipient — operator-supplied. Hard-coded as the v1 default
// but overridable at runtime via Admin Settings (v0.5.48).
// v0.5.57 — operator switched the receiving MoMo line from the
// 0530... wallet to the 0246798526 wallet so the same number that
// appears on customer receipts (NOTIFICATION_WHATSAPP) is the one
// they pay into. The recipient name stays the same.
// v0.6.5 — operator switched the receiving MoMo line back to a 0530
// wallet (0530686367). All three downstream surfaces (display number,
// WhatsApp escalation in the NOTE block, screenshot-proof line) now
// pull from this single constant via payment.momoRecipient.number,
// so future swaps land on every visible field at once.
// v0.7.3 — operator switched both the receiving MoMo line AND the
// public escalation line over to 0246798526 so the same number
// shows in payment proofs, screenshot-target instructions, and the
// SMS-receipt field on the activation modal.
// v0.7.266 — operator switched the RECEIVING MoMo wallet (the
// "Send MoMo to" row where customers actually pay) to the 0530686367
// wallet. This constant feeds ONLY that display/recipient row. The
// WhatsApp support line AND the screenshot payment-proof line in the
// NOTE block are a SEPARATE customer support/escalation channel that
// stays on 0246798526 — they source NOTIFICATION_WHATSAPP below, NOT
// this constant. The operator's PERSONAL SMS-alert line
// (ADMIN_NOTIFICATION_PHONE) also stays on 0246798526 (internal).
export const MOMO_RECIPIENT = {
  name: 'Richard Kwesi Attieku',
  number: '0530686367',
} as const

// Where receipts and notifications are sent (defaults; overridable).
// v0.7.266 — this is the customer-facing SUPPORT / escalation WhatsApp
// line: the activation modal's "contact support on WhatsApp" line AND
// the "send a screenshot for payment proof" line both source it, as
// does the post-purchase "contact us" receipt link. It stays on the
// 0246798526 support/proof channel — deliberately DIFFERENT from
// MOMO_RECIPIENT.number (0530686367), which is only the wallet
// customers send money INTO.
export const NOTIFICATION_EMAIL = 'nanvilow@gmail.com'
export const NOTIFICATION_WHATSAPP = '0246798526'

// v0.6.6 — Admin's PERSONAL phone for receiving payment-code-generated
// SMS alerts. Distinct from MOMO_RECIPIENT.number (the customer-facing
// payment receiver) and NOTIFICATION_WHATSAPP (the public escalation
// line). When a customer hits "Generate payment code", an SMS goes
// here so the admin knows to look out for the matching MoMo deposit
// without checking email. Overridable via RuntimeConfig.adminPhone in
// the admin settings tab; defaults below if unset.
export const ADMIN_NOTIFICATION_PHONE = '0246798526'

/** Effective admin notification phone (config override applied). */
export function getEffectiveAdminPhone(): string {
  try {
    const c = getConfig()
    return c?.adminPhone?.trim() || ADMIN_NOTIFICATION_PHONE
  } catch {
    return ADMIN_NOTIFICATION_PHONE
  }
}

// ─── Runtime resolution helpers (v0.5.48) ────────────────────────────
// All three of these consult the owner-saved RuntimeConfig (Admin
// Settings tab) before falling back to the compiled-in defaults
// above. Server routes that need prices, contact numbers, or trial
// length should call these functions instead of reading the
// constants directly so the owner's saved overrides apply.

/** Live plan list with any per-plan price overrides applied. */
export function getEffectivePlans(): Plan[] {
  let overrides: Partial<Record<string, number>> | undefined
  try {
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
    const c = getConfig()
    return {
      email: c?.notifyEmail?.trim() || NOTIFICATION_EMAIL,
      whatsapp: c?.whatsappNumber?.trim() || NOTIFICATION_WHATSAPP,
    }
  } catch {
    return { email: NOTIFICATION_EMAIL, whatsapp: NOTIFICATION_WHATSAPP }
  }
}
