// Speaker-Follow tests — v0.7.110.
//
// Pre-110 the matcher used trigram Jaccard with switchThreshold = 0.20.
// Operator complaint: "Speaker Follow does nothing — toggle is on but
// the highlight never moves." Root cause was that real preaching
// transcripts almost never produce three consecutive matching tokens
// against a verse after stop-word removal, so the bestScore stayed
// near zero and never crossed the 0.20 floor.
//
// These tests pin the new bigram+unigram model and the lower 0.10 /
// 0.04 thresholds so a future "let's bump this back up" doesn't
// silently regress speaker-follow into uselessness.

import { describe, it, expect } from 'vitest'
import { pickBestVerse, type VerseLine } from './speaker-follow'

const PSALM_23: VerseLine[] = [
  { index: 0, text: 'The LORD is my shepherd; I shall not want.' },
  { index: 1, text: 'He maketh me to lie down in green pastures: he leadeth me beside the still waters.' },
  { index: 2, text: 'He restoreth my soul: he leadeth me in the paths of righteousness for his name\'s sake.' },
  { index: 3, text: 'Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me; thy rod and thy staff they comfort me.' },
  { index: 4, text: 'Thou preparest a table before me in the presence of mine enemies: thou anointest my head with oil; my cup runneth over.' },
  { index: 5, text: 'Surely goodness and mercy shall follow me all the days of my life: and I will dwell in the house of the LORD for ever.' },
]

describe('pickBestVerse — v0.7.110 bigram model + lower thresholds', () => {
  it('preacher quoting verse 3 (paraphrase) → switches to index 3', () => {
    const speech = 'even when I walk through the valley of the shadow of death I fear no evil because you are with me'
    const r = pickBestVerse(speech, PSALM_23, { currentIndex: 0 })
    expect(r.shouldSwitch).toBe(true)
    expect(r.bestIndex).toBe(3)
  })

  it('preacher quoting verse 4 → switches from index 3 to 4', () => {
    const speech = 'you prepare a table before me in the presence of my enemies and you anoint my head with oil'
    const r = pickBestVerse(speech, PSALM_23, { currentIndex: 3 })
    expect(r.shouldSwitch).toBe(true)
    expect(r.bestIndex).toBe(4)
  })

  it('preacher quoting verse 5 → switches forward', () => {
    const speech = 'surely goodness and mercy shall follow me all the days of my life'
    const r = pickBestVerse(speech, PSALM_23, { currentIndex: 4 })
    expect(r.shouldSwitch).toBe(true)
    expect(r.bestIndex).toBe(5)
  })

  it('vague preaching that matches no verse strongly → no switch', () => {
    const speech = 'today we are talking about hope and how we can find it in difficult times'
    const r = pickBestVerse(speech, PSALM_23, { currentIndex: 0 })
    expect(r.shouldSwitch).toBe(false)
  })

  it('preacher reading verse 0 verbatim → stays on index 0 (no switch)', () => {
    const speech = 'The LORD is my shepherd I shall not want'
    const r = pickBestVerse(speech, PSALM_23, { currentIndex: 0 })
    expect(r.shouldSwitch).toBe(false)
  })

  it('"Jesus wept" — 2-token verse still matchable via unigram fallback', () => {
    const verses: VerseLine[] = [
      { index: 0, text: 'Jesus wept.' },
      { index: 1, text: 'Then said the Jews, Behold how he loved him!' },
    ]
    const speech = 'and the bible just simply says Jesus wept'
    const r = pickBestVerse(speech, verses, { currentIndex: 1 })
    expect(r.bestIndex).toBe(0)
    expect(r.shouldSwitch).toBe(true)
  })

  it('default switchThreshold is now 0.10 (was 0.20)', () => {
    // Direct probe: a preacher quoting a unique multi-word phrase
    // from verse 4 should comfortably clear 0.10 but probably not
    // the old 0.20.
    const speech = 'thou anointest my head with oil my cup runneth over'
    const r = pickBestVerse(speech, PSALM_23, { currentIndex: 0 })
    expect(r.bestScore).toBeGreaterThanOrEqual(0.10)
    expect(r.shouldSwitch).toBe(true)
    expect(r.bestIndex).toBe(4)
  })

  it('anti-rewind guard still blocks backward flips within 1.5 s', () => {
    const speech = 'the lord is my shepherd I shall not want'
    const r = pickBestVerse(speech, PSALM_23, {
      currentIndex: 4,
      lastSwitchAt: Date.now(),
    })
    // Even though verse 0 scores higher, recent forward switch
    // means the backward jump is suppressed.
    expect(r.shouldSwitch).toBe(false)
  })

  it('anti-rewind guard releases after 1.5 s', () => {
    const speech = 'the lord is my shepherd I shall not want'
    const r = pickBestVerse(speech, PSALM_23, {
      currentIndex: 4,
      lastSwitchAt: Date.now() - 2000,
    })
    expect(r.shouldSwitch).toBe(true)
    expect(r.bestIndex).toBe(0)
  })

  it('empty speech → no switch', () => {
    const r = pickBestVerse('', PSALM_23, { currentIndex: 0 })
    expect(r.shouldSwitch).toBe(false)
  })
})
