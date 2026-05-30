/**
 * Reference-fire policy — decides whether an explicitly-detected Bible
 * address should fire fresh, re-fire as a re-mention, or be suppressed.
 *
 * ─── Why this exists ─────────────────────────────────────────────────
 * v0.7.263 added INTERIM explicit detection: the verse detector now runs
 * on Deepgram's interim hypotheses (throttled ~150 ms) so an address
 * fires the instant its chapter:verse is spoken, instead of waiting for
 * the next final. That accelerator created two spam vectors against the
 * provider's 30 s re-mention dedupe (`processedRefsRef`):
 *
 *   1. INTERIM SELF-SPAM — while the speaker is mid-sentence, every
 *      ~150 ms interim still contains the same reference. Without a
 *      guard, each interim re-enters the re-mention branch, calls
 *      `addDetectedVerse` again (fresh id + detectedAt), and re-triggers
 *      the centralized auto-live effect → the projector flickers /
 *      re-promotes the same verse dozens of times per utterance.
 *
 *   2. FINAL-ECHOES-INTERIM DOUBLE-FIRE — the interim path fires the
 *      reference, then ~1 s later Deepgram cuts the FINAL for the same
 *      utterance. The final-path detector sees the same address still
 *      inside the 30 s window → re-mention promotion → the SAME single
 *      utterance fires auto-live twice.
 *
 * A short per-reference promotion COOLDOWN (default 2.5 s) collapses both
 * vectors: any fire/re-fire within the cooldown of the previous fire is
 * suppressed, while a genuine re-mention seconds later still promotes.
 * The decision is a pure function so it is exhaustively unit-testable
 * (the caller passes `nowMs` and the last-fire timestamp — no clock, no
 * React, no store access inside).
 */

export type ReferenceFireDecision =
  /** Never fired (or dedupe window expired) — run the full new-entry path. */
  | 'new'
  /** Genuine re-mention within the dedupe window, past the cooldown — re-promote. */
  | 'rementtion'
  /** Too soon since the last fire (interim self-spam / final echo) — do nothing. */
  | 'suppress'

export interface ReferenceFirePolicyOptions {
  /**
   * Re-mention dedupe window. A reference fired more than this many ms
   * ago is treated as brand new again. Mirrors the provider's
   * `REF_DEDUPE_TTL_MS`. Default 30 000.
   */
  dedupeTtlMs?: number
  /**
   * Minimum gap between two fires of the SAME reference. Anything inside
   * this window is interim self-spam or a final echoing the interim that
   * just fired, so it is suppressed. Default 2 500 — long enough to span
   * a single utterance's interim stream + its trailing final, short
   * enough that a deliberate re-mention a few seconds later still fires.
   */
  rementionCooldownMs?: number
}

const DEFAULT_DEDUPE_TTL_MS = 30_000
const DEFAULT_REMENTION_COOLDOWN_MS = 2_500

/**
 * Decide how an explicit reference detection should be handled given the
 * last time the SAME reference fired.
 *
 * @param lastFireAtMs  Wall-clock ms of the previous fire, or 0 / <=0 if
 *                      this reference has never fired this session.
 * @param nowMs         Current wall-clock ms.
 */
export function decideReferenceFire(
  lastFireAtMs: number,
  nowMs: number,
  opts: ReferenceFirePolicyOptions = {},
): ReferenceFireDecision {
  const ttl = opts.dedupeTtlMs ?? DEFAULT_DEDUPE_TTL_MS
  const cooldown = opts.rementionCooldownMs ?? DEFAULT_REMENTION_COOLDOWN_MS

  // Never fired → fresh detection.
  if (lastFireAtMs <= 0) return 'new'

  const age = nowMs - lastFireAtMs

  // Clock skew / out-of-order timestamp — treat defensively as too-soon.
  if (age < 0) return 'suppress'

  // Outside the dedupe window → the earlier fire is ancient history;
  // treat as a brand-new mention.
  if (age >= ttl) return 'new'

  // Inside the dedupe window but within the cooldown → interim self-spam
  // or a final echoing the interim that just fired. Suppress.
  if (age < cooldown) return 'suppress'

  // Inside the dedupe window, past the cooldown → a deliberate
  // re-mention by the speaker. Re-promote.
  return 'rementtion'
}
