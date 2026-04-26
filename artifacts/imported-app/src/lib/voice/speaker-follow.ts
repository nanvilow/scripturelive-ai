// Speaker-Follow Mode — v0.5.52.
//
// Continuously matches what the preacher is saying against each verse
// of the currently-displayed multi-verse passage and returns the index
// of the verse that best matches.
//
// Matching strategy: token-trigram Jaccard similarity (cheap, robust
// against word reorder and minor mistranscription) computed on the
// last `windowMs` ms of transcription against each verse's body text
// after stop-word removal.
//
// Hysteresis: only switch verses when the new best is BOTH ≥
// `switchThreshold` AND ≥ `currentScore + minDelta`. Without this the
// highlight thrashes between two verses that share many words (e.g.
// John 3:16 and 3:17 both have "world", "God", "son", "perish",
// "everlasting").

const STOP = new Set([
  'the','a','an','of','and','or','to','in','for','on','at','is','was','were','be',
  'by','that','this','it','as','with','from','but','so','if','then','than',
  'i','you','he','she','they','we','my','your','our','their','his','her','its',
  'shall','will','have','has','had','am','are','do','did','done',
  'unto','upon','thee','thou','thy','thine','ye','yea','verily','also','even',
])

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP.has(w))
}

function trigrams(toks: string[]): Set<string> {
  const out = new Set<string>()
  if (toks.length < 1) return out
  if (toks.length === 1) {
    out.add(toks[0])
    return out
  }
  if (toks.length === 2) {
    out.add(`${toks[0]} ${toks[1]}`)
    return out
  }
  for (let i = 0; i + 2 < toks.length; i++) {
    out.add(`${toks[i]} ${toks[i + 1]} ${toks[i + 2]}`)
  }
  return out
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  const union = a.size + b.size - inter
  return union === 0 ? 0 : inter / union
}

export interface VerseLine {
  index: number
  text: string
}

export interface FollowResult {
  /** Index of the best-matching verse, or null if no decisive match. */
  bestIndex: number | null
  /** Score of bestIndex against the spoken window. */
  bestScore: number
  /** True when the caller should switch the highlight. */
  shouldSwitch: boolean
}

export interface FollowOpts {
  /** Required score for a verse to even be considered the new best. Default 0.20. */
  switchThreshold?: number
  /** Required margin over `currentScore` to actually switch. Default 0.05. */
  minDelta?: number
  /** Index of the currently highlighted verse (caller-tracked). */
  currentIndex: number | null
}

/**
 * Score every verse in the passage against the recent transcription
 * and decide whether to switch the highlight. Pure function — caller
 * is expected to track currentIndex and call this on each new
 * transcript chunk.
 *
 * The Jaccard scores are deliberately small (typical 0.05 - 0.30) so
 * the defaults above are tuned for that range.
 */
export function pickBestVerse(
  recentSpeech: string,
  verses: VerseLine[],
  opts: FollowOpts,
): FollowResult {
  if (!verses.length || !recentSpeech.trim()) {
    return { bestIndex: opts.currentIndex, bestScore: 0, shouldSwitch: false }
  }
  const switchThreshold = opts.switchThreshold ?? 0.20
  const minDelta = opts.minDelta ?? 0.05

  const speechTri = trigrams(tokens(recentSpeech))
  let best = -1
  let bestScore = 0
  let currentScore = 0
  for (const v of verses) {
    const verseTri = trigrams(tokens(v.text))
    const s = jaccard(speechTri, verseTri)
    if (s > bestScore) {
      best = v.index
      bestScore = s
    }
    if (v.index === opts.currentIndex) currentScore = s
  }
  if (best < 0) {
    return { bestIndex: opts.currentIndex, bestScore: 0, shouldSwitch: false }
  }
  if (best === opts.currentIndex) {
    return { bestIndex: best, bestScore, shouldSwitch: false }
  }
  const decisive = bestScore >= switchThreshold && bestScore >= currentScore + minDelta
  return {
    bestIndex: best,
    bestScore,
    shouldSwitch: decisive,
  }
}
