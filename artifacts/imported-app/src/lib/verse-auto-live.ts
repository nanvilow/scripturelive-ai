// v0.7.107 — Per-column auto-live thresholds + continuous gate per
// operator spec ("Auto LIVE Detection System Fix — VERY IMPORTANT").
//
// REVERSAL of the v0.7.106 single-floor model. Operator complaint:
// "auto-live detection only works once and stops". Two root causes:
//
//   1) v0.7.106 used a 3.5 s LIVE_HOLD_MS dwell window between fires.
//      In real preaching, the auto-fire effect in logos-shell only
//      re-runs when `detectedVerses` changes. If a new top arrives
//      DURING the 3.5 s window the helper refused to fire, and once
//      the window elapsed nothing re-triggered the effect — so the
//      app appeared to "lock" after the first fire. v0.7.107 sets
//      LIVE_HOLD_MS = 0 (continuous, no anti-flicker dwell). The
//      ONLY duplicate-block is the id===currentLiveId no-refire short-
//      circuit, which the spec explicitly allows ("No duplicate
//      blocking unless same exact verse is already LIVE").
//
//   2) v0.7.106 used a single 0.65 floor for both detector pipelines.
//      The spec wants column-specific thresholds:
//        • COL 1 "Auto Verse Match"        → semantic, ≥ 80%
//        • COL 2 "Bible Reference Quoted"  → explicit, ≥ 60%
//        • COL 3 "Suggested Verses"        → 10-49%, manual only
//      Lower floor for explicit (regex hits are crisp; 60% is plenty).
//      Higher floor for semantic (paraphrase / embedding hits are
//      softer; 80% guards against false positives going live).
//
// The "Auto Verse Match" column header in logos-shell is rendered
// over our SEMANTIC pipeline (id === 'explicit' is the regex hits
// labelled "Bible Reference Quoted" in the UI). This is the
// historical wiring; we keep the internal source tags 'explicit' /
// 'semantic' but apply the new thresholds per the operator-facing
// labels. See COLUMN_AUTO_LIVE_MIN below for the source→threshold
// map and `pickAutoLiveBySource` for the floor lookup.
//
// Suggestions column accepts the literal 10-49% band per the spec
// ("DO NOT auto-send live. Only send to LIVE when the user double-
// clicks"). Anything above 49% that didn't qualify for its column's
// auto-fire floor is currently dropped from the visible UI — this
// is the spec's intent (the 50-79% semantic / 50-59% explicit gap
// is a false-positive zone we deliberately don't surface).
export type DetectionSource = 'explicit' | 'semantic' | 'suggestion'

export interface RankedVerse {
  id: string
  confidence?: number
  detectedAt?: Date | string | number
  source?: DetectionSource
}

// v0.7.108 — Column-specific auto-live floors per operator spec.
//   • EXPLICIT (regex / Reference-Engine hits, labelled "Auto Verse
//     Match" in the UI): ≥ 0.60.
//   • SEMANTIC (preacher-phrase / keyword / AI cosine embeddings,
//     labelled "Bible Reference Quoted" in the UI — paraphrased
//     quotations): LOWERED 0.80 → 0.55. Operator: "Bible Reference
//     Quoted column, Paraphrased quotations auto-live should be at
//     55% to 100%". Paraphrase recall is more important than
//     precision in live preaching — the previous 0.80 floor was so
//     strict it almost never fired in real audio.
export const EXPLICIT_AUTO_LIVE_MIN = 0.6
export const SEMANTIC_AUTO_LIVE_MIN = 0.55

const COLUMN_AUTO_LIVE_MIN: Record<Exclude<DetectionSource, 'suggestion'>, number> = {
  explicit: EXPLICIT_AUTO_LIVE_MIN,
  semantic: SEMANTIC_AUTO_LIVE_MIN,
}

// Generic "is this auto-live eligible at all" floor — the LOWEST of
// the per-source minima. Kept as a back-compat export so older
// callers (and pickAutoLiveMatch below) still resolve.
export const AUTO_LIVE_MIN_CONFIDENCE = Math.min(
  EXPLICIT_AUTO_LIVE_MIN,
  SEMANTIC_AUTO_LIVE_MIN,
)

// Suggestions column: literal 10-49% band per spec.
export const SUGGESTION_MIN_CONFIDENCE = 0.1
export const SUGGESTION_MAX_EXCLUSIVE = 0.5
export const LIVE_COLUMN_MIN_CONFIDENCE = AUTO_LIVE_MIN_CONFIDENCE
export const ALTERNATIVE_MIN_CONFIDENCE = SUGGESTION_MIN_CONFIDENCE

// v0.7.107 — Stability stays at 1 frame (real-time per spec).
export const STABILITY_MIN_FRAMES = 1

// v0.7.107 — Anti-flicker dwell DISABLED (was 3500 in v0.7.106).
// Operator spec: "Detection runs in real-time continuously. Every
// new valid detection triggers LIVE based on rules above. No
// duplicate blocking unless same exact verse is already LIVE
// (optional optimization)." The id===currentLiveId no-refire
// short-circuit is the ONLY block now.
export const LIVE_HOLD_MS = 0

function detectedAtMs(v: RankedVerse): number {
  const d = v.detectedAt
  if (d == null) return 0
  if (typeof d === 'number') return d
  if (typeof d === 'string') return new Date(d).getTime() || 0
  if (d instanceof Date) return d.getTime()
  return 0
}

function sourceOf(v: RankedVerse): DetectionSource {
  return v.source ?? 'explicit'
}

function autoLiveMinFor(source: Exclude<DetectionSource, 'suggestion'>): number {
  return COLUMN_AUTO_LIVE_MIN[source]
}

// Pure ranking helper — picks the highest-confidence verse from the
// supplied list whose confidence ≥ AUTO_LIVE_MIN_CONFIDENCE (the
// LOWEST per-source floor). Used by legacy callers; new code paths
// should use pickAutoLiveBySource which respects the per-source
// floor for the requested column.
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

// Per-pipeline pick. Returns the NEWEST verse tagged with the
// requested source whose confidence clears that source's auto-live
// floor (explicit ≥ 0.60, semantic ≥ 0.55). Returns null if no
// qualifying candidate exists.
//
// v0.7.107 — Newest-first (was confidence-desc). Operator spec:
// "Every NEW valid detection triggers LIVE continuously". A new
// 0.62 explicit hit must displace an older 0.95 hit, otherwise the
// projector stays stuck on whatever scored highest at the start of
// the sermon. Confidence is used only as a tiebreak for same-frame
// arrivals.
export function pickAutoLiveBySource<T extends RankedVerse>(
  detected: readonly T[],
  source: Exclude<DetectionSource, 'suggestion'>,
): T | null {
  const min = autoLiveMinFor(source)
  const candidates = detected.filter(
    (v) => sourceOf(v) === source && (v.confidence ?? 0) >= min,
  )
  if (!candidates.length) return null
  candidates.sort((a, b) => {
    const dt = detectedAtMs(b) - detectedAtMs(a)
    if (dt !== 0) return dt
    const dc = (b.confidence ?? 0) - (a.confidence ?? 0)
    if (dc !== 0) return dc
    return b.id.localeCompare(a.id)
  })
  return candidates[0]
}

// Suggestions column. Returns every detection in the 0.10–0.50
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

// Per-pipeline live-column listing. Uses the source-specific floor.
// v0.7.107 — Newest detection sits on TOP (matches operator spec:
// "always make new detection arrive on top of previous detections").
// Confidence is the secondary tiebreak only.
export function liveColumnFor<T extends RankedVerse>(
  detected: readonly T[],
  source: Exclude<DetectionSource, 'suggestion'>,
): T[] {
  const min = autoLiveMinFor(source)
  return [...detected]
    .filter((v) => sourceOf(v) === source && (v.confidence ?? 0) >= min)
    .sort((a, b) => {
      const dt = detectedAtMs(b) - detectedAtMs(a)
      if (dt !== 0) return dt
      const dc = (b.confidence ?? 0) - (a.confidence ?? 0)
      if (dc !== 0) return dc
      return b.id.localeCompare(a.id)
    })
}

// Legacy single-column alternatives helper (newest-first, ≥ 0.10).
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
// At default minFrames=1 (v0.7.106+) this is a pass-through: any
// candidate fires on its first observation. Kept because the test
// suite asserts the counter behaviour and callers can pass
// `minFrames > 1` for tighter gates.
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
// `lastFireAtMs` is retained so a future call site can re-enable the
// dwell window via opts.holdMs without changing the gate shape. With
// the default LIVE_HOLD_MS = 0 it is effectively unused.
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

// Legacy two-arg sticky decision (uses the LOWEST per-source floor).
// Kept for any external caller still resolving this name.
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

// v0.7.107 — Source-aware auto-fire decision with per-column floors
// and continuous (no-dwell) firing.
//
// Inputs:
//   • `detected`        — full detectedVerses store array.
//   • `currentLiveId`   — id of the verse currently shown live, or null.
//                          The helper will NOT re-fire the same id.
//   • `gate`            — { explicit, semantic, lastFireAtMs } prior
//                          frame state.
//   • `opts.minFrames`  — override the 1-frame default (tests).
//   • `opts.holdMs`     — override the 0 ms default to RE-ENABLE the
//                          dwell window (tests / future tuning).
//   • `opts.nowMs`      — override Date.now() (tests).
//
// Behaviour:
//   1. If `holdMs > 0` and less than `holdMs` ms have elapsed since
//      the last fire, return `fire: false` and leave gate unchanged.
//      Default `holdMs = 0` skips this check entirely (continuous).
//   2. Per-source pick + stability counter advance. If a counter has
//      reached `minFrames` AND its top is not the verse currently
//      live, fire it; explicit wins on tiebreak.
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

  // Hold window: only enforced when holdMs > 0 (default is 0, i.e.
  // continuous firing per spec). Returned gate is unchanged so the
  // caller persists it without bumping counters.
  if (holdMs > 0 && gate.lastFireAtMs > 0 && now - gate.lastFireAtMs < holdMs) {
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

  // Spec-allowed optimization: don't refire whatever's already on
  // the projector ("No duplicate blocking unless same exact verse
  // is already LIVE").
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
