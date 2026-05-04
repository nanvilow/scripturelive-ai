export interface RankedVerse {
  id: string
  confidence?: number
  detectedAt?: Date | string | number
}

// v0.7.93 — Auto-live floor raised back to 0.55 after operator
// feedback that the v0.7.91 floor of 0.40 was promoting wrong verses
// to the live screen during sermons (the regex/embedding detector
// returns low-50 % confidence on ambiguous half-quotes that operators
// did NOT want auto-fired). The Alternative References band is
// widened to [0.20, 0.55) so the operator still sees the same
// "20 to 40%" suggestions they asked for in v0.7.91 — they just have
// to double-click to promote them, which is the safe failure mode.
//
// Tier summary:
//   confidence < 0.20 → dropped (too noisy to surface)
//   0.20 ≤ c < 0.55  → Alternative References (operator promotes)
//   confidence ≥ 0.55 → MAIN auto-live pick
export const AUTO_LIVE_MIN_CONFIDENCE = 0.55
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

// v0.7.94 — Alternatives are EVERY detected verse the operator can
// manually promote, except the single auto-live winner. Ordered by
// NEWEST DETECTION FIRST per operator spec:
//   "It says 9 detected verses, but only one is in there. I want all
//    detected verses to be in there but new detections come on top of
//    the old ones."
//
// v0.7.93 incorrectly capped this column at confidence < 0.55, which
// meant high-confidence siblings of the live pick (the other 8 of
// the 9 detections in the bug report) were filtered out and never
// rendered. The Auto-Live column shows the single winner; this
// column now shows every other ≥20 % detection so the badge count
// and the visible rows match.
export function alternativesFor<T extends RankedVerse>(
  detected: readonly T[],
  liveMatchId: string | null,
): T[] {
  return [...detected]
    .filter((v) => {
      if (v.id === liveMatchId) return false
      const c = v.confidence ?? 0
      return c >= ALTERNATIVE_MIN_CONFIDENCE
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
