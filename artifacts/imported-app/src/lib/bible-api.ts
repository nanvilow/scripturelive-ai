import type { BibleTranslation, BibleVerse } from './store'

// ──────────────────────────────────────────────
// Book aliases and names
// ──────────────────────────────────────────────
const BOOK_ALIASES: Record<string, string> = {
  gen: 'Genesis', ex: 'Exodus', exo: 'Exodus', lev: 'Leviticus',
  num: 'Numbers', deut: 'Deuteronomy', jos: 'Joshua', judg: 'Judges',
  ruth: 'Ruth', '1 sam': '1 Samuel', '2 sam': '2 Samuel',
  '1 ki': '1 Kings', '2 ki': '2 Kings', '1 chron': '1 Chronicles',
  '2 chron': '2 Chronicles', ezra: 'Ezra', neh: 'Nehemiah',
  esth: 'Esther', job: 'Job', ps: 'Psalms', psalm: 'Psalms',
  prov: 'Proverbs', eccl: 'Ecclesiastes', song: 'Song of Solomon',
  isa: 'Isaiah', jer: 'Jeremiah', lam: 'Lamentations',
  eze: 'Ezekiel', dan: 'Daniel', hos: 'Hosea', joel: 'Joel',
  amos: 'Amos', obad: 'Obadiah', jonah: 'Jonah', mic: 'Micah',
  nah: 'Nahum', hab: 'Habakkuk', zeph: 'Zephaniah', hag: 'Haggai',
  zech: 'Zechariah', mal: 'Malachi', matt: 'Matthew', mt: 'Matthew',
  mark: 'Mark', mk: 'Mark', lk: 'Luke', luke: 'Luke',
  jn: 'John', john: 'John', acts: 'Acts', rom: 'Romans',
  '1 cor': '1 Corinthians', '2 cor': '2 Corinthians',
  gal: 'Galatians', eph: 'Ephesians', phil: 'Philippians',
  col: 'Colossians', '1 thess': '1 Thessalonians',
  '2 thess': '2 Thessalonians', '1 tim': '1 Timothy',
  '2 tim': '2 Timothy', tit: 'Titus', phlm: 'Philemon',
  heb: 'Hebrews', jas: 'James', '1 pet': '1 Peter',
  '2 pet': '2 Peter', '1 john': '1 John', '2 john': '2 John',
  '3 john': '3 John', jude: 'Jude', rev: 'Revelation',
}

const BOOK_NAMES = Object.values(BOOK_ALIASES)

// ──────────────────────────────────────────────
// Chapter counts per book — used for prev/next chapter navigation
// ──────────────────────────────────────────────
export const BOOK_CHAPTER_COUNTS: Record<string, number> = {
  'Genesis': 50, 'Exodus': 40, 'Leviticus': 27, 'Numbers': 36, 'Deuteronomy': 34,
  'Joshua': 24, 'Judges': 21, 'Ruth': 4, '1 Samuel': 31, '2 Samuel': 24,
  '1 Kings': 22, '2 Kings': 25, '1 Chronicles': 29, '2 Chronicles': 36,
  'Ezra': 10, 'Nehemiah': 13, 'Esther': 10, 'Job': 42, 'Psalms': 150,
  'Proverbs': 31, 'Ecclesiastes': 12, 'Song of Solomon': 8, 'Isaiah': 66,
  'Jeremiah': 52, 'Lamentations': 5, 'Ezekiel': 48, 'Daniel': 12, 'Hosea': 14,
  'Joel': 3, 'Amos': 9, 'Obadiah': 1, 'Jonah': 4, 'Micah': 7, 'Nahum': 3,
  'Habakkuk': 3, 'Zephaniah': 3, 'Haggai': 2, 'Zechariah': 14, 'Malachi': 4,
  'Matthew': 28, 'Mark': 16, 'Luke': 24, 'John': 21, 'Acts': 28, 'Romans': 16,
  '1 Corinthians': 16, '2 Corinthians': 13, 'Galatians': 6, 'Ephesians': 6,
  'Philippians': 4, 'Colossians': 4, '1 Thessalonians': 5, '2 Thessalonians': 3,
  '1 Timothy': 6, '2 Timothy': 4, 'Titus': 3, 'Philemon': 1, 'Hebrews': 13,
  'James': 5, '1 Peter': 5, '2 Peter': 3, '1 John': 5, '2 John': 1, '3 John': 1,
  'Jude': 1, 'Revelation': 22,
}

// Canonical book order — used for crossing book boundaries during nav.
export const BOOK_ORDER: string[] = Object.keys(BOOK_CHAPTER_COUNTS)

export function getNextChapter(book: string, chapter: number): { book: string; chapter: number } | null {
  const max = BOOK_CHAPTER_COUNTS[book]
  if (!max) return null
  if (chapter < max) return { book, chapter: chapter + 1 }
  const idx = BOOK_ORDER.indexOf(book)
  if (idx >= 0 && idx < BOOK_ORDER.length - 1) {
    return { book: BOOK_ORDER[idx + 1], chapter: 1 }
  }
  return null
}

export function getPrevChapter(book: string, chapter: number): { book: string; chapter: number } | null {
  if (chapter > 1) return { book, chapter: chapter - 1 }
  const idx = BOOK_ORDER.indexOf(book)
  if (idx > 0) {
    const prevBook = BOOK_ORDER[idx - 1]
    return { book: prevBook, chapter: BOOK_CHAPTER_COUNTS[prevBook] }
  }
  return null
}

// ──────────────────────────────────────────────
// Whole-chapter fetch — used by the library's chapter browser
// ──────────────────────────────────────────────
export type ChapterVerse = { verse: number; text: string }
export type BibleChapter = {
  book: string
  chapter: number
  translation: string
  verses: ChapterVerse[]
}

export async function fetchBibleChapterFromAPI(
  book: string,
  chapter: number,
  translation: string = 'KJV',
): Promise<BibleChapter | null> {
  try {
    const info = TRANSLATIONS_INFO[translation]
    // Modern translations via bolls.life
    if (info?.source === 'bolls') {
      const bolls = await fetchChapterFromBolls(book, chapter, info.abbreviation)
      if (bolls) return bolls
      // Fall through to bible-api.com if bolls fails
    }
    const apiTrans = TRANSLATION_MAP[translation] || 'kjv'
    const ref = `${book.replace(/\s+/g, '+')}+${chapter}`
    const tryFetch = async (t: string) => {
      const r = await fetch(`${BIBLE_API_BASE}/${ref}?translation=${t}`, {
        headers: { Accept: 'application/json' },
      })
      if (!r.ok) return null
      return r.json()
    }
    let data = await tryFetch(apiTrans)
    if (!data && translation !== 'KJV') data = await tryFetch('kjv')
    if (!data || !Array.isArray(data.verses)) return null
    return {
      book,
      chapter,
      translation: info?.source === 'bolls' ? `${translation} (KJV used)` : translation,
      verses: data.verses.map((v: { verse: number; text: string }) => ({
        verse: v.verse,
        text: (v.text || '').trim(),
      })),
    }
  } catch (e) {
    console.error('Error fetching Bible chapter from API:', e)
    return null
  }
}

export async function fetchBibleChapter(
  book: string,
  chapter: number,
  translation: string = 'KJV',
): Promise<BibleChapter | null> {
  try {
    const params = new URLSearchParams({ book, chapter: String(chapter), translation })
    const r = await fetch(`/api/bible?${params.toString()}`)
    if (!r.ok) return null
    const data = await r.json()
    if (!data || !Array.isArray(data.verses)) return null
    return data as BibleChapter
  } catch (e) {
    console.error('Error fetching chapter:', e)
    return null
  }
}

// ──────────────────────────────────────────────
// All available Bible translations
// ──────────────────────────────────────────────
// Bible translations actually served by the upstream APIs we use
// (bible-api.com for verse/chapter, bolls.life as a fallback for modern
// versions). Modern copyrighted translations (NIV/ESV/NLT/NASB/MSG) are
// proxied through bolls.life when available; KJV/ASV/WEB/etc. use bible-api.com
// directly. All entries here return their *actual* translation text — no silent
// KJV fallback for the user.
export const TRANSLATIONS_INFO: Record<string, { name: string; full: string; abbreviation: string; source: 'bible-api' | 'bolls' }> = {
  KJV: { name: 'KJV', full: 'King James Version', abbreviation: 'kjv', source: 'bible-api' },
  ASV: { name: 'ASV', full: 'American Standard Version', abbreviation: 'asv', source: 'bible-api' },
  WEB: { name: 'WEB', full: 'World English Bible', abbreviation: 'web', source: 'bible-api' },
  BBE: { name: 'BBE', full: 'Bible in Basic English', abbreviation: 'bbe', source: 'bible-api' },
  YLT: { name: 'YLT', full: "Young's Literal Translation", abbreviation: 'ylt', source: 'bible-api' },
  DARBY: { name: 'DARBY', full: 'Darby Translation', abbreviation: 'darby', source: 'bible-api' },
  OEB: { name: 'OEB', full: 'Open English Bible', abbreviation: 'oeb-cw', source: 'bible-api' },
  // Modern versions via bolls.life
  ESV: { name: 'ESV', full: 'English Standard Version', abbreviation: 'ESV', source: 'bolls' },
  NIV: { name: 'NIV', full: 'New International Version', abbreviation: 'NIV', source: 'bolls' },
  NLT: { name: 'NLT', full: 'New Living Translation', abbreviation: 'NLT', source: 'bolls' },
  NKJV: { name: 'NKJV', full: 'New King James Version', abbreviation: 'NKJV', source: 'bolls' },
  NASB: { name: 'NASB', full: 'New American Standard Bible', abbreviation: 'NASB', source: 'bolls' },
  AMP: { name: 'AMP', full: 'Amplified Bible', abbreviation: 'AMP', source: 'bolls' },
  CSB: { name: 'CSB', full: 'Christian Standard Bible', abbreviation: 'CSB', source: 'bolls' },
  MSG: { name: 'MSG', full: 'The Message', abbreviation: 'MSG', source: 'bolls' },
  RSV: { name: 'RSV', full: 'Revised Standard Version', abbreviation: 'RSV', source: 'bolls' },
}

// API translation mapping (bible-api.com slugs only; bolls translations use the key directly)
export const TRANSLATION_MAP: Record<string, string> = {
  KJV: 'kjv', ASV: 'asv', WEB: 'web', OEB: 'oeb-cw', BBE: 'bbe',
  YLT: 'ylt', DARBY: 'darby',
}

// ──────────────────────────────────────────────
// Verse patterns for detection (stronger patterns)
// ──────────────────────────────────────────────
const BOOK_NAMES_PATTERN = 'Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|1\\s*Samuel|2\\s*Samuel|1\\s*Kings|2\\s*Kings|1\\s*Chronicles|2\\s*Chronicles|Ezra|Nehemiah|Esther|Job|Psalms?|Proverbs|Ecclesiastes|Song\\s*of\\s*Solomon|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|1\\s*Corinthians|2\\s*Corinthians|Galatians|Ephesians|Philippians|Colossians|1\\s*Thessalonians|2\\s*Thessalonians|1\\s*Timothy|2\\s*Timothy|Titus|Philemon|Hebrews|James|1\\s*Peter|2\\s*Peter|1\\s*John|2\\s*John|3\\s*John|Jude|Revelation'

const BOOK_ABBR_PATTERN = 'Gen|Exo?|Lev|Num|Deut|Josh?|Judg|Ruth|1?\\s*Sam|2?\\s*Sam|1?\\s*Ki|2?\\s*Ki|1?\\s*Chron|2?\\s*Chron|Ezra?|Neh|Esth|Job|Ps|Prov|Eccl|Song|Isa|Jer|Lam|Eze|Dan|Hos|Joel|Amos|Obad|Jonah|Mic|Nah|Hab|Zeph|Hag|Zech|Mal|Matt?|Mark?|LK?|Jn|John|Acts?|Rom|1?\\s*Cor|2?\\s*Cor|Gal|Eph|Phil|Col|1?\\s*Thess|2?\\s*Thess|1?\\s*Tim|2?\\s*Tim|Tit|Phlm|Heb|Jas|1?\\s*Pet|2?\\s*Pet|1?\\s*Jn|2?\\s*Jn|3?\\s*Jn|Jude|Rev'

const VERSE_NUM = '(\\d{1,3})(?::(\\d{1,3})(?:\\s*[-\\u2013]\\s*(\\d{1,3}))?)?'

export const VERSE_PATTERNS = [
  // "Book Chapter:Verse" or "Book Chapter Verse" (full names)
  new RegExp(`([1-3]?\\s*(?:${BOOK_NAMES_PATTERN}))\\s+${VERSE_NUM}`, 'gi'),
  // Abbreviated form "Gen 3:16"
  new RegExp(`\\b(${BOOK_ABBR_PATTERN})\\s+${VERSE_NUM}`, 'gi'),
  // Conversational: "Book chapter X verse Y" (full names)
  new RegExp(`([1-3]?\\s*(?:${BOOK_NAMES_PATTERN}))\\s+chapter\\s+(\\d{1,3})\\s*(?:,?\\s*(?:verse|verses?|vs?\\.?|v)\\.?\\s*(\\d{1,3})(?:\\s*[-\\u2013toand]+\\s*(\\d{1,3}))?)?`, 'gi'),
  // Conversational abbreviated: "Gen chapter 3 verse 16" / "Gen ch3 v16"
  new RegExp(`\\b(${BOOK_ABBR_PATTERN})\\s+ch(?:apter)?\\.?\\s*(\\d{1,3})\\s*(?:,?\\s*(?:v(?:erse|s|s\\.?)?|vs?\\.?)\\.?\\s*(\\d{1,3})(?:\\s*[-\\u2013toand]+\\s*(\\d{1,3}))?)?`, 'gi'),
  // Patterns with context: "turn to [Book] X:Y" / "read in [Book] X:Y" / "as we see in [Book] X:Y"
  new RegExp(`(?:turn\\s+to|read\\s+(?:in|from)|look\\s+at|go\\s+to|see|find|open\\s+(?:your\\s+bibles?\\s+to|to)|as\\s+(?:we\\s+)?(?:read|see|find)\\s+in|according\\s+to)\\s+([1-3]?\\s*(?:${BOOK_NAMES_PATTERN}))\\s+${VERSE_NUM}`, 'gi'),
  // "the Bible says in [Book] X:Y" / "Scripture says [Book] X:Y" / "in [Book] X:Y"
  new RegExp(`(?:the\\s+(?:Bible|bible|Word|word|scripture|Scripture)\\s+(?:says?|tells?\\s+us|declares?|teaches?)\\s+(?:in\\s+)?)?([1-3]?\\s*(?:${BOOK_NAMES_PATTERN}))\\s+${VERSE_NUM}`, 'gi'),
]

function normalizeBookName(raw: string | undefined): string | null {
  if (!raw) return null
  const normalized = raw.trim().replace(/\s+/g, ' ').toLowerCase()
  for (const [alias, fullName] of Object.entries(BOOK_ALIASES)) {
    if (normalized === alias.toLowerCase() || normalized === fullName.toLowerCase()) {
      return fullName
    }
  }
  return null
}

function formatReference(book: string, chapter: number, verseStart: number, verseEnd?: number): string {
  return verseEnd ? `${book} ${chapter}:${verseStart}-${verseEnd}` : `${book} ${chapter}:${verseStart}`
}

export function parseVerseReference(input: string): {
  reference: string
  book: string
  chapter: number
  verseStart: number
  verseEnd?: number
} | null {
  const cleaned = input.trim()
  for (const pattern of VERSE_PATTERNS) {
    // Remove 'g' flag for match() so capture groups work correctly
    const flags = pattern.flags.replace('g', '')
    const nonGlobalPattern = new RegExp(pattern.source, flags)
    const match = cleaned.match(nonGlobalPattern)
    if (match) {
      const bookRaw = match[1]
      const chapter = parseInt(match[2])
      const verseStart = match[3] ? parseInt(match[3]) : 1
      const verseEnd = match[4] ? parseInt(match[4]) : undefined
      const book = normalizeBookName(bookRaw)
      if (book) {
        return {
          reference: formatReference(book, chapter, verseStart, verseEnd),
          book,
          chapter,
          verseStart,
          verseEnd,
        }
      }
    }
  }
  return null
}

export function detectVersesInText(text: string): string[] {
  const references: string[] = []
  for (const pattern of VERSE_PATTERNS) {
    let match
    const regex = new RegExp(pattern.source, pattern.flags)
    while ((match = regex.exec(text)) !== null) {
      const book = normalizeBookName(match[1])
      if (book) {
        const chapter = parseInt(match[2])
        const verseStart = match[3] ? parseInt(match[3]) : 1
        const verseEnd = match[4] ? parseInt(match[4]) : undefined
        references.push(formatReference(book, chapter, verseStart, verseEnd))
      }
    }
  }
  return [...new Set(references)]
}

// ──────────────────────────────────────────────
// Autocomplete helper for Bible search
// ──────────────────────────────────────────────
const ALL_BOOK_ENTRIES: { name: string; aliases: string[] }[] = [
  { name: 'Genesis', aliases: ['gen', 'ge'] },
  { name: 'Exodus', aliases: ['exo', 'ex', 'exod'] },
  { name: 'Leviticus', aliases: ['lev', 'le', 'lv'] },
  { name: 'Numbers', aliases: ['num', 'nu', 'nm', 'nb'] },
  { name: 'Deuteronomy', aliases: ['deut', 'de', 'dt'] },
  { name: 'Joshua', aliases: ['josh', 'jos', 'jsh'] },
  { name: 'Judges', aliases: ['judg', 'jg', 'jdgs'] },
  { name: 'Ruth', aliases: ['ruth', 'ru'] },
  { name: '1 Samuel', aliases: ['1 sam', '1sam', '1sm'] },
  { name: '2 Samuel', aliases: ['2 sam', '2sam', '2sm'] },
  { name: '1 Kings', aliases: ['1 ki', '1ki', '1kgs'] },
  { name: '2 Kings', aliases: ['2 ki', '2ki', '2kgs'] },
  { name: '1 Chronicles', aliases: ['1 chron', '1chron', '1chr'] },
  { name: '2 Chronicles', aliases: ['2 chron', '2chron', '2chr'] },
  { name: 'Ezra', aliases: ['ezra', 'ezr'] },
  { name: 'Nehemiah', aliases: ['neh', 'ne'] },
  { name: 'Esther', aliases: ['esth', 'es', 'est'] },
  { name: 'Job', aliases: ['job'] },
  { name: 'Psalms', aliases: ['ps', 'psa', 'psalm', 'psm'] },
  { name: 'Proverbs', aliases: ['prov', 'pr', 'prv'] },
  { name: 'Ecclesiastes', aliases: ['eccl', 'ecc', 'ec'] },
  { name: 'Song of Solomon', aliases: ['song', 'sos', 'ss'] },
  { name: 'Isaiah', aliases: ['isa', 'is'] },
  { name: 'Jeremiah', aliases: ['jer', 'je', 'jm'] },
  { name: 'Lamentations', aliases: ['lam', 'la'] },
  { name: 'Ezekiel', aliases: ['eze', 'ezk'] },
  { name: 'Daniel', aliases: ['dan', 'dn'] },
  { name: 'Hosea', aliases: ['hos', 'ho'] },
  { name: 'Joel', aliases: ['joel', 'jl'] },
  { name: 'Amos', aliases: ['amos', 'am'] },
  { name: 'Obadiah', aliases: ['obad', 'ob'] },
  { name: 'Jonah', aliases: ['jonah', 'jon', 'jnh'] },
  { name: 'Micah', aliases: ['mic', 'mi'] },
  { name: 'Nahum', aliases: ['nah', 'na'] },
  { name: 'Habakkuk', aliases: ['hab', 'hk'] },
  { name: 'Zephaniah', aliases: ['zeph', 'zp'] },
  { name: 'Haggai', aliases: ['hag', 'hg'] },
  { name: 'Zechariah', aliases: ['zech', 'zc'] },
  { name: 'Malachi', aliases: ['mal', 'ml'] },
  { name: 'Matthew', aliases: ['matt', 'mt', 'math'] },
  { name: 'Mark', aliases: ['mark', 'mk', 'mr'] },
  { name: 'Luke', aliases: ['luke', 'lk', 'lc'] },
  { name: 'John', aliases: ['john', 'jn', 'joh'] },
  { name: 'Acts', aliases: ['acts', 'ac'] },
  { name: 'Romans', aliases: ['rom', 'ro', 'rm'] },
  { name: '1 Corinthians', aliases: ['1 cor', '1cor', '1co'] },
  { name: '2 Corinthians', aliases: ['2 cor', '2cor', '2co'] },
  { name: 'Galatians', aliases: ['gal', 'ga'] },
  { name: 'Ephesians', aliases: ['eph', 'ep'] },
  { name: 'Philippians', aliases: ['phil', 'php', 'pp'] },
  { name: 'Colossians', aliases: ['col', 'co'] },
  { name: '1 Thessalonians', aliases: ['1 thess', '1thess', '1th'] },
  { name: '2 Thessalonians', aliases: ['2 thess', '2thess', '2th'] },
  { name: '1 Timothy', aliases: ['1 tim', '1tim', '1ti'] },
  { name: '2 Timothy', aliases: ['2 tim', '2tim', '2ti'] },
  { name: 'Titus', aliases: ['tit', 'ti', 'tts'] },
  { name: 'Philemon', aliases: ['phlm', 'phm', 'pm'] },
  { name: 'Hebrews', aliases: ['heb', 'he'] },
  { name: 'James', aliases: ['jas', 'jm', 'ja'] },
  { name: '1 Peter', aliases: ['1 pet', '1pet', '1pe'] },
  { name: '2 Peter', aliases: ['2 pet', '2pet', '2pe'] },
  { name: '1 John', aliases: ['1 jn', '1jn', '1jo'] },
  { name: '2 John', aliases: ['2 jn', '2jn', '2jo'] },
  { name: '3 John', aliases: ['3 jn', '3jn', '3jo'] },
  { name: 'Jude', aliases: ['jude', 'jud', 'jd'] },
  { name: 'Revelation', aliases: ['rev', 're', 'rv'] },
]

export interface AutocompleteSuggestion {
  display: string
  reference: string
  book: string
  chapter?: number
  verse?: number
}

export function getAutocompleteSuggestions(input: string, maxResults = 8): AutocompleteSuggestion[] {
  if (!input || input.trim().length < 2) return []
  const query = input.trim().toLowerCase()
  const results: AutocompleteSuggestion[] = []

  // Parse input: could be "joh", "joh 10", "joh 10 30", "john 10:30"
  const parts = query.split(/\s+/)
  if (parts.length === 0) return []

  // Step 1: Find matching books
  const matchedBooks = ALL_BOOK_ENTRIES.filter(entry => {
    if (entry.name.toLowerCase().startsWith(query)) return true
    return entry.aliases.some(a => a.startsWith(query) || query.startsWith(a))
  })

  if (parts.length === 1) {
    // User typed just the book abbreviation/name
    for (const book of matchedBooks.slice(0, maxResults)) {
      results.push({
        display: `${book.name} (add chapter & verse)`,
        reference: book.name,
        book: book.name,
      })
    }
    return results
  }

  // Step 2: Find the book from the first part(s)
  let bookName: string | null = null
  let chapterPart: string | null = null
  let versePart: string | null = null

  const firstPart = parts[0]
  const twoPartBook = parts.length >= 2 ? `${parts[0]} ${parts[1]}` : null

  for (const entry of ALL_BOOK_ENTRIES) {
    if (entry.aliases.some(a => a === firstPart || a === twoPartBook)) {
      bookName = entry.name
      break
    }
    if (entry.name.toLowerCase().startsWith(firstPart)) {
      bookName = entry.name
      break
    }
  }

  if (!bookName) {
    for (const entry of ALL_BOOK_ENTRIES) {
      if (entry.name.toLowerCase().startsWith(query) || entry.aliases.some(a => query.startsWith(a))) {
        bookName = entry.name
        break
      }
    }
  }

  if (!bookName) return []

  const bookAlias = ALL_BOOK_ENTRIES.find(e => e.name === bookName)!
  const bookAliasLower = bookAlias.aliases.map(a => a.toLowerCase())
  const consumedParts = bookAliasLower.some(a => a === twoPartBook) ? 2 : 1

  if (parts.length > consumedParts) {
    chapterPart = parts[consumedParts].replace(/[:.,]/g, '')
    if (parts.length > consumedParts + 1) {
      const verseStr = parts[consumedParts + 1].replace(/[-–.,]/g, '')
      versePart = verseStr || null
    }
  }

  const chapter = chapterPart ? parseInt(chapterPart) : null
  const verse = versePart ? parseInt(versePart) : null

  if (chapter !== null && !isNaN(chapter)) {
    if (verse !== null && !isNaN(verse)) {
      results.push({
        display: `${bookName} ${chapter}:${verse}`,
        reference: `${bookName} ${chapter}:${verse}`,
        book: bookName,
        chapter,
        verse,
      })
    } else {
      results.push({
        display: `${bookName} ${chapter}:1`,
        reference: `${bookName} ${chapter}:1`,
        book: bookName,
        chapter,
        verse: 1,
      })
    }
  } else {
    results.push({
      display: `${bookName} 1:1`,
      reference: `${bookName} 1:1`,
      book: bookName,
      chapter: 1,
      verse: 1,
    })
  }

  return results.slice(0, maxResults)
}

// ──────────────────────────────────────────────
// Server-side Bible API fetch (for API routes only)
// ──────────────────────────────────────────────
const BIBLE_API_BASE = 'https://bible-api.com'
const BOLLS_API_BASE = 'https://bolls.life'

// Bolls.life uses sequential book IDs in standard Protestant order — same as
// our BOOK_ORDER (Genesis=1 ... Revelation=66).
function bollsBookId(book: string): number | null {
  const idx = BOOK_ORDER.indexOf(book)
  return idx >= 0 ? idx + 1 : null
}

async function fetchVerseFromBolls(
  parsed: { book: string; chapter: number; verseStart: number; verseEnd?: number },
  translation: string,
  reference: string,
): Promise<BibleVerse | null> {
  const bookId = bollsBookId(parsed.book)
  if (!bookId) return null
  const start = parsed.verseStart
  const end = parsed.verseEnd ?? parsed.verseStart
  // bolls /get-text/<trans>/<book>/<chapter>/ returns the whole chapter
  const url = `${BOLLS_API_BASE}/get-text/${encodeURIComponent(translation)}/${bookId}/${parsed.chapter}/`
  const r = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!r.ok) return null
  const data = (await r.json()) as Array<{ verse: number; text: string }>
  if (!Array.isArray(data)) return null
  const wanted = data.filter((v) => v.verse >= start && v.verse <= end)
  if (wanted.length === 0) return null
  const text = wanted.map((v) => v.text.replace(/<[^>]+>/g, '').trim()).join('\n')
  return { reference, text, translation, book: parsed.book, chapter: parsed.chapter, verseStart: start, verseEnd: parsed.verseEnd }
}

async function fetchChapterFromBolls(
  book: string,
  chapter: number,
  translation: string,
): Promise<BibleChapter | null> {
  const bookId = bollsBookId(book)
  if (!bookId) return null
  const url = `${BOLLS_API_BASE}/get-text/${encodeURIComponent(translation)}/${bookId}/${chapter}/`
  const r = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!r.ok) return null
  const data = (await r.json()) as Array<{ verse: number; text: string }>
  if (!Array.isArray(data) || data.length === 0) return null
  return {
    book,
    chapter,
    translation,
    verses: data.map((v) => ({ verse: v.verse, text: v.text.replace(/<[^>]+>/g, '').trim() })),
  }
}

export async function fetchBibleVerseFromAPI(
  reference: string,
  translation: string = 'KJV'
): Promise<BibleVerse | null> {
  try {
    const parsed = parseVerseReference(reference)
    if (!parsed) return null

    const info = TRANSLATIONS_INFO[translation]
    // Modern translations (NIV/ESV/NLT/...) are served by bolls.life
    if (info?.source === 'bolls') {
      const bolls = await fetchVerseFromBolls(parsed, info.abbreviation, reference)
      if (bolls) return bolls
      // Fall through to bible-api.com KJV as last resort, clearly labeled
    }

    const bibleApiTranslation = TRANSLATION_MAP[translation] || 'kjv'
    const apiRef = `${parsed.book}+${parsed.chapter}:${parsed.verseStart}${parsed.verseEnd ? `-${parsed.verseEnd}` : ''}`

    const response = await fetch(`${BIBLE_API_BASE}/${apiRef}?translation=${bibleApiTranslation}`, {
      headers: { 'Accept': 'application/json' },
    })

    if (!response.ok) {
      if (translation !== 'KJV') {
        const fallbackResponse = await fetch(`${BIBLE_API_BASE}/${apiRef}?translation=kjv`, {
          headers: { 'Accept': 'application/json' },
        })
        if (fallbackResponse.ok) {
          const data = await fallbackResponse.json()
          return {
            reference,
            text: data.text || '',
            translation: `${translation} (KJV used)`,
            book: parsed.book,
            chapter: parsed.chapter,
            verseStart: parsed.verseStart,
            verseEnd: parsed.verseEnd,
          }
        }
      }
      return {
        reference,
        text: `Verse text for ${reference} (${translation}) — unable to fetch from API.`,
        translation,
        book: parsed.book,
        chapter: parsed.chapter,
        verseStart: parsed.verseStart,
        verseEnd: parsed.verseEnd,
      }
    }

    const data = await response.json()
    return {
      reference,
      text: data.text || '',
      translation,
      book: parsed.book,
      chapter: parsed.chapter,
      verseStart: parsed.verseStart,
      verseEnd: parsed.verseEnd,
    }
  } catch (error) {
    console.error('Error fetching Bible verse from API:', error)
    return null
  }
}

// ──────────────────────────────────────────────
// Voice text detection — search Bible by spoken phrase
// ──────────────────────────────────────────────
export type BibleSearchHit = {
  book: string
  chapter: number
  verse: number
  text: string
  translation: string
  reference: string
  score: number
}

/**
 * Search for verses matching a spoken phrase ("In the beginning God created…")
 * via bolls.life's full-text endpoint. Returns ranked candidates.
 */
export async function searchBibleByTextFromAPI(
  query: string,
  translation: string = 'KJV',
  limit: number = 5,
): Promise<BibleSearchHit[]> {
  try {
    const cleaned = query.trim()
    if (cleaned.length < 8) return []
    const info = TRANSLATIONS_INFO[translation]
    const bollsTrans = info?.source === 'bolls' ? info.abbreviation : 'KJV'
    const url = `${BOLLS_API_BASE}/find/${encodeURIComponent(bollsTrans)}/?search=${encodeURIComponent(cleaned)}`
    const r = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!r.ok) return []
    const data = (await r.json()) as Array<{
      book: number
      chapter: number
      verse: number
      text: string
    }>
    if (!Array.isArray(data) || data.length === 0) return []
    // Strip <mark> highlights and <S>NNNN</S> Strong-number annotations.
    const clean = (s: string) =>
      (s || '')
        .replace(/<S>[^<]*<\/S>/g, '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    return data.slice(0, limit).map((v) => {
      const bookName = BOOK_ORDER[v.book - 1] || `Book ${v.book}`
      return {
        book: bookName,
        chapter: v.chapter,
        verse: v.verse,
        text: clean(v.text),
        translation,
        reference: `${bookName} ${v.chapter}:${v.verse}`,
        score: 1,
      }
    })
  } catch (e) {
    console.error('Bible text search failed:', e)
    return []
  }
}

// ──────────────────────────────────────────────
// Client-side Bible fetch (routes through our API)
// ──────────────────────────────────────────────
export async function fetchBibleVerse(
  reference: string,
  translation: string = 'KJV'
): Promise<BibleVerse | null> {
  try {
    const params = new URLSearchParams({
      reference,
      translation,
    })
    const response = await fetch(`/api/bible?${params.toString()}`)

    if (!response.ok) {
      console.error(`Bible API error: ${response.status} ${response.statusText}`)
      return null
    }

    const data = await response.json()
    if (data.error) {
      console.error(`Bible API error: ${data.error}`)
      return null
    }

    return {
      reference: data.reference,
      text: data.text,
      translation: data.translation,
      book: data.book || '',
      chapter: data.chapter || 0,
      verseStart: data.verseStart || 0,
      verseEnd: data.verseEnd,
    }
  } catch (error) {
    console.error('Error fetching Bible verse:', error)
    return null
  }
}

export function splitVerseIntoSlides(verse: BibleVerse, linesPerSlide: 2 | 4 = 2): string[][] {
  const sentences = verse.text
    .split(/(?<=[.!?])\s+|\n+/)
    .filter((s) => s.trim().length > 0)
    .map((s) => s.trim())

  const slides: string[][] = []
  for (let i = 0; i < sentences.length; i += linesPerSlide) {
    slides.push(sentences.slice(i, i + linesPerSlide))
  }

  return slides.length > 0 ? slides : [[verse.text]]
}

export function getBookNames(): string[] {
  return BOOK_NAMES
}
