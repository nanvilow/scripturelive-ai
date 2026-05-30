/**
 * v0.7.264 — HISTORY + QUEUE consecutive-duplicate suppression.
 *
 * Operator screenshots 2026-05-30:
 *   - Scripture Feed HISTORY pane showed "Habakkuk 1:1 MSG" ×4 and
 *     "John 3:16" ×2 back-to-back.
 *   - QUEUE pane showed "Romans 8:28" ×3 back-to-back.
 *
 * Root cause: the speech pipeline calls addToVerseHistory on every
 * re-emitted final hypothesis, and AUTO LIVE re-fires the same
 * reference frame-after-frame (the v0.7.187.2 re-mention promotion
 * mints a fresh id each time), so both lists grew with identical
 * consecutive rows. addDetectedVerse already deduped; these two paths
 * did not.
 *
 * Fix: addToVerseHistory and addScheduleItemQuiet collapse an incoming
 * entry that matches the most-recent entry (history: reference +
 * translation; queue: type + title + subtitle). A DIFFERENT entry in
 * between breaks the run, so a verse can legitimately reappear later.
 *
 * THIS TEST FAILS ON v0.7.263 and PASSES ON v0.7.264.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore, type BibleVerse, type ScheduleItem } from './store'

const g = globalThis as unknown as { localStorage?: Storage }
if (!g.localStorage) {
  const store = new Map<string, string>()
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size },
  } as Storage
}

const bv = (reference: string, translation: string, text: string): BibleVerse => {
  const [, chap = '1', vs = '1'] = reference.match(/(\d+):(\d+)/) ?? []
  return {
    reference,
    text,
    translation,
    book: reference.replace(/\s*\d+:\d+.*$/, ''),
    chapter: Number(chap),
    verseStart: Number(vs),
  }
}

const verseQ = (ref: string, translation: string): Omit<ScheduleItem, 'id' | 'addedAt'> => ({
  type: 'verse',
  title: ref,
  subtitle: translation,
  slides: [{ id: `s-${ref}`, type: 'verse', title: ref, subtitle: translation, content: ['x'], background: 'minimal' }],
})

beforeEach(() => {
  useAppStore.setState({ verseHistory: [], schedule: [] } as Partial<ReturnType<typeof useAppStore.getState>>)
})

describe('HISTORY dedup (addToVerseHistory)', () => {
  it('collapses consecutive identical verses to a single entry', () => {
    const add = useAppStore.getState().addToVerseHistory
    add(bv('Habakkuk 1:1', 'MSG', 'The problem as God gave Habakkuk to see it:'))
    add(bv('Habakkuk 1:1', 'MSG', 'The problem as God gave Habakkuk to see it:'))
    add(bv('Habakkuk 1:1', 'MSG', 'The problem as God gave Habakkuk to see it:'))
    add(bv('Habakkuk 1:1', 'MSG', 'The problem as God gave Habakkuk to see it:'))
    const h = useAppStore.getState().verseHistory
    expect(h).toHaveLength(1)
    expect(h[0].reference).toBe('Habakkuk 1:1')
  })

  it('keeps distinct verses and allows the same verse to reappear after a different one', () => {
    const add = useAppStore.getState().addToVerseHistory
    add(bv('Habakkuk 1:1', 'MSG', 'a'))
    add(bv('John 3:16', 'AMP', 'b'))
    add(bv('John 3:16', 'AMP', 'b')) // consecutive dup → collapsed
    add(bv('Habakkuk 1:1', 'MSG', 'a')) // reappears after John → allowed
    const refs = useAppStore.getState().verseHistory.map((v) => v.reference)
    // newest-first: Habakkuk, John, Habakkuk
    expect(refs).toEqual(['Habakkuk 1:1', 'John 3:16', 'Habakkuk 1:1'])
  })

  it('treats a different translation of the same reference as distinct', () => {
    const add = useAppStore.getState().addToVerseHistory
    add(bv('John 3:16', 'KJV', 'a'))
    add(bv('John 3:16', 'AMP', 'b'))
    expect(useAppStore.getState().verseHistory).toHaveLength(2)
  })
})

describe('QUEUE dedup (addScheduleItemQuiet)', () => {
  it('collapses consecutive identical verse appends to a single queue row', () => {
    const add = useAppStore.getState().addScheduleItemQuiet
    const id1 = add(verseQ('Romans 8:28', 'KJV'))
    const id2 = add(verseQ('Romans 8:28', 'KJV'))
    const id3 = add(verseQ('Romans 8:28', 'KJV'))
    const sched = useAppStore.getState().schedule
    expect(sched).toHaveLength(1)
    expect(sched[0].title).toBe('Romans 8:28')
    // skipped appends return the existing row id
    expect(id2).toBe(id1)
    expect(id3).toBe(id1)
  })

  it('keeps distinct verses and allows the same verse after a different one', () => {
    const add = useAppStore.getState().addScheduleItemQuiet
    add(verseQ('Romans 8:28', 'KJV'))
    add(verseQ('John 3:16', 'KJV'))
    add(verseQ('Romans 8:28', 'KJV')) // not consecutive → appended
    const titles = useAppStore.getState().schedule.map((s) => s.title)
    expect(titles).toEqual(['Romans 8:28', 'John 3:16', 'Romans 8:28'])
  })
})
