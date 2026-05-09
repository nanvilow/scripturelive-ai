// v0.7.137 — Generalised wldeh/bible-api fetcher.
//
// Originally Twi-only (v0.7.77, slug `tw-wakna`). v0.7.137 generalises
// the same chapter-fetch + cache plumbing across multiple Ghanaian
// translations sourced from the same dataset:
//
//   TWI         → tw-wakna  (Akuapem Twi, Biblica Open 2020)
//   TWIASANTE   → tw-wasna  (Asante Twi  / "Twerɛ Kronkron", Biblica Open 2020)
//   EWE         → ee-oal    (Ewe         / "Agbenya La",      Biblica Open 2020)
//
// Each chapter file at
//   raw.githubusercontent.com/wldeh/bible-api/master/bibles/<slug>
//   /books/<book-slug>/chapters/<N>.json
// returns `{ data: [{book, chapter, verse, text}, ...] }`.
//
// We expose a generic `fetchWldehVerse` / `fetchWldehChapter` taking
// the translation key and route through `WLDEH_TRANSLATIONS`. The
// legacy `fetchTwiVerse` / `fetchTwiChapter` exports are preserved as
// thin wrappers so callers that imported them before v0.7.137 keep
// working unchanged.
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
const TWI_AKUAPEM_BOOK_SLUG: Record<string, string> = {
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

// Asante Twi (tw-wasna). Verified against
// `GET /repos/wldeh/bible-api/contents/bibles/tw-wasna/books`.
// Differs from Akuapem mainly by the open-o suffix `ɔ` on plural
// people-of nouns ("…fo" → "…foɔ") and `ɛ` insertion in some words.
const TWI_ASANTE_BOOK_SLUG: Record<string, string> = {
  Genesis: '1mose', Exodus: '2mose', Leviticus: '3mose',
  Numbers: '4mose', Deuteronomy: '5mose',
  Joshua: 'yosua', Judges: 'atemmufoɔ', Ruth: 'rut',
  '1 Samuel': '1samuel', '2 Samuel': '2samuel',
  '1 Kings': '1ahemfo', '2 Kings': '2ahemfo',
  '1 Chronicles': '1berɛsosɛm', '2 Chronicles': '2berɛsosɛm',
  Ezra: 'ɛsra', Nehemiah: 'nehemia', Esther: 'ɛster',
  Job: 'hiob', Psalms: 'nnwom', Proverbs: 'mmɛbusɛm',
  Ecclesiastes: 'ɔsɛnkafoɔ', 'Song of Solomon': 'nnwommudwom',
  Isaiah: 'yesaia', Jeremiah: 'yeremia', Lamentations: 'kwadwom',
  Ezekiel: 'hesekiel', Daniel: 'daniel',
  Hosea: 'hosea', Joel: 'yoɛl', Amos: 'amos', Obadiah: 'obadia',
  Jonah: 'yona', Micah: 'mika', Nahum: 'nahum', Habakkuk: 'habakuk',
  Zephaniah: 'sefania', Haggai: 'hagai', Zechariah: 'sakaria',
  Malachi: 'malaki',
  Matthew: 'mateo', Mark: 'marko', Luke: 'luka', John: 'yohane',
  Acts: 'asomafoɔ',
  Romans: 'romafoɔ',
  '1 Corinthians': '1korintofoɔ', '2 Corinthians': '2korintofoɔ',
  Galatians: 'galatifoɔ', Ephesians: 'efesofoɔ',
  Philippians: 'filipifoɔ', Colossians: 'kolosefoɔ',
  '1 Thessalonians': '1tesalonikafoɔ', '2 Thessalonians': '2tesalonikafoɔ',
  '1 Timothy': '1timoteo', '2 Timothy': '2timoteo',
  Titus: 'tito', Philemon: 'filemon',
  Hebrews: 'hebrifoɔ', James: 'yakobo',
  '1 Peter': '1petro', '2 Peter': '2petro',
  '1 John': '1yohane', '2 John': '2yohane', '3 John': '3yohane',
  Jude: 'yuda', Revelation: 'adiyisɛm',
}

// Ewe (ee-oal — Biblica Open Agbenya La 2020, Ghana). Verified
// against `GET /repos/wldeh/bible-api/contents/bibles/ee-oal/books`.
// Note: Pentateuch uses Mose POSTFIX ordinal ("mose1"…"mose5"),
// inverse of the Twi PREFIX convention. Judges = `ʋɔnudrɔ̃lawo`
// (literally "judges") with U+028B Ʋ — this matters because URL
// encoding needs to handle non-Latin1 chars cleanly (encodeURIComponent
// in fetchWldehChapterRaw handles this).
const EWE_BOOK_SLUG: Record<string, string> = {
  Genesis: 'mose1', Exodus: 'mose2', Leviticus: 'mose3',
  Numbers: 'mose4', Deuteronomy: 'mose5',
  Joshua: 'yosua', Judges: 'ʋɔnudrɔ̃lawo', Ruth: 'rut',
  '1 Samuel': 'samuel1', '2 Samuel': 'samuel2',
  '1 Kings': 'fiawo1', '2 Kings': 'fiawo2',
  '1 Chronicles': 'kronika1', '2 Chronicles': 'kronika2',
  Ezra: 'ezra', Nehemiah: 'nehemia', Esther: 'ester',
  Job: 'hiob', Psalms: 'psalmowo', Proverbs: 'lododowo',
  Ecclesiastes: 'nyagblɔla', 'Song of Solomon': 'hawo',
  Isaiah: 'yesaya', Jeremiah: 'yeremia', Lamentations: 'konyifahawo',
  Ezekiel: 'hezekiel', Daniel: 'daniel',
  Hosea: 'hosea', Joel: 'yoel', Amos: 'amos', Obadiah: 'obadia',
  Jonah: 'yona', Micah: 'mika', Nahum: 'nahum', Habakkuk: 'habakuk',
  Zephaniah: 'zefania', Haggai: 'hagai', Zechariah: 'zekaria',
  Malachi: 'malaki',
  Matthew: 'mateo', Mark: 'marko', Luke: 'luka', John: 'yohanes',
  Acts: 'dɔwɔwɔwo',
  Romans: 'romatɔwo',
  '1 Corinthians': 'korintotɔwo1', '2 Corinthians': 'korintotɔwo2',
  Galatians: 'galatiatɔwo', Ephesians: 'efesotɔwo',
  Philippians: 'filipitɔwo', Colossians: 'kolosetɔwo',
  '1 Thessalonians': 'tesalonikatɔwo1', '2 Thessalonians': 'tesalonikatɔwo2',
  '1 Timothy': 'timoteo1', '2 Timothy': 'timoteo2',
  Titus: 'tito', Philemon: 'filemon',
  Hebrews: 'hebritɔwo', James: 'yakobo',
  '1 Peter': 'petro1', '2 Peter': 'petro2',
  '1 John': 'yohanes1', '2 John': 'yohanes2', '3 John': 'yohanes3',
  Jude: 'yuda', Revelation: 'nyaɖeɖefia',
}

export type WldehKey = 'TWI' | 'TWIASANTE' | 'EWE'

export const WLDEH_TRANSLATIONS: Record<WldehKey, { cdnSlug: string; bookSlugs: Record<string, string> }> = {
  TWI:       { cdnSlug: 'tw-wakna', bookSlugs: TWI_AKUAPEM_BOOK_SLUG },
  TWIASANTE: { cdnSlug: 'tw-wasna', bookSlugs: TWI_ASANTE_BOOK_SLUG },
  EWE:       { cdnSlug: 'ee-oal',   bookSlugs: EWE_BOOK_SLUG },
}

const WLDEH_CDN_BASE = 'https://cdn.jsdelivr.net/gh/wldeh/bible-api/bibles'

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
// switches (e.g. operator toggles NIV ↔ TWI back and forth). Keyed by
// translation+book+chapter so the three wldeh translations cannot
// collide.
const chapterCache = new Map<string, Array<{ verse: number; text: string }>>()

function isWldehKey(s: string): s is WldehKey {
  return s === 'TWI' || s === 'TWIASANTE' || s === 'EWE'
}

async function fetchWldehChapterRaw(
  translation: WldehKey,
  book: string,
  chapter: number,
): Promise<Array<{ verse: number; text: string }> | null> {
  const cfg = WLDEH_TRANSLATIONS[translation]
  if (!cfg) return null
  const slug = cfg.bookSlugs[book]
  if (!slug) return null
  const cacheKey = `${translation}/${slug}/${chapter}`
  const hit = chapterCache.get(cacheKey)
  if (hit) return hit

  const url = `${WLDEH_CDN_BASE}/${cfg.cdnSlug}/books/${encodeURIComponent(slug)}/chapters/${chapter}.json`
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

export async function fetchWldehVerse(
  parsed: { book: string; chapter: number; verseStart: number; verseEnd?: number },
  reference: string,
  translation: string,
): Promise<BibleVerse | null> {
  if (!isWldehKey(translation)) return null
  const verses = await fetchWldehChapterRaw(translation, parsed.book, parsed.chapter)
  if (!verses) return null
  const start = parsed.verseStart
  const end = parsed.verseEnd ?? parsed.verseStart
  const wanted = verses.filter((v) => v.verse >= start && v.verse <= end)
  if (wanted.length === 0) return null
  return {
    reference,
    text: wanted.map((v) => v.text).join('\n'),
    translation,
    book: parsed.book,
    chapter: parsed.chapter,
    verseStart: start,
    verseEnd: parsed.verseEnd,
  }
}

export async function fetchWldehChapter(
  book: string,
  chapter: number,
  translation: string,
): Promise<BibleChapter | null> {
  if (!isWldehKey(translation)) return null
  const verses = await fetchWldehChapterRaw(translation, book, chapter)
  if (!verses) return null
  return { book, chapter, translation, verses }
}

export function isWldehBookSupported(book: string, translation: string): boolean {
  if (!isWldehKey(translation)) return false
  return book in WLDEH_TRANSLATIONS[translation].bookSlugs
}

// ── Backward-compat shims (TWI = Akuapem) for pre-v0.7.137 callers ──
export const TWI_BOOK_SLUG = TWI_AKUAPEM_BOOK_SLUG
export function fetchTwiVerse(
  parsed: { book: string; chapter: number; verseStart: number; verseEnd?: number },
  reference: string,
): Promise<BibleVerse | null> {
  return fetchWldehVerse(parsed, reference, 'TWI')
}
export function fetchTwiChapter(book: string, chapter: number): Promise<BibleChapter | null> {
  return fetchWldehChapter(book, chapter, 'TWI')
}
export function isTwiBookSupported(book: string): boolean {
  return isWldehBookSupported(book, 'TWI')
}
