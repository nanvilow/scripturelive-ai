// Canonical pricing catalogue for ScriptureLive AI.
//
// This is the single source of truth for plan prices, durations, and
// short codes. Both the desktop/Next.js app (`artifacts/imported-app`)
// and the public marketing site (`artifacts/site`) import from here
// so a price change in one place can never silently drift from the
// other — a pastor seeing GHS 200 on the website but a different
// number inside the app would damage trust, and this lib exists to
// make that drift impossible.
//
// DO NOT renumber or re-letter existing codes — they are baked into
// every activation code we have ever generated (SL-{CODE}-…) and
// changing them retroactively would invalidate codes already in the
// wild.

export type PlanCode = '1M' | '2M' | '3M' | '4M' | '5M' | '6M' | '1Y'

export interface Plan {
  /** Short code baked into activation codes (SL-{CODE}-…). */
  code: PlanCode
  /** Human-friendly name shown on plan cards / receipts. */
  label: string
  /** Price in Ghana cedis (GHS). */
  amountGhs: number
  /** Number of calendar days the activation grants. */
  days: number
  /** Optional "% off" badge shown on the plan card. */
  discountLabel?: string
  /**
   * Whether this tier is surfaced on the public marketing site.
   * The marketing layout intentionally shows only a curated subset
   * for visual balance.
   */
  showOnMarketing: boolean
  /**
   * v0.7.64 — Whether this tier is hidden from BOTH the marketing
   * site and the in-app subscription modal. Hidden plans are kept
   * in the catalogue so historical activation codes minted with
   * those codes (e.g. SL-2M-…, SL-3M-…) still validate via
   * findPlan() — the entries just disappear from purchase UIs.
   * Operator request 2026-05-03: collapse the catalogue to 1M + 1Y.
   */
  hidden?: boolean
}

// v0.7.64 — Operator pricing changes (2026-05-03):
//   • 1M dropped GHS 200 → GHS 170.
//   • 2M, 3M, 4M, 5M, 6M hidden from purchase UIs (kept here so
//     existing activation codes for those tiers still validate).
//   • 1Y "25% Off" badge removed (operator preference; price unchanged).
// Per-month transcription-time labelling and usage metering were
// deliberately NOT added here — the licensing model is per-device
// activation codes with no server-side account or usage telemetry,
// so any "X hours/month" claim cannot be enforced. See replit.md
// changelog for the rationale.
export const PLANS: readonly Plan[] = [
  { code: '1M', label: '1 Month',  amountGhs: 170,  days: 31,  showOnMarketing: true  },
  { code: '2M', label: '2 Months', amountGhs: 350,  days: 62,  showOnMarketing: false, hidden: true },
  { code: '3M', label: '3 Months', amountGhs: 550,  days: 93,  showOnMarketing: false, hidden: true },
  { code: '4M', label: '4 Months', amountGhs: 750,  days: 124, showOnMarketing: false, hidden: true },
  { code: '5M', label: '5 Months', amountGhs: 900,  days: 155, showOnMarketing: false, hidden: true },
  { code: '6M', label: '6 Months', amountGhs: 1200, days: 186, showOnMarketing: false, hidden: true },
  { code: '1Y', label: '1 Year',   amountGhs: 1800, days: 365, showOnMarketing: true },
] as const

export function findPlan(code: string): Plan | null {
  return PLANS.find((p) => p.code === code) ?? null
}

export function isPlanCode(s: unknown): s is PlanCode {
  return typeof s === 'string' && PLANS.some((p) => p.code === s)
}

/** Subset of plans that should appear on the public marketing site. */
export function getMarketingPlans(): readonly Plan[] {
  return PLANS.filter((p) => p.showOnMarketing && !p.hidden)
}

/**
 * Subset of plans that should appear in the in-app customer
 * subscription modal. Filters out hidden tiers but is otherwise the
 * full catalogue — the in-app modal historically showed more tiers
 * than the marketing site (operator could push customers toward
 * longer commitments). v0.7.64 collapsed both surfaces to {1M, 1Y}
 * by marking 2M–6M hidden.
 */
export function getPurchasablePlans(): readonly Plan[] {
  return PLANS.filter((p) => !p.hidden)
}
