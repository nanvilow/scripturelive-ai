export interface RankedVerse {
  id: string
  confidence?: number
}

export const AUTO_LIVE_MIN_CONFIDENCE = 0.5

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

export function shouldFireAutoLive<T extends RankedVerse>(
  detected: readonly T[],
  currentLiveId: string | null,
): { fire: false } | { fire: true; verse: T } {
  const top = pickAutoLiveMatch(detected)
  if (!top) return { fire: false }
  if (top.id === currentLiveId) return { fire: false }
  return { fire: true, verse: top }
}
