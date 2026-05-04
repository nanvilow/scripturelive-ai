export interface RankedVerse {
  id: string
  confidence?: number
}

export const AUTO_LIVE_MIN_CONFIDENCE = 0.5

// Pure ranking helper — used by the Detected Verses card to figure
// out which row to badge as "Auto-Live Match" and which to show in
// the right-hand Alternative References column.
//
// Picks the single highest-confidence verse with confidence >= 0.50.
// Ties broken by id (deterministic).
export function pickAutoLiveMatch<T extends RankedVerse>(detected: readonly T[]): T | null {
  if (!detected.length) return null
  const ranked = [...detected].sort((a, b) => {
    const dc = (b.confidence ?? 0) - (a.confidence ?? 0)
    return dc !== 0 ? dc : b.id.localeCompare(a.id)
  })
  const top = ranked[0]
  if (!top || (top.confidence ?? 0) < AUTO_LIVE_MIN_CONFIDENCE) return null
  return top
}

export function alternativesFor<T extends RankedVerse>(
  detected: readonly T[],
  liveMatchId: string | null,
): T[] {
  return [...detected]
    .sort((a, b) => {
      const dc = (b.confidence ?? 0) - (a.confidence ?? 0)
      return dc !== 0 ? dc : b.id.localeCompare(a.id)
    })
    .filter((v) => v.id !== liveMatchId)
}

// Auto-advance decision used by the AppShell effect. STICKY model
// per operator clarification:
//
//   "Alternative References should never auto-go-live — only the
//    user can double-click to promote one."
//
// So the rule is:
//   • If nothing is currently live, fire on the first detection
//     whose top match clears 50%.
//   • Once a verse is live, lock — NO subsequent detection auto-
//     promotes anything else, no matter how confident. The operator
//     either clicks Clear (which empties the detection list and
//     releases the lock for the next session) or double-clicks an
//     Alternative Reference to switch live manually.
//
// `currentLiveId` is the id of the verse the AppShell believes is
// already live (tracked via lastAutoVerseId ref). Pass null when
// nothing has ever been auto-promoted in this detection session.
export function shouldFireAutoLive<T extends RankedVerse>(
  detected: readonly T[],
  currentLiveId: string | null,
): { fire: false } | { fire: true; verse: T } {
  // Sticky lock: once a verse is live, never displace it via auto.
  if (currentLiveId) return { fire: false }
  const top = pickAutoLiveMatch(detected)
  if (!top) return { fire: false }
  return { fire: true, verse: top }
}
