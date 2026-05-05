// v0.7.104 — THREE-PIPELINE auto-verse detection per pastebin spec
// (t5B6FGSD). The Detected Verses card is now split into three
// columns by DETECTION SOURCE rather than by confidence band:
//
//   1. Auto Verse Match (Live)      — explicit references parsed by
//                                      the regex / Reference-Engine v2
//                                      ("Amos 1:3", "John 3:16-17").
//                                      Auto-fires when confidence
//                                      ≥ 0.85 AND the candidate is
//                                      stable across ≥ 3 consecutive
//                                      effect frames.
//
//   2. Bible Reference Quoted        — semantic / paraphrase matches
//                                      (preacher-phrase catalogue,
//                                      keyword text-search, AI cosine
//                                      embedding). Same 0.85 floor
//                                      and 3-frame stability gate as
//                                      column 1, but tracked
//                                      INDEPENDENTLY: a stable
//                                      semantic hit can never be
//                                      displaced by an explicit hit
//                                      (or vice-versa) — each pipeline
//                                      owns its own auto-live decision.
//
//   3. Suggested Verses Detect       — the 0.50–0.84 band from EITHER
//                                      detector. Manual only — the
//                                      operator must double-click a
//                                      row to send it live. Never
//                                      auto-fires regardless of how
//                                      long the candidate sits.
//
// Confidence < 0.50 is dropped entirely (too noisy to surface).
//
// "Independent pipelines" is the operator-facing promise: there are
// NO fallback chains, NO cross-trigger between columns. The live
// pipeline that fired most recently sticks until the operator clears
// it (existing v0.7.86 sticky behaviour preserved).
export type DetectionSource = 'explicit' | 'semantic' | 'suggestion'

export interface RankedVerse {
  id: string
  confidence?: number
  detectedAt?: Date | string | number
  source?: DetectionSource
}

// Auto-live floor raised 0.55 → 0.85 per spec ("≥85% confidence").
// Anything below this in the explicit/semantic columns surfaces only
// as a visual chip, never auto-fires.
export const AUTO_LIVE_MIN_CONFIDENCE = 0.85

// The "Suggested Verses" column accepts the 0.10–0.60 band per the
// operator's clarification on the v0.7.104 spec. Operator promotes
// manually; no auto-fire path exists from this column. Anything in
// the 0.60–0.85 dead-band surfaces in the live column for that
// pipeline as a SUB-THRESHOLD chip — visible but not yet firing
// because it hasn't reached the 0.85 auto-live floor.
export const SUGGESTION_MIN_CONFIDENCE = 0.1
export const SUGGESTION_MAX_EXCLUSIVE = 0.6
// Live columns (explicit / semantic) start surfacing chips from
// this floor up — below it, the row would only ever appear in
// the suggestions column.
export const LIVE_COLUMN_MIN_CONFIDENCE = SUGGESTION_MAX_EXCLUSIVE

// v0.7.94-compat: the old `ALTERNATIVE_MIN_CONFIDENCE` symbol is kept
// re-exported as the suggestion floor so any external imports still
// resolve (no longer used inside this module).
export const ALTERNATIVE_MIN_CONFIDENCE = SUGGESTION_MIN_CONFIDENCE

// Stability gate — the candidate must remain top of its source column
// across ≥ N consecutive evaluator frames before auto-live fires.
// "Frame" here = one tick of the auto-fire effect, which itself runs
// on every detectedVerses mutation (each new addDetectedVerse call).
//
// Default 3 matches the spec ("≥ 3 consecutive frames"). Tests pass
// `minFrames: 1` to assert immediate firing without stability waits.
export const STABILITY_MIN_FRAMES = 3

function detectedAtMs(v: RankedVerse): number {
  const d = v.detectedAt
  if (d == null) return 0
  if (typeof d === 'number') return d
  if (typeof d === 'string') return new Date(d).getTime() || 0
  if (d instanceof Date) return d.getTime()
  return 0
}

// Default a missing source to 'explicit' so detection events recorded
// before v0.7.104 (or by a code path that hasn't been tagged yet) keep
// flowing into the explicit column rather than vanishing. Operators
// will still see them; only the new column-routing is best-effort
// rather than a hard contract.
function sourceOf(v: RankedVerse): DetectionSource {
  return v.source ?? 'explicit'
}

// Pure ranking helper — picks the highest-confidence verse from the
// supplied list whose confidence ≥ AUTO_LIVE_MIN_CONFIDENCE. Ties
// broken by NEWER detectedAt first, then by id (deterministic).
//
// In v0.7.104 callers should prefer `pickAutoLiveBySource` so each
// pipeline owns its own pick. This generic helper is kept for the
// existing single-column callers (and the test suite) but no longer
// drives the live UI.
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

// v0.7.104 — Per-pipeline pick. Returns the highest-confidence verse
// tagged with the requested source whose confidence clears the
// auto-live floor. Returns null if no qualifying candidate exists.
//
// The two live columns each call this with their own source; a
// stable winner in one column does NOT consider candidates in the
// other (independence rule).
export function pickAutoLiveBySource<T extends RankedVerse>(
  detected: readonly T[],
  source: Exclude<DetectionSource, 'suggestion'>,
): T | null {
  return pickAutoLiveMatch(detected.filter((v) => sourceOf(v) === source))
}

// v0.7.104 — Suggestions column. Returns every detection in the
// 0.50–0.84 band (regardless of source) plus anything explicitly
// tagged `source: 'suggestion'`, ordered newest-first. The
// suggestions column never auto-fires; this list drives the manual
// double-click promotion UI.
export function suggestionsFor<T extends RankedVerse>(detected: readonly T[]): T[] {
  return [...detected]
    .filter((v) => {
      if (sourceOf(v) === 'suggestion') return true
      const c = v.confidence ?? 0
      return c >= SUGGESTION_MIN_CONFIDENCE && c < SUGGESTION_MAX_EXCLUSIVE
    })
    .sort((a, b) => {
      const dt = detectedAtMs(b) - detectedAtMs(a)
      if (dt !== 0) return dt
      const dc = (b.confidence ?? 0) - (a.confidence ?? 0)
      if (dc !== 0) return dc
      return b.id.localeCompare(a.id)
    })
}

// v0.7.104 — Per-pipeline live-column listing. Returns every
// detection tagged with the requested source whose confidence is at
// least LIVE_COLUMN_MIN_CONFIDENCE (i.e. above the suggestions
// band). The auto-live winner is rendered first, the rest as
// sub-threshold chips waiting to clear the 0.85 stability gate.
export function liveColumnFor<T extends RankedVerse>(
  detected: readonly T[],
  source: Exclude<DetectionSource, 'suggestion'>,
): T[] {
  return [...detected]
    .filter((v) => sourceOf(v) === source && (v.confidence ?? 0) >= LIVE_COLUMN_MIN_CONFIDENCE)
    .sort((a, b) => {
      const dc = (b.confidence ?? 0) - (a.confidence ?? 0)
      if (dc !== 0) return dc
      const dt = detectedAtMs(b) - detectedAtMs(a)
      if (dt !== 0) return dt
      return b.id.localeCompare(a.id)
    })
}

// v0.7.94-compat: legacy single-column alternatives helper. Kept so
// any non-shell caller still compiles. Returns everything ≥ the
// suggestions floor minus the supplied live id, newest-first.
export function alternativesFor<T extends RankedVerse>(
  detected: readonly T[],
  liveMatchId: string | null,
): T[] {
  return [...detected]
    .filter((v) => {
      if (v.id === liveMatchId) return false
      const c = v.confidence ?? 0
      return c >= SUGGESTION_MIN_CONFIDENCE
    })
    .sort((a, b) => {
      const dt = detectedAtMs(b) - detectedAtMs(a)
      if (dt !== 0) return dt
      const dc = (b.confidence ?? 0) - (a.confidence ?? 0)
      if (dc !== 0) return dc
      return b.id.localeCompare(a.id)
    })
}

// ─── Stability gate ───────────────────────────────────────────────
//
// The spec demands a candidate be observed as the top pick of its
// pipeline across ≥ 3 consecutive frames before auto-live fires.
// `evaluateStability` is a pure step function: pass in the previous
// gate state and the current top candidate, get back the next state
// plus a `fire` boolean.
//
// • New top.id (or first observation) → count resets to 1.
// • Same top.id as last tick           → count increments.
// • count ≥ minFrames                  → fire = true.
// • candidate is null                  → state cleared.
//
// The caller is responsible for persisting `next` into a useRef and
// for guaranteeing the function is invoked once per "frame" (i.e.
// once per auto-fire effect run).
export interface StabilityState {
  topId: string | null
  count: number
}

export const initialStabilityState: StabilityState = { topId: null, count: 0 }

export function evaluateStability<T extends RankedVerse>(
  prev: StabilityState,
  candidate: T | null,
  opts: { minFrames?: number } = {},
): { next: StabilityState; fire: boolean; verse: T | null } {
  const minFrames = opts.minFrames ?? STABILITY_MIN_FRAMES
  if (!candidate) {
    return { next: { topId: null, count: 0 }, fire: false, verse: null }
  }
  const sameAsPrev = prev.topId === candidate.id
  const count = sameAsPrev ? prev.count + 1 : 1
  const next: StabilityState = { topId: candidate.id, count }
  return { next, fire: count >= minFrames, verse: candidate }
}

// v0.7.104 — Source-aware sticky auto-fire decision.
//
// Inputs:
//   • `detected`        — the full detectedVerses store array.
//   • `currentLiveId`   — id of the verse currently shown live, or null.
//   • `stability`       — { explicit, semantic } prior frame counts.
//   • `opts.minFrames`  — override for the 3-frame default (tests).
//
// Output:
//   • `fire: true | false`
//   • `verse`           — the verse to push live (when fire=true).
//   • `nextStability`   — updated counter state to persist for the
//                          next frame.
//   • `source`          — which pipeline won ('explicit' | 'semantic').
//
// Sticky rule (preserved from v0.7.86): once anything is live, no
// further auto-fire occurs until the operator clears (currentLiveId
// becomes null). This prevents thrash mid-passage.
//
// Independence rule (new): the explicit and semantic gates each get
// their own counter; the explicit pipeline never displaces a stable
// semantic winner and vice-versa. When BOTH go stable on the same
// frame the explicit pipeline wins (regex matches are deterministic
// addresses; semantic matches are heuristic paraphrase guesses).
export interface PerSourceStabilityState {
  explicit: StabilityState
  semantic: StabilityState
}

export const initialPerSourceStability: PerSourceStabilityState = {
  explicit: initialStabilityState,
  semantic: initialStabilityState,
}

export type AutoFireDecision<T extends RankedVerse> =
  | { fire: false; nextStability: PerSourceStabilityState }
  | {
      fire: true
      verse: T
      source: 'explicit' | 'semantic'
      nextStability: PerSourceStabilityState
    }

// v0.7.94-compat — legacy two-arg sticky decision. Fires immediately
// on the first ≥0.85 top match (no stability tracking). Kept so the
// pre-v0.7.104 test suite and any external callers still compile.
// New code paths should use `shouldFireAutoLiveStable` below.
export function shouldFireAutoLive<T extends RankedVerse>(
  detected: readonly T[],
  currentLiveId: string | null,
): { fire: false } | { fire: true; verse: T; source: 'explicit' | 'semantic' } {
  if (currentLiveId) return { fire: false }
  const top = pickAutoLiveMatch(detected)
  if (!top) return { fire: false }
  return {
    fire: true,
    verse: top,
    source: sourceOf(top) === 'semantic' ? 'semantic' : 'explicit',
  }
}

// v0.7.104 — Source-aware sticky auto-fire decision with stability
// gate. Each pipeline (explicit / semantic) accumulates its own
// frame count; the explicit gate wins on tiebreak (regex addresses
// beat heuristic paraphrases when both are stable on the same frame).
//
// Sticky rule: once anything is live (currentLiveId != null) no
// further auto-fire occurs until the operator clears.
export function shouldFireAutoLiveStable<T extends RankedVerse>(
  detected: readonly T[],
  currentLiveId: string | null,
  stability: PerSourceStabilityState,
  opts: { minFrames?: number } = {},
): AutoFireDecision<T> {
  if (currentLiveId) {
    // Sticky: do not advance the gate while a verse is locked live;
    // returning the same state lets the caller persist it unchanged.
    return { fire: false, nextStability: stability }
  }

  const explicitTop = pickAutoLiveBySource(detected, 'explicit')
  const semanticTop = pickAutoLiveBySource(detected, 'semantic')

  const minFrames = opts.minFrames ?? STABILITY_MIN_FRAMES
  const explicitGate = evaluateStability(stability.explicit, explicitTop, { minFrames })
  const semanticGate = evaluateStability(stability.semantic, semanticTop, { minFrames })
  const nextStability: PerSourceStabilityState = {
    explicit: explicitGate.next,
    semantic: semanticGate.next,
  }

  // Independence + tiebreak: explicit wins when both stable.
  if (explicitGate.fire && explicitGate.verse) {
    return { fire: true, verse: explicitGate.verse, source: 'explicit', nextStability }
  }
  if (semanticGate.fire && semanticGate.verse) {
    return { fire: true, verse: semanticGate.verse, source: 'semantic', nextStability }
  }
  return { fire: false, nextStability }
}
