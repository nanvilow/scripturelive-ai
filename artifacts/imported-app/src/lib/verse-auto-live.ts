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
// v0.7.127 — Lowered SEMANTIC floor 0.55 → 0.50 to close the
// 50–54 % dead gap between the suggestions cap (<0.50) and the
// previous semantic floor (≥0.55). Operator screenshot showed a
// 52 % Matthew 4:19 paint into "SUGGESTED VERSES" then immediately
// vanish to "Low-confidence guesses (10–49%)" because nothing in the
// gap had a home column. Mirrors the v0.7.114 fix that closed the
// 55–59 % gap by aligning the suggestion-tag threshold with this
// floor (see speech-provider.tsx L1827 + L1984 — both also moved
// from `< 0.55` to `< 0.50` in v0.7.127). Auto-go-live is still
// gated by the per-source stability + 1.25 s anti-flicker dwell, so
// the lower visibility floor does NOT mean every 50 % hit fires
// immediately — it means the operator can SEE 50 %+ semantic hits in
// COL 2 instead of having them disappear into a typography gap.
export const SEMANTIC_AUTO_LIVE_MIN = 0.5

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

// v0.7.109 — Anti-flicker dwell RE-ENABLED at 1250 ms.
// Operator spec: "If there's a next Bible verse or Bible Reference
// detection, let the previous Bible verse or Bible Reference
// detected stay live for about 1 to 1.5 sec." 1250 ms is the
// midpoint of that range — enough breathing room for the
// congregation to read the previous verse before the swap, short
// enough that the projector still feels live.
//
// Within `lastFireAtMs + LIVE_HOLD_MS` of a previous fire the gate
// returns fire=false with the gate UNCHANGED so the next call can
// re-evaluate. Once the window elapses, the next NEW qualifying
// detection (different id from currentLiveId) fires immediately.
// The id===currentLiveId no-refire short-circuit still applies.
// v0.7.116 — Lowered 1250 → 500. Operator complaint: "when a
// detection are being made at Bible Reference Quoted and Auto Verse
// Match detection is already live display, it doesn't switch to the
// new detection found in Bible Reference Quoted." The 1250 ms dwell
// window blocked ALL cross-column switching for 1.25 s after every
// fire — long enough that a brand-new high-confidence detection from
// the OTHER column would be silently swallowed if it landed during
// that window. 500 ms is still enough breathing room for the
// congregation to register the previous verse, but short enough that
// new detections feel immediate. Combined with v0.7.116's source-
// crossing dwell bypass below, cross-column switching now lands on
// the projector within ~half a second of detection.
export const LIVE_HOLD_MS = 500

// v0.7.117 — READ-LOCK ("Sticky live verse"). Operator complaint:
// "Can you lock down the accurately detected Bible verse that's in
// live display until the AI detects another accurate one? Because
// when an accurate Bible verse is detected and a user is reading
// from the live display before you will see the AI detector will
// detect another word from what is being read from the previous
// Bible detection and then will replace it with what it detected
// when they are reading from the live displayed one, which is not
// fine."
//
// Root cause: when a verse fires live, the operator (or preacher)
// reads it aloud. The transcript then says the verse text, the
// catalogue / semantic matcher detects a NEARBY verse (same chapter
// ±1-2, or a verse sharing the same opening clause), and the
// auto-fire helper happily swaps it in. Result: the projector
// flickers off the correct verse.
//
// Fix: For LIVE_STICKY_MS (8000 ms = 8 s) after a verse goes live,
// gate any new fire by these stricter rules:
//   1. Same reference as currentLive → never re-fire (existing rule).
//   2. New candidate confidence < currentLiveConfidence + 0.10 → BLOCK.
//      Stops same-chapter "near-misses" with similar confidence from
//      hijacking the live verse during read-back.
//   3. Otherwise allow — a clearly-better detection (e.g. an explicit
//      regex hit at 0.95 when current live is a semantic 0.65) WILL
//      override even within the read-lock.
// After the 8 s window the helper falls back to v0.7.116's normal
// 500 ms dwell and the operator gets responsive cross-column swaps
// for the next verse the preacher quotes.
export const LIVE_STICKY_MS = 8000

// Minimum confidence delta required for a new candidate to override
// the live verse during the read-lock window. 0.10 is large enough
// to filter out catalogue near-misses (which usually score within a
// few hundredths of the correct hit) but small enough that a
// genuinely better detection from the other column still wins.
export const LIVE_STICKY_CONFIDENCE_DELTA = 0.1

// v0.7.120 — High-confidence read-lock floor.
// Operator escalation: COL 2 "Bible Reference Quoted" went live with a
// verbatim preacher quotation ("Suffer not a witch to live" → Exod
// 22:18, conf 0.85 hand-curated EXACT) and was IMMEDIATELY hijacked by
// a COL 1 "Auto Verse Match" detection of an unrelated reference,
// because the v0.7.117 read-lock only required candConf >= liveConf +
// 0.10 (so an explicit 0.95 vs semantic 0.85 = 0.10 delta exactly →
// override allowed).
//
// When the live verse came from a HIGH-CONFIDENCE source (>= 0.85,
// which corresponds to hand-curated EXACT 0.95 / hand-curated FUZZY
// 0.85 / explicit-regex 0.95) the operator's spoken intent is
// unambiguous — the projector should STAY THERE for the full sticky
// window regardless of what else the matcher sees in the noisy
// transcript trailing the quote. Only an explicit operator click in
// the Detected Verses card overrides.
//
// Below this threshold (semantic 0.55-0.84, auto-derived 0.65) the
// older delta-based logic still applies — those are softer detections
// and a clearly-better candidate should be allowed to swap in.
export const LIVE_HIGH_CONF_LOCK = 0.85

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

// Suggestions column. Returns every detection in the 0.10–0.499
// band, ordered newest-first.
//
// v0.7.127 — Removed the `source === 'suggestion'` short-circuit
// that previously bypassed the upper-bound check. The bypass let
// upstream taggers leak ≥0.50-confidence detections into this
// column (e.g. AI cosine matcher returning 0.52 + tagged
// 'suggestion' by speech-provider.tsx pre-fix) — a 52 % Matthew
// 4:19 painted into the column whose own header reads
// "Low-confidence guesses (10–49%)". The band is now enforced
// strictly for ALL sources. The 'suggestion' tag remains a hint to
// downstream consumers (it never auto-fires) but it no longer
// overrides the column's confidence contract. Auto-derived FUZZY
// hits from the preacher-phrase pipeline (hard-coded conf=0.42 in
// speech-provider.tsx L1685–1689) still appear here because their
// confidence sits inside the band — the bypass was redundant for
// them anyway.
export function suggestionsFor<T extends RankedVerse>(detected: readonly T[]): T[] {
  return [...detected]
    .filter((v) => {
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
// `lastFireAtMs` stamps the wall-clock of the most recent fire. The
// helper enforces the LIVE_HOLD_MS dwell window against this stamp
// so the previous verse stays live for ~1.25 s before the next
// qualifying detection can swap it out.
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

// v0.7.109 — Source-aware auto-fire decision with per-column floors
// and a 1.25 s anti-flicker dwell window (previous verse stays live
// for ~1-1.5 s before the next qualifying detection swaps it).
//
// Inputs:
//   • `detected`        — full detectedVerses store array.
//   • `currentLiveId`   — id of the verse currently shown live, or null.
//                          The helper will NOT re-fire the same id.
//   • `gate`            — { explicit, semantic, lastFireAtMs } prior
//                          frame state.
//   • `opts.minFrames`  — override the 1-frame default (tests).
//   • `opts.holdMs`     — override the 1250 ms default (tests can
//                          pass 0 to disable the dwell, or a longer
//                          value to widen it).
//   • `opts.nowMs`      — override Date.now() (tests).
//
// Behaviour:
//   1. If less than `holdMs` (default 1250) ms have elapsed since
//      the last fire, return `fire: false` and leave gate unchanged
//      so the previous verse stays live for the dwell window.
//   2. Per-source pick + stability counter advance. If a counter has
//      reached `minFrames` AND its top is not the verse currently
//      live, fire it; explicit wins on tiebreak.
//   3. Suggestion-tagged candidates are ineligible to fire (they
//      don't appear in pickAutoLiveBySource, which filters on
//      'explicit' | 'semantic' only).
export function shouldFireAutoLiveStable<T extends RankedVerse & { reference?: string }>(
  detected: readonly T[],
  currentLiveId: string | null,
  gate: AutoFireGateState,
  opts: {
    minFrames?: number
    holdMs?: number
    nowMs?: number
    // v0.7.117 — Override the read-lock window (8 s default). Tests
    // can pass 0 to disable.
    stickyMs?: number
    // v0.7.117 — Override the confidence delta required to break the
    // read-lock (0.10 default).
    stickyDelta?: number
  } = {},
): AutoFireDecision<T> {
  const minFrames = opts.minFrames ?? STABILITY_MIN_FRAMES
  const holdMs = opts.holdMs ?? LIVE_HOLD_MS
  const stickyMs = opts.stickyMs ?? LIVE_STICKY_MS
  const stickyDelta = opts.stickyDelta ?? LIVE_STICKY_CONFIDENCE_DELTA
  const now = opts.nowMs ?? Date.now()

  // Hold window: enforced for `holdMs` ms after the last fire (500
  // by default per v0.7.116 spec — previous verse stays live for
  // ~0.5 s before any swap). Returned gate is unchanged so the
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
  let explicitFire =
    explicitGate.fire && explicitGate.verse && explicitGate.verse.id !== currentLiveId
      ? explicitGate.verse
      : null
  let semanticFire =
    semanticGate.fire && semanticGate.verse && semanticGate.verse.id !== currentLiveId
      ? semanticGate.verse
      : null

  // ── v0.7.117 — READ-LOCK gate ────────────────────────────────────
  // Within `stickyMs` of the last fire, suppress new fires whose
  // confidence does not exceed the live verse by `stickyDelta`. This
  // stops same-chapter near-miss detections from hijacking the live
  // verse while the operator/preacher reads it aloud.
  //
  // The live verse is found by id in the detected[] list. If it has
  // been pruned from the list (rare — usually it's still there) the
  // read-lock degrades to "block any new fire below stickyDelta of
  // the current top". Either way the live projector slide stays put.
  if (
    stickyMs > 0 &&
    gate.lastFireAtMs > 0 &&
    now - gate.lastFireAtMs < stickyMs &&
    currentLiveId
  ) {
    const liveVerse = detected.find((v) => v.id === currentLiveId) ?? null
    const liveConf = liveVerse?.confidence ?? 0
    const liveRef = liveVerse?.reference ?? null
    // v0.7.120 — High-confidence absolute lock. If the live verse
    // came from a verbatim hand-curated catalog hit (>= 0.85) the
    // operator's intent is unambiguous; block ALL cross-ref auto
    // swaps in the sticky window regardless of incoming candidate
    // confidence. Manual operator click still overrides because that
    // path doesn't go through this gate.
    const liveIsHighConf = liveConf >= LIVE_HIGH_CONF_LOCK
    const passesReadLock = (cand: T | null): boolean => {
      if (!cand) return false
      // Same reference → not really a swap. Block (no visible flicker).
      if (liveRef && cand.reference === liveRef) return false
      // v0.7.120 — HIGH-CONF lock blocks all cross-ref auto swaps.
      if (liveIsHighConf) return false
      const candConf = cand.confidence ?? 0
      return candConf >= liveConf + stickyDelta
    }
    if (!passesReadLock(explicitFire)) explicitFire = null
    if (!passesReadLock(semanticFire)) semanticFire = null
  }

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
