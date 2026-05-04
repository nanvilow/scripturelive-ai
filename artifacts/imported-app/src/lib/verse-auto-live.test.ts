import { describe, expect, it } from 'vitest'
import {
  AUTO_LIVE_MIN_CONFIDENCE,
  alternativesFor,
  pickAutoLiveMatch,
  shouldFireAutoLive,
} from './verse-auto-live'

const v = (id: string, confidence: number) => ({ id, confidence, reference: id })

describe('auto-live verse selection (operator clarified rules)', () => {
  it('uses 0.50 (50%) as the auto-live floor', () => {
    expect(AUTO_LIVE_MIN_CONFIDENCE).toBe(0.5)
  })

  it('picks the HIGHEST-confidence verse, not the newest', () => {
    const detected = [v('Prov.4.7', 0.56), v('Prov.1.7', 0.69), v('Eccl.12.13', 0.55)]
    expect(pickAutoLiveMatch(detected)?.id).toBe('Prov.1.7')
  })

  it('"God is spirit, and his worshipers..." → John 4:24 IS the main pick (NOT an alternative)', () => {
    const detected = [v('John.4.24', 0.92), v('Phil.3.3', 0.41), v('Rom.8.9', 0.38)]
    const live = pickAutoLiveMatch(detected)
    expect(live?.id).toBe('John.4.24')
    const alts = alternativesFor(detected, live?.id ?? null)
    expect(alts.map((a) => a.id)).not.toContain('John.4.24')
    expect(alts.map((a) => a.id)).toEqual(['Phil.3.3', 'Rom.8.9'])
  })

  it('matches BELOW 50% never go live', () => {
    const detected = [v('Prov.4.7', 0.45), v('Eccl.12.13', 0.42), v('Job.28.28', 0.22)]
    expect(pickAutoLiveMatch(detected)).toBeNull()
  })

  it('exactly 50% IS live-eligible (boundary inclusive)', () => {
    expect(pickAutoLiveMatch([v('Ps.23.1', 0.5)])?.id).toBe('Ps.23.1')
  })

  it('49.9% is NOT live-eligible (boundary exclusive)', () => {
    expect(pickAutoLiveMatch([v('Ps.23.1', 0.499)])).toBeNull()
  })

  it('empty detection list → no live pick', () => {
    expect(pickAutoLiveMatch([])).toBeNull()
  })

  describe('shouldFireAutoLive — STICKY: once live, NOTHING else auto-promotes', () => {
    it('fires on the FIRST high-confidence match when nothing is live yet', () => {
      const r = shouldFireAutoLive([v('John.4.24', 0.92)], null)
      expect(r.fire).toBe(true)
      if (r.fire) expect(r.verse.id).toBe('John.4.24')
    })

    it('does NOT fire when the top match is below the 50% threshold', () => {
      const r = shouldFireAutoLive([v('Job.28.28', 0.40)], null)
      expect(r.fire).toBe(false)
    })

    it('STICKY: a new HIGHER-confidence match arriving later does NOT auto-promote (alternatives never auto-go-live)', () => {
      // John 4:24 is already live. A new detection appears with a
      // 95% match for Prov 3:5. Operator complaint: this used to
      // displace John 4:24. New rule: it stays as an Alternative
      // Reference and ONLY promotes if the operator double-clicks.
      const detected = [v('John.4.24', 0.92), v('Prov.3.5', 0.95)]
      const r = shouldFireAutoLive(detected, 'John.4.24')
      expect(r.fire).toBe(false)
    })

    it('STICKY: lower-confidence siblings of the same phrase do not auto-promote', () => {
      const detected = [v('John.4.24', 0.92), v('Phil.3.3', 0.55)]
      const r = shouldFireAutoLive(detected, 'John.4.24')
      expect(r.fire).toBe(false)
    })

    it('STICKY: even when the previously-live verse leaves the list, no new auto-promote happens', () => {
      // John 4:24 was auto-promoted earlier; the detection has
      // since aged out and a fresh Prov 3:5 detection arrived.
      // Lock holds — the operator must Clear or double-click.
      const r = shouldFireAutoLive([v('Prov.3.5', 0.92)], 'John.4.24')
      expect(r.fire).toBe(false)
    })

    it('Lock RELEASES when the operator clears the detection list (then next high-confidence fires)', () => {
      // Caller flow: when detected.length === 0 the AppShell effect
      // sets lastAutoVerseId.current = null, so the next call has
      // currentLiveId = null and behaves as the first-fire case.
      const r = shouldFireAutoLive([v('Prov.3.5', 0.92)], null)
      expect(r.fire).toBe(true)
      if (r.fire) expect(r.verse.id).toBe('Prov.3.5')
    })

    it('Two competing 50%+ matches: only the top fires once, the other stays in alternatives forever (until Clear)', () => {
      // First call (nothing live) → John 4:24 (higher confidence) fires.
      const first = shouldFireAutoLive(
        [v('John.4.24', 0.78), v('Phil.3.3', 0.66)],
        null,
      )
      expect(first.fire).toBe(true)
      if (first.fire) expect(first.verse.id).toBe('John.4.24')
      // Subsequent calls with John 4:24 already live: Phil 3:3
      // never auto-promotes even though it's 66% (well over 50%).
      const second = shouldFireAutoLive(
        [v('John.4.24', 0.78), v('Phil.3.3', 0.66)],
        'John.4.24',
      )
      expect(second.fire).toBe(false)
    })
  })
})
