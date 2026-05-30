// v0.7.267 — Force-finalize decision for the Deepgram streaming hook.
//
// Deepgram only emits an `is_final` transcript at ~endpointing (300 ms)
// silence boundaries. A speaker talking fast with no pauses produces a
// single ever-growing interim and NO finals, so the persistent transcript
// stalls AND the heavy AI verse-detection pipeline (semantic /
// preacher-phrase / paraphrase recovery) — which is gated on `is_final` —
// never runs. The hook watches the gap since the last final and asks
// Deepgram to flush the current segment via a `Finalize` control message
// when an interim keeps arriving past the threshold.
//
// This pure predicate is split out from the hook so it can be unit-tested
// without a live WebSocket / AudioContext.

/**
 * Returns true when the streaming hook should send a Deepgram `Finalize`
 * control message for the current interim run.
 *
 * @param now                  current epoch ms
 * @param lastFinalAtMs        epoch ms of the most recent `is_final` (or
 *                             the socket-open time as the initial seed)
 * @param lastFinalizeReqAtMs  epoch ms of the last Finalize we requested
 *                             (0 when none armed)
 * @param thresholdMs          how long an interim may run with no final
 *                             before we force one (FORCE_FINALIZE_MS)
 *
 * Both clauses use strict greater-than so the threshold itself is not yet
 * enough — we only intervene once an interim has run *past* it. The second
 * clause rate-limits the request so the ~100-300 ms interim cadence can't
 * spam Finalize before the resulting `from_finalize` final returns and
 * resets `lastFinalAtMs`.
 */
export function shouldForceFinalize(
  now: number,
  lastFinalAtMs: number,
  lastFinalizeReqAtMs: number,
  thresholdMs: number,
): boolean {
  return (
    now - lastFinalAtMs > thresholdMs && now - lastFinalizeReqAtMs > thresholdMs
  )
}
