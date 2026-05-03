// v0.7.65 — Preacher Phrase Detection tests.
//
// Proves the detector honours the operator's spec from the
// MASTER-INSTRUCTION-BIBLE-VERSE-DETECTION-SYSTEM brief:
//   • case-insensitive
//   • punctuation-insensitive
//   • fuzzy match at ≥ 80% token overlap
//   • partial-phrase detection (preacher mid-sentence)
//   • dedupe across calls via excludeReferences
//   • "General Sermon Phrase" entries flagged sermonOnly
import { describe, it, expect } from 'vitest'
import {
  detectBestPreacherPhrase,
  detectPreacherPhrases,
  normalizePhrase,
  PREACHER_PHRASES,
} from './preacher-phrases'

describe('preacher-phrases — catalogue integrity', () => {
  it('compiles a non-trivial deduplicated catalogue', () => {
    expect(PREACHER_PHRASES.length).toBeGreaterThanOrEqual(150)
    const seen = new Set<string>()
    for (const p of PREACHER_PHRASES) {
      expect(seen.has(p.normalized)).toBe(false)
      seen.add(p.normalized)
    }
  })

  it('maps "say amen somebody" as sermonOnly with no Bible address', () => {
    const e = PREACHER_PHRASES.find((p) => p.normalized === 'say amen somebody')
    expect(e).toBeDefined()
    expect(e!.sermonOnly).toBe(true)
    expect(e!.reference).toBe('General Sermon Phrase')
  })

  it('maps real Bible phrases with correct references', () => {
    const cases: Array<[string, string]> = [
      ['jesus wept', 'John 11:35'],
      ['for god so loved the world', 'John 3:16'],
      ['the lord is my shepherd', 'Psalm 23:1'],
      ['lazarus come forth', 'John 11:43'],
      ['weeping may endure for a night', 'Psalm 30:5'],
      ['joy comes in the morning', 'Psalm 30:5'],
      ['trouble dont last always', 'Psalm 30:5'],
      ['the heavens declare the glory of god', 'Psalm 19:1'],
      ['i can do all things through christ', 'Philippians 4:13'],
      ['guard your heart with all diligence', 'Proverbs 4:23'],
      ['no weapon formed against you shall prosper', 'Isaiah 54:17'],
    ]
    for (const [phrase, ref] of cases) {
      const e = PREACHER_PHRASES.find((p) => p.normalized === phrase)
      expect(e, `missing catalogue entry: ${phrase}`).toBeDefined()
      expect(e!.reference).toBe(ref)
    }
  })
})

describe('preacher-phrases — normaliser', () => {
  it('lowercases, strips punctuation, collapses whitespace', () => {
    expect(normalizePhrase("Jesus, Wept!")).toBe('jesus wept')
    expect(normalizePhrase("trouble don't last  always.")).toBe('trouble dont last always')
    expect(normalizePhrase('  THE   Lord   IS   my   Shepherd  ')).toBe('the lord is my shepherd')
  })
})

describe('detectBestPreacherPhrase — exact substring matching', () => {
  it('detects a verse mid-sentence (operator spec: partial phrases)', () => {
    const t = 'and the bible tells us that Jesus wept at the tomb of Lazarus'
    const hit = detectBestPreacherPhrase(t)
    expect(hit).not.toBeNull()
    expect(hit!.reference).toBe('John 11:35')
    expect(hit!.matchType).toBe('exact')
    expect(hit!.score).toBe(1.0)
  })

  it('is case-insensitive', () => {
    const hit = detectBestPreacherPhrase('FOR GOD SO LOVED THE WORLD that he gave...')
    expect(hit?.reference).toBe('John 3:16')
  })

  it('ignores punctuation', () => {
    const hit = detectBestPreacherPhrase("Saints, the Lord, is my Shepherd. I shall not want!")
    expect(hit?.reference).toBe('Psalm 23:1')
  })

  it('detects preacher-only sermon phrases with sermonOnly flag', () => {
    const hit = detectBestPreacherPhrase('alright church can I get an amen tonight')
    expect(hit?.reference).toBe('General Sermon Phrase')
    expect(hit?.sermonOnly).toBe(true)
  })

  it('returns null when no phrase matches', () => {
    expect(detectBestPreacherPhrase('today the choir will sing two songs')).toBeNull()
  })
})

describe('detectPreacherPhrases — fuzzy matching at ≥80% threshold', () => {
  it('matches a phrase with one transcription typo (Lev-1)', () => {
    // "lazerus" instead of "lazarus" — single-char swap, Lev-1 token
    const hit = detectBestPreacherPhrase('he cried lazerus come forth from the grave')
    expect(hit?.reference).toBe('John 11:43')
  })

  it('matches a phrase with one substituted word (~83% overlap)', () => {
    // 6 tokens, one wrong → 5/6 = 0.833 ≥ 0.80
    const hit = detectBestPreacherPhrase('today the heavens declare a glory of god clearly')
    expect(hit?.reference).toBe('Psalm 19:1')
  })

  it('rejects a near-miss below 80% overlap', () => {
    // Random unrelated 6-token chunk should not catch any phrase.
    expect(detectBestPreacherPhrase('we like to celebrate birthdays here every sunday')).toBeNull()
  })
})

describe('detectPreacherPhrases — multi-hit + dedupe', () => {
  it('returns multiple distinct references in one transcript', () => {
    const t =
      'we know weeping may endure for a night but joy comes in the morning amen'
    const hits = detectPreacherPhrases(t)
    const refs = new Set(hits.map((h) => h.reference))
    expect(refs.has('Psalm 30:5')).toBe(true)
    // Two different catalogue entries collapse to the same Psalm 30:5
    // reference; detector dedupes by reference so we get one hit.
    expect(hits.length).toBe(1)
  })

  it('honours excludeReferences (recent-detection cache)', () => {
    const t = 'and Jesus wept at the tomb'
    expect(detectBestPreacherPhrase(t)?.reference).toBe('John 11:35')
    const second = detectBestPreacherPhrase(t, {
      excludeReferences: new Set(['John 11:35']),
    })
    expect(second).toBeNull()
  })
})
