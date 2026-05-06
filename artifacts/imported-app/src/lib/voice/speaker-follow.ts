// Speaker-Follow Mode — v0.5.52 (re-tuned in v0.7.110).
//
// Continuously matches what the preacher is saying against each verse
// of the currently-displayed multi-verse passage and returns the index
// of the verse that best matches.
//
// Matching strategy: token-BIGRAM Jaccard similarity (cheap, robust
// against word reorder and minor mistranscription) computed on the
// last ~8 s of transcription against each verse's body text after
// stop-word removal.
//
// v0.7.110 — switched from trigrams to bigrams. The original v0.5.52
// trigram model required THREE consecutive matching content tokens
// for any score above 0, which is unreachable when the preacher
// paraphrases ("And then Paul writes that we should…" vs the verse
// "Therefore being justified by faith…"). Bigrams give us 3-5× the
// recall on real preaching transcripts at a small cost in
// discrimination, which the hysteresis below absorbs.
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

// v0.7.110 — bigrams + unigrams. Bigrams give us word-pair locality
// (so "loved world" still scores higher than just "loved" + "world"
// independently), and the unigram fallback ensures very short verses
// like "Jesus wept" still produce a non-empty signature.
function ngrams(toks: string[]): Set<string> {
  const out = new Set<string>()
  if (toks.length === 0) return out
  // Always include unigrams — short verses ("Jesus wept" → 2 tokens
  // after stop-word removal) would otherwise produce an empty set
  // and never match.
  for (const t of toks) out.add(t)
  for (let i = 0; i + 1 < toks.length; i++) {
    out.add(`${toks[i]} ${toks[i + 1]}`)
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
  /**
   * Required score for a verse to even be considered the new best.
   * v0.7.110: dropped 0.20 → 0.10 because the new bigram+unigram
   * signature produces lower absolute scores than the v0.5.52
   * trigram model. 0.10 is the empirical floor for "the preacher
   * is clearly reading THIS verse" on real worship transcripts.
   */
  switchThreshold?: number
  /**
   * Required margin over `currentScore` to actually switch.
   * v0.7.4: bumped 0.05 → 0.08 to make the highlight stickier in
   * multi-verse passages where adjacent verses share many tokens.
   * v0.7.110: dropped 0.08 → 0.04 to match the lower-magnitude
   * scores from the bigram model — the relative ordering is
   * preserved, so a 4-point gap is still decisive evidence.
   */
  minDelta?: number
  /** Index of the currently highlighted verse (caller-tracked). */
  currentIndex: number | null
  /**
   * v0.7.4 — Anti-rewind window. Timestamp (ms since epoch) of the
   * most recent forward switch. If the new best verse index is LESS
   * than `currentIndex` AND the elapsed time since `lastSwitchAt` is
   * below `antiRewindMs`, we suppress the switch. Preachers almost
   * always progress through a passage; a sudden backward jump within
   * 1.5 s is overwhelmingly noise (filler words from the previous
   * verse leaking into the speech window).
   */
  lastSwitchAt?: number
  /** Default 1500 ms. Set 0 to disable the anti-rewind guard. */
  antiRewindMs?: number
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
  const switchThreshold = opts.switchThreshold ?? 0.10
  const minDelta = opts.minDelta ?? 0.04
  const antiRewindMs = opts.antiRewindMs ?? 1500

  const speechTri = ngrams(tokens(recentSpeech))
  let best = -1
  let bestScore = 0
  let currentScore = 0
  for (const v of verses) {
    const verseTri = ngrams(tokens(v.text))
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
  // v0.7.4 — Anti-rewind guard. Suppress backward jumps within
  // antiRewindMs of the previous forward switch.
  const isBackward =
    opts.currentIndex !== null && best < opts.currentIndex
  const blockedByRewindGuard =
    isBackward &&
    antiRewindMs > 0 &&
    opts.lastSwitchAt !== undefined &&
    Date.now() - opts.lastSwitchAt < antiRewindMs
  return {
    bestIndex: best,
    bestScore,
    shouldSwitch: decisive && !blockedByRewindGuard,
  }
}
