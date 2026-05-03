// stripIntroducingPreamble — v0.7.28.
//
// The semantic matcher unit tests focus on the new preamble
// stripper. Embedding + cosine math are not unit-tested here
// because they require a live OpenAI call; the production failure
// mode the operator reported ("here's a verse about loving your
// enemies" produces no chip) is FULLY captured by the stripper
// behaviour these tests pin — once the wrapper is gone, the
// already-shipped matcher pipeline embeds the topic phrase
// against POPULAR_VERSES_KJV exactly the way it always has.

import { describe, it, expect } from 'vitest'

import { preacherCatalogueAsVerses, stripIntroducingPreamble } from './semantic-matcher'
import { PREACHER_PHRASES } from '@/lib/bibles/preacher-phrases'

describe('stripIntroducingPreamble — operator-reported case', () => {
  it("strips \"here's a verse about\" so the embedding sees just the topic", () => {
    expect(stripIntroducingPreamble("here's a verse about loving your enemies"))
      .toBe('loving your enemies')
  })

  it("strips \"here is a verse about\"", () => {
    expect(stripIntroducingPreamble('here is a verse about loving your enemies'))
      .toBe('loving your enemies')
  })

  it("strips \"this is a scripture about\"", () => {
    expect(stripIntroducingPreamble('this is a scripture about being born again'))
      .toBe('being born again')
  })

  it("strips \"there's a passage about\"", () => {
    expect(stripIntroducingPreamble("there's a passage about faith hope and love"))
      .toBe('faith hope and love')
  })
})

describe('stripIntroducingPreamble — let / I want / I will family', () => {
  it("strips \"let me read a verse about\"", () => {
    expect(stripIntroducingPreamble('let me read a verse about forgiveness'))
      .toBe('forgiveness')
  })

  it("strips \"let's look at a passage about\"", () => {
    expect(stripIntroducingPreamble("let's look at a passage about grace"))
      .toBe('grace')
  })

  it("strips \"I want to share a verse about\"", () => {
    expect(stripIntroducingPreamble('I want to share a verse about humility'))
      .toBe('humility')
  })

  it("strips \"I'll read the scripture where\"", () => {
    expect(stripIntroducingPreamble("I'll read the scripture where Jesus says I am the way"))
      .toBe('Jesus says I am the way')
  })

  it("strips \"I am going to read a verse about\"", () => {
    expect(stripIntroducingPreamble('I am going to read a verse about prayer'))
      .toBe('prayer')
  })
})

describe('stripIntroducingPreamble — we / I have family', () => {
  it("strips \"we have a verse about\"", () => {
    expect(stripIntroducingPreamble('we have a verse about salvation'))
      .toBe('salvation')
  })

  it("strips \"I have a scripture where\"", () => {
    expect(stripIntroducingPreamble('I have a scripture where Paul talks about love'))
      .toBe('Paul talks about love')
  })

  it("strips \"I've got a verse about\"", () => {
    expect(stripIntroducingPreamble("I've got a verse about being still"))
      .toBe('being still')
  })
})

describe('stripIntroducingPreamble — bare openers', () => {
  it("strips \"the verse about\"", () => {
    expect(stripIntroducingPreamble('the verse about a city on a hill'))
      .toBe('a city on a hill')
  })

  it("strips \"a scripture about\"", () => {
    expect(stripIntroducingPreamble('a scripture about being born again'))
      .toBe('being born again')
  })

  it("strips bare \"scripture about\"", () => {
    expect(stripIntroducingPreamble('scripture about love'))
      .toBe('love')
  })

  it("strips bare \"passage about\"", () => {
    expect(stripIntroducingPreamble('passage about faith'))
      .toBe('faith')
  })

  it("strips \"the passage where\"", () => {
    expect(stripIntroducingPreamble('the passage where Jesus walks on water'))
      .toBe('Jesus walks on water')
  })
})

describe('stripIntroducingPreamble — preserves real paraphrases', () => {
  // Critical: these must NOT be stripped. They are the actual
  // paraphrased verse text we WANT the embedder to see.
  it('does NOT strip "the Lord is my shepherd I shall not want"', () => {
    const input = 'the Lord is my shepherd I shall not want'
    expect(stripIntroducingPreamble(input)).toBe(input)
  })

  it('does NOT strip "for God so loved the world"', () => {
    const input = 'for God so loved the world that he gave his only son'
    expect(stripIntroducingPreamble(input)).toBe(input)
  })

  it('does NOT strip "love is patient love is kind"', () => {
    const input = 'love is patient love is kind'
    expect(stripIntroducingPreamble(input)).toBe(input)
  })

  it('does NOT strip "be still and know that I am God"', () => {
    const input = 'be still and know that I am God'
    expect(stripIntroducingPreamble(input)).toBe(input)
  })

  it('does NOT strip "I can do all things through Christ"', () => {
    const input = 'I can do all things through Christ who strengthens me'
    expect(stripIntroducingPreamble(input)).toBe(input)
  })

  it('does NOT strip a sentence that mentions "verse" but not as preamble', () => {
    // The word "verse" appears mid-sentence — no preamble pattern
    // should match because the sentence does NOT start with the
    // recognised opener forms.
    const input = 'this verse really speaks to my heart'
    expect(stripIntroducingPreamble(input)).toBe(input)
  })
})

describe('stripIntroducingPreamble — trailing fillers', () => {
  it('strips a trailing "right?" after the topic', () => {
    expect(stripIntroducingPreamble("here's a verse about loving your enemies, right?"))
      .toBe('loving your enemies')
  })

  it('strips a trailing "you know"', () => {
    expect(stripIntroducingPreamble('let me read a verse about grace you know'))
      .toBe('grace')
  })

  it('strips a trailing "amen"', () => {
    expect(stripIntroducingPreamble('the verse about salvation, amen'))
      .toBe('salvation')
  })

  it('strips a trailing punctuation cluster', () => {
    expect(stripIntroducingPreamble('the verse about love...'))
      .toBe('love')
  })
})

describe('stripIntroducingPreamble — degenerate inputs', () => {
  it('returns empty string for empty input', () => {
    expect(stripIntroducingPreamble('')).toBe('')
  })

  it('returns empty string for whitespace only', () => {
    expect(stripIntroducingPreamble('   ')).toBe('')
  })

  it('returns trimmed input when no preamble matches', () => {
    expect(stripIntroducingPreamble('  random preaching text  ')).toBe('random preaching text')
  })

  it('returns ORIGINAL when stripping would leave too few word chars', () => {
    // The preamble matches but the trailing topic is just "it" —
    // far too small to embed usefully. We refuse to strip in that
    // case so the matcher at least gets the full sentence.
    const input = "here's a verse about it"
    expect(stripIntroducingPreamble(input)).toBe(input)
  })

  it('is case-insensitive', () => {
    expect(stripIntroducingPreamble("HERE'S A VERSE ABOUT loving your enemies"))
      .toBe('loving your enemies')
  })

  it('handles "talks about" continuation', () => {
    expect(stripIntroducingPreamble('the verse that talks about loving your neighbor'))
      .toBe('loving your neighbor')
  })

  it('handles "that says" continuation', () => {
    expect(stripIntroducingPreamble("here's a verse that says love is patient"))
      .toBe('love is patient')
  })

  it('handles "saying" continuation', () => {
    expect(stripIntroducingPreamble('the verse saying do not be afraid'))
      .toBe('do not be afraid')
  })

  it('handles "mentions" continuation', () => {
    expect(stripIntroducingPreamble('the verse that mentions the kingdom of heaven'))
      .toBe('the kingdom of heaven')
  })

  it('handles "on" continuation (e.g. "verse on patience")', () => {
    expect(stripIntroducingPreamble('the verse on patience and endurance'))
      .toBe('patience and endurance')
  })
})

describe('preacherCatalogueAsVerses — v0.7.67 LLM/preacher wiring', () => {
  const verses = preacherCatalogueAsVerses()

  it('synthesises a non-trivial set of PopularVerse-shaped records', () => {
    expect(verses.length).toBeGreaterThanOrEqual(150)
  })

  it('excludes "General Sermon Phrase" entries (no Bible address to project)', () => {
    expect(verses.find((v) => v.reference === 'General Sermon Phrase')).toBeUndefined()
    // And every Bible-addressed entry in the catalogue IS represented.
    const addressed = PREACHER_PHRASES.filter((p) => !p.sermonOnly).length
    expect(verses.length).toBe(addressed)
  })

  it('parses simple references into book/chapter/verseStart', () => {
    const wept = verses.find((v) => v.reference === 'John 11:35')
    expect(wept).toBeDefined()
    expect(wept!.book).toBe('John')
    expect(wept!.chapter).toBe(11)
    expect(wept!.verseStart).toBe(35)
    expect(wept!.text.toLowerCase()).toContain('jesus wept')
  })

  it('parses "1 Samuel 17:47"-style numbered-book references', () => {
    const battle = verses.find((v) => v.reference === '1 Samuel 17:47')
    expect(battle).toBeDefined()
    expect(battle!.book).toBe('1 Samuel')
    expect(battle!.chapter).toBe(17)
    expect(battle!.verseStart).toBe(47)
  })
})
