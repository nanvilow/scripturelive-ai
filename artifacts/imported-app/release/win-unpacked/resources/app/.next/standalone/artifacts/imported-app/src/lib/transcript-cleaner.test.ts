import { describe, it, expect } from 'vitest'
import { cleanTranscriptText } from './transcript-cleaner'

describe('cleanTranscriptText', () => {
  describe('empty / blank input', () => {
    it('returns an empty string for an empty input', () => {
      expect(cleanTranscriptText('')).toBe('')
    })

    it('returns an empty string for whitespace-only input', () => {
      expect(cleanTranscriptText('   \t\n   ')).toBe('')
    })

    it('returns an empty string when only noise tags are present', () => {
      expect(cleanTranscriptText('[BLANK_AUDIO]')).toBe('')
      expect(cleanTranscriptText('[BLANK_AUDIO] [music] (silence)')).toBe('')
    })
  })

  describe('noise-tag stripping', () => {
    it('strips a [BLANK_AUDIO] tag', () => {
      expect(cleanTranscriptText('Hello [BLANK_AUDIO] world')).toBe('Hello world')
    })

    it('strips a [music] tag', () => {
      expect(cleanTranscriptText('Welcome [music] to the service')).toBe(
        'Welcome to the service',
      )
    })

    it('strips a parenthetical (silence) tag', () => {
      expect(cleanTranscriptText('Pray with me (silence) and listen')).toBe(
        'Pray with me and listen',
      )
    })

    it('strips a parenthetical (applause) tag', () => {
      expect(cleanTranscriptText('Amen (applause) brothers')).toBe('Amen brothers')
    })

    it('is case-insensitive for bracketed noise tags', () => {
      expect(cleanTranscriptText('Hello [Blank_Audio] world')).toBe('Hello world')
      expect(cleanTranscriptText('Hello [MUSIC] world')).toBe('Hello world')
      expect(cleanTranscriptText('Hello [Noise] world')).toBe('Hello world')
    })

    it('is case-insensitive for parenthetical noise tags', () => {
      expect(cleanTranscriptText('Hello (Silence) world')).toBe('Hello world')
      expect(cleanTranscriptText('Hello (APPLAUSE) world')).toBe('Hello world')
    })

    it('strips all of the recognised bracketed noise tag variants', () => {
      const variants = [
        '[blank_audio]',
        '[music]',
        '[sound]',
        '[noise]',
        '[silence]',
        '[inaudible]',
        '[applause]',
        '[laughter]',
        '[cough]',
        '[crowd]',
      ]
      for (const tag of variants) {
        expect(cleanTranscriptText(`before ${tag} after`)).toBe('before after')
      }
    })

    it('strips multiple noise tags in a single chunk', () => {
      expect(
        cleanTranscriptText('[BLANK_AUDIO] Praise God [music] and rejoice (applause) today'),
      ).toBe('Praise God and rejoice today')
    })

    it('does not strip non-noise bracketed words', () => {
      // [chapter] is not in the noise allow-list and should survive.
      expect(cleanTranscriptText('Read [chapter] one verse two')).toBe(
        'Read [chapter] one verse two',
      )
    })
  })

  describe('repeated-punctuation collapse', () => {
    it('collapses long runs of dots to three', () => {
      expect(cleanTranscriptText('Wait..... for it')).toBe('Wait... for it')
    })

    it('collapses long runs of commas to three', () => {
      expect(cleanTranscriptText('Hold on,,,,, please')).toBe('Hold on,,, please')
    })

    it('collapses long runs of exclamation marks to three', () => {
      expect(cleanTranscriptText('Amen!!!!!! brothers')).toBe('Amen!!! brothers')
    })

    it('collapses long runs of question marks to three', () => {
      expect(cleanTranscriptText('Really?????? now')).toBe('Really??? now')
    })

    it('leaves a single punctuation mark untouched', () => {
      expect(cleanTranscriptText('Hello. World.')).toBe('Hello. World.')
    })

    it('leaves a normal ellipsis (three dots) untouched', () => {
      expect(cleanTranscriptText('Wait... for it')).toBe('Wait... for it')
    })
  })

  describe('whitespace / newline normalisation', () => {
    it('collapses runs of spaces to a single space', () => {
      expect(cleanTranscriptText('Hello     world')).toBe('Hello world')
    })

    it('collapses tabs to a single space', () => {
      expect(cleanTranscriptText('Hello\t\tworld')).toBe('Hello world')
    })

    it('collapses newlines to a single space', () => {
      expect(cleanTranscriptText('Hello\nworld')).toBe('Hello world')
    })

    it('collapses CRLF newlines to a single space', () => {
      expect(cleanTranscriptText('Hello\r\nworld')).toBe('Hello world')
    })

    it('collapses mixed whitespace runs to a single space', () => {
      expect(cleanTranscriptText('Hello  \n\t  world')).toBe('Hello world')
    })

    it('trims leading and trailing whitespace', () => {
      expect(cleanTranscriptText('   Hello world   ')).toBe('Hello world')
    })
  })

  describe('immediate-repeat phrase dedupe', () => {
    it('collapses a doubled single word', () => {
      expect(cleanTranscriptText('the the')).toBe('the')
    })

    it('collapses a tripled single word', () => {
      expect(cleanTranscriptText('and and and')).toBe('and')
    })

    it('collapses a doubled bigram ("of the of the")', () => {
      expect(cleanTranscriptText('of the of the')).toBe('of the')
    })

    it('collapses a doubled trigram ("you know what you know what")', () => {
      expect(cleanTranscriptText('you know what you know what')).toBe('you know what')
    })

    it('treats casing as equivalent for the dedupe pass', () => {
      expect(cleanTranscriptText('The the')).toBe('The')
    })

    it('ignores trailing punctuation when comparing repeats (preserves first occurrence)', () => {
      // Trailing punctuation on either side should not block the dedupe;
      // the first occurrence is kept verbatim, including its punctuation.
      expect(cleanTranscriptText('and, and')).toBe('and,')
      expect(cleanTranscriptText('and and,')).toBe('and')
    })

    it('does not collapse non-adjacent repeats', () => {
      // "the cat sat the cat sat" IS an adjacent trigram repeat and
      // collapses; pick a phrase where the repeat is interrupted.
      expect(cleanTranscriptText('the cat the dog')).toBe('the cat the dog')
    })

    it('does not collapse when the repeated tokens are different words', () => {
      expect(cleanTranscriptText('the cat')).toBe('the cat')
    })

    it('handles a long stuttered chunk end-to-end', () => {
      // Reproduces a typical Whisper stutter — bracketed noise + word
      // repeats + extra whitespace, all in a single chunk.
      const input = '  [BLANK_AUDIO]  And and and the Lord said,,,, of the of the people'
      expect(cleanTranscriptText(input)).toBe('And the Lord said,,, of the people')
    })
  })

  describe('leading punctuation trim', () => {
    it('strips leading dashes', () => {
      expect(cleanTranscriptText('- - hello world')).toBe('hello world')
    })

    it('strips leading commas and semicolons', () => {
      expect(cleanTranscriptText(',; hello world')).toBe('hello world')
    })

    it('strips leading dots', () => {
      expect(cleanTranscriptText('... hello world')).toBe('hello world')
    })

    it('does not strip leading letters', () => {
      expect(cleanTranscriptText('hello world')).toBe('hello world')
    })
  })
})
