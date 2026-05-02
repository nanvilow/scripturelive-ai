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
   * (currently 1M / 3M / 6M / 1Y) for visual balance, while the
   * in-app subscription modal lists every tier.
   */
  showOnMarketing: boolean
}

export const PLANS: readonly Plan[] = [
  { code: '1M', label: '1 Month',  amountGhs: 200,  days: 31,  showOnMarketing: true  },
  { code: '2M', label: '2 Months', amountGhs: 350,  days: 62,  showOnMarketing: false },
  { code: '3M', label: '3 Months', amountGhs: 550,  days: 93,  showOnMarketing: true  },
  { code: '4M', label: '4 Months', amountGhs: 750,  days: 124, showOnMarketing: false },
  { code: '5M', label: '5 Months', amountGhs: 900,  days: 155, showOnMarketing: false },
  { code: '6M', label: '6 Months', amountGhs: 1200, days: 186, showOnMarketing: true  },
  { code: '1Y', label: '1 Year',   amountGhs: 1800, days: 365, discountLabel: '25% Off', showOnMarketing: true },
] as const

export function findPlan(code: string): Plan | null {
  return PLANS.find((p) => p.code === code) ?? null
}

export function isPlanCode(s: unknown): s is PlanCode {
  return typeof s === 'string' && PLANS.some((p) => p.code === s)
}

/** Subset of plans that should appear on the public marketing site. */
export function getMarketingPlans(): readonly Plan[] {
  return PLANS.filter((p) => p.showOnMarketing)
}
