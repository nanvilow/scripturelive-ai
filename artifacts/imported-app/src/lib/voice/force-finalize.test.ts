import { describe, it, expect } from 'vitest'
import { shouldForceFinalize } from './force-finalize'

// v0.7.267 — guard the force-finalize cadence: fire once an interim has
// run past the threshold with no final, but never spam Finalize before the
// resulting from_finalize final returns and resets the clock.
const T = 2500
const NOW = 1_000_000

describe('shouldForceFinalize', () => {
  it('does NOT finalize before the threshold elapses since the last final', () => {
    expect(shouldForceFinalize(NOW, NOW - 1000, 0, T)).toBe(false)
  })

  it('does NOT finalize at exactly the threshold (strict greater-than)', () => {
    expect(shouldForceFinalize(NOW, NOW - T, 0, T)).toBe(false)
  })

  it('finalizes once a continuous interim has run past the threshold', () => {
    expect(shouldForceFinalize(NOW, NOW - (T + 1), 0, T)).toBe(true)
  })

  it('is suppressed while a recently-requested Finalize is still in flight', () => {
    // long since the last final, but we asked for a Finalize just 10 ms ago
    expect(shouldForceFinalize(NOW, NOW - (T + 1), NOW - 10, T)).toBe(false)
  })

  it('re-arms after the rate-limit window passes with still no final', () => {
    expect(shouldForceFinalize(NOW, NOW - (T + 1), NOW - (T + 1), T)).toBe(true)
  })

  it('seeded at socket-open time, the first quick interim does not fire', () => {
    // lastFinalAt seeded to ws.onopen; an interim 300 ms later must not fire
    const openedAt = NOW - 300
    expect(shouldForceFinalize(NOW, openedAt, 0, T)).toBe(false)
  })
})
