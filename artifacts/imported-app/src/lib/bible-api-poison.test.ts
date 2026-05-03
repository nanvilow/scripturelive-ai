import { describe, it, expect } from 'vitest'
import { isPoisonedVerseText } from './bible-api'

// Regression suite for v0.7.59 — "unable to fetch from API" leaked to
// the live projector during a service. The poison-text guard must
// catch every shape of the legacy placeholder so it can never reach
// the renderer again.
describe('isPoisonedVerseText', () => {
  it('catches the exact legacy placeholder string', () => {
    const poison = 'Verse text for John 3:16 (KJV) — unable to fetch from API.'
    expect(isPoisonedVerseText(poison)).toBe(true)
  })

  it('catches placeholders for any reference / translation', () => {
    expect(isPoisonedVerseText('Verse text for Psalms 23:1-6 (NIV) — unable to fetch from API.')).toBe(true)
    expect(isPoisonedVerseText('Verse text for Romans 8:28 (ESV) — unable to fetch from API.')).toBe(true)
    expect(isPoisonedVerseText('Verse text for 1 Corinthians 13:4-7 (NLT) — unable to fetch from API.')).toBe(true)
  })

  it('catches the substring even if wrapped (defense in depth)', () => {
    // Old code or a transformer might prefix/suffix; the substring
    // check still fires.
    expect(isPoisonedVerseText('[cached] Verse text for John 3:16 (KJV) — unable to fetch from API. ')).toBe(true)
    expect(isPoisonedVerseText('Sorry, unable to fetch from API right now.')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isPoisonedVerseText('UNABLE TO FETCH FROM API')).toBe(true)
    expect(isPoisonedVerseText('Unable To Fetch From Api')).toBe(true)
  })

  it('does NOT flag real verse text — including the word "API" or "fetch"', () => {
    expect(isPoisonedVerseText('In the beginning God created the heaven and the earth.')).toBe(false)
    expect(isPoisonedVerseText('For God so loved the world that he gave his one and only Son.')).toBe(false)
    // Adversarial: real verse mentioning "fetch" (e.g. fetching water).
    expect(isPoisonedVerseText('And he said, Go and fetch me a little water in a vessel.')).toBe(false)
    // Real verse mentioning "API" — none in scripture, but check the
    // substring guard isn't triggered by the bare word.
    expect(isPoisonedVerseText('The API was carried into the temple.')).toBe(false)
  })

  it('handles null / undefined / empty defensively', () => {
    expect(isPoisonedVerseText(null)).toBe(false)
    expect(isPoisonedVerseText(undefined)).toBe(false)
    expect(isPoisonedVerseText('')).toBe(false)
  })
})
