export interface RankedVerse {
  id: string
  confidence?: number
  detectedAt?: Date | string | number
}

// v0.7.91 — Threshold lowered 0.50 → 0.40 per operator spec
// ("make the percentage be 20 to 40%"). Anything ≥ 40% is the MAIN
// auto-live pick; the [0.20, 0.40) band is the Alternative References
// bucket the operator can double-click to promote manually.
export const AUTO_LIVE_MIN_CONFIDENCE = 0.4
// Lower bound of the Alternative References band. Below this we don't
// even surface the candidate — too noisy for the operator to scan.
export const ALTERNATIVE_MIN_CONFIDENCE = 0.2

function detectedAtMs(v: RankedVerse): number {
  const d = v.detectedAt
  if (d == null) return 0
  if (typeof d === 'number') return d
  if (typeof d === 'string') return new Date(d).getTime() || 0
  if (d instanceof Date) return d.getTime()
  return 0
}

// Pure ranking helper — picks the single highest-confidence verse with
// confidence >= 0.40. Ties broken by NEWER detectedAt first, then by
// id (deterministic).
export function pickAutoLiveMatch<T extends RankedVerse>(detected: readonly T[]): T | null {
  if (!detected.length) return null
  const ranked = [...detected].sort((a, b) => {
    const dc = (b.confidence ?? 0) - (a.confidence ?? 0)
    if (dc !== 0) return dc
    const dt = detectedAtMs(b) - detectedAtMs(a)
    if (dt !== 0) return dt
    return b.id.localeCompare(a.id)
  })
  const top = ranked[0]
  if (!top || (top.confidence ?? 0) < AUTO_LIVE_MIN_CONFIDENCE) return null
  return top
}

// v0.7.91 — Alternatives are the verses the operator can MANUALLY
// promote. Now ordered by NEWEST DETECTION FIRST per operator spec
// ("Always display new detection on top of the old detected verse").
// Items outside the [0.20, 0.40) band are filtered out so the column
// only shows actionable suggestions.
export function alternativesFor<T extends RankedVerse>(
  detected: readonly T[],
  liveMatchId: string | null,
): T[] {
  return [...detected]
    .filter((v) => {
      if (v.id === liveMatchId) return false
      const c = v.confidence ?? 0
      return c >= ALTERNATIVE_MIN_CONFIDENCE && c < AUTO_LIVE_MIN_CONFIDENCE
    })
    .sort((a, b) => {
      // Newest first.
      const dt = detectedAtMs(b) - detectedAtMs(a)
      if (dt !== 0) return dt
      // Tiebreaker: higher confidence first, then id desc.
      const dc = (b.confidence ?? 0) - (a.confidence ?? 0)
      if (dc !== 0) return dc
      return b.id.localeCompare(a.id)
    })
}

// Auto-advance decision — STICKY. Per operator clarification:
//   "Alternative References should never auto-go-live — only the
//    user can double-click to promote one."
// Once a verse is live, NO subsequent detection auto-promotes
// anything else, no matter how confident. Lock releases only when
// the operator clicks Clear (which empties detectedVerses) or
// double-clicks an Alternative Reference.
export function shouldFireAutoLive<T extends RankedVerse>(
  detected: readonly T[],
  currentLiveId: string | null,
): { fire: false } | { fire: true; verse: T } {
  if (currentLiveId) return { fire: false }
  const top = pickAutoLiveMatch(detected)
  if (!top) return { fire: false }
  return { fire: true, verse: top }
}
