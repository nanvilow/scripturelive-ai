// v0.7.106 — Three-pipeline auto-verse detection re-tuned per
// pastebin spec jh9YcK2h ("MASTER PROMPT FOR REPLIT"). The
// column split from v0.7.104 is preserved; the THRESHOLDS and
// the anti-flicker control are what changed:
//
//   • Auto-live floor      0.85 → 0.65   (65% spec)
//   • Suggestions band     0.10–0.60 → 0.10–0.65 (failsafe rule)
//   • Stability frames     3     → 1     ("real-time, continuous")
//   • Anti-flicker         3-frame gate → 3.5 s LIVE_HOLD_MS
//                          ("previous verse must remain visible
//                          for 3-4 s, then transition out")
//
// The columns:
//
//   1. Auto Verse Match (Live)      — explicit references parsed by
//                                      the regex / Reference-Engine v2
//                                      ("Amos 1:3", "John 3:16-17").
//                                      Auto-fires on the first
//                                      ≥ 65% top pick — provided
//                                      the 3.5 s hold window from
//                                      the previous fire has elapsed.
//
//   2. Bible Reference Quoted        — semantic / paraphrase matches
//                                      (preacher-phrase catalogue,
//                                      keyword text-search, AI cosine
//                                      embedding). Same 65% floor +
//                                      hold window as col 1, tracked
//                                      INDEPENDENTLY: a hit in one
//                                      column does not block a hit
//                                      in the other (explicit wins
//                                      on tiebreak).
//
//   3. Suggested Verses Detect       — anything in the 0.10–0.65
//                                      band from EITHER detector.
//                                      MANUAL ONLY — operator must
//                                      double-click a row to send
//                                      it live. Never auto-fires
//                                      regardless of how long the
//                                      candidate sits.
//
// Confidence < 0.10 is dropped entirely (too noisy to surface).
//
// "Independent pipelines" is the operator-facing promise: there are
// NO fallback chains, NO cross-trigger between columns. The 3.5 s
// hold window is the spec's anti-slot-machine guard ("the app will
// either spam verses like a broken slot machine, or freeze like
// it's scared to commit"). Within the window: no fire. After the
// window: the next ≥ 65% top auto-fires immediately (real-time).
export type DetectionSource = 'explicit' | 'semantic' | 'suggestion'

export interface RankedVerse {
  id: string
  confidence?: number
  detectedAt?: Date | string | number
  source?: DetectionSource
}

// v0.7.106 — Auto-live floor lowered 0.85 → 0.65 per spec
// jh9YcK2h ("auto-trigger to LIVE when detection confidence is
// between 65% – 100%"). Anything below this is routed to the
// suggestions column per the failsafe rule ("If detection
// confidence drops below 65%: Do NOT push to live. Route to
// Suggested Verses instead").
export const AUTO_LIVE_MIN_CONFIDENCE = 0.65

// The "Suggested Verses" column accepts everything in the
// 0.10–0.65 band. Operator promotes manually; no auto-fire path
// exists from this column. Anything ≥ 0.65 lives in cols 1/2.
export const SUGGESTION_MIN_CONFIDENCE = 0.1
export const SUGGESTION_MAX_EXCLUSIVE = 0.65
// Live columns (explicit / semantic) start surfacing rows from
// this floor up — below it, the row would only ever appear in
// the suggestions column.
export const LIVE_COLUMN_MIN_CONFIDENCE = SUGGESTION_MAX_EXCLUSIVE

// v0.7.94-compat: the old `ALTERNATIVE_MIN_CONFIDENCE` symbol is kept
// re-exported as the suggestion floor so any external imports still
// resolve (no longer used inside this module).
export const ALTERNATIVE_MIN_CONFIDENCE = SUGGESTION_MIN_CONFIDENCE

// v0.7.106 — Stability gate relaxed 3 → 1 per spec ("real-time
// and continuous, with zero manual interaction required, fix
// current issue where detection does not trigger live output").
// The old 3-frame wait was the root cause of the operator
// complaint that v0.7.104/.105 stopped firing — most preaching
// audio produces a single high-confidence frame at a time, so
// the gate almost never closed. Anti-flicker is now handled by
// LIVE_HOLD_MS instead.
export const STABILITY_MIN_FRAMES = 1

// v0.7.106 — Minimum dwell time between consecutive auto-fires
// per the spec's display-timing rule: "If a new verse/reference
// is detected: The previous verse must remain visible for 3-4
// seconds, then transition out." 3.5 s is the midpoint. Within
// this window after a fire, the gate refuses to fire again so
// the projector doesn't slot-machine through rapidly-changing
// detections; once the window elapses, the next ≥ 65% top
// auto-fires immediately (real-time).
export const LIVE_HOLD_MS = 3500

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
// flowing into the explicit column rather than vanishing.
function sourceOf(v: RankedVerse): DetectionSource {
  return v.source ?? 'explicit'
}

// Pure ranking helper — picks the highest-confidence verse from the
// supplied list whose confidence ≥ AUTO_LIVE_MIN_CONFIDENCE. Ties
// broken by NEWER detectedAt first, then by id (deterministic).
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

// Per-pipeline pick. Returns the highest-confidence verse tagged
// with the requested source whose confidence clears the auto-live
// floor. Returns null if no qualifying candidate exists.
export function pickAutoLiveBySource<T extends RankedVerse>(
  detected: readonly T[],
  source: Exclude<DetectionSource, 'suggestion'>,
): T | null {
  return pickAutoLiveMatch(detected.filter((v) => sourceOf(v) === source))
}

// Suggestions column. Returns every detection in the 0.10–0.65
// band (regardless of source) plus anything explicitly tagged
// `source: 'suggestion'`, ordered newest-first.
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

// Per-pipeline live-column listing. Returns every detection
// tagged with the requested source whose confidence is at least
// LIVE_COLUMN_MIN_CONFIDENCE (0.65). Newest auto-fire winner
// renders first; the rest as additional rows below.
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

// ─── Stability gate (per-pipeline frame counter) ──────────────────
//
// At default minFrames=1 (v0.7.106) this is a pass-through: any
// candidate fires on its first observation. The function is kept
// because the test suite asserts the counter behaviour and because
// callers that want a multi-frame gate (e.g. tests or future tuning)
// can pass `minFrames > 1`.
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

// ─── Auto-fire gate state (per-source counters + last-fire clock) ─
//
// `lastFireAtMs` carries the wall-clock of the most recent fire so
// the helper can enforce the 3.5 s hold window across calls. The
// caller persists this state in a useRef and passes Date.now() in
// via opts.nowMs (overridable for tests).
export interface AutoFireGateState {
  explicit: StabilityState
  semantic: StabilityState
  lastFireAtMs: number
}

export const initialAutoFireGate: AutoFireGateState = {
  explicit: initialStabilityState,
  semantic: initialStabilityState,
  lastFireAtMs: 0,
}

// Backwards-compat alias — older callers (and the existing
// useRef in logos-shell) reference these names.
export type PerSourceStabilityState = AutoFireGateState
export const initialPerSourceStability: PerSourceStabilityState = initialAutoFireGate

export type AutoFireDecision<T extends RankedVerse> =
  | { fire: false; nextStability: AutoFireGateState }
  | {
      fire: true
      verse: T
      source: 'explicit' | 'semantic'
      nextStability: AutoFireGateState
    }

// v0.7.94-compat — legacy two-arg sticky decision. Fires immediately
// on the first ≥ AUTO_LIVE_MIN_CONFIDENCE top match (no stability,
// no hold window, no source tracking). Kept so any external caller
// still compiles. New code paths should use shouldFireAutoLiveStable.
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

// v0.7.106 — Source-aware auto-fire decision with the new
// hold-window anti-flicker rule.
//
// Inputs:
//   • `detected`        — full detectedVerses store array.
//   • `currentLiveId`   — id of the verse currently shown live, or null.
//                          The helper will NOT re-fire the same id even
//                          after the hold window expires.
//   • `gate`            — { explicit, semantic, lastFireAtMs } prior
//                          frame state.
//   • `opts.minFrames`  — override the 1-frame default (tests).
//   • `opts.holdMs`     — override the 3.5 s hold window (tests).
//   • `opts.nowMs`      — override Date.now() (tests).
//
// Behaviour:
//   1. If less than `holdMs` has elapsed since the last fire, return
//      `fire: false` and leave gate unchanged. This is the spec's
//      "previous verse must remain visible for 3-4 seconds" rule
//      and the only anti-flicker control.
//   2. Otherwise, advance the per-source counters with the current
//      top picks. If a counter has reached `minFrames` AND its top
//      is not the verse currently live, fire it; explicit wins on
//      tiebreak. On fire, stamp `lastFireAtMs = nowMs` in the
//      returned next state.
//   3. Suggestion-tagged candidates are ineligible to fire (they
//      don't appear in pickAutoLiveBySource, which filters on
//      'explicit' | 'semantic' only).
export function shouldFireAutoLiveStable<T extends RankedVerse>(
  detected: readonly T[],
  currentLiveId: string | null,
  gate: AutoFireGateState,
  opts: { minFrames?: number; holdMs?: number; nowMs?: number } = {},
): AutoFireDecision<T> {
  const minFrames = opts.minFrames ?? STABILITY_MIN_FRAMES
  const holdMs = opts.holdMs ?? LIVE_HOLD_MS
  const now = opts.nowMs ?? Date.now()

  // Hold window: refuse to fire while the previous live verse is
  // still inside its 3.5 s dwell. Gate state is returned unchanged
  // so the caller persists it without bumping counters.
  if (gate.lastFireAtMs > 0 && now - gate.lastFireAtMs < holdMs) {
    return { fire: false, nextStability: gate }
  }

  const explicitTop = pickAutoLiveBySource(detected, 'explicit')
  const semanticTop = pickAutoLiveBySource(detected, 'semantic')

  const explicitGate = evaluateStability(gate.explicit, explicitTop, { minFrames })
  const semanticGate = evaluateStability(gate.semantic, semanticTop, { minFrames })
  const nextGate: AutoFireGateState = {
    explicit: explicitGate.next,
    semantic: semanticGate.next,
    lastFireAtMs: gate.lastFireAtMs,
  }

  // Don't refire whatever's already on the projector — the spec
  // says the current verse stays "indefinitely" if no NEW verse
  // is detected, so picking up the same top.id again is a no-op.
  const explicitFire =
    explicitGate.fire && explicitGate.verse && explicitGate.verse.id !== currentLiveId
      ? explicitGate.verse
      : null
  const semanticFire =
    semanticGate.fire && semanticGate.verse && semanticGate.verse.id !== currentLiveId
      ? semanticGate.verse
      : null

  // Independence + tiebreak: explicit wins when both fire same frame.
  if (explicitFire) {
    return {
      fire: true,
      verse: explicitFire,
      source: 'explicit',
      nextStability: { ...nextGate, lastFireAtMs: now },
    }
  }
  if (semanticFire) {
    return {
      fire: true,
      verse: semanticFire,
      source: 'semantic',
      nextStability: { ...nextGate, lastFireAtMs: now },
    }
  }
  return { fire: false, nextStability: nextGate }
}
