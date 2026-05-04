import { describe, expect, it } from 'vitest'
import {
  AUTO_LIVE_MIN_CONFIDENCE,
  alternativesFor,
  pickAutoLiveMatch,
  shouldFireAutoLive,
} from './verse-auto-live'

const v = (id: string, confidence: number) => ({ id, confidence, reference: id })

describe('auto-live verse selection (operator clarified rules)', () => {
  it('uses 0.50 (50%) as the auto-live floor — NOT 0.65', () => {
    expect(AUTO_LIVE_MIN_CONFIDENCE).toBe(0.5)
  })

  it('picks the HIGHEST-confidence verse, not the newest', () => {
    const detected = [v('Prov.4.7', 0.56), v('Prov.1.7', 0.69), v('Eccl.12.13', 0.55)]
    expect(pickAutoLiveMatch(detected)?.id).toBe('Prov.1.7')
  })

  it('"God is spirit, and his worshipers..." → John 4:24 GOES LIVE (correct match goes live, NOT alternatives)', () => {
    const detected = [v('John.4.24', 0.92), v('Phil.3.3', 0.41), v('Rom.8.9', 0.38)]
    const live = pickAutoLiveMatch(detected)
    expect(live?.id).toBe('John.4.24')
    const alts = alternativesFor(detected, live?.id ?? null)
    expect(alts.map((a) => a.id)).not.toContain('John.4.24')
    expect(alts.map((a) => a.id)).toEqual(['Phil.3.3', 'Rom.8.9'])
  })

  it('lower-confidence siblings of the SAME phrase stay in Alternative References (do not auto-promote)', () => {
    const detected = [v('Prov.1.7', 0.69), v('Prov.4.7', 0.56), v('Eccl.12.13', 0.51)]
    const live = pickAutoLiveMatch(detected)
    expect(live?.id).toBe('Prov.1.7')
    const alts = alternativesFor(detected, live?.id ?? null)
    expect(alts.map((a) => a.id)).toEqual(['Prov.4.7', 'Eccl.12.13'])
  })

  it('matches BELOW 50% never go live (≥20% would be candidates / Alternative References)', () => {
    const detected = [v('Prov.4.7', 0.45), v('Eccl.12.13', 0.42), v('Job.28.28', 0.22)]
    expect(pickAutoLiveMatch(detected)).toBeNull()
  })

  it('exactly 50% IS live-eligible (boundary inclusive)', () => {
    expect(pickAutoLiveMatch([v('Ps.23.1', 0.5)])?.id).toBe('Ps.23.1')
  })

  it('49.9% is NOT live-eligible (boundary exclusive on the low side)', () => {
    expect(pickAutoLiveMatch([v('Ps.23.1', 0.499)])).toBeNull()
  })

  it('empty detection list → no live pick (lock releases on Clear)', () => {
    expect(pickAutoLiveMatch([])).toBeNull()
  })

  describe('shouldFireAutoLive (the screen-follows-the-speaker behaviour)', () => {
    it('fires when no verse is currently live and a high-confidence match arrives', () => {
      const r = shouldFireAutoLive([v('John.4.24', 0.92)], null)
      expect(r.fire).toBe(true)
      if (r.fire) expect(r.verse.id).toBe('John.4.24')
    })

    it('REPLACES the live verse when the speaker quotes a new scripture (top match changes)', () => {
      const r = shouldFireAutoLive([v('Prov.3.5', 0.88), v('John.4.24', 0.31)], 'John.4.24')
      expect(r.fire).toBe(true)
      if (r.fire) expect(r.verse.id).toBe('Prov.3.5')
    })

    it('does NOT re-fire when the top match is already live (no slide re-flash)', () => {
      const r = shouldFireAutoLive([v('John.4.24', 0.92), v('Phil.3.3', 0.41)], 'John.4.24')
      expect(r.fire).toBe(false)
    })

    it('does NOT fire when the top match is below the 50% threshold', () => {
      const r = shouldFireAutoLive([v('Job.28.28', 0.40)], null)
      expect(r.fire).toBe(false)
    })
  })
})
