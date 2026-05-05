import { describe, expect, it } from 'vitest'
import {
  ALTERNATIVE_MIN_CONFIDENCE,
  AUTO_LIVE_MIN_CONFIDENCE,
  LIVE_COLUMN_MIN_CONFIDENCE,
  LIVE_HOLD_MS,
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
// THRESHOLDS — v0.7.106 spec compliance (jh9YcK2h)
// ──────────────────────────────────────────────────────────────────
describe('thresholds (v0.7.106 — jh9YcK2h spec)', () => {
  it('auto-live floor is 0.65 per spec ("65% – 100%")', () => {
    expect(AUTO_LIVE_MIN_CONFIDENCE).toBe(0.65)
  })
  it('suggestions band is 0.10–0.65 (failsafe rule)', () => {
    expect(SUGGESTION_MIN_CONFIDENCE).toBe(0.1)
    expect(SUGGESTION_MAX_EXCLUSIVE).toBe(0.65)
  })
  it('live column floor matches the suggestion ceiling (no dead-band)', () => {
    expect(LIVE_COLUMN_MIN_CONFIDENCE).toBe(SUGGESTION_MAX_EXCLUSIVE)
    expect(LIVE_COLUMN_MIN_CONFIDENCE).toBe(AUTO_LIVE_MIN_CONFIDENCE)
  })
  it('stability gate is 1 frame (real-time, no wait)', () => {
    expect(STABILITY_MIN_FRAMES).toBe(1)
  })
  it('hold window is 3.5 s (mid of spec\'s "3-4 seconds")', () => {
    expect(LIVE_HOLD_MS).toBe(3500)
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
// pickAutoLiveMatch — generic 0.65 floor
// ──────────────────────────────────────────────────────────────────
describe('pickAutoLiveMatch', () => {
  it('picks the HIGHEST-confidence verse', () => {
    const detected = [v('Prov.4.7', 0.66), v('Prov.1.7', 0.89), v('Eccl.12.13', 0.95)]
    expect(pickAutoLiveMatch(detected)?.id).toBe('Eccl.12.13')
  })

  it('65% IS live-eligible (boundary inclusive)', () => {
    expect(pickAutoLiveMatch([v('Ps.23.1', 0.65)])?.id).toBe('Ps.23.1')
  })

  it('64.9% is NOT live-eligible (failsafe routes to suggestions)', () => {
    expect(pickAutoLiveMatch([v('Ps.23.1', 0.649)])).toBeNull()
  })
})

// ──────────────────────────────────────────────────────────────────
// pickAutoLiveBySource — independence
// ──────────────────────────────────────────────────────────────────
describe('pickAutoLiveBySource (per-pipeline independence)', () => {
  it('explicit pick ignores semantic candidates', () => {
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

  it('an unsourced detection defaults to the explicit column', () => {
    const detected = [v('Untagged.1.1', 0.91, 1000)]
    expect(pickAutoLiveBySource(detected, 'explicit')?.id).toBe('Untagged.1.1')
    expect(pickAutoLiveBySource(detected, 'semantic')).toBeNull()
  })

  it('rejects a 0.64 candidate (below the auto-live floor)', () => {
    const detected = [v('A', 0.64, 1, 'explicit')]
    expect(pickAutoLiveBySource(detected, 'explicit')).toBeNull()
  })
})

// ──────────────────────────────────────────────────────────────────
// suggestionsFor — column 3 contents (10-64.9% band)
// ──────────────────────────────────────────────────────────────────
describe('suggestionsFor (column 3 — 10%–64.9% manual-only band)', () => {
  it('includes 0.10–0.64 detections regardless of source', () => {
    const detected = [
      v('A', 0.92, 1000, 'explicit'),  // → live column
      v('B', 0.65, 2000, 'semantic'),  // → live column (boundary)
      v('C', 0.55, 3000, 'explicit'),
      v('D', 0.30, 4000, 'semantic'),
      v('E', 0.10, 5000, 'semantic'),
      v('F', 0.09, 6000, 'semantic'),  // dropped (below floor)
    ]
    const ids = suggestionsFor(detected).map((s) => s.id)
    expect(ids).toEqual(['E', 'D', 'C'])
  })

  it('a 0.65 detection lives in cols 1/2, NOT col 3 (boundary)', () => {
    const detected = [v('SixtyFive', 0.65, 1000, 'semantic')]
    expect(suggestionsFor(detected)).toEqual([])
  })

  it('a 0.64 detection lives in col 3 (boundary)', () => {
    const detected = [v('SixtyFour', 0.64, 1000, 'semantic')]
    expect(suggestionsFor(detected).map((s) => s.id)).toEqual(['SixtyFour'])
  })

  it('includes anything tagged source=suggestion regardless of confidence', () => {
    const detected = [
      v('LowSugg', 0.05, 1000, 'suggestion'),
      v('OtherLow', 0.05, 2000, 'semantic'), // dropped (below floor, not tagged)
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
      v('D', 0.09), // dropped (below 0.10 floor)
    ]
    expect(alternativesFor(detected, 'A').map((a) => a.id).sort()).toEqual(['B', 'C'])
  })
})

describe('liveColumnFor (cols 1 & 2)', () => {
  it('includes detections at or above 0.65 from its source only', () => {
    const detected = [
      v('Hi', 0.92, 1, 'explicit'),
      v('Mid', 0.7, 2, 'explicit'),
      v('Edge', 0.65, 3, 'explicit'),    // boundary inclusive
      v('Sub', 0.64, 4, 'explicit'),     // → suggestions
      v('Sem', 0.91, 5, 'semantic'),     // wrong column
    ]
    expect(liveColumnFor(detected, 'explicit').map((d) => d.id)).toEqual(['Hi', 'Mid', 'Edge'])
  })

  it('orders by confidence desc, then newest', () => {
    const detected = [
      v('A', 0.7, 1000, 'semantic'),
      v('B', 0.95, 2000, 'semantic'),
      v('C', 0.95, 9000, 'semantic'),
    ]
    expect(liveColumnFor(detected, 'semantic').map((d) => d.id)).toEqual(['C', 'B', 'A'])
  })
})

// ──────────────────────────────────────────────────────────────────
// evaluateStability — pure step function (now defaults to 1 frame)
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
// shouldFireAutoLive — legacy two-arg sticky decision (0.65 floor)
// ──────────────────────────────────────────────────────────────────
describe('shouldFireAutoLive (legacy compat — fires on first ≥0.65)', () => {
  it('fires on the first ≥0.65 match when nothing is live', () => {
    const r = shouldFireAutoLive([v('John.4.24', 0.66, 1, 'semantic')], null)
    expect(r.fire).toBe(true)
    if (r.fire) expect(r.verse.id).toBe('John.4.24')
  })

  it('does NOT fire when the top match is below 0.65', () => {
    const r = shouldFireAutoLive([v('Job.28.28', 0.64, 1, 'explicit')], null)
    expect(r.fire).toBe(false)
  })

  it('STICKY: a later 0.99 match does NOT displace the live verse', () => {
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
// shouldFireAutoLiveStable (v0.7.106 — hold window + real-time gate)
// ──────────────────────────────────────────────────────────────────
describe('shouldFireAutoLiveStable (v0.7.106 — real-time + 3.5s hold)', () => {
  const fresh = (): AutoFireGateState => ({ ...initialAutoFireGate })

  it('fires IMMEDIATELY on first detection ≥0.65 (real-time spec)', () => {
    const r = shouldFireAutoLiveStable(
      [v('Amos.1.3', 0.66, 1, 'explicit')],
      null,
      fresh(),
      { nowMs: 1000 },
    )
    expect(r.fire).toBe(true)
    if (r.fire) {
      expect(r.verse.id).toBe('Amos.1.3')
      expect(r.source).toBe('explicit')
      expect(r.nextStability.lastFireAtMs).toBe(1000)
    }
  })

  it('does NOT fire when the top is below 0.65', () => {
    const r = shouldFireAutoLiveStable([v('Lo', 0.64, 1, 'explicit')], null, fresh(), {
      nowMs: 1000,
    })
    expect(r.fire).toBe(false)
  })

  it('64.9% never fires regardless of how many frames pass', () => {
    let g = fresh()
    let r
    for (let i = 0; i < 10; i++) {
      r = shouldFireAutoLiveStable([v('X', 0.649, 1, 'explicit')], null, g, { nowMs: 1000 + i })
      g = r.nextStability
    }
    expect(r!.fire).toBe(false)
  })

  it('HOLD WINDOW: refuses to fire within 3.5s of a previous fire', () => {
    let g = fresh()
    // Fire at t=1000
    let r = shouldFireAutoLiveStable(
      [v('First', 0.9, 1, 'explicit')],
      null,
      g,
      { nowMs: 1000 },
    )
    expect(r.fire).toBe(true)
    g = r.nextStability
    expect(g.lastFireAtMs).toBe(1000)

    // New top arrives at t=2000 (well within 3.5 s window) — must NOT fire
    r = shouldFireAutoLiveStable(
      [v('Second', 0.95, 2000, 'explicit')],
      'First',
      g,
      { nowMs: 2000 },
    )
    expect(r.fire).toBe(false)
    expect(r.nextStability).toBe(g) // gate returned unchanged

    // At exactly t = 1000 + 3500 = 4500 — boundary, hold has elapsed
    r = shouldFireAutoLiveStable(
      [v('Second', 0.95, 2000, 'explicit')],
      'First',
      g,
      { nowMs: 4500 },
    )
    expect(r.fire).toBe(true)
    if (r.fire) {
      expect(r.verse.id).toBe('Second')
      expect(r.nextStability.lastFireAtMs).toBe(4500)
    }
  })

  it('AFTER HOLD: a different top auto-fires (replaces previous)', () => {
    let g: AutoFireGateState = { ...fresh(), lastFireAtMs: 1000 }
    const r = shouldFireAutoLiveStable(
      [v('NewTop', 0.91, 1, 'explicit')],
      'OldLive',
      g,
      { nowMs: 5000 }, // 4 s later, hold elapsed
    )
    expect(r.fire).toBe(true)
    if (r.fire) {
      expect(r.verse.id).toBe('NewTop')
      expect(r.nextStability.lastFireAtMs).toBe(5000)
    }
  })

  it('SAME top.id as currentLiveId does NOT refire (current verse "stays indefinitely")', () => {
    const g: AutoFireGateState = { ...fresh(), lastFireAtMs: 1000 }
    const r = shouldFireAutoLiveStable(
      [v('Already.Live', 0.99, 1, 'explicit')],
      'Already.Live',
      g,
      { nowMs: 99999 }, // way past hold window
    )
    expect(r.fire).toBe(false)
  })

  it('hold window does NOT block the very FIRST fire (lastFireAtMs=0)', () => {
    const g = fresh() // lastFireAtMs: 0
    const r = shouldFireAutoLiveStable(
      [v('First.Ever', 0.9, 1, 'explicit')],
      null,
      g,
      { nowMs: 100 }, // even at t=100ms, fires because lastFireAtMs=0
    )
    expect(r.fire).toBe(true)
  })

  it('explicit and semantic columns track INDEPENDENTLY (counters)', () => {
    let g = fresh()
    const detected = [
      v('Amos.1.3', 0.91, 1, 'explicit'),
      v('John.4.24', 0.92, 2, 'semantic'),
    ]
    // First call fires explicit (tiebreak winner) — counters both bumped
    const r = shouldFireAutoLiveStable(detected, null, g, { nowMs: 1000, minFrames: 2 })
    expect(r.fire).toBe(false) // minFrames=2, both at count 1
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

  it('honours opts.holdMs override (e.g. 0 = no anti-flicker)', () => {
    let g: AutoFireGateState = { ...fresh(), lastFireAtMs: 1000 }
    // With holdMs=0 the window is always elapsed, so a different
    // top fires immediately.
    const r = shouldFireAutoLiveStable(
      [v('Quick', 0.9, 1, 'explicit')],
      'Old',
      g,
      { nowMs: 1001, holdMs: 0 },
    )
    expect(r.fire).toBe(true)
  })
})
