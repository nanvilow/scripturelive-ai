// v0.7.239 — Unit tests for the n-gram phrase-index matcher.
//
// Validates the operator-supplied examples from the request:
//   "king couldn't sleep"   → Esther 6:1
//   "valley shadow death"   → Psalms 23:4
//   "light of world"        → John 8:12
//
// Plus structural invariants:
//   • Sub-millisecond per query after the first warm-up.
//   • Stopword removal doesn't drop content tokens.
//   • Longer n-grams win over shorter ones on the same entry.
//   • Reference dedupe at the top-level matcher.

import { describe, it, expect, beforeAll } from 'vitest'
import {
  matchTranscript,
  tokenise,
  warmPhraseIndex,
  phraseIndexStatus,
  __resetPhraseIndexForTests,
} from './phrase-index'

describe('phrase-index', () => {
  beforeAll(() => {
    __resetPhraseIndexForTests()
    warmPhraseIndex()
  })

  it('tokenise strips stopwords and punctuation', () => {
    expect(tokenise("king couldn't sleep")).toEqual(['king', 'couldnt', 'sleep'])
    expect(tokenise('The Lord is my shepherd.')).toEqual(['lord', 'shepherd'])
    expect(tokenise('   ')).toEqual([])
    expect(tokenise('')).toEqual([])
  })

  it('phraseIndexStatus reports a populated index after warm', () => {
    const s = phraseIndexStatus()
    expect(s.ready).toBe(true)
    expect(s.corpusSize).toBeGreaterThan(1000)
    expect(s.ngramCount).toBeGreaterThan(5000)
  })

  it("operator example: 'king couldn't sleep' → Esther 6:1", () => {
    const r = matchTranscript("king couldn't sleep")
    expect(r.matches.length).toBeGreaterThan(0)
    expect(r.matches[0].reference).toBe('Esther 6:1')
    expect(r.matches[0].phraseLength).toBeGreaterThanOrEqual(2)
  })

  it('contract: paraphrase wins return operator-visible verse text in `text`', () => {
    // Per the docstring on PhraseEntry.text, paraphrase-source wins
    // ARE the operator-visible verse row (curated to match how
    // pulpit-spoken paraphrases read). Anchor that contract so a
    // future field rename or source-priority change can't silently
    // break the example from the operator request:
    //   "king couldn't sleep" → Esther 6:1 → "That night, the king couldn't sleep."
    const r = matchTranscript("king couldn't sleep")
    const top = r.matches[0]
    expect(top.source).toBe('paraphrase')
    expect(top.text.toLowerCase()).toContain('king')
    expect(top.text.toLowerCase()).toContain('sleep')
  })

  it("operator example: 'valley shadow death' → Psalm(s) 23:4", () => {
    const r = matchTranscript('valley shadow death')
    expect(r.matches.length).toBeGreaterThan(0)
    // Accept either "Psalm 23:4" (preacher-phrases.ts uses the
    // singular, non-canonical form) or "Psalms 23:4" (the canonical
    // form per popular-verses.ts). Existing data-layer drift across
    // catalogues — fixing it is out of scope for the phrase-index.
    expect(r.matches[0].reference).toMatch(/^Psalms? 23:4$/)
  })

  it("operator example: 'light of world' → John 8:12", () => {
    const r = matchTranscript('light of world')
    expect(r.matches.length).toBeGreaterThan(0)
    // John 8:12 is the canonical home of "light of the world" — must
    // appear at minimum in the top 3 (Matthew 5:14 also contains the
    // exact phrase, so the strict #1 slot is order-dependent).
    const refs = r.matches.slice(0, 3).map((m) => m.reference)
    expect(refs).toContain('John 8:12')
  })

  it('full-quote transcript pins score to 1.0', () => {
    const r = matchTranscript('For God so loved the world.')
    expect(r.matches[0].reference).toBe('John 3:16')
    expect(r.matches[0].score).toBe(1)
  })

  it('returns empty matches for empty / whitespace input', () => {
    expect(matchTranscript('').matches).toEqual([])
    expect(matchTranscript('   ').matches).toEqual([])
  })

  it('returns empty matches when only stopwords are present', () => {
    expect(matchTranscript('the and to of in').matches).toEqual([])
  })

  it('dedupes by reference at top level by default', () => {
    // Psalms 23:1 has two paraphrases ("The Lord is my shepherd",
    // "I shall not want") — dedupe should collapse to one chip.
    const r = matchTranscript('the lord is my shepherd I shall not want')
    const psalm23 = r.matches.filter((m) => m.reference === 'Psalms 23:1')
    expect(psalm23.length).toBeLessThanOrEqual(1)
  })

  it('allowDuplicateReferences exposes per-surface-form matches', () => {
    const r = matchTranscript('the lord is my shepherd I shall not want', {
      allowDuplicateReferences: true,
      topK: 10,
    })
    // Both surface forms of Psalms 23:1 may now appear since they're
    // distinct corpus entries that each independently matched.
    const psalm23 = r.matches.filter((m) => m.reference === 'Psalms 23:1')
    expect(psalm23.length).toBeGreaterThanOrEqual(1)
  })

  it('minN=1 surfaces single-word matches (diagnostic mode)', () => {
    // "shepherd" alone is too noisy for the default minN=2 gate but
    // should fire when explicitly requested.
    const r1 = matchTranscript('shepherd', { minN: 1 })
    expect(r1.matches.length).toBeGreaterThan(0)
    const r2 = matchTranscript('shepherd')
    expect(r2.matches.length).toBe(0)
  })

  it('queryTokens + probedNgrams are populated', () => {
    const r = matchTranscript('king couldnt sleep tonight before dawn')
    expect(r.queryTokens).toBeGreaterThan(0)
    expect(r.probedNgrams).toBeGreaterThan(0)
  })

  it('handles curly apostrophes and contractions', () => {
    // U+2019 right single quotation mark — what Word / iOS produces.
    const r = matchTranscript('king couldn\u2019t sleep')
    expect(r.matches[0]?.reference).toBe('Esther 6:1')
  })

  it('performance: 100 queries complete in <50ms after warm', () => {
    const queries = [
      'king couldnt sleep',
      'valley shadow death',
      'light of world',
      'for god so loved',
      'jesus wept',
      'be still and know',
      'fear not for I am with you',
      'the just shall live by faith',
      'cast all your cares',
      'perfect love drives out fear',
    ]
    const start = performance.now()
    for (let i = 0; i < 10; i++) {
      for (const q of queries) {
        matchTranscript(q)
      }
    }
    const elapsed = performance.now() - start
    // 100 queries in well under 50ms on a cold CI runner. Local dev
    // typically sees <5ms.
    expect(elapsed).toBeLessThan(50)
  })
})
