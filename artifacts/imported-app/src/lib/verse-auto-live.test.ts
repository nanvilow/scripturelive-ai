import { describe, expect, it } from 'vitest'
import {
  ALTERNATIVE_MIN_CONFIDENCE,
  AUTO_LIVE_MIN_CONFIDENCE,
  EXPLICIT_AUTO_LIVE_MIN,
  LIVE_COLUMN_MIN_CONFIDENCE,
  LIVE_HOLD_MS,
  SEMANTIC_AUTO_LIVE_MIN,
  SUGGESTION_MAX_EXCLUSIVE,
  SUGGESTION_MIN_CONFIDENCE,
  STABILITY_MIN_FRAMES,
  alternativesFor,
  evaluateStability,
  initialAutoFireGate,
  initialPerSourceStability,
  initialStabilityState,
  liveColumnFor,
  pickAutoLiveBySource,
  pickAutoLiveMatch,
  shouldFireAutoLive,
  shouldFireAutoLiveStable,
  suggestionsFor,
  type AutoFireGateState,
  type DetectionSource,
} from './verse-auto-live'

void LIVE_COLUMN_MIN_CONFIDENCE

const v = (
  id: string,
  confidence: number,
  detectedAt?: number,
  source?: DetectionSource,
) => ({
  id,
  confidence,
  reference: id,
  detectedAt: detectedAt != null ? new Date(detectedAt) : undefined,
  source,
})

// ──────────────────────────────────────────────────────────────────
// THRESHOLDS — v0.7.107 spec compliance
// ──────────────────────────────────────────────────────────────────
describe('thresholds (v0.7.109 — per-column auto-live + 1.25 s dwell)', () => {
  it('explicit floor is 0.58 per v0.7.133 operator spec ("any Bible Reference detected as low as 58% should auto go live")', () => {
    expect(EXPLICIT_AUTO_LIVE_MIN).toBe(0.58)
  })
  it('semantic / "Bible Reference Quoted" (paraphrase) floor is 0.50 per v0.7.127 spec (was 0.55, lowered to close 50–54 % gap)', () => {
    expect(SEMANTIC_AUTO_LIVE_MIN).toBe(0.5)
  })
  it('AUTO_LIVE_MIN_CONFIDENCE legacy export = lowest per-source floor (0.50)', () => {
    expect(AUTO_LIVE_MIN_CONFIDENCE).toBe(0.5)
  })
  it('suggestions band is 0.10–0.50 per spec', () => {
    expect(SUGGESTION_MIN_CONFIDENCE).toBe(0.1)
    expect(SUGGESTION_MAX_EXCLUSIVE).toBe(0.5)
  })
  it('stability gate is 1 frame (real-time, no wait)', () => {
    expect(STABILITY_MIN_FRAMES).toBe(1)
  })
  it('hold window is 500 ms (v0.7.116 — was 1250 ms; halved so cross-column switching is responsive)', () => {
    expect(LIVE_HOLD_MS).toBe(500)
  })
  it('legacy ALTERNATIVE_MIN_CONFIDENCE re-exports as suggestion floor', () => {
    expect(ALTERNATIVE_MIN_CONFIDENCE).toBe(SUGGESTION_MIN_CONFIDENCE)
  })
  it('initialPerSourceStability aliases initialAutoFireGate (compat)', () => {
    expect(initialPerSourceStability).toBe(initialAutoFireGate)
    expect(initialAutoFireGate.lastFireAtMs).toBe(0)
  })
})

// ──────────────────────────────────────────────────────────────────
// pickAutoLiveBySource — per-column floors
// ──────────────────────────────────────────────────────────────────
describe('pickAutoLiveBySource (per-column floors)', () => {
  it('explicit at 0.58 IS live-eligible (v0.7.133 boundary inclusive)', () => {
    expect(pickAutoLiveBySource([v('A', 0.58, 1, 'explicit')], 'explicit')?.id).toBe('A')
  })
  it('explicit at 0.57 is NOT live-eligible (v0.7.133 below the 0.58 floor)', () => {
    expect(pickAutoLiveBySource([v('A', 0.57, 1, 'explicit')], 'explicit')).toBeNull()
  })
  it('explicit at 0.59 IS live-eligible (above the v0.7.133 0.58 floor)', () => {
    expect(pickAutoLiveBySource([v('A', 0.59, 1, 'explicit')], 'explicit')?.id).toBe('A')
  })
  it('semantic at 0.50 IS live-eligible (boundary inclusive — v0.7.127 floor)', () => {
    expect(pickAutoLiveBySource([v('A', 0.5, 1, 'semantic')], 'semantic')?.id).toBe('A')
  })
  it('semantic at 0.49 is NOT live-eligible (strict 50% floor — falls into suggestions instead)', () => {
    expect(pickAutoLiveBySource([v('A', 0.49, 1, 'semantic')], 'semantic')).toBeNull()
  })
  it('semantic at 0.65 IS live-eligible under v0.7.108 (was rejected by v0.7.107 0.80 floor)', () => {
    expect(pickAutoLiveBySource([v('A', 0.65, 1, 'semantic')], 'semantic')?.id).toBe('A')
  })
  it('semantic at 0.79 IS live-eligible under v0.7.108 (was rejected by v0.7.107 0.80 floor)', () => {
    expect(pickAutoLiveBySource([v('A', 0.79, 1, 'semantic')], 'semantic')?.id).toBe('A')
  })
  it('explicit pick ignores semantic candidates and vice versa', () => {
    const detected = [
      v('Amos.1.3', 0.91, 1000, 'explicit'),
      v('John.4.24', 0.99, 2000, 'semantic'),
    ]
    expect(pickAutoLiveBySource(detected, 'explicit')?.id).toBe('Amos.1.3')
    expect(pickAutoLiveBySource(detected, 'semantic')?.id).toBe('John.4.24')
  })
  it('returns null when its column has no qualifying candidate', () => {
    const detected = [v('Ps.23.1', 0.92, 1000, 'semantic')]
    expect(pickAutoLiveBySource(detected, 'explicit')).toBeNull()
  })
  it('an unsourced detection defaults to the explicit column at 0.58+ (v0.7.133)', () => {
    const detected = [v('Untagged.1.1', 0.61, 1000)]
    expect(pickAutoLiveBySource(detected, 'explicit')?.id).toBe('Untagged.1.1')
    expect(pickAutoLiveBySource(detected, 'semantic')).toBeNull()
  })
  it('picks the NEWEST qualifying verse within its source (spec: continuous fire)', () => {
    const detected = [
      v('Old',    0.95, 1, 'explicit'),
      v('Mid',    0.75, 2, 'explicit'),
      v('Newest', 0.61, 3, 'explicit'),
    ]
    expect(pickAutoLiveBySource(detected, 'explicit')?.id).toBe('Newest')
  })

  it('a NEW low-confidence-but-qualifying hit displaces an OLDER high-confidence one', () => {
    // The bug this prevents: projector gets stuck on the first 0.95
    // hit of the sermon and never advances even when a new 0.62 hit
    // comes in further down the page.
    const detected = [
      v('OldHigh',  0.95, 1000, 'explicit'),
      v('NewLow',   0.62, 9000, 'explicit'),
    ]
    expect(pickAutoLiveBySource(detected, 'explicit')?.id).toBe('NewLow')
  })
})

// ──────────────────────────────────────────────────────────────────
// pickAutoLiveMatch — generic floor (lowest per-source = 0.60)
// ──────────────────────────────────────────────────────────────────
describe('pickAutoLiveMatch (legacy — lowest per-source floor)', () => {
  it('60% IS live-eligible (boundary inclusive)', () => {
    expect(pickAutoLiveMatch([v('Ps.23.1', 0.6)])?.id).toBe('Ps.23.1')
  })
  it('49% is NOT live-eligible (v0.7.127 — lowest per-source floor is 0.50)', () => {
    expect(pickAutoLiveMatch([v('Ps.23.1', 0.49)])).toBeNull()
  })
  it('50% IS live-eligible (v0.7.127 — boundary inclusive on the new lowered floor)', () => {
    expect(pickAutoLiveMatch([v('Ps.23.1', 0.5)])?.id).toBe('Ps.23.1')
  })
  it('picks the HIGHEST-confidence verse (legacy path retains confidence ordering)', () => {
    const detected = [v('A', 0.66), v('B', 0.89), v('C', 0.95)]
    expect(pickAutoLiveMatch(detected)?.id).toBe('C')
  })
})

// ──────────────────────────────────────────────────────────────────
// suggestionsFor — column 3 (10-49% manual-only band)
// ──────────────────────────────────────────────────────────────────
describe('suggestionsFor (column 3 — 10%–49% manual-only)', () => {
  it('includes 0.10–0.49 detections regardless of source', () => {
    const detected = [
      v('A', 0.92, 1000, 'explicit'),  // → live column
      v('B', 0.61, 2000, 'explicit'),  // → live column
      v('C', 0.49, 3000, 'explicit'),  // 49% → spec drops; we treat <0.50 as suggestion
      v('D', 0.30, 4000, 'semantic'),
      v('E', 0.10, 5000, 'semantic'),
      v('F', 0.09, 6000, 'semantic'),  // dropped (below floor)
    ]
    const ids = suggestionsFor(detected).map((s) => s.id)
    expect(ids).toEqual(['E', 'D', 'C'])
  })

  it('a 0.50 detection is NOT in suggestions (boundary exclusive top)', () => {
    expect(suggestionsFor([v('Half', 0.5, 1000, 'semantic')])).toEqual([])
  })

  it('a 0.49 detection IS in suggestions (just below the cap)', () => {
    expect(suggestionsFor([v('JustUnder', 0.49, 1000, 'semantic')]).map((s) => s.id))
      .toEqual(['JustUnder'])
  })

  it('a 0.10 detection IS in suggestions (boundary inclusive floor)', () => {
    expect(suggestionsFor([v('Floor', 0.1, 1000, 'semantic')]).map((s) => s.id))
      .toEqual(['Floor'])
  })

  it('v0.7.127 — source=suggestion tag NO LONGER bypasses the band: low-conf still dropped, in-band still in', () => {
    // Pre-v0.7.127 the `source==='suggestion'` short-circuit let any
    // suggestion-tagged verse appear regardless of confidence. That
    // leaked 0.50+ verses (e.g. the operator-screenshotted 52%
    // Matthew 4:19) into the column whose header reads
    // "Low-confidence guesses (10–49%)". Now the band is enforced
    // strictly for every source.
    const detected = [
      v('TooLow',     0.05, 1000, 'suggestion'),  // dropped (<0.10)
      v('TooHigh',    0.52, 2000, 'suggestion'),  // dropped (≥0.50) — would have leaked pre-fix
      v('InBandSugg', 0.30, 3000, 'suggestion'),  // kept (in band)
      v('InBandSem',  0.30, 4000, 'semantic'),    // kept (in band)
    ]
    expect(suggestionsFor(detected).map((s) => s.id)).toEqual(['InBandSem', 'InBandSugg'])
  })

  it('returns newest-first', () => {
    const detected = [
      v('Old', 0.30, 1000, 'semantic'),
      v('New', 0.30, 9000, 'semantic'),
      v('Mid', 0.30, 5000, 'semantic'),
    ]
    expect(suggestionsFor(detected).map((s) => s.id)).toEqual(['New', 'Mid', 'Old'])
  })

  it('drops everything below 0.10', () => {
    const detected = [v('X', 0.09, 1000, 'semantic'), v('Y', 0.05, 2000, 'explicit')]
    expect(suggestionsFor(detected)).toEqual([])
  })
})

// ──────────────────────────────────────────────────────────────────
// alternativesFor (legacy compat)
// ──────────────────────────────────────────────────────────────────
describe('alternativesFor (legacy 2-column compat)', () => {
  it('excludes the live winner and anything below the suggestion floor', () => {
    const detected = [
      v('A', 0.95),
      v('B', 0.92),
      v('C', 0.55),
      v('D', 0.09), // dropped
    ]
    expect(alternativesFor(detected, 'A').map((a) => a.id).sort()).toEqual(['B', 'C'])
  })
})

// ──────────────────────────────────────────────────────────────────
// liveColumnFor — per-source floor
// ──────────────────────────────────────────────────────────────────
describe('liveColumnFor (cols 1 & 2 — per-source floors)', () => {
  it('explicit column includes ≥0.58 from explicit source only, NEWEST first (v0.7.133)', () => {
    const detected = [
      v('Hi',   0.92, 1, 'explicit'),
      v('Mid',  0.7,  2, 'explicit'),
      v('Edge', 0.58, 3, 'explicit'),     // v0.7.133 boundary inclusive
      v('Sub',  0.57, 4, 'explicit'),     // → suggestions
      v('Sem',  0.91, 5, 'semantic'),     // wrong column
    ]
    // Newest detected first → Edge (3), Mid (2), Hi (1).
    expect(liveColumnFor(detected, 'explicit').map((d) => d.id)).toEqual(['Edge', 'Mid', 'Hi'])
  })

  it('semantic column requires ≥0.50 (v0.7.127 — closes 50–54% gap), NEWEST first', () => {
    const detected = [
      v('A', 0.95, 1, 'semantic'),
      v('B', 0.80, 2, 'semantic'),
      v('C', 0.65, 3, 'semantic'),
      v('D', 0.55, 4, 'semantic'),
      v('E', 0.50, 5, 'semantic'), // boundary inclusive on the new v0.7.127 floor
      v('F', 0.49, 6, 'semantic'), // dropped → routed to suggestions
    ]
    // E,D,C,B,A — newest first, F dropped (below 50%).
    expect(liveColumnFor(detected, 'semantic').map((d) => d.id)).toEqual(['E', 'D', 'C', 'B', 'A'])
  })

  it('orders by NEWEST first, confidence as tiebreak only', () => {
    const detected = [
      v('A', 0.85, 1000, 'semantic'),
      v('B', 0.95, 2000, 'semantic'),
      v('C', 0.95, 9000, 'semantic'),
    ]
    // C is newest → top. B then A by detectedAt.
    expect(liveColumnFor(detected, 'semantic').map((d) => d.id)).toEqual(['C', 'B', 'A'])
  })

  it('NEW low-conf detection sits ABOVE OLDER high-conf detection', () => {
    const detected = [
      v('OldHigh', 0.95, 1000, 'explicit'),
      v('NewLow',  0.62, 9000, 'explicit'),
    ]
    expect(liveColumnFor(detected, 'explicit').map((d) => d.id)).toEqual(['NewLow', 'OldHigh'])
  })
})

// ──────────────────────────────────────────────────────────────────
// evaluateStability — pure step function (defaults to 1 frame)
// ──────────────────────────────────────────────────────────────────
describe('evaluateStability', () => {
  it('clears state when candidate is null', () => {
    const r = evaluateStability({ topId: 'X', count: 2 }, null)
    expect(r).toEqual({ next: { topId: null, count: 0 }, fire: false, verse: null })
  })

  it('fires on the FIRST observation at default minFrames=1', () => {
    const r = evaluateStability(initialStabilityState, v('A', 0.9, 1, 'explicit'))
    expect(r.fire).toBe(true)
    expect(r.next).toEqual({ topId: 'A', count: 1 })
  })

  it('counts to 3 then fires when minFrames=3 (tunable)', () => {
    let s = initialStabilityState
    const cand = v('A', 0.9, 1, 'explicit')
    let r = evaluateStability(s, cand, { minFrames: 3 }); s = r.next
    expect([r.next.count, r.fire]).toEqual([1, false])
    r = evaluateStability(s, cand, { minFrames: 3 }); s = r.next
    expect([r.next.count, r.fire]).toEqual([2, false])
    r = evaluateStability(s, cand, { minFrames: 3 }); s = r.next
    expect([r.next.count, r.fire]).toEqual([3, true])
  })

  it('resets count to 1 when the top.id changes', () => {
    let s = initialStabilityState
    s = evaluateStability(s, v('A', 0.9, 1, 'explicit'), { minFrames: 5 }).next
    s = evaluateStability(s, v('A', 0.9, 1, 'explicit'), { minFrames: 5 }).next
    expect(s.count).toBe(2)
    const r = evaluateStability(s, v('B', 0.9, 1, 'explicit'), { minFrames: 5 })
    expect(r.next).toEqual({ topId: 'B', count: 1 })
    expect(r.fire).toBe(false)
  })
})

// ──────────────────────────────────────────────────────────────────
// shouldFireAutoLive — legacy two-arg sticky decision
// ──────────────────────────────────────────────────────────────────
describe('shouldFireAutoLive (legacy compat)', () => {
  it('fires on the first ≥0.60 explicit match when nothing is live', () => {
    const r = shouldFireAutoLive([v('John.4.24', 0.66, 1, 'explicit')], null)
    expect(r.fire).toBe(true)
    if (r.fire) expect(r.verse.id).toBe('John.4.24')
  })

  it('STICKY: a later match does NOT displace the live verse', () => {
    const detected = [
      v('John.4.24', 0.92, 1, 'explicit'),
      v('Prov.3.5', 0.99, 2, 'semantic'),
    ]
    const r = shouldFireAutoLive(detected, 'John.4.24')
    expect(r.fire).toBe(false)
  })

  it('Lock RELEASES when currentLiveId becomes null', () => {
    const r = shouldFireAutoLive([v('Prov.3.5', 0.92, 1, 'explicit')], null)
    expect(r.fire).toBe(true)
  })
})

// ──────────────────────────────────────────────────────────────────
// shouldFireAutoLiveStable (v0.7.107 — continuous + per-column)
// ──────────────────────────────────────────────────────────────────
describe('shouldFireAutoLiveStable (v0.7.107 — continuous, per-column)', () => {
  const fresh = (): AutoFireGateState => ({ ...initialAutoFireGate })

  it('fires IMMEDIATELY on first explicit ≥0.60 (real-time spec)', () => {
    const r = shouldFireAutoLiveStable(
      [v('Amos.1.3', 0.61, 1, 'explicit')],
      null,
      fresh(),
      { nowMs: 1000 },
    )
    expect(r.fire).toBe(true)
    if (r.fire) {
      expect(r.verse.id).toBe('Amos.1.3')
      expect(r.source).toBe('explicit')
    }
  })

  it('fires IMMEDIATELY on first semantic ≥0.55 (v0.7.108 paraphrase floor)', () => {
    const r = shouldFireAutoLiveStable(
      [v('John.4.24', 0.81, 1, 'semantic')],
      null,
      fresh(),
      { nowMs: 1000 },
    )
    expect(r.fire).toBe(true)
    if (r.fire) {
      expect(r.verse.id).toBe('John.4.24')
      expect(r.source).toBe('semantic')
    }
  })

  it('does NOT fire when the explicit top is below 0.58 (v0.7.133)', () => {
    const r = shouldFireAutoLiveStable([v('Lo', 0.57, 1, 'explicit')], null, fresh(), {
      nowMs: 1000,
    })
    expect(r.fire).toBe(false)
  })

  it('does NOT fire when the semantic top is below 0.50 (v0.7.127 — floor lowered from 0.55)', () => {
    const r = shouldFireAutoLiveStable([v('Lo', 0.49, 1, 'semantic')], null, fresh(), {
      nowMs: 1000,
    })
    expect(r.fire).toBe(false)
  })

  it('semantic at 0.65 DOES fire under v0.7.108 (paraphrase floor lowered to 0.55)', () => {
    const r = shouldFireAutoLiveStable(
      [v('X', 0.65, 1, 'semantic')],
      null,
      fresh(),
      { nowMs: 1000 },
    )
    expect(r.fire).toBe(true)
    if (r.fire) expect(r.source).toBe('semantic')
  })

  it('DWELL: a SECOND fire 1 ms after the first is BLOCKED (within 1.25 s window)', () => {
    let g = fresh()
    // First fire at t=1000
    let r = shouldFireAutoLiveStable(
      [v('First', 0.9, 1, 'explicit')],
      null,
      g,
      { nowMs: 1000 },
    )
    expect(r.fire).toBe(true)
    g = r.nextStability

    // Second fire at t=1001 (1 ms later) — BLOCKED by 1.25 s dwell.
    r = shouldFireAutoLiveStable(
      [v('Second', 0.95, 2, 'explicit')],
      'First',
      g,
      { nowMs: 1001 },
    )
    expect(r.fire).toBe(false)
  })

  it('DWELL: a SECOND fire 1.25 s after the first IS allowed (boundary inclusive)', () => {
    let g = fresh()
    let r = shouldFireAutoLiveStable(
      [v('First', 0.9, 1, 'explicit')],
      null,
      g,
      { nowMs: 1000 },
    )
    expect(r.fire).toBe(true)
    g = r.nextStability

    // Second fire EXACTLY at t=2250 (1250 ms later) — boundary is
    // `now - lastFireAtMs < holdMs`, so 1250 ms elapsed is allowed.
    r = shouldFireAutoLiveStable(
      [v('Second', 0.95, 2, 'explicit')],
      'First',
      g,
      { nowMs: 2250 },
    )
    expect(r.fire).toBe(true)
    if (r.fire) expect(r.verse.id).toBe('Second')
  })

  it('DWELL: third, fourth, fifth fires all proceed when each waits 1.25 s+', () => {
    let g = fresh()
    const ids: string[] = []
    for (let i = 0; i < 5; i++) {
      const id = `V${i}`
      const r = shouldFireAutoLiveStable(
        [v(id, 0.9, i, 'explicit')],
        ids[ids.length - 1] ?? null,
        g,
        { nowMs: 1000 + i * 1300 }, // 1300 ms apart > 1250 dwell
      )
      g = r.nextStability
      if (r.fire) ids.push(r.verse.id)
    }
    expect(ids).toEqual(['V0', 'V1', 'V2', 'V3', 'V4'])
  })

  it('DWELL: rapid-fire detections within the window collapse to a single fire', () => {
    let g = fresh()
    // First fires at t=1000.
    let r = shouldFireAutoLiveStable([v('A', 0.9, 1, 'explicit')], null, g, { nowMs: 1000 })
    expect(r.fire).toBe(true)
    g = r.nextStability
    // v0.7.116 — Hold window halved from 1250 → 500 ms. Detections
    // at t=1100, 1200, 1300, 1400 — all within the 500 ms window from
    // t=1000 — are blocked (4 attempts, 0 fires). Previous verse
    // stays on screen for the full dwell.
    let fires = 0
    for (let i = 0; i < 4; i++) {
      r = shouldFireAutoLiveStable(
        [v(`B${i}`, 0.9, 2 + i, 'explicit')],
        'A',
        g,
        { nowMs: 1000 + 100 * (i + 1) },
      )
      if (r.fire) fires++
      g = r.nextStability
    }
    expect(fires).toBe(0)
    // Now jump past the 500 ms window — next detection fires.
    r = shouldFireAutoLiveStable(
      [v('Late', 0.9, 99, 'explicit')],
      'A',
      g,
      { nowMs: 1000 + 600 },
    )
    expect(r.fire).toBe(true)
    if (r.fire) expect(r.verse.id).toBe('Late')
  })

  it('SAME top.id as currentLiveId does NOT refire (allowed dedup per spec)', () => {
    const g: AutoFireGateState = { ...fresh(), lastFireAtMs: 1000 }
    const r = shouldFireAutoLiveStable(
      [v('Already.Live', 0.99, 1, 'explicit')],
      'Already.Live',
      g,
      { nowMs: 99999 },
    )
    expect(r.fire).toBe(false)
  })

  it('explicit and semantic columns track INDEPENDENTLY (counters)', () => {
    let g = fresh()
    const detected = [
      v('Amos.1.3', 0.91, 1, 'explicit'),
      v('John.4.24', 0.92, 2, 'semantic'),
    ]
    // minFrames=2 — both stay at count 1 on first call
    const r = shouldFireAutoLiveStable(detected, null, g, { nowMs: 1000, minFrames: 2 })
    expect(r.fire).toBe(false)
    g = r.nextStability
    expect(g.explicit.count).toBe(1)
    expect(g.semantic.count).toBe(1)
  })

  it('EXPLICIT wins on tiebreak when both columns fire same frame', () => {
    const g = fresh()
    const detected = [
      v('Explicit.Hit', 0.91, 1, 'explicit'),
      v('Semantic.Hit', 0.99, 2, 'semantic'),
    ]
    const r = shouldFireAutoLiveStable(detected, null, g, { nowMs: 1000 })
    expect(r.fire).toBe(true)
    if (r.fire) expect(r.source).toBe('explicit')
  })

  it('v0.7.117 READ-LOCK: lower-confidence detection within 8 s does NOT replace live verse', () => {
    // Pre-117: this test asserted that NewLow (0.62) DID replace
    // OldHigh (0.95) once the 1.25 s dwell elapsed. v0.7.117 reverses
    // that behaviour per operator complaint: "Can you lock down the
    // accurately detected Bible verse that's in live display until
    // the AI detects another accurate one?" During the 8 s sticky
    // window, a new candidate must clear (currentLive.confidence +
    // 0.10) to take over — which 0.62 does not against 0.95.
    let g = fresh()
    let r = shouldFireAutoLiveStable(
      [v('OldHigh', 0.95, 1000, 'explicit')],
      null,
      g,
      { nowMs: 1000 },
    )
    expect(r.fire).toBe(true)
    g = r.nextStability

    // 1.3 s later — past the 500 ms dwell but well inside the 8 s
    // read-lock. NewLow (0.62) is far below OldHigh (0.95) so it
    // must NOT fire.
    r = shouldFireAutoLiveStable(
      [
        v('OldHigh', 0.95, 1000, 'explicit'),
        v('NewLow',  0.62, 2300, 'explicit'),
      ],
      'OldHigh',
      g,
      { nowMs: 2300 },
    )
    expect(r.fire).toBe(false)
  })

  it('v0.7.117 READ-LOCK: clearly-better detection (≥ +0.10) DOES break the lock', () => {
    let g = fresh()
    // First fire: OldMid (0.65) — auto-derived semantic match.
    let r = shouldFireAutoLiveStable(
      [v('OldMid', 0.65, 1000, 'semantic')],
      null,
      g,
      { nowMs: 1000 },
    )
    expect(r.fire).toBe(true)
    g = r.nextStability
    // 2 s later (still in 8 s sticky window): a much better explicit
    // hit (0.95) for a different reference arrives. Should override.
    r = shouldFireAutoLiveStable(
      [
        v('OldMid',     0.65, 1000, 'semantic'),
        v('Explicit95', 0.95, 3000, 'explicit'),
      ],
      'OldMid',
      g,
      { nowMs: 3000 },
    )
    expect(r.fire).toBe(true)
    if (r.fire) expect(r.verse.id).toBe('Explicit95')
  })

  it('v0.7.117 READ-LOCK: AFTER the 8 s window, normal swap behaviour resumes', () => {
    let g = fresh()
    let r = shouldFireAutoLiveStable(
      [v('OldHigh', 0.95, 1000, 'explicit')],
      null,
      g,
      { nowMs: 1000 },
    )
    expect(r.fire).toBe(true)
    g = r.nextStability
    // 9 s later — past both the 500 ms dwell and the 8 s sticky.
    // A lower-confidence newer detection now CAN take over (the
    // operator has moved on; the read-lock is over).
    r = shouldFireAutoLiveStable(
      [
        v('OldHigh', 0.95, 1000, 'explicit'),
        v('NewLow',  0.62, 10000, 'explicit'),
      ],
      'OldHigh',
      g,
      { nowMs: 10000 },
    )
    expect(r.fire).toBe(true)
    if (r.fire) expect(r.verse.id).toBe('NewLow')
  })

  it('v0.7.150 EXPLICIT-OWNS-LIVE FREEZE: a high-conf semantic verbatim quote is FROZEN OUT by an explicit lookup lock (operator spec — explicit always wins, semantic frozen until live cleared)', () => {
    // SUPERSEDES v0.7.128. Operator's v0.7.150 directive flips the
    // v0.7.128 behaviour: once an EXPLICIT verse owns live, the
    // SEMANTIC pipeline is FROZEN from auto-fire — even a verbatim
    // hand-curated preacher-phrase EXACT (semantic @ 0.95) cannot
    // hijack the projector. Operator's literal words: "always display
    // Bible Reference Quoted column detected over Auto Verse Match …
    // be freezed without interferening with the Reference Quoted
    // column detection". The freeze releases when STOP LIVE / CLEAR /
    // BLACK fires (currentLiveId becomes null) — covered by the
    // freeze-release test below.
    let g = fresh()
    let r = shouldFireAutoLiveStable(
      [{ ...v('Deut.2.1', 1.0, 1000, 'explicit'), reference: 'Deuteronomy 2:1' }],
      null,
      g,
      { nowMs: 1000 },
    )
    expect(r.fire).toBe(true)
    g = r.nextStability
    expect(g.explicitOwnsLive).toBe(true)
    // 2 s later: preacher quotes Psalm 121:2 verbatim (semantic 0.95).
    // SHOULD NOT fire — explicit owns live, semantic is frozen.
    r = shouldFireAutoLiveStable(
      [
        { ...v('Deut.2.1', 1.0, 1000, 'explicit'),  reference: 'Deuteronomy 2:1' },
        { ...v('Psa.121.2', 0.95, 3000, 'semantic'), reference: 'Psalm 121:2' },
      ],
      'Deut.2.1',
      g,
      { nowMs: 3000 },
    )
    expect(r.fire).toBe(false)
  })

  it('v0.7.150 EXPLICIT-OWNS-LIVE FREEZE RELEASE: STOP LIVE / CLEAR (currentLiveId=null) clears the latch and the next semantic detection auto-fires again', () => {
    // Companion to the freeze test above. The freeze must be a
    // soft-lock that cleanly releases the moment the operator hits
    // STOP LIVE / CLEAR / BLACK (which flips currentLiveId to null).
    let g = fresh()
    // Frame 1: explicit goes live → latches explicitOwnsLive=true.
    let r = shouldFireAutoLiveStable(
      [{ ...v('Deut.2.1', 1.0, 1000, 'explicit'), reference: 'Deuteronomy 2:1' }],
      null,
      g,
      { nowMs: 1000 },
    )
    expect(r.fire).toBe(true)
    g = r.nextStability
    expect(g.explicitOwnsLive).toBe(true)
    // Frame 2: operator presses STOP LIVE → currentLiveId becomes
    // null. Next call MUST reset the latch.
    r = shouldFireAutoLiveStable(
      [{ ...v('Psa.121.2', 0.95, 3000, 'semantic'), reference: 'Psalm 121:2' }],
      null,
      g,
      { nowMs: 10000 },
    )
    expect(r.fire).toBe(true)
    if (r.fire) {
      expect(r.verse.id).toBe('Psa.121.2')
      expect(r.source).toBe('semantic')
    }
    expect(r.nextStability.explicitOwnsLive).toBe(false)
  })

  it('v0.7.128 HIGH-CONF VS LOW-CONF SAME-PIPELINE: a low-conf same-pipeline candidate STILL cannot hijack a high-conf live verse (v0.7.120 protection intact)', () => {
    // v0.7.131 narrows this case: only SAME-pipeline near-misses are
    // treated as noise. CROSS-pipeline disagreement is corroboration
    // and gets its own escape (see v0.7.131 tests below). Original
    // v0.7.120 scenario was a verbatim semantic phrase being
    // hijacked by a same-column near-miss — that protection stays.
    let g = fresh()
    let r = shouldFireAutoLiveStable(
      [{ ...v('Exo.22.18', 0.95, 1000, 'semantic'), reference: 'Exodus 22:18' }],
      null,
      g,
      { nowMs: 1000 },
    )
    expect(r.fire).toBe(true)
    g = r.nextStability
    r = shouldFireAutoLiveStable(
      [
        { ...v('Exo.22.18',  0.95, 1000, 'semantic'), reference: 'Exodus 22:18' },
        // Same SEMANTIC pipeline near-miss — must NOT break the lock.
        { ...v('Some.Other', 0.70, 3000, 'semantic'), reference: 'Some Other 1:1' },
      ],
      'Exo.22.18',
      g,
      { nowMs: 3000 },
    )
    expect(r.fire).toBe(false)
  })

  it('v0.7.131 CROSS-PIPELINE CORROBORATION: a moderate-conf EXPLICIT detection DOES break a high-conf SEMANTIC false-positive lock', () => {
    // Reproduces the operator screenshot https://imgur.com/a/8MmmIPI:
    // preacher said "Paul and Silas were locked up in prison" → COL 1
    // "Auto Verse Match" (semantic pipeline) had latched onto a
    // phrase-only false-positive at 1.00 confidence and gone live.
    // COL 2 "Bible Reference Quoted" (explicit pipeline) correctly
    // detected Acts 16 at 0.70. Pre-v0.7.131 the v0.7.128 escape
    // required BOTH detections ≥0.85, so the 0.70 explicit was
    // permanently locked out by the spurious 1.00 semantic.
    // v0.7.131: cross-pipeline disagreement at ≥0.70 breaks the lock.
    let g = fresh()
    let r = shouldFireAutoLiveStable(
      [
        {
          ...v('Phrase.Match', 1.0, 1000, 'semantic'),
          reference: 'Some Wrong Verse 1:1',
        },
      ],
      null,
      g,
      { nowMs: 1000 },
    )
    expect(r.fire).toBe(true)
    g = r.nextStability
    // 2 s later (well inside the 8 s sticky window): explicit
    // pipeline detects Acts 16 at exactly 0.70 — operator's exact
    // reported case. Cross-pipeline + ≥0.70 → lock yields.
    r = shouldFireAutoLiveStable(
      [
        {
          ...v('Phrase.Match', 1.0, 1000, 'semantic'),
          reference: 'Some Wrong Verse 1:1',
        },
        {
          ...v('Acts.16.25', 0.7, 3000, 'explicit'),
          reference: 'Acts 16:25',
        },
      ],
      'Phrase.Match',
      g,
      { nowMs: 3000 },
    )
    expect(r.fire).toBe(true)
    if (r.fire) {
      expect(r.verse.id).toBe('Acts.16.25')
      expect(r.source).toBe('explicit')
    }
  })

  it('v0.7.133 CROSS-PIPELINE: explicit candidate BELOW 0.58 floor still cannot hijack a high-conf semantic lock', () => {
    // v0.7.133 lowered the cross-pipeline EXPLICIT floor 0.70 → 0.58
    // (operator spec "any Bible Reference detected as low as 58%").
    // The escape still has a floor — sub-0.58 explicit hits are
    // below the auto-live column floor itself and remain blocked.
    let g = fresh()
    let r = shouldFireAutoLiveStable(
      [{ ...v('Live.High', 0.95, 1000, 'semantic'), reference: 'John 3:16' }],
      null,
      g,
      { nowMs: 1000 },
    )
    expect(r.fire).toBe(true)
    g = r.nextStability
    r = shouldFireAutoLiveStable(
      [
        { ...v('Live.High', 0.95, 1000, 'semantic'), reference: 'John 3:16' },
        // Cross-pipeline explicit at 0.55 — below the 0.58 floor.
        { ...v('Weak.Hit',  0.55, 3000, 'explicit'), reference: 'Some Other 1:1' },
      ],
      'Live.High',
      g,
      { nowMs: 3000 },
    )
    expect(r.fire).toBe(false)
  })

  it('v0.7.133 CROSS-PIPELINE: explicit candidate at the 0.58 boundary breaks a 1.00 semantic lock (operator screenshot reproduction)', () => {
    // Operator screenshot https://imgur.com/a/8MmmIPI — the same
    // case v0.7.131 tried to fix but at exactly 0.70 the boundary
    // was still failing in production. v0.7.133 drops the floor to
    // 0.58 so a 0.58/0.60/0.65/0.70 explicit hit ALL break the lock.
    for (const candConf of [0.58, 0.6, 0.65, 0.7]) {
      let g = fresh()
      let r = shouldFireAutoLiveStable(
        [{ ...v('Phrase.False', 1.0, 1000, 'semantic'), reference: 'Wrong 1:1' }],
        null,
        g,
        { nowMs: 1000 },
      )
      expect(r.fire).toBe(true)
      g = r.nextStability
      r = shouldFireAutoLiveStable(
        [
          { ...v('Phrase.False', 1.0,        1000, 'semantic'), reference: 'Wrong 1:1' },
          { ...v('Acts.16.25',   candConf,  3000, 'explicit'), reference: 'Acts 16:25' },
        ],
        'Phrase.False',
        g,
        { nowMs: 3000 },
      )
      expect(r.fire, `cand=${candConf}`).toBe(true)
      if (r.fire) {
        expect(r.verse.id).toBe('Acts.16.25')
        expect(r.source).toBe('explicit')
      }
    }
  })

  it('v0.7.150 SUPERSEDES v0.7.135: a 0.58 SEMANTIC paraphrase is FROZEN OUT by a 1.00 EXPLICIT live verse (explicit-owns-live latch)', () => {
    // REVERSES v0.7.135. The v0.7.135 symmetric floor allowed a 0.58
    // semantic to break a 1.00 explicit lock — operator subsequently
    // changed their mind and asked for the OPPOSITE protection: once
    // an explicit verse takes live, the semantic pipeline is frozen
    // entirely. The 0.58 cross-pipeline floor is preserved as a
    // boundary exit (see CROSS_PIPELINE_SEMANTIC_VS_EXPLICIT_MIN
    // docstring) but the explicit-owns-live latch makes it
    // unreachable while a live verse is showing — by design.
    let g = fresh()
    let r = shouldFireAutoLiveStable(
      [{ ...v('Loaded.Chap', 1.0, 1000, 'explicit'), reference: 'Deut 2:1' }],
      null,
      g,
      { nowMs: 1000 },
    )
    expect(r.fire).toBe(true)
    g = r.nextStability
    expect(g.explicitOwnsLive).toBe(true)
    r = shouldFireAutoLiveStable(
      [
        { ...v('Loaded.Chap',     1.0,  1000, 'explicit'), reference: 'Deut 2:1' },
        // Cross-pipeline semantic at 0.58 — would have fired under
        // v0.7.135. Frozen out under v0.7.150.
        { ...v('Para.Quote',      0.58, 3000, 'semantic'), reference: 'Acts 16:25' },
      ],
      'Loaded.Chap',
      g,
      { nowMs: 3000 },
    )
    expect(r.fire).toBe(false)
  })

  it('v0.7.150 EXPLICIT PREEMPTION: a 0.60 EXPLICIT candidate IMMEDIATELY overrides a 1.00 SEMANTIC live verse (no cross-pipeline floor — explicit always wins)', () => {
    // Operator's primary v0.7.150 ask: "anytime Auto Verse Match is
    // 100% detected, it doesn't allow any verse … in the Bible
    // Reference Quoted to auto go live". Under v0.7.150 the
    // cross-pipeline read-lock is fully open in the EXPLICIT-cand
    // vs SEMANTIC-live direction — only the EXPLICIT_AUTO_LIVE_MIN
    // (0.58) column floor gates the override.
    let g = fresh()
    let r = shouldFireAutoLiveStable(
      [{ ...v('Sem.Live', 1.0, 1000, 'semantic'), reference: 'Some Para 1:1' }],
      null,
      g,
      { nowMs: 1000 },
    )
    expect(r.fire).toBe(true)
    g = r.nextStability
    expect(g.explicitOwnsLive).toBe(false)
    r = shouldFireAutoLiveStable(
      [
        { ...v('Sem.Live',  1.0,  1000, 'semantic'), reference: 'Some Para 1:1' },
        { ...v('Exp.Quote', 0.60, 3000, 'explicit'), reference: 'John 3:16' },
      ],
      'Sem.Live',
      g,
      { nowMs: 3000 },
    )
    expect(r.fire).toBe(true)
    if (r.fire) {
      expect(r.verse.id).toBe('Exp.Quote')
      expect(r.source).toBe('explicit')
    }
    expect(r.nextStability.explicitOwnsLive).toBe(true)
  })

  it('v0.7.135 SYMMETRIC boundary: a 0.57 SEMANTIC against a 1.00 EXPLICIT lock is STILL blocked (below the 0.58 floor)', () => {
    // 0.57 is below the column auto-live floor anyway (semantic
    // floor is 0.50, but the cross-pipeline corroboration floor is
    // 0.58 — below it, the lock holds. Sanity-check the boundary so
    // a future tweak can't accidentally let sub-floor noise through.
    let g = fresh()
    let r = shouldFireAutoLiveStable(
      [{ ...v('Loaded.Chap', 1.0, 1000, 'explicit'), reference: 'Deut 2:1' }],
      null,
      g,
      { nowMs: 1000 },
    )
    expect(r.fire).toBe(true)
    g = r.nextStability
    r = shouldFireAutoLiveStable(
      [
        { ...v('Loaded.Chap', 1.0,  1000, 'explicit'), reference: 'Deut 2:1' },
        { ...v('Soft.Sub',    0.57, 3000, 'semantic'), reference: 'Other 1:1' },
      ],
      'Loaded.Chap',
      g,
      { nowMs: 3000 },
    )
    expect(r.fire).toBe(false)
  })

  it('v0.7.131 CROSS-PIPELINE CORROBORATION: same-reference cross-pipeline candidate is still blocked (no flicker)', () => {
    // The same-reference no-flicker guard runs FIRST, before the
    // cross-pipeline escape. A 0.95 explicit hit on the same
    // reference as a 0.95 semantic live verse must NOT cause a
    // visible reswap.
    let g = fresh()
    let r = shouldFireAutoLiveStable(
      [{ ...v('Sem.Live', 0.95, 1000, 'semantic'), reference: 'John 3:16' }],
      null,
      g,
      { nowMs: 1000 },
    )
    expect(r.fire).toBe(true)
    g = r.nextStability
    r = shouldFireAutoLiveStable(
      [
        { ...v('Sem.Live', 0.95, 1000, 'semantic'), reference: 'John 3:16' },
        { ...v('Exp.Echo', 0.95, 3000, 'explicit'), reference: 'John 3:16' },
      ],
      'Sem.Live',
      g,
      { nowMs: 3000 },
    )
    expect(r.fire).toBe(false)
  })

  it('v0.7.117 READ-LOCK: same-reference re-fire is always blocked (no flicker)', () => {
    let g = fresh()
    let r = shouldFireAutoLiveStable(
      [v('Same.Ref', 0.95, 1000, 'explicit')],
      null,
      g,
      { nowMs: 1000 },
    )
    expect(r.fire).toBe(true)
    g = r.nextStability
    // Same reference, NEW id, much higher confidence — read-lock
    // still blocks it because reference is identical (no real
    // change to project).
    r = shouldFireAutoLiveStable(
      [
        { ...v('Same.Ref',  0.95, 1000, 'explicit'), reference: 'John 3:16' },
        { ...v('Same.Ref2', 0.99, 3000, 'explicit'), reference: 'John 3:16' },
      ],
      'Same.Ref',
      g,
      { nowMs: 3000 },
    )
    // The candidate is genuinely a different id with higher conf,
    // BUT same reference → still suppressed by the read-lock.
    expect(r.fire).toBe(false)
  })

  it('semantic-only candidate fires on the semantic side', () => {
    const g = fresh()
    const r = shouldFireAutoLiveStable(
      [v('John.4.24', 0.92, 1, 'semantic')],
      null,
      g,
      { nowMs: 1000 },
    )
    expect(r.fire).toBe(true)
    if (r.fire) {
      expect(r.source).toBe('semantic')
      expect(r.verse.id).toBe('John.4.24')
    }
  })

  it('suggestion-tagged candidates NEVER fire (column 3 is manual-only)', () => {
    let g = fresh()
    let r
    for (let i = 0; i < 5; i++) {
      r = shouldFireAutoLiveStable(
        [v('Sugg.1.1', 0.95, 1, 'suggestion')],
        null,
        g,
        { nowMs: 1000 * (i + 1) },
      )
      g = r.nextStability
    }
    expect(r!.fire).toBe(false)
  })

  it('honours opts.holdMs override (caller can widen or zero the dwell window)', () => {
    let g = fresh()
    // First fire at t=1000
    let r = shouldFireAutoLiveStable(
      [v('First', 0.9, 1, 'explicit')],
      null,
      g,
      { nowMs: 1000, holdMs: 3500 },
    )
    expect(r.fire).toBe(true)
    g = r.nextStability

    // Second fire at t=2000 — within 3.5 s window, BLOCKED
    r = shouldFireAutoLiveStable(
      [v('Second', 0.95, 2, 'explicit')],
      'First',
      g,
      { nowMs: 2000, holdMs: 3500 },
    )
    expect(r.fire).toBe(false)

    // After window — fires
    r = shouldFireAutoLiveStable(
      [v('Second', 0.95, 2, 'explicit')],
      'First',
      g,
      { nowMs: 4500, holdMs: 3500 },
    )
    expect(r.fire).toBe(true)
  })
})
