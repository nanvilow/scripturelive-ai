// v0.7.77 — Twi (Akuapem) Bible fetcher.
//
// Sourced from the public-domain wldeh/bible-api dataset on GitHub
// (https://github.com/wldeh/bible-api), translation slug `tw-wakna`.
// Each chapter file at
//   raw.githubusercontent.com/wldeh/bible-api/master/bibles/tw-wakna
//   /books/<twi-slug>/chapters/<N>.json
// returns `{ data: [{book, chapter, verse, text}, ...] }`.
//
// We expose two helpers shaped exactly like the bolls fetchers in
// bible-api.ts so the existing translation-routing in
// fetchBibleVerseFromAPI / fetchBibleChapterFromAPI can delegate to
// us without further plumbing.
//
// jsdelivr is used as the CDN so each chapter response is cached at
// the edge — important during a live service, where the same passage
// (e.g. "John 3:16") may be re-fetched several times across the
// operator/preview/live/NDI/congregation pipelines.

import type { BibleVerse } from '@/lib/store'
import type { BibleChapter } from '@/lib/bible-api'

// English-canonical book name → Twi slug used by wldeh/bible-api in
// the tw-wakna directory listing. Verified against
// `GET /repos/wldeh/bible-api/contents/bibles/tw-wakna/books`.
// Genesis–Deuteronomy use Mose (Moses) ordinal naming, which is the
// standard Akuapem Bible convention.
const TWI_BOOK_SLUG: Record<string, string> = {
  // Pentateuch
  Genesis: '1mose', Exodus: '2mose', Leviticus: '3mose',
  Numbers: '4mose', Deuteronomy: '5mose',
  // History
  Joshua: 'yosua', Judges: 'atemmufo', Ruth: 'rut',
  '1 Samuel': '1samuel', '2 Samuel': '2samuel',
  '1 Kings': '1ahemfo', '2 Kings': '2ahemfo',
  '1 Chronicles': '1beresosɛm', '2 Chronicles': '2beresosɛm',
  Ezra: 'ɛsra', Nehemiah: 'nehemia', Esther: 'ɛster',
  // Wisdom / Poetry
  Job: 'hiob', Psalms: 'nnwom', Proverbs: 'mmebusɛm',
  Ecclesiastes: 'ɔsɛnkafo', 'Song of Solomon': 'nnwommudwom',
  // Major prophets
  Isaiah: 'yesaia', Jeremiah: 'yeremia', Lamentations: 'kwadwom',
  Ezekiel: 'hesekiel', Daniel: 'daniel',
  // Minor prophets
  Hosea: 'hosea', Joel: 'yoɛl', Amos: 'amos', Obadiah: 'obadia',
  Jonah: 'yona', Micah: 'mika', Nahum: 'nahum', Habakkuk: 'habakuk',
  Zephaniah: 'sefania', Haggai: 'hagai', Zechariah: 'sakaria',
  Malachi: 'malaki',
  // Gospels + Acts
  Matthew: 'mateo', Mark: 'marko', Luke: 'luka', John: 'yohane',
  Acts: 'asomafo',
  // Pauline epistles
  Romans: 'romafo',
  '1 Corinthians': '1korintofo', '2 Corinthians': '2korintofo',
  Galatians: 'galatifo', Ephesians: 'efesofo',
  Philippians: 'filipifo', Colossians: 'kolosefo',
  '1 Thessalonians': '1tesalonikafo', '2 Thessalonians': '2tesalonikafo',
  '1 Timothy': '1timoteo', '2 Timothy': '2timoteo',
  Titus: 'tito', Philemon: 'filemon',
  // General epistles + Revelation
  Hebrews: 'hebrifo', James: 'yakobo',
  '1 Peter': '1petro', '2 Peter': '2petro',
  '1 John': '1yohane', '2 John': '2yohane', '3 John': '3yohane',
  Jude: 'yuda', Revelation: 'adiyisɛm',
}

const WLDEH_CDN = 'https://cdn.jsdelivr.net/gh/wldeh/bible-api/bibles/tw-wakna'

type WldehChapterResponse = {
  data?: Array<{
    book?: string
    chapter?: string | number
    verse?: string | number
    text?: string
  }>
}

// In-memory chapter cache so a passage that has already been fetched
// once during the session resolves instantly on subsequent translation
// switches (e.g. operator toggles NIV ↔ TWI back and forth).
const chapterCache = new Map<string, Array<{ verse: number; text: string }>>()

async function fetchTwiChapterRaw(
  book: string,
  chapter: number,
): Promise<Array<{ verse: number; text: string }> | null> {
  const slug = TWI_BOOK_SLUG[book]
  if (!slug) return null
  const cacheKey = `${slug}/${chapter}`
  const hit = chapterCache.get(cacheKey)
  if (hit) return hit

  const url = `${WLDEH_CDN}/books/${encodeURIComponent(slug)}/chapters/${chapter}.json`
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!r.ok) return null
    const json = (await r.json()) as WldehChapterResponse
    const rows = Array.isArray(json.data) ? json.data : []
    const verses = rows
      .map((row) => ({
        verse: typeof row.verse === 'string' ? parseInt(row.verse, 10) : Number(row.verse ?? 0),
        text: typeof row.text === 'string' ? row.text.trim() : '',
      }))
      .filter((v) => Number.isFinite(v.verse) && v.verse > 0 && v.text.length > 0)
    if (verses.length === 0) return null
    chapterCache.set(cacheKey, verses)
    return verses
  } catch {
    return null
  }
}

export async function fetchTwiVerse(
  parsed: { book: string; chapter: number; verseStart: number; verseEnd?: number },
  reference: string,
): Promise<BibleVerse | null> {
  const verses = await fetchTwiChapterRaw(parsed.book, parsed.chapter)
  if (!verses) return null
  const start = parsed.verseStart
  const end = parsed.verseEnd ?? parsed.verseStart
  const wanted = verses.filter((v) => v.verse >= start && v.verse <= end)
  if (wanted.length === 0) return null
  return {
    reference,
    text: wanted.map((v) => v.text).join('\n'),
    translation: 'TWI',
    book: parsed.book,
    chapter: parsed.chapter,
    verseStart: start,
    verseEnd: parsed.verseEnd,
  }
}

export async function fetchTwiChapter(
  book: string,
  chapter: number,
): Promise<BibleChapter | null> {
  const verses = await fetchTwiChapterRaw(book, chapter)
  if (!verses) return null
  return { book, chapter, translation: 'TWI', verses }
}

export function isTwiBookSupported(book: string): boolean {
  return book in TWI_BOOK_SLUG
}
