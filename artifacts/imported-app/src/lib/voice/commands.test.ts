import { describe, it, expect } from 'vitest'
import { detectCommand, detectCommandChain } from './commands'

// v0.7.19 — Advanced voice command system tests.
//
// The operator's MASTER PROMPT specifies an 8-case "must pass all"
// test set. Each of those is asserted here, plus coverage for:
//   • the new translation/delete/show-verse intents
//   • wake-word ("Media") priority handling
//   • filler-word filtering ("okay", "thank you", "thank you media")
//   • multi-command chaining ("John 3:16, message version, next verse")
//   • anti-false-trigger guards (negating continuations,
//     translation-alias overlap with preaching vocabulary)
//
// Bible-reference parsing and slide dispatch are covered by their own
// suites (reference-engine + speech-provider integration); this file
// is intentionally focused on the parser surface in commands.ts.

describe('detectCommand — operator must-pass test set (v0.7.19)', () => {
  // 1. "Book of John 3:16" — handled downstream by the reference
  //    engine (detectBestReference). This is NOT a voice command, so
  //    the parser must NOT swallow it. We assert null so the
  //    SpeechProvider falls through to the reference engine.
  it('does NOT treat a bare reference-only utterance as a command', () => {
    expect(detectCommand('Book of John 3:16')).toBeNull()
    expect(detectCommand('John 3:16')).toBeNull()
  })

  // 2. "Give me message version" → change_translation: MSG
  it('parses "Give me message version" as change_translation MSG', () => {
    const cmd = detectCommand('Give me message version')
    expect(cmd?.kind).toBe('change_translation')
    expect(cmd?.translation).toBe('MSG')
  })

  // 3. "Next verse" → next_verse
  it('parses "Next verse" as next_verse', () => {
    const cmd = detectCommand('Next verse')
    expect(cmd?.kind).toBe('next_verse')
  })

  // 4. "Show verse 1" → show_verse_n with verseNumber 1
  it('parses "Show verse 1" as show_verse_n N=1', () => {
    const cmd = detectCommand('Show verse 1')
    expect(cmd?.kind).toBe('show_verse_n')
    expect(cmd?.verseNumber).toBe(1)
  })

  // 5. "In the beginning was the Word" — partial verse text. Not a
  //    command; handled by the text-search / semantic-match path
  //    downstream. Parser must return null.
  it('does NOT treat partial verse text as a command', () => {
    expect(detectCommand('In the beginning was the Word')).toBeNull()
  })

  // 6. "New King James version" → change_translation: NKJV
  //    Critical: must outrank the substring "King James" → KJV
  //    because the alias matcher walks longest-first.
  it('parses "New King James version" as change_translation NKJV (not KJV)', () => {
    const cmd = detectCommand('New King James version')
    expect(cmd?.kind).toBe('change_translation')
    expect(cmd?.translation).toBe('NKJV')
  })

  // 7. "Media, delete previous verse" → wake-word + delete_previous_verse
  it('parses "Media, delete previous verse" as delete_previous_verse with wake word', () => {
    const cmd = detectCommand('Media, delete previous verse')
    expect(cmd?.kind).toBe('delete_previous_verse')
    expect(cmd?.wakeWord).toBe(true)
  })

  // 8. "Media, clear screen" → wake-word + clear_screen
  it('parses "Media, clear screen" as clear_screen with wake word', () => {
    const cmd = detectCommand('Media, clear screen')
    expect(cmd?.kind).toBe('clear_screen')
    expect(cmd?.wakeWord).toBe(true)
  })
})

describe('detectCommand — translation aliases', () => {
  it.each([
    ['Give me KJV', 'KJV'],
    ['Give me King James version', 'KJV'],
    ['Give me NKJV', 'NKJV'],
    ['Give me Amplified', 'AMP'],
    ['Give me amplified version', 'AMP'],
    ['Switch to ESV', 'ESV'],
    ['Change to NIV', 'NIV'],
    ['Use NLT', 'NLT'],
    ['Show me NASB', 'NASB'],
    ['Give me CSB', 'CSB'],
    ['Give me RSV', 'RSV'],
    ['Switch to ASV', 'ASV'],
    ['Use WEB', 'WEB'],
    ['Give me Darby', 'DARBY'],
  ])('"%s" → translation %s', (utterance, expected) => {
    const cmd = detectCommand(utterance)
    expect(cmd?.kind).toBe('change_translation')
    expect(cmd?.translation).toBe(expected)
  })

  // Bare alias alone — should still parse as a translation switch.
  it('"NKJV" alone parses as change_translation NKJV', () => {
    expect(detectCommand('NKJV')?.translation).toBe('NKJV')
  })
  it('"the message" alone parses as change_translation MSG', () => {
    expect(detectCommand('the message')?.translation).toBe('MSG')
  })
})

describe('detectCommand — anti-false-trigger guards', () => {
  // The translation aliases overlap with common preaching vocab.
  // Without strict-mode gating, "the message of the cross" would
  // accidentally switch to MSG. Guard: bare-alias mode requires the
  // utterance to be JUST the alias (+ optional version/bible suffix).
  it('does NOT switch translation on "the message of the cross"', () => {
    expect(detectCommand('the message of the cross')).toBeNull()
  })

  it('does NOT switch translation on "amplified by his grace"', () => {
    expect(detectCommand('amplified by his grace')).toBeNull()
  })

  // Negating continuation: "next verse says ..." is the preacher
  // reading, not a navigation command.
  it('does NOT trigger next_verse on "next verse says love your neighbor"', () => {
    expect(detectCommand('next verse says love your neighbor')).toBeNull()
  })
})

describe('detectCommand — filler-word filter', () => {
  it.each([
    'okay',
    'OK',
    'thank you',
    'thanks',
    'thank you media',
    'very good',
    'amen',
    'praise God',
    'Hallelujah',
    'mm',
  ])('"%s" returns null (filler)', (utterance) => {
    expect(detectCommand(utterance)).toBeNull()
  })

  // "Media, okay" — wake word followed by filler. Must still be null
  // so we don't try to dispatch an empty command.
  it('"Media, okay" returns null (wake word + filler)', () => {
    expect(detectCommand('Media, okay')).toBeNull()
  })
})

describe('detectCommand — wake-word handling', () => {
  it('strips "Media, " prefix and recognises the underlying command', () => {
    const cmd = detectCommand('Media, next verse')
    expect(cmd?.kind).toBe('next_verse')
    expect(cmd?.wakeWord).toBe(true)
  })

  it('strips "Media: " prefix', () => {
    const cmd = detectCommand('Media: clear screen')
    expect(cmd?.kind).toBe('clear_screen')
    expect(cmd?.wakeWord).toBe(true)
  })

  it('strips "Hey media " prefix', () => {
    const cmd = detectCommand('Hey media next verse')
    expect(cmd?.kind).toBe('next_verse')
    expect(cmd?.wakeWord).toBe(true)
  })

  it('wake word gives higher confidence than the same command without it', () => {
    const wokeCmd = detectCommand('Media, next verse')
    const bareCmd = detectCommand('Next verse')
    expect(wokeCmd?.confidence ?? 0).toBeGreaterThan(bareCmd?.confidence ?? 0)
  })

  it('wake word allows a longer courtesy tail ("media clear screen now thanks")', () => {
    // Without the wake word, the post-trigger tail "now thanks" would
    // exceed the 12-char heuristic and reject. With it, we accept up
    // to 24 chars of tail.
    const woke = detectCommand('Media, clear screen now thanks')
    expect(woke?.kind).toBe('clear_screen')
    const bare = detectCommand('clear screen now thanks please')
    expect(bare).toBeNull()
  })
})

describe('detectCommand — show_verse_n', () => {
  it.each([
    ['Show verse 1', 1],
    ['Go to verse 7', 7],
    ['Display verse 23', 23],
    ['Jump to verse 16', 16],
    ['Read verse 3', 3],
  ])('"%s" → verseNumber %d', (utterance, n) => {
    const cmd = detectCommand(utterance)
    expect(cmd?.kind).toBe('show_verse_n')
    expect(cmd?.verseNumber).toBe(n)
  })

  it('"verse 5" alone (without wake word) still parses', () => {
    const cmd = detectCommand('verse 5')
    expect(cmd?.kind).toBe('show_verse_n')
    expect(cmd?.verseNumber).toBe(5)
  })

  it('rejects out-of-range verse numbers', () => {
    expect(detectCommand('show verse 9999')).toBeNull()
  })
})

describe('detectCommand — delete_previous_verse', () => {
  it.each([
    'delete previous verse',
    'delete previous bars',
    'remove previous verse',
    'delete that verse',
    'remove last verse',
    'undo last verse',
    'remove that scripture',
  ])('"%s" → delete_previous_verse', (utterance) => {
    expect(detectCommand(utterance)?.kind).toBe('delete_previous_verse')
  })
})

describe('detectCommandChain — multi-command chaining', () => {
  it('parses "John 3:16, message version, next verse" as 3 commands', () => {
    const chain = detectCommandChain('John 3:16, message version, next verse')
    expect(chain.length).toBe(3)
    expect(chain[0]?.kind).toBe('go_to_reference')
    expect(chain[0]?.reference?.book).toBe('John')
    expect(chain[0]?.reference?.chapter).toBe(3)
    expect(chain[0]?.reference?.verseStart).toBe(16)
    expect(chain[1]?.kind).toBe('change_translation')
    expect(chain[1]?.translation).toBe('MSG')
    expect(chain[2]?.kind).toBe('next_verse')
  })

  it('parses "Media, NKJV, clear screen" with wake-word propagation', () => {
    const chain = detectCommandChain('Media, NKJV, clear screen')
    expect(chain.length).toBe(2)
    expect(chain[0]?.kind).toBe('change_translation')
    expect(chain[0]?.translation).toBe('NKJV')
    expect(chain[0]?.wakeWord).toBe(true)
    expect(chain[1]?.kind).toBe('clear_screen')
    expect(chain[1]?.wakeWord).toBe(true)
  })

  it('"and then" / "then" separator works', () => {
    const chain = detectCommandChain('next verse then previous verse')
    expect(chain.length).toBe(2)
    expect(chain[0]?.kind).toBe('next_verse')
    expect(chain[1]?.kind).toBe('previous_verse')
  })

  it('returns single command for non-chained utterance', () => {
    const chain = detectCommandChain('next verse')
    expect(chain.length).toBe(1)
    expect(chain[0]?.kind).toBe('next_verse')
  })

  it('returns empty array for filler', () => {
    expect(detectCommandChain('okay, thank you, very good')).toEqual([])
  })
})
