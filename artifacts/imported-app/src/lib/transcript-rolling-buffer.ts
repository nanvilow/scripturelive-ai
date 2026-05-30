/**
 * Rolling transcript word buffer — bridges Bible references that are
 * split across Deepgram transcript boundaries.
 *
 * ─── Why this exists ─────────────────────────────────────────────────
 * Deepgram emits a `final` transcript after each ~300 ms silence gap
 * (the v0.7.165 `endpointing=300` invariant). A speaker who says a
 * reference with a pause in the middle — "John" … <breath> … "3:7" —
 * produces TWO independent finals: `"John"` then `"3:7"`. The verse
 * detector (`detectBestReference`) only ever saw the single most recent
 * chunk, so neither chunk on its own carried a complete reference and
 * the address was silently dropped.
 *
 * Likewise, a reference embedded deep inside a long continuous
 * utterance arrives in whatever final Deepgram happens to cut, and the
 * book name + chapter:verse can straddle that cut.
 *
 * This module keeps a short, time-windowed AND length-capped rolling
 * window of the most recent FINAL words so the detector always sees a
 * contiguous span of recent speech, regardless of where Deepgram drew
 * its segment boundaries.
 *
 * ─── Design constraints ──────────────────────────────────────────────
 *  • Pure + deterministic — no React, no I/O, no Date.now() inside.
 *    The caller passes `nowMs` so the logic is fully unit-testable.
 *  • Time-bounded so a reference spoken 30 s ago doesn't keep
 *    re-surfacing and fighting the 30 s dedupe window in the provider.
 *  • Length-bounded so a fast monologue can't grow the window without
 *    limit (the detector is O(n) over tokens; we keep n small + cheap).
 *  • Only FINAL words are persisted. Interim words are transient and
 *    are appended at detection time via `bufferText(buf) + ' ' + interim`
 *    so they never pollute the persisted window once superseded.
 */

export interface RollingWord {
  /** The single transcript word (already cleaned upstream). */
  readonly w: string
  /** Wall-clock ms when this word's final chunk landed. */
  readonly at: number
}

export interface RollingBufferOptions {
  /**
   * Drop words older than this many ms. Default 12 000 — long enough to
   * bridge a "John … <pause> … 3:7" reference (operators pause up to a
   * few seconds) but short enough that an address spoken much earlier
   * doesn't linger and re-fire.
   */
  windowMs?: number
  /**
   * Hard cap on retained words regardless of age. Default 60 — keeps the
   * detector's token walk trivially cheap and prevents a fast,
   * pause-free monologue from growing the window unbounded.
   */
  maxWords?: number
}

const DEFAULT_WINDOW_MS = 12_000
const DEFAULT_MAX_WORDS = 60

/**
 * Append the words of a freshly-finalised transcript chunk to the
 * rolling window, then evict anything outside the time/length bounds.
 * Returns a NEW array (never mutates `prev`) so it is safe to store in
 * a React ref and compare by reference if needed.
 */
export function pushWords(
  prev: readonly RollingWord[],
  chunk: string,
  nowMs: number,
  opts: RollingBufferOptions = {},
): RollingWord[] {
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS
  const maxWords = opts.maxWords ?? DEFAULT_MAX_WORDS

  const incoming: RollingWord[] = chunk
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => ({ w, at: nowMs }))

  // Nothing to add — still apply eviction so a long silence prunes the
  // window even when the latest chunk was empty.
  let next: RollingWord[] = incoming.length ? [...prev, ...incoming] : [...prev]

  const cutoff = nowMs - windowMs
  next = next.filter((x) => x.at >= cutoff)

  if (next.length > maxWords) {
    next = next.slice(next.length - maxWords)
  }
  return next
}

/**
 * Render the last `lastN` words of the buffer back into a plain string
 * for the detector. Defaults to 30 — the same window the legacy
 * single-chunk path used, so detection breadth is unchanged; the only
 * difference is the words now span chunk boundaries.
 */
export function bufferText(buf: readonly RollingWord[], lastN = 30): string {
  if (lastN <= 0) return ''
  return buf
    .slice(Math.max(0, buf.length - lastN))
    .map((x) => x.w)
    .join(' ')
}

/**
 * Convenience for the interim path: the persisted final-word window
 * plus the current (non-persisted) interim hypothesis, clipped to the
 * last `lastN` words. This is what lets a reference whose book name was
 * already finalised ("John") fire the instant the chapter:verse appears
 * in the live interim ("3:7") — sub-second, before Deepgram cuts the
 * next final.
 */
export function detectionText(
  buf: readonly RollingWord[],
  interim: string,
  lastN = 30,
): string {
  const base = buf.map((x) => x.w)
  const tail = interim.trim() ? interim.trim().split(/\s+/).filter(Boolean) : []
  const all = [...base, ...tail]
  return all.slice(Math.max(0, all.length - lastN)).join(' ')
}
