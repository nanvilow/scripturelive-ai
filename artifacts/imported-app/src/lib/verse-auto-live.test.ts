import { describe, expect, it } from 'vitest'
import {
  ALTERNATIVE_MIN_CONFIDENCE,
  AUTO_LIVE_MIN_CONFIDENCE,
  alternativesFor,
  pickAutoLiveMatch,
  shouldFireAutoLive,
} from './verse-auto-live'

const v = (id: string, confidence: number, detectedAt?: number) => ({
  id,
  confidence,
  reference: id,
  detectedAt: detectedAt != null ? new Date(detectedAt) : undefined,
})

describe('auto-live verse selection (v0.7.94 — every detection ≥20% appears in alternatives)', () => {
  it('uses 0.55 (55%) as the auto-live floor — v0.7.93 raised from 0.40 after operator-reported false positives', () => {
    expect(AUTO_LIVE_MIN_CONFIDENCE).toBe(0.55)
    expect(ALTERNATIVE_MIN_CONFIDENCE).toBe(0.2)
  })

  it('picks the HIGHEST-confidence verse', () => {
    const detected = [v('Prov.4.7', 0.66), v('Prov.1.7', 0.89), v('Eccl.12.13', 0.75)]
    expect(pickAutoLiveMatch(detected)?.id).toBe('Prov.1.7')
  })

  it('55% IS live-eligible (boundary inclusive)', () => {
    expect(pickAutoLiveMatch([v('Ps.23.1', 0.55)])?.id).toBe('Ps.23.1')
  })

  it('54.9% is NOT live-eligible (boundary exclusive — falls into alternatives)', () => {
    expect(pickAutoLiveMatch([v('Ps.23.1', 0.549)])).toBeNull()
  })

  it('matches BELOW 20% never appear in alternatives', () => {
    const detected = [v('Job.28.28', 0.18), v('Prov.4.7', 0.32)]
    const alts = alternativesFor(detected, null)
    expect(alts.map((a) => a.id)).toEqual(['Prov.4.7'])
  })

  it('v0.7.94: alternatives include EVERY ≥20% detection except the live winner', () => {
    // Reported bug: 9 detected verses, only 1 visible. With the v0.7.93
    // upper bound of 0.55, the high-confidence siblings of the live
    // pick disappeared. They must now show in the right column.
    const detected = [
      v('A', 0.95),  // live winner — excluded from alternatives
      v('B', 0.90),  // alt — was being dropped before v0.7.94
      v('C', 0.72),  // alt — was being dropped before v0.7.94
      v('D', 0.55),  // alt — boundary, was being dropped before v0.7.94
      v('E', 0.54),  // alt — just below the live floor
      v('F', 0.20),  // alt — boundary inclusive
      v('G', 0.19),  // dropped (below 20%)
    ]
    const alts = alternativesFor(detected, 'A')
    expect(alts.map((a) => a.id).sort()).toEqual(['B', 'C', 'D', 'E', 'F'])
  })

  it('v0.7.94: count of (live + alts) equals total detected ≥20% — badge matches list', () => {
    // The Detected Verses card badge shows detectedVerses.length, and
    // the operator must see every counted row. Anything ≥20% must
    // surface in either the live column (1 row max) or the alts column.
    const detected = [
      v('A', 0.95, 9000),
      v('B', 0.88, 8000),
      v('C', 0.66, 7000),
      v('D', 0.42, 6000),
      v('E', 0.25, 5000),
    ]
    const live = pickAutoLiveMatch(detected)
    const alts = alternativesFor(detected, live?.id ?? null)
    expect((live ? 1 : 0) + alts.length).toBe(detected.length)
  })

  it('Always displays NEW detections on top of OLD ones (operator spec)', () => {
    const old = v('Old', 0.30, 1000)
    const newer = v('New', 0.30, 5000)
    const newest = v('Newest', 0.30, 9000)
    const alts = alternativesFor([old, newer, newest], null)
    expect(alts.map((a) => a.id)).toEqual(['Newest', 'New', 'Old'])
  })

  it('Newest-first ordering applies even with mixed confidences', () => {
    const old_high = v('OldHigh', 0.48, 1000)
    const new_low = v('NewLow', 0.22, 9000)
    const alts = alternativesFor([old_high, new_low], null)
    // Newest first, regardless of confidence:
    expect(alts.map((a) => a.id)).toEqual(['NewLow', 'OldHigh'])
  })

  describe('shouldFireAutoLive — STICKY: alternatives never auto-promote', () => {
    it('fires on the first ≥55% match when nothing is live', () => {
      const r = shouldFireAutoLive([v('John.4.24', 0.65)], null)
      expect(r.fire).toBe(true)
      if (r.fire) expect(r.verse.id).toBe('John.4.24')
    })

    it('does NOT fire when the top match is below 55% (it goes to alternatives)', () => {
      const r = shouldFireAutoLive([v('Job.28.28', 0.45)], null)
      expect(r.fire).toBe(false)
    })

    it('STICKY: a later 95% match does NOT displace the live verse', () => {
      const detected = [v('John.4.24', 0.65), v('Prov.3.5', 0.95)]
      const r = shouldFireAutoLive(detected, 'John.4.24')
      expect(r.fire).toBe(false)
    })

    it('Lock RELEASES when the operator clears (currentLiveId becomes null)', () => {
      const r = shouldFireAutoLive([v('Prov.3.5', 0.75)], null)
      expect(r.fire).toBe(true)
      if (r.fire) expect(r.verse.id).toBe('Prov.3.5')
    })
  })
})
