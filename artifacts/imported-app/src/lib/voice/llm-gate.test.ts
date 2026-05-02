// v0.7.29 — Tests for the LLM-classifier command-likeness gate.

import { describe, it, expect } from 'vitest'

import { isLikelyCommandUtterance, _triggerVerbCount } from './llm-gate'

describe('isLikelyCommandUtterance — trigger verbs', () => {
  it('accepts "next verse"', () => {
    expect(isLikelyCommandUtterance('next verse')).toBe(true)
  })
  it('accepts "previous chapter"', () => {
    expect(isLikelyCommandUtterance('previous chapter')).toBe(true)
  })
  it('accepts "skip ahead"', () => {
    expect(isLikelyCommandUtterance('skip ahead')).toBe(true)
  })
  it('accepts "go to John 3:16"', () => {
    expect(isLikelyCommandUtterance('go to John 3:16')).toBe(true)
  })
  it('accepts "show the next verse"', () => {
    expect(isLikelyCommandUtterance('show the next verse')).toBe(true)
  })
  it('accepts "hide the screen"', () => {
    expect(isLikelyCommandUtterance('hide the screen')).toBe(true)
  })
  it('accepts "blank screen"', () => {
    expect(isLikelyCommandUtterance('blank screen')).toBe(true)
  })
  it('accepts "scroll down"', () => {
    expect(isLikelyCommandUtterance('scroll down')).toBe(true)
  })
  it('accepts "switch to NIV"', () => {
    expect(isLikelyCommandUtterance('switch to NIV')).toBe(true)
  })
  it('accepts "change translation"', () => {
    expect(isLikelyCommandUtterance('change translation')).toBe(true)
  })
  it('accepts "find the verse about love"', () => {
    expect(isLikelyCommandUtterance('find the verse about love')).toBe(true)
  })
  it('accepts "search for grace"', () => {
    expect(isLikelyCommandUtterance('search for grace')).toBe(true)
  })
  it('accepts "delete previous verse"', () => {
    expect(isLikelyCommandUtterance('delete previous verse')).toBe(true)
  })
  it('accepts "undo that"', () => {
    expect(isLikelyCommandUtterance('undo that')).toBe(true)
  })
  it('accepts "stop autoscroll"', () => {
    expect(isLikelyCommandUtterance('stop autoscroll')).toBe(true)
  })
  it('accepts "pause"', () => {
    // 1 word — should reject on length floor.
    expect(isLikelyCommandUtterance('pause')).toBe(false)
  })
  it('accepts "pause please"', () => {
    expect(isLikelyCommandUtterance('pause please')).toBe(true)
  })
})

describe('isLikelyCommandUtterance — wake-word bypass', () => {
  it('accepts "media, next verse"', () => {
    expect(isLikelyCommandUtterance('media, next verse')).toBe(true)
  })
  it('accepts "okay show John 3:16"', () => {
    expect(isLikelyCommandUtterance('okay show John 3:16')).toBe(true)
  })
  it('accepts "hey go to chapter 5"', () => {
    expect(isLikelyCommandUtterance('hey go to chapter 5')).toBe(true)
  })
  it('rejects "media" alone (only wake word, no verb)', () => {
    expect(isLikelyCommandUtterance('media')).toBe(false)
  })
})

describe('isLikelyCommandUtterance — structural hints', () => {
  it('accepts "the next verse please"', () => {
    expect(isLikelyCommandUtterance('the next verse please')).toBe(true)
  })
  it('accepts "verse 16 now"', () => {
    expect(isLikelyCommandUtterance('verse 16 now')).toBe(true)
  })
  it('accepts "translation niv"', () => {
    expect(isLikelyCommandUtterance('translation niv')).toBe(true)
  })
  it('accepts "to esv"', () => {
    expect(isLikelyCommandUtterance('to esv')).toBe(true)
  })
  it('accepts "autoscroll please"', () => {
    expect(isLikelyCommandUtterance('autoscroll please')).toBe(true)
  })
})

describe('isLikelyCommandUtterance — rejects sermon speech', () => {
  it('rejects normal preaching', () => {
    expect(isLikelyCommandUtterance('and Jesus said unto them blessed are the meek for they shall inherit the earth'))
      .toBe(false)
  })
  it('rejects an introducing-preamble sentence (handled by semantic-matcher v0.7.28)', () => {
    expect(isLikelyCommandUtterance("here's a verse about loving your enemies")).toBe(false)
  })
  it('rejects greeting', () => {
    expect(isLikelyCommandUtterance('good morning brothers and sisters')).toBe(false)
  })
  it('rejects a long testimony sentence', () => {
    expect(isLikelyCommandUtterance(
      'I want to tell you a story about how God moved in my life last week when I was praying',
    )).toBe(false)
  })
  it('rejects empty string', () => {
    expect(isLikelyCommandUtterance('')).toBe(false)
  })
  it('rejects whitespace-only', () => {
    expect(isLikelyCommandUtterance('   ')).toBe(false)
  })
  it('rejects single-word utterance', () => {
    expect(isLikelyCommandUtterance('amen')).toBe(false)
  })
})

describe('isLikelyCommandUtterance — length cap', () => {
  it('rejects utterances longer than 12 words even when they start with a trigger', () => {
    // 13 words, starts with "show" — too long, almost certainly
    // sermon content rather than a command.
    const long =
      'show me the way you want me to walk in this life today'
    expect(long.split(/\s+/).length).toBeGreaterThan(12)
    expect(isLikelyCommandUtterance(long)).toBe(false)
  })
  it('accepts an exactly-12-word command', () => {
    const twelve = 'show the next verse from chapter three of the book of John'
    expect(twelve.split(/\s+/).length).toBe(12)
    expect(isLikelyCommandUtterance(twelve)).toBe(true)
  })
})

describe('isLikelyCommandUtterance — case + punctuation', () => {
  it('is case-insensitive on the first word', () => {
    expect(isLikelyCommandUtterance('NEXT VERSE')).toBe(true)
  })
  it('strips trailing punctuation on the first word', () => {
    expect(isLikelyCommandUtterance('next, verse')).toBe(true)
  })
  it("handles \"let's\" with an apostrophe as a trigger", () => {
    expect(isLikelyCommandUtterance("let's read John 3:16")).toBe(true)
  })
})

describe('isLikelyCommandUtterance — coverage smoke', () => {
  it('TRIGGER_VERBS list has not been accidentally truncated', () => {
    // If a refactor accidentally drops a chunk of trigger verbs the
    // test count will collapse silently. Pin a floor.
    expect(_triggerVerbCount()).toBeGreaterThanOrEqual(35)
  })
})
