// v0.6.0 — duration formatter for license/trial countdown displays.
//
// Operator request: replace the bare "30 days left" pill with a more
// precise "30 Days 12 Hours 45 Minutes Remaining" readout so the
// operator can SEE their subscription draining toward zero in real
// time instead of staring at an integer that only ticks once a day.
//
// Three exported variants:
//   • formatDaysHoursMinutes(ms)       — long form, used in Settings
//                                        and the License pill.
//   • formatDaysHoursMinutesShort(ms)  — compact "30d 12h 45m" for
//                                        cramped chrome (admin pills).
//   • formatTotalAsDhmString(ms)        — server-side admin/CSV friendly.
//
// All variants clamp negatives to 0 so an expired subscription shows
// "0 Days 0 Hours 0 Minutes Remaining" rather than negative noise.

export interface DurationParts {
  days: number
  hours: number
  minutes: number
  seconds: number
}

export function decomposeDuration(msLeft: number): DurationParts {
  const safe = Math.max(0, Math.floor(msLeft))
  const totalSecs = Math.floor(safe / 1000)
  const days = Math.floor(totalSecs / 86400)
  const hours = Math.floor((totalSecs % 86400) / 3600)
  const minutes = Math.floor((totalSecs % 3600) / 60)
  const seconds = totalSecs % 60
  return { days, hours, minutes, seconds }
}

/**
 * Long form: "30 Days 12 Hours 45 Minutes Remaining" / "0 Days 0 Hours 5 Minutes Remaining".
 * If `master` is true, returns the marketing-friendly "Lifetime — never expires" string
 * because rendering a 100-year countdown is misleading.
 */
export function formatDaysHoursMinutes(msLeft: number, opts?: { master?: boolean }): string {
  if (opts?.master) return 'Lifetime — never expires'
  const { days, hours, minutes } = decomposeDuration(msLeft)
  return `${days} Days ${hours} Hours ${minutes} Minutes Remaining`
}

/** Compact "30d 12h 45m" form for narrow chrome (top-bar pill, table rows). */
export function formatDaysHoursMinutesShort(msLeft: number, opts?: { master?: boolean }): string {
  if (opts?.master) return '∞'
  const { days, hours, minutes } = decomposeDuration(msLeft)
  return `${days}d ${hours}h ${minutes}m`
}

/** Plain "30d 12h 45m" used by admin CSV exports / log lines. */
export function formatTotalAsDhmString(msLeft: number): string {
  const { days, hours, minutes } = decomposeDuration(msLeft)
  return `${days}d ${hours}h ${minutes}m`
}

/** Convert {days, hours, minutes} from the admin form into a fractional days
 *  number suitable for the existing days-based licensing storage.
 *
 *  v0.6.3 — removed the 23/59 clamps on hours/minutes. The admin
 *  generate route now accepts overflow values (e.g. "30 hours" or
 *  "240 minutes") and folds them into the days bucket via this
 *  helper. Clamping was rejecting that path silently — a "30 hour"
 *  entry was being treated as 23 hours, so the legacy `days`
 *  display column read "1 day" instead of "2 days". The activation
 *  engine itself uses durationMs (computed in the route) so this
 *  was always cosmetic, but operators saw mismatched info in the
 *  admin list. Now the math respects the operator's exact intent.
 */
export function partsToDays(days: number, hours: number, minutes: number): number {
  const d = Math.max(0, Math.floor(days || 0))
  const h = Math.max(0, Math.floor(hours || 0))
  const m = Math.max(0, Math.floor(minutes || 0))
  // Total fractional days (a minute is ~0.000694 days).
  const total = d + h / 24 + m / 1440
  // Server validates as integer days for backwards compat. Round UP so
  // an operator who picks "0 days 1 hour" still gets at least 1 day on
  // the legacy display path; the precise expiresAt is computed from
  // durationMs in the new v0.6.3 storage path.
  return Math.max(1, Math.ceil(total))
}

/** Convert {days, hours, minutes} into total milliseconds — used by the
 *  admin endpoint to compute a fractional expiresAt without losing the
 *  hour/minute precision the operator picked.
 *
 *  v0.6.3 — removed the 23/59 clamps for the same reason as
 *  partsToDays above. */
export function partsToMs(days: number, hours: number, minutes: number): number {
  const d = Math.max(0, Math.floor(days || 0))
  const h = Math.max(0, Math.floor(hours || 0))
  const m = Math.max(0, Math.floor(minutes || 0))
  return d * 86_400_000 + h * 3_600_000 + m * 60_000
}
