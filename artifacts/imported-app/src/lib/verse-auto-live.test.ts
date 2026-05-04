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

describe('auto-live verse selection (operator-clarified rules, v0.7.91)', () => {
  it('uses 0.40 (40%) as the auto-live floor — operator spec "20 to 40%"', () => {
    expect(AUTO_LIVE_MIN_CONFIDENCE).toBe(0.4)
    expect(ALTERNATIVE_MIN_CONFIDENCE).toBe(0.2)
  })

  it('picks the HIGHEST-confidence verse', () => {
    const detected = [v('Prov.4.7', 0.46), v('Prov.1.7', 0.69), v('Eccl.12.13', 0.55)]
    expect(pickAutoLiveMatch(detected)?.id).toBe('Prov.1.7')
  })

  it('40% IS live-eligible (boundary inclusive)', () => {
    expect(pickAutoLiveMatch([v('Ps.23.1', 0.4)])?.id).toBe('Ps.23.1')
  })

  it('39.9% is NOT live-eligible (boundary exclusive — falls into alternatives)', () => {
    expect(pickAutoLiveMatch([v('Ps.23.1', 0.399)])).toBeNull()
  })

  it('matches BELOW 20% never appear in alternatives', () => {
    const detected = [v('Job.28.28', 0.18), v('Prov.4.7', 0.32)]
    const alts = alternativesFor(detected, null)
    expect(alts.map((a) => a.id)).toEqual(['Prov.4.7'])
  })

  it('alternatives bucket is exactly the [0.20, 0.40) band', () => {
    const detected = [
      v('A', 0.95),  // main — excluded from alternatives
      v('B', 0.40),  // main — boundary, excluded from alternatives
      v('C', 0.39),  // alt
      v('D', 0.20),  // alt — boundary inclusive
      v('E', 0.19),  // dropped
    ]
    const alts = alternativesFor(detected, 'A')
    expect(alts.map((a) => a.id).sort()).toEqual(['C', 'D'])
  })

  it('Always displays NEW detections on top of OLD ones (operator spec)', () => {
    const old = v('Old', 0.30, 1000)
    const newer = v('New', 0.30, 5000)
    const newest = v('Newest', 0.30, 9000)
    const alts = alternativesFor([old, newer, newest], null)
    expect(alts.map((a) => a.id)).toEqual(['Newest', 'New', 'Old'])
  })

  it('Newest-first ordering applies even with mixed confidences', () => {
    const old_high = v('OldHigh', 0.38, 1000)
    const new_low = v('NewLow', 0.22, 9000)
    const alts = alternativesFor([old_high, new_low], null)
    // Newest first, regardless of confidence:
    expect(alts.map((a) => a.id)).toEqual(['NewLow', 'OldHigh'])
  })

  describe('shouldFireAutoLive — STICKY: alternatives never auto-promote', () => {
    it('fires on the first ≥40% match when nothing is live', () => {
      const r = shouldFireAutoLive([v('John.4.24', 0.55)], null)
      expect(r.fire).toBe(true)
      if (r.fire) expect(r.verse.id).toBe('John.4.24')
    })

    it('does NOT fire when the top match is below 40% (it goes to alternatives)', () => {
      const r = shouldFireAutoLive([v('Job.28.28', 0.30)], null)
      expect(r.fire).toBe(false)
    })

    it('STICKY: a later 95% match does NOT displace the live verse', () => {
      const detected = [v('John.4.24', 0.55), v('Prov.3.5', 0.95)]
      const r = shouldFireAutoLive(detected, 'John.4.24')
      expect(r.fire).toBe(false)
    })

    it('Lock RELEASES when the operator clears (currentLiveId becomes null)', () => {
      const r = shouldFireAutoLive([v('Prov.3.5', 0.65)], null)
      expect(r.fire).toBe(true)
      if (r.fire) expect(r.verse.id).toBe('Prov.3.5')
    })
  })
})
