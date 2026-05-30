import { describe, it, expect } from 'vitest'
import { decideReferenceFire } from './reference-fire-policy'

const TTL = 30_000
const COOLDOWN = 2_500

describe('decideReferenceFire', () => {
  it('fires fresh when the reference has never fired (lastAt = 0)', () => {
    expect(decideReferenceFire(0, 1_000_000)).toBe('new')
  })

  it('treats a negative/unset lastAt as fresh', () => {
    expect(decideReferenceFire(-5, 1_000_000)).toBe('new')
  })

  it('SUPPRESSES interim self-spam: same ref re-detected 150ms later', () => {
    const t0 = 1_000_000
    // First interim fires fresh.
    expect(decideReferenceFire(0, t0)).toBe('new')
    // Every subsequent interim within the same utterance is suppressed.
    expect(decideReferenceFire(t0, t0 + 150)).toBe('suppress')
    expect(decideReferenceFire(t0, t0 + 300)).toBe('suppress')
    expect(decideReferenceFire(t0, t0 + 1_500)).toBe('suppress')
  })

  it('SUPPRESSES the final that echoes the interim ~1s later (no double-fire)', () => {
    const interimFiredAt = 1_000_000
    // Final for the SAME utterance lands ~1.2s after the interim fired.
    expect(decideReferenceFire(interimFiredAt, interimFiredAt + 1_200)).toBe('suppress')
  })

  it('PROMOTES a deliberate re-mention spoken after the cooldown but within the window', () => {
    const firstFire = 1_000_000
    // Speaker says the address again 5s later — past the 2.5s cooldown,
    // still inside the 30s dedupe window → genuine re-mention.
    expect(decideReferenceFire(firstFire, firstFire + 5_000)).toBe('rementtion')
  })

  it('boundary: exactly at cooldown promotes; one ms before suppresses', () => {
    const t0 = 1_000_000
    expect(decideReferenceFire(t0, t0 + COOLDOWN - 1)).toBe('suppress')
    expect(decideReferenceFire(t0, t0 + COOLDOWN)).toBe('rementtion')
  })

  it('boundary: exactly at the dedupe TTL is a fresh mention again', () => {
    const t0 = 1_000_000
    expect(decideReferenceFire(t0, t0 + TTL - 1)).toBe('rementtion')
    expect(decideReferenceFire(t0, t0 + TTL)).toBe('new')
  })

  it('honours custom cooldown / ttl options', () => {
    const t0 = 1_000_000
    expect(
      decideReferenceFire(t0, t0 + 500, { rementionCooldownMs: 1_000, dedupeTtlMs: 10_000 }),
    ).toBe('suppress')
    expect(
      decideReferenceFire(t0, t0 + 1_000, { rementionCooldownMs: 1_000, dedupeTtlMs: 10_000 }),
    ).toBe('rementtion')
    expect(
      decideReferenceFire(t0, t0 + 10_000, { rementionCooldownMs: 1_000, dedupeTtlMs: 10_000 }),
    ).toBe('new')
  })

  it('PROOF — interim that failed to resolve text (no stamp) lets the FINAL still fire', () => {
    // Mirrors the provider invariant: the 'new' branch stamps the dedupe
    // map ONLY after a verse text actually resolves + fires. If an interim
    // detects the reference but text resolution misses (transient fetch /
    // unbundled translation), it does NOT stamp — so lastFireAt stays 0.
    // The FINAL of the same utterance (~1.2s later) must therefore still
    // be allowed to attempt its own fresh fire, not be cooldown-suppressed.
    const lastFireAtAfterFailedInterim = 0 // interim did not stamp
    expect(decideReferenceFire(lastFireAtAfterFailedInterim, 1_001_200)).toBe('new')
  })

  it('PROOF — full single-utterance lifecycle never double-promotes', () => {
    // Simulates the v0.7.263 interim + final flow for one utterance of
    // "...John 3:16..." then a real re-mention later. Tracks lastFireAt
    // exactly as the provider does (stamp only on new/rementtion).
    let lastFireAt = 0
    const fires: number[] = []
    const tick = (t: number) => {
      const d = decideReferenceFire(lastFireAt, t)
      if (d === 'new' || d === 'rementtion') {
        lastFireAt = t
        fires.push(t)
      }
      return d
    }
    const base = 1_000_000
    expect(tick(base)).toBe('new') // first interim → fires
    expect(tick(base + 150)).toBe('suppress') // interim spam
    expect(tick(base + 300)).toBe('suppress')
    expect(tick(base + 450)).toBe('suppress')
    expect(tick(base + 1_300)).toBe('suppress') // final echoes interim → no double-fire
    // Exactly ONE fire so far for this utterance.
    expect(fires).toEqual([base])
    // Speaker deliberately re-mentions 6s later.
    expect(tick(base + 6_000)).toBe('rementtion')
    expect(fires).toEqual([base, base + 6_000])
  })
})
