// v0.7.261 — Regression: prove lookupVerse / lookupRange accept the
// store's UPPERCASE translation key ('KJV') and return canonical text.
//
// Why this test exists: v0.7.253 (sendDetected) and v0.7.260 (AUTO LIVE
// useEffect) both shipped what looked like a correct chain
// (parseVerseReference → lookupVerse/lookupRange → fallback best.text).
// But the renderer passes `v.translation || 'KJV'` (uppercase) and the
// loadTranslation() switch only matches lowercase ('kjv'), so the
// lookup returned null EVERY TIME and the fallback to best.text (the
// trigger paraphrase for SEMANTIC detections) hit the projector.
// Operator screenshots 2026-05-28 18:13/18:14 caught this on the
// Matthew 14:21 / Mark 5:25 paraphrases.
//
// The fix in loadTranslation() normalizes via toLowerCase(). These
// tests pin that behavior so a future refactor cannot regress it.

import { describe, expect, it } from 'vitest'
import { lookupVerse, lookupRange } from './local-bible'

describe('local-bible — translation key case normalization (v0.7.261)', () => {
  it('lookupVerse returns canonical KJV text for uppercase "KJV"', () => {
    const text = lookupVerse('Matthew', 14, 21, 'KJV')
    expect(text).toBe(
      'And they that had eaten were about five thousand men, beside women and children.',
    )
  })

  it('lookupVerse returns canonical KJV text for lowercase "kjv"', () => {
    const text = lookupVerse('Matthew', 14, 21, 'kjv')
    expect(text).toBe(
      'And they that had eaten were about five thousand men, beside women and children.',
    )
  })

  it('lookupVerse returns canonical KJV text for mixed-case "Kjv"', () => {
    const text = lookupVerse('Matthew', 14, 21, 'Kjv')
    expect(text).toBe(
      'And they that had eaten were about five thousand men, beside women and children.',
    )
  })

  it('lookupVerse handles Mark 5:25 (the other paraphrase-leak case from operator screenshot)', () => {
    const text = lookupVerse('Mark', 5, 25, 'KJV')
    expect(text).toBe(
      'And a certain woman, which had an issue of blood twelve years,',
    )
  })

  it('lookupVerse handles Esther 6:1 (paraphrase-leak case from v0.7.260 screenshot)', () => {
    const text = lookupVerse('Esther', 6, 1, 'KJV')
    expect(text).toContain('On that night could not the king sleep')
  })

  it('lookupRange returns canonical text for uppercase "KJV"', () => {
    const result = lookupRange('John', 3, 16, 17, 'KJV')
    expect(result).not.toBeNull()
    expect(result!.text).toContain('For God so loved the world')
    expect(result!.lines).toHaveLength(2)
  })

  it('lookupVerse returns null for an unbundled translation regardless of case', () => {
    // 'WEB' isn't in the bundled set — should be null both ways.
    expect(lookupVerse('Matthew', 14, 21, 'WEB')).toBeNull()
    expect(lookupVerse('Matthew', 14, 21, 'web')).toBeNull()
  })

  it('lookupVerse trims whitespace from translation key', () => {
    const text = lookupVerse('Matthew', 14, 21, '  KJV  ')
    expect(text).toBe(
      'And they that had eaten were about five thousand men, beside women and children.',
    )
  })
})
