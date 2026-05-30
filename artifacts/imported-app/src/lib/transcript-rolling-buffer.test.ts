import { describe, it, expect } from 'vitest'
import {
  pushWords,
  bufferText,
  detectionText,
  type RollingWord,
} from './transcript-rolling-buffer'
import { detectBestReference } from './bibles/reference-engine'

describe('transcript-rolling-buffer — windowing', () => {
  it('accumulates words across chunks in order', () => {
    let buf: RollingWord[] = []
    buf = pushWords(buf, 'turn with me to', 1000)
    buf = pushWords(buf, 'the book of John', 2000)
    expect(bufferText(buf)).toBe('turn with me to the book of John')
  })

  it('evicts words older than the time window', () => {
    let buf: RollingWord[] = []
    buf = pushWords(buf, 'John', 0, { windowMs: 12_000 })
    // 3:7 spoken 13 s later — "John" is now stale and should be gone.
    buf = pushWords(buf, '3:7', 13_000, { windowMs: 12_000 })
    expect(bufferText(buf)).toBe('3:7')
  })

  it('keeps words within the time window', () => {
    let buf: RollingWord[] = []
    buf = pushWords(buf, 'John', 0, { windowMs: 12_000 })
    buf = pushWords(buf, '3:7', 2_000, { windowMs: 12_000 })
    expect(bufferText(buf)).toBe('John 3:7')
  })

  it('caps total retained words at maxWords', () => {
    let buf: RollingWord[] = []
    for (let i = 0; i < 100; i++) {
      buf = pushWords(buf, `w${i}`, i * 10, { maxWords: 60, windowMs: 10 ** 9 })
    }
    expect(buf.length).toBe(60)
    // Oldest survivor is w40 (100 - 60).
    expect(buf[0]!.w).toBe('w40')
    expect(buf[buf.length - 1]!.w).toBe('w99')
  })

  it('never mutates the previous array', () => {
    const prev: RollingWord[] = [{ w: 'a', at: 0 }]
    const next = pushWords(prev, 'b', 100)
    expect(prev).toEqual([{ w: 'a', at: 0 }])
    expect(next).not.toBe(prev)
  })

  it('prunes on an empty chunk after a long silence', () => {
    let buf: RollingWord[] = []
    buf = pushWords(buf, 'Genesis 1:1', 0, { windowMs: 5_000 })
    buf = pushWords(buf, '', 6_000, { windowMs: 5_000 })
    expect(buf.length).toBe(0)
  })
})

describe('transcript-rolling-buffer — detectionText (interim path)', () => {
  it('appends the live interim to the persisted finals', () => {
    const buf: RollingWord[] = [
      { w: 'open', at: 0 },
      { w: 'your', at: 0 },
      { w: 'bibles', at: 0 },
      { w: 'to', at: 0 },
      { w: 'John', at: 0 },
    ]
    expect(detectionText(buf, '3:7')).toBe('open your bibles to John 3:7')
  })

  it('clips to the last N words across finals + interim', () => {
    const buf: RollingWord[] = Array.from({ length: 40 }, (_, i) => ({
      w: `w${i}`,
      at: 0,
    }))
    const out = detectionText(buf, 'tail', 5)
    expect(out).toBe('w36 w37 w38 w39 tail')
  })
})

// ─── PROOF: the operator-reported failures now detect ──────────────────
// These assert the END-TO-END behaviour the operator asked for: a
// reference split across Deepgram finals (with a pause) and a reference
// buried inside a long continuous utterance both resolve to the correct
// address once the rolling buffer bridges the chunk boundary.
describe('transcript-rolling-buffer — cross-chunk Bible detection (PROOF)', () => {
  it('detects "John" <pause> "3:7" spoken as two separate finals', () => {
    // Single-chunk path (the old behaviour) — each chunk alone fails.
    expect(detectBestReference('John')).toBeNull()
    expect(detectBestReference('3:7')).toBeNull()

    // Rolling-buffer path — the two finals bridge and detect.
    let buf: RollingWord[] = []
    buf = pushWords(buf, 'John', 0)
    buf = pushWords(buf, '3:7', 1_500)
    const hit = detectBestReference(bufferText(buf))
    expect(hit).not.toBeNull()
    expect(hit!.book).toBe('John')
    expect(hit!.chapter).toBe(3)
    expect(hit!.verseStart).toBe(7)
    expect(hit!.confidence).toBeGreaterThanOrEqual(80)
  })

  it('detects a reference embedded in a long continuous utterance', () => {
    let buf: RollingWord[] = []
    buf = pushWords(buf, 'and the lord spoke to the people saying', 0)
    buf = pushWords(buf, 'let us turn together to Romans 8:28 and read', 500)
    const hit = detectBestReference(bufferText(buf))
    expect(hit).not.toBeNull()
    expect(hit!.book).toBe('Romans')
    expect(hit!.chapter).toBe(8)
    expect(hit!.verseStart).toBe(28)
  })

  it('detects the instant chapter:verse appears in the live interim', () => {
    // Book name already finalised; chapter:verse still interim.
    const buf: RollingWord[] = [
      { w: 'lets', at: 0 },
      { w: 'go', at: 0 },
      { w: 'to', at: 0 },
      { w: 'Genesis', at: 0 },
    ]
    expect(detectBestReference(bufferText(buf))).toBeNull()
    const hit = detectBestReference(detectionText(buf, 'chapter 1 verse 1'))
    expect(hit).not.toBeNull()
    expect(hit!.book).toBe('Genesis')
    expect(hit!.chapter).toBe(1)
    expect(hit!.verseStart).toBe(1)
  })
})
