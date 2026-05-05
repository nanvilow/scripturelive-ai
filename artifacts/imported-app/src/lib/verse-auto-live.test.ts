import { describe, expect, it } from 'vitest'
import {
  ALTERNATIVE_MIN_CONFIDENCE,
  AUTO_LIVE_MIN_CONFIDENCE,
  LIVE_COLUMN_MIN_CONFIDENCE,
  SUGGESTION_MAX_EXCLUSIVE,
  SUGGESTION_MIN_CONFIDENCE,
  STABILITY_MIN_FRAMES,
  alternativesFor,
  evaluateStability,
  initialPerSourceStability,
  initialStabilityState,
  liveColumnFor,
  pickAutoLiveBySource,
  pickAutoLiveMatch,
  shouldFireAutoLive,
  shouldFireAutoLiveStable,
  suggestionsFor,
  type DetectionSource,
  type PerSourceStabilityState,
} from './verse-auto-live'

void LIVE_COLUMN_MIN_CONFIDENCE // silence unused-import lint when this file is restructured

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
// THRESHOLDS — v0.7.104 spec compliance
// ──────────────────────────────────────────────────────────────────
describe('thresholds (v0.7.104 — three-pipeline spec)', () => {
  it('auto-live floor is 0.85 per spec', () => {
    expect(AUTO_LIVE_MIN_CONFIDENCE).toBe(0.85)
  })
  it('suggestions band is 0.10–0.60 (operator clarification)', () => {
    expect(SUGGESTION_MIN_CONFIDENCE).toBe(0.1)
    expect(SUGGESTION_MAX_EXCLUSIVE).toBe(0.6)
  })
  it('stability default is 3 consecutive frames', () => {
    expect(STABILITY_MIN_FRAMES).toBe(3)
  })
  it('legacy ALTERNATIVE_MIN_CONFIDENCE re-exports as suggestion floor', () => {
    expect(ALTERNATIVE_MIN_CONFIDENCE).toBe(SUGGESTION_MIN_CONFIDENCE)
  })
})

// ──────────────────────────────────────────────────────────────────
// pickAutoLiveMatch — generic 0.85 floor
// ──────────────────────────────────────────────────────────────────
describe('pickAutoLiveMatch', () => {
  it('picks the HIGHEST-confidence verse', () => {
    const detected = [v('Prov.4.7', 0.66), v('Prov.1.7', 0.89), v('Eccl.12.13', 0.95)]
    expect(pickAutoLiveMatch(detected)?.id).toBe('Eccl.12.13')
  })

  it('85% IS live-eligible (boundary inclusive)', () => {
    expect(pickAutoLiveMatch([v('Ps.23.1', 0.85)])?.id).toBe('Ps.23.1')
  })

  it('84.9% is NOT live-eligible (falls into suggestions)', () => {
    expect(pickAutoLiveMatch([v('Ps.23.1', 0.849)])).toBeNull()
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

  it('rejects a 0.84 candidate (below the auto-live floor)', () => {
    const detected = [v('A', 0.84, 1, 'explicit')]
    expect(pickAutoLiveBySource(detected, 'explicit')).toBeNull()
  })
})

// ──────────────────────────────────────────────────────────────────
// suggestionsFor — column 3 contents
// ──────────────────────────────────────────────────────────────────
describe('suggestionsFor (column 3 — 10%–60% manual-only band)', () => {
  it('includes 0.10–0.59 detections regardless of source', () => {
    const detected = [
      v('A', 0.92, 1000, 'explicit'),  // → live column
      v('B', 0.65, 2000, 'semantic'),  // → live column (sub-threshold chip)
      v('C', 0.55, 3000, 'explicit'),
      v('D', 0.30, 4000, 'semantic'),
      v('E', 0.10, 5000, 'semantic'),
      v('F', 0.09, 6000, 'semantic'),  // dropped (below floor)
    ]
    const ids = suggestionsFor(detected).map((s) => s.id)
    expect(ids).toEqual(['E', 'D', 'C'])
  })

  it('a 0.60 detection lives in cols 1/2, NOT col 3 (boundary)', () => {
    const detected = [v('Sixty', 0.6, 1000, 'semantic')]
    expect(suggestionsFor(detected)).toEqual([])
  })

  it('a 0.59 detection lives in col 3 (boundary)', () => {
    const detected = [v('FiftyNine', 0.59, 1000, 'semantic')]
    expect(suggestionsFor(detected).map((s) => s.id)).toEqual(['FiftyNine'])
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

describe('liveColumnFor (cols 1 & 2 — sub-threshold chips visible)', () => {
  it('includes detections at or above 0.60 from its source only', () => {
    const detected = [
      v('Hi', 0.92, 1, 'explicit'),
      v('Mid', 0.7, 2, 'explicit'),
      v('Edge', 0.6, 3, 'explicit'),    // boundary inclusive
      v('Sub', 0.59, 4, 'explicit'),    // → suggestions
      v('Sem', 0.91, 5, 'semantic'),    // wrong column
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
// evaluateStability — pure 3-frame gate
// ──────────────────────────────────────────────────────────────────
describe('evaluateStability', () => {
  it('clears state when candidate is null', () => {
    const r = evaluateStability({ topId: 'X', count: 2 }, null)
    expect(r).toEqual({ next: { topId: null, count: 0 }, fire: false, verse: null })
  })

  it('counts to 3 then fires (default minFrames=3)', () => {
    let s = initialStabilityState
    const cand = v('A', 0.9, 1, 'explicit')
    let r = evaluateStability(s, cand); s = r.next
    expect([r.next.count, r.fire]).toEqual([1, false])
    r = evaluateStability(s, cand); s = r.next
    expect([r.next.count, r.fire]).toEqual([2, false])
    r = evaluateStability(s, cand); s = r.next
    expect([r.next.count, r.fire]).toEqual([3, true])
  })

  it('resets count to 1 when the top.id changes', () => {
    let s = initialStabilityState
    s = evaluateStability(s, v('A', 0.9, 1, 'explicit')).next
    s = evaluateStability(s, v('A', 0.9, 1, 'explicit')).next
    expect(s.count).toBe(2)
    const r = evaluateStability(s, v('B', 0.9, 1, 'explicit'))
    expect(r.next).toEqual({ topId: 'B', count: 1 })
    expect(r.fire).toBe(false)
  })

  it('honours custom minFrames=1 (immediate fire)', () => {
    const r = evaluateStability(initialStabilityState, v('A', 0.9, 1, 'explicit'), { minFrames: 1 })
    expect(r.fire).toBe(true)
  })
})

// ──────────────────────────────────────────────────────────────────
// shouldFireAutoLive — source-aware sticky decision
// ──────────────────────────────────────────────────────────────────
describe('shouldFireAutoLive (legacy compat — fires immediately, no stability)', () => {
  it('fires on the first ≥0.85 match when nothing is live', () => {
    const r = shouldFireAutoLive([v('John.4.24', 0.92, 1, 'semantic')], null)
    expect(r.fire).toBe(true)
    if (r.fire) expect(r.verse.id).toBe('John.4.24')
  })

  it('does NOT fire when the top match is below 0.85', () => {
    const r = shouldFireAutoLive([v('Job.28.28', 0.84, 1, 'explicit')], null)
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

describe('shouldFireAutoLiveStable (v0.7.104 source-aware)', () => {
  it('does NOT fire on first frame, fires on third', () => {
    let stab: PerSourceStabilityState = initialPerSourceStability
    const detected = [v('Amos.1.3', 0.91, 1, 'explicit')]
    let r = shouldFireAutoLiveStable(detected, null, stab)
    expect(r.fire).toBe(false)
    stab = r.nextStability
    r = shouldFireAutoLiveStable(detected, null, stab)
    expect(r.fire).toBe(false)
    stab = r.nextStability
    r = shouldFireAutoLiveStable(detected, null, stab)
    expect(r.fire).toBe(true)
    if (r.fire) {
      expect(r.verse.id).toBe('Amos.1.3')
      expect(r.source).toBe('explicit')
    }
  })

  it('does NOT fire when below 0.85 even after many frames', () => {
    let stab: PerSourceStabilityState = initialPerSourceStability
    const detected = [v('Lo', 0.84, 1, 'explicit')]
    let r
    for (let i = 0; i < 10; i++) {
      r = shouldFireAutoLiveStable(detected, null, stab)
      stab = r.nextStability
    }
    expect(r!.fire).toBe(false)
  })

  it('STICKY: gate frozen while currentLiveId is set', () => {
    const stab = initialPerSourceStability
    const detected = [v('A', 0.99, 1, 'explicit')]
    const r = shouldFireAutoLiveStable(detected, 'X', stab)
    expect(r.fire).toBe(false)
    expect(r.nextStability).toBe(stab) // returned unchanged
  })

  it('explicit and semantic columns have INDEPENDENT stability counters', () => {
    let stab: PerSourceStabilityState = initialPerSourceStability
    let detected = [v('Amos.1.3', 0.91, 1, 'explicit')]
    let r = shouldFireAutoLiveStable(detected, null, stab)
    stab = r.nextStability
    expect(stab.explicit.count).toBe(1)
    expect(stab.semantic.count).toBe(0)

    detected = [
      v('Amos.1.3', 0.91, 1, 'explicit'),
      v('John.4.24', 0.92, 2, 'semantic'),
    ]
    r = shouldFireAutoLiveStable(detected, null, stab)
    stab = r.nextStability
    expect(stab.explicit.count).toBe(2)
    expect(stab.semantic.count).toBe(1)

    r = shouldFireAutoLiveStable(detected, null, stab)
    expect(r.fire).toBe(true)
    if (r.fire) expect(r.source).toBe('explicit')
  })

  it('semantic-only stable candidate fires on the semantic side', () => {
    let stab: PerSourceStabilityState = initialPerSourceStability
    const detected = [v('John.4.24', 0.92, 1, 'semantic')]
    let r
    for (let i = 0; i < 3; i++) {
      r = shouldFireAutoLiveStable(detected, null, stab)
      stab = r.nextStability
    }
    expect(r!.fire).toBe(true)
    if (r!.fire) {
      expect(r!.source).toBe('semantic')
      expect(r!.verse.id).toBe('John.4.24')
    }
  })

  it('suggestion-tagged candidates NEVER fire (column 3 is manual-only)', () => {
    let stab: PerSourceStabilityState = initialPerSourceStability
    const detected = [v('Sugg.1.1', 0.95, 1, 'suggestion')]
    let r
    for (let i = 0; i < 5; i++) {
      r = shouldFireAutoLiveStable(detected, null, stab)
      stab = r.nextStability
    }
    expect(r!.fire).toBe(false)
  })

  it('when top.id changes mid-stability the count resets', () => {
    let stab: PerSourceStabilityState = initialPerSourceStability
    let r = shouldFireAutoLiveStable([v('A', 0.91, 1, 'explicit')], null, stab)
    stab = r.nextStability
    r = shouldFireAutoLiveStable([v('A', 0.91, 1, 'explicit')], null, stab)
    stab = r.nextStability
    expect(stab.explicit.count).toBe(2)

    r = shouldFireAutoLiveStable(
      [v('A', 0.91, 1, 'explicit'), v('B', 0.99, 2, 'explicit')],
      null,
      stab,
    )
    expect(r.fire).toBe(false)
    expect(r.nextStability.explicit).toEqual({ topId: 'B', count: 1 })
  })

  it('honours opts.minFrames=1 (immediate fire)', () => {
    const stab = initialPerSourceStability
    const detected = [v('Quick', 0.91, 1, 'explicit')]
    const r = shouldFireAutoLiveStable(detected, null, stab, { minFrames: 1 })
    expect(r.fire).toBe(true)
  })
})
