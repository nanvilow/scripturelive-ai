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
  it('explicit floor is 0.60 per spec', () => {
    expect(EXPLICIT_AUTO_LIVE_MIN).toBe(0.6)
  })
  it('semantic / "Bible Reference Quoted" (paraphrase) floor is 0.55 per v0.7.108 spec', () => {
    expect(SEMANTIC_AUTO_LIVE_MIN).toBe(0.55)
  })
  it('AUTO_LIVE_MIN_CONFIDENCE legacy export = lowest per-source floor (0.55)', () => {
    expect(AUTO_LIVE_MIN_CONFIDENCE).toBe(0.55)
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
  it('explicit at 0.60 IS live-eligible (boundary inclusive)', () => {
    expect(pickAutoLiveBySource([v('A', 0.6, 1, 'explicit')], 'explicit')?.id).toBe('A')
  })
  it('explicit at 0.59 is NOT live-eligible', () => {
    expect(pickAutoLiveBySource([v('A', 0.59, 1, 'explicit')], 'explicit')).toBeNull()
  })
  it('semantic at 0.55 IS live-eligible (boundary inclusive — v0.7.108 floor)', () => {
    expect(pickAutoLiveBySource([v('A', 0.55, 1, 'semantic')], 'semantic')?.id).toBe('A')
  })
  it('semantic at 0.54 is NOT live-eligible (strict 55% floor)', () => {
    expect(pickAutoLiveBySource([v('A', 0.54, 1, 'semantic')], 'semantic')).toBeNull()
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
  it('an unsourced detection defaults to the explicit column at 0.60+', () => {
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
  it('54% is NOT live-eligible (v0.7.108 — lowest per-source floor is 0.55)', () => {
    expect(pickAutoLiveMatch([v('Ps.23.1', 0.54)])).toBeNull()
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

  it('includes anything tagged source=suggestion regardless of confidence', () => {
    const detected = [
      v('LowSugg', 0.05, 1000, 'suggestion'),
      v('OtherLow', 0.05, 2000, 'semantic'), // dropped
    ]
    expect(suggestionsFor(detected).map((s) => s.id)).toEqual(['LowSugg'])
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
  it('explicit column includes ≥0.60 from explicit source only, NEWEST first', () => {
    const detected = [
      v('Hi',   0.92, 1, 'explicit'),
      v('Mid',  0.7,  2, 'explicit'),
      v('Edge', 0.6,  3, 'explicit'),     // boundary inclusive
      v('Sub',  0.59, 4, 'explicit'),     // → suggestions
      v('Sem',  0.91, 5, 'semantic'),     // wrong column
    ]
    // Newest detected first → Edge (3), Mid (2), Hi (1).
    expect(liveColumnFor(detected, 'explicit').map((d) => d.id)).toEqual(['Edge', 'Mid', 'Hi'])
  })

  it('semantic column requires ≥0.55 (v0.7.108 — paraphrase-friendly), NEWEST first', () => {
    const detected = [
      v('A', 0.95, 1, 'semantic'),
      v('B', 0.80, 2, 'semantic'),
      v('C', 0.79, 3, 'semantic'),
      v('D', 0.65, 4, 'semantic'),
      v('E', 0.55, 5, 'semantic'), // boundary inclusive
      v('F', 0.54, 6, 'semantic'), // dropped
    ]
    // E,D,C,B,A — newest first, F dropped (below 55%).
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

  it('does NOT fire when the explicit top is below 0.60', () => {
    const r = shouldFireAutoLiveStable([v('Lo', 0.59, 1, 'explicit')], null, fresh(), {
      nowMs: 1000,
    })
    expect(r.fire).toBe(false)
  })

  it('does NOT fire when the semantic top is below 0.55 (v0.7.108)', () => {
    const r = shouldFireAutoLiveStable([v('Lo', 0.54, 1, 'semantic')], null, fresh(), {
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

  it('NEW detection (lower confidence) replaces OLDER live verse AFTER the 1.25 s dwell', () => {
    let g = fresh()
    // First fire: OldHigh (0.95) at t=1000
    let r = shouldFireAutoLiveStable(
      [v('OldHigh', 0.95, 1000, 'explicit')],
      null,
      g,
      { nowMs: 1000 },
    )
    expect(r.fire).toBe(true)
    if (r.fire) expect(r.verse.id).toBe('OldHigh')
    g = r.nextStability

    // Second frame at t=2300 (1300 ms later — past dwell). A NEW
    // lower-confidence (but qualifying) detection arrives. Spec: it
    // MUST become the new live verse, even though OldHigh is still
    // in the list at higher confidence.
    r = shouldFireAutoLiveStable(
      [
        v('OldHigh', 0.95, 1000, 'explicit'),
        v('NewLow',  0.62, 2300, 'explicit'),
      ],
      'OldHigh',
      g,
      { nowMs: 2300 },
    )
    expect(r.fire).toBe(true)
    if (r.fire) expect(r.verse.id).toBe('NewLow')
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
