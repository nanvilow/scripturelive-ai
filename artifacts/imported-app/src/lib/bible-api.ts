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
    // v0.7.77 — Twi via wldeh/bible-api. No fallback: the operator
    // explicitly asked for Twi, and substituting KJV would silently
    // put the wrong language on the projector during a service.
    if (info?.source === 'wldeh') {
      const { fetchTwiChapter } = await import('@/lib/bibles/twi-bible')
      return await fetchTwiChapter(book, chapter)
    }
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
export const TRANSLATIONS_INFO: Record<string, { name: string; full: string; abbreviation: string; source: 'bible-api' | 'bolls' | 'wldeh' }> = {
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
  // v0.7.77 — Twi (Akuapem) Bible. Sourced from the public-domain
  // wldeh/bible-api dataset (`tw-wakna`). Implementation lives in
  // src/lib/bibles/twi-bible.ts; routing handled by the source ===
  // 'wldeh' branch in fetchBibleVerseFromAPI / fetchBibleChapterFromAPI.
  // Lets a preacher say "give me the Twi version" mid-service and have
  // the live verse swap to its Akuapem Twi text in place.
  TWI: { name: 'TWI', full: 'Twi (Akuapem) Bible', abbreviation: 'tw-wakna', source: 'wldeh' },
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

// v0.5.32 — STRICT verse number: requires the colon-form
// "chapter:verse" so plain "John 3" (without context) NEVER matches.
// This is the cure for the "John had 3 apples" false-positive class
// of bug. Patterns that have a strong context lead-in (e.g. "turn to",
// "the Bible says") still accept the colon-less form because the
// context word disambiguates the speaker's intent.
const VERSE_NUM_STRICT = '(\\d{1,3})\\s*:\\s*(\\d{1,3})(?:\\s*[-\\u2013]\\s*(\\d{1,3}))?'
const VERSE_NUM_WITH_CTX = '(\\d{1,3})(?::(\\d{1,3})(?:\\s*[-\\u2013]\\s*(\\d{1,3}))?)?'

export const VERSE_PATTERNS = [
  // 1) Strict colon-form (full book name): "John 3:16" / "1 Corinthians 13:4-7"
  //    REQUIRES the colon — does NOT match bare "John 3".
  new RegExp(`\\b([1-3]?\\s*(?:${BOOK_NAMES_PATTERN}))\\s+${VERSE_NUM_STRICT}`, 'gi'),
  // 2) Strict colon-form (abbreviated): "Gen 3:16" / "Rom 8:28"
  new RegExp(`\\b(${BOOK_ABBR_PATTERN})\\s+${VERSE_NUM_STRICT}`, 'gi'),
  // 3) Conversational with explicit "chapter X verse Y" (full names) —
  //    the words "chapter" and "verse" make this unambiguous even
  //    without a colon.
  new RegExp(`\\b([1-3]?\\s*(?:${BOOK_NAMES_PATTERN}))\\s+chapter\\s+(\\d{1,3})\\s*(?:,?\\s*(?:verse|verses?|vs?\\.?|v)\\.?\\s*(\\d{1,3})(?:\\s*[-\\u2013toand]+\\s*(\\d{1,3}))?)?`, 'gi'),
  // 4) Conversational abbreviated: "Gen chapter 3 verse 16" / "Gen ch3 v16"
  new RegExp(`\\b(${BOOK_ABBR_PATTERN})\\s+ch(?:apter)?\\.?\\s*(\\d{1,3})\\s*(?:,?\\s*(?:v(?:erse|s|s\\.?)?|vs?\\.?)\\.?\\s*(\\d{1,3})(?:\\s*[-\\u2013toand]+\\s*(\\d{1,3}))?)?`, 'gi'),
  // 5) Strong scripture-context lead-in + book + chapter (verse optional).
  //    The lead-in phrase is the disambiguator — "turn to John 3" is a
  //    Bible reference; "John 3 apples" is not.
  new RegExp(`(?:turn\\s+to|read\\s+(?:in|from)|look\\s+at|go\\s+to|find|open\\s+(?:your\\s+bibles?\\s+to|to)|as\\s+(?:we\\s+)?(?:read|see|find)\\s+in|according\\s+to|the\\s+(?:bible|word|scripture)s?\\s+(?:says?|tells?\\s+us|declares?|teaches?)\\s+(?:in\\s+)?)\\s*([1-3]?\\s*(?:${BOOK_NAMES_PATTERN}))\\s+${VERSE_NUM_WITH_CTX}`, 'gi'),
  // v0.5.33 — patterns 6 & 7: LOOSE "Book + chapter + verse" with
  // whitespace separator (NO colon). Speech-to-text rarely emits the
  // colon, so a preacher who says "John three sixteen" produces the
  // normalised text "John 3 16" — which patterns 1 & 2 cannot match.
  // The detector only commits these matches when the source text was
  // normalised from spoken numbers OR a scripture-context word is
  // nearby (see detectVersesInTextWithScore below). Bare "John 3 16"
  // typed into the operator console with no normalisation signal will
  // still NOT commit, so the conversational false-positive class
  // ("John had 3 apples and 16 oranges") stays blocked.
  new RegExp(`\\b([1-3]?\\s*(?:${BOOK_NAMES_PATTERN}))\\s+(\\d{1,3})\\s+(\\d{1,3})(?:\\s*[-\\u2013]\\s*(\\d{1,3}))?\\b`, 'gi'),
  new RegExp(`\\b(${BOOK_ABBR_PATTERN})\\s+(\\d{1,3})\\s+(\\d{1,3})(?:\\s*[-\\u2013]\\s*(\\d{1,3}))?\\b`, 'gi'),
]
// Pattern indices 6 and 7 are LOOSE (no colon) and only commit when
// the input was normalised from spoken numbers or has a context word.
// detectVersesInTextWithScore enforces this gate.
const LOOSE_PATTERN_INDICES = new Set([6, 7])

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

// v0.5.32 — Tolerant anchored chapter-only patterns for the MANUAL
// lookup UIs (BibleLookup, BibleLookupCompact, the "/api/bible"
// reference query, and operator UIs that pass the slide title back
// through). These are anchored to the FULL trimmed input string
// (^…$), so they cannot false-positive on a sentence excerpt the way
// the global VERSE_PATTERNS used to. They accept "Psalms 23",
// "1 Corinthians 13", "Gen 1", and the optional ":verse" / range form.
//
// Speech transcript detection still uses the strict VERSE_PATTERNS
// above — those are intentionally stricter so conversational chatter
// like "John had 3 apples" never commits as a Bible reference.
const LOOKUP_PATTERNS = [
  // Full book name + chapter (+ optional :verse(-range))
  new RegExp(`^([1-3]?\\s*(?:${BOOK_NAMES_PATTERN}))\\s+(\\d{1,3})(?::(\\d{1,3})(?:\\s*[-\\u2013]\\s*(\\d{1,3}))?)?\\s*$`, 'i'),
  // Abbreviated book name + chapter (+ optional :verse(-range))
  new RegExp(`^(${BOOK_ABBR_PATTERN})\\s+(\\d{1,3})(?::(\\d{1,3})(?:\\s*[-\\u2013]\\s*(\\d{1,3}))?)?\\s*$`, 'i'),
]

export function parseVerseReference(input: string): {
  reference: string
  book: string
  chapter: number
  verseStart: number
  verseEnd?: number
} | null {
  const cleaned = input.trim()
  // Try the strict speech-detection patterns first — they handle the
  // full conversational forms ("turn to John 3:16", "Romans chapter
  // 8 verse 28") that operators occasionally paste in.
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
  // v0.5.32 — Tolerant anchored fallback for chapter-only manual
  // lookups ("Psalms 23", "1 Corinthians 13", "Gen 1"). Safe because
  // the LOOKUP_PATTERNS are anchored to ^…$ on the trimmed input —
  // they only match when the WHOLE input is a clean book+chapter
  // expression, never a sentence fragment. Without this, the
  // tightened VERSE_PATTERNS (which now require an explicit colon
  // or context lead-in) would have broken every manual chapter
  // lookup in the Bible Lookup UI — a v0.5.32 regression flagged
  // by code review and fixed before release.
  for (const pattern of LOOKUP_PATTERNS) {
    const match = cleaned.match(pattern)
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

// ──────────────────────────────────────────────
// Spelled-out number normalization
// ──────────────────────────────────────────────
// Speech-to-text often produces "John three sixteen" instead of
// "John 3:16". We pre-process the transcript to convert spelled-out
// numbers into digits so the regex patterns above can lock on.
const NUM_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40,
  fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  hundred: 100,
}

// v0.5.33 — emit MULTIPLE separate numbers from a buffer.
// The previous wordsToNumber summed everything into one total, so
// "John three sixteen" normalized to "John 19" instead of "John 3 16",
// which made every spoken Bible reference fail the colon-form regex
// AND mislead the loose pattern into matching the wrong chapter.
//
// New behaviour: emit each number word as its own digit, BUT combine
// classic compounds:
//   - "twenty one" / "thirty five" → 21 / 35   (tens + ones)
//   - "three hundred" / "three hundred fifty" → 300 / 350  (multiplier)
// All other consecutive number words become separate digits, so the
// chapter:verse pair survives normalisation:
//   - "three sixteen"          → [3, 16]
//   - "eight twenty eight"     → [8, 28]
//   - "thirteen four to seven" → [13, 4, 7]   ("to" is a connector)
//   - "twenty one verse five"  → "verse" breaks the buffer; [21], [5]
function wordsToNumbers(parts: string[]): number[] {
  const result: number[] = []
  let i = 0
  while (i < parts.length) {
    const w = parts[i].toLowerCase()
    if (w === 'and') { i++; continue }
    if (!(w in NUM_WORDS)) { i++; continue }
    let v = NUM_WORDS[w]
    // Compound: tens (20..90) + ones (1..9) → 21..99
    if (v >= 20 && v < 100 && i + 1 < parts.length) {
      const next = parts[i + 1].toLowerCase()
      if (next in NUM_WORDS && NUM_WORDS[next] > 0 && NUM_WORDS[next] < 10) {
        v += NUM_WORDS[next]
        result.push(v)
        i += 2
        continue
      }
    }
    // Compound: ones (1..9) + hundred (+ optional tens/ones)
    if (v > 0 && v < 10 && i + 1 < parts.length) {
      const next = parts[i + 1].toLowerCase()
      if (next === 'hundred') {
        v *= 100
        i += 2
        if (i < parts.length) {
          const after = parts[i].toLowerCase()
          if (after in NUM_WORDS) {
            const av = NUM_WORDS[after]
            if (av >= 20 && av < 100 && i + 1 < parts.length) {
              const after2 = parts[i + 1].toLowerCase()
              if (after2 in NUM_WORDS && NUM_WORDS[after2] > 0 && NUM_WORDS[after2] < 10) {
                v += av + NUM_WORDS[after2]
                i += 2
                result.push(v)
                continue
              }
            }
            if (av < 100) { v += av; i++ }
          }
        }
        result.push(v)
        continue
      }
    }
    result.push(v)
    i++
  }
  return result
}

/**
 * Replace spoken number sequences with their digit equivalents.
 * Examples:
 *   "John three sixteen"          → "John 3 16"
 *   "Romans eight twenty eight"   → "Romans 8 28"
 *   "first Corinthians thirteen four" → "1 Corinthians 13 4"
 *
 * We greedily group consecutive number words (chunks separated by
 * non-number words), convert each chunk, and emit the digits with a
 * single space so the patterns above ("Book chapter verse" w/o colon)
 * still match. Ordinal "first/second/third" prefix to a book is also
 * normalized so "first John" → "1 John".
 */
function normalizeSpokenNumbers(text: string): string {
  if (!text) return text
  // Ordinal prefixes for book numbers
  let t = text
    .replace(/\b(first|1st)\s+/gi, '1 ')
    .replace(/\b(second|2nd)\s+/gi, '2 ')
    .replace(/\b(third|3rd)\s+/gi, '3 ')

  // Walk through tokens, collapsing runs of number-words into digits.
  const tokens = t.split(/(\s+)/)
  const out: string[] = []
  let buf: string[] = []
  const flush = () => {
    if (!buf.length) return
    // v0.5.33 — emit each compound number as its own digit so a buffer
    // like ["three", "sixteen"] becomes "3 16" (two numbers) rather
    // than "19" (the broken sum). This is what lets the loose
    // normalised regex below pick up "John three sixteen" → "John 3 16"
    // and commit it as a real Bible reference.
    const nums = wordsToNumbers(buf)
    if (nums.length) {
      out.push(nums.map(String).join(' '))
    } else {
      out.push(buf.join(' '))
    }
    buf = []
  }
  for (const tk of tokens) {
    if (/^\s+$/.test(tk)) {
      if (buf.length) {
        // keep building if next token is also a number-word
        continue
      }
      out.push(tk)
      continue
    }
    const w = tk.toLowerCase().replace(/[.,!?;:]+$/, '')
    if (w in NUM_WORDS || w === 'and' && buf.length) {
      buf.push(tk.replace(/[.,!?;:]+$/, ''))
    } else {
      flush()
      // re-emit a space if the previous token we just flushed dropped one
      if (out.length && !/\s$/.test(out[out.length - 1])) out.push(' ')
      out.push(tk)
    }
  }
  flush()
  return out.join('')
}

// ──────────────────────────────────────────────
// Verse detection (with confidence score)
// ──────────────────────────────────────────────
export interface DetectedReference {
  reference: string
  book: string
  chapter: number
  verseStart: number
  verseEnd?: number
  /** 0..1 confidence the reference is real and accurate. */
  confidence: number
  /** True if the speaker said an explicit verse number (e.g. "3:16"). */
  hasExplicitVerse: boolean
  /** The matched substring from the original (or normalized) text. */
  matched: string
}

function scoreReference(opts: {
  bookFull: boolean
  hasExplicitVerse: boolean
  hasContextWord: boolean
  fromSpokenNumbers: boolean
  chapter: number
  verseStart: number
  book: string
}): number {
  const maxChapter = BOOK_CHAPTER_COUNTS[opts.book]
  // Hard fail: chapter beyond the book's range.
  if (maxChapter && opts.chapter > maxChapter) return 0

  let s = 0.55 // baseline for a parsed match
  if (opts.bookFull) s += 0.18           // full book name vs abbreviation
  if (opts.hasExplicitVerse) s += 0.22   // explicit "3:16" / "verse 16"
  if (opts.hasContextWord) s += 0.08     // "scripture", "the bible says", etc.
  if (opts.fromSpokenNumbers) s -= 0.05  // small penalty for STT-derived nums
  // Cap at 1.0
  return Math.max(0, Math.min(1, s))
}

// Phrases preachers actually say that signal "scripture is coming".
// Far broader than the original "the Bible says" list — covers
// general-authority style ("Scripture makes us understand"), apostolic
// attribution ("Paul tells us in", "John writes"), red-letter quotation
// ("Jesus said", "Christ declared", "the Lord spoke"), prophetic
// framing ("Thus saith the Lord"), and the call-and-response openers
// ("the Word of God tells us", "the Bible declares").
const CONTEXT_WORDS = /(scripture|bible|verse|chapter|gospel|epistle|psalm|word\s+of\s+god|read\s+from|turn\s+to|open\s+(?:your\s+bibles?\s+)?to|let\s+us\s+(?:look|turn|read)|jesus\s+(?:said|says|spoke|declared|tells?\s+us)|christ\s+(?:said|declared|spoke)|the\s+lord\s+(?:said|says|spoke|declared)|paul\s+(?:tells|writes|says|teaches|addresses)|peter\s+(?:tells|writes|says)|john\s+(?:tells|writes|says)|moses\s+(?:said|wrote|tells)|david\s+(?:said|wrote|sings)|the\s+(?:bible|word|scripture)s?\s+(?:says?|tells?|declares?|teaches?|reveals?|reminds?|promises?|warns?|makes?\s+(?:us\s+)?understand)|thus\s+sa(?:ith|ys)\s+the\s+lord|it\s+is\s+written|as\s+it\s+is\s+written|remember\s+(?:what\s+)?jesus|the\s+prophet\s+\w+\s+(?:said|wrote))/i

// Quick test for preacher attribution phrases — used to bias the
// fuzzy text-search engine in speech-provider so paraphrases and
// hidden-citation styles ("Remember, Jesus spoke these words…")
// still land on the right verse even without an explicit reference.
export const PREACHER_ATTRIBUTION = /\b(jesus\s+(?:said|says|spoke|declared|tells?\s+us)|christ\s+(?:said|declared|spoke)|the\s+lord\s+(?:said|says|spoke|declared)|paul\s+(?:tells|writes|says|teaches|addresses)|peter\s+(?:tells|writes|says)|john\s+(?:tells|writes|says)|moses\s+(?:said|wrote)|the\s+(?:bible|word|scripture)s?\s+(?:says?|tells?|declares?|teaches?|reveals?|reminds?|promises?|warns?|makes?\s+(?:us\s+)?understand)|thus\s+sa(?:ith|ys)\s+the\s+lord|it\s+is\s+written|as\s+it\s+is\s+written|remember\s+(?:what\s+)?jesus|word\s+of\s+god\s+tells?\s+us)\b/i

export function detectVersesInTextWithScore(rawText: string): DetectedReference[] {
  if (!rawText) return []
  const normalized = normalizeSpokenNumbers(rawText)
  const wasNormalized = normalized !== rawText
  const hasContext = CONTEXT_WORDS.test(rawText)

  const seen = new Map<string, DetectedReference>()
  for (let pi = 0; pi < VERSE_PATTERNS.length; pi++) {
    const pattern = VERSE_PATTERNS[pi]
    const regex = new RegExp(pattern.source, pattern.flags)
    let match: RegExpExecArray | null
    while ((match = regex.exec(normalized)) !== null) {
      const bookRaw = match[1]
      const book = normalizeBookName(bookRaw)
      if (!book) continue
      const chapter = parseInt(match[2])
      if (!chapter || chapter < 1) continue
      const verseStart = match[3] ? parseInt(match[3]) : 1
      const verseEnd = match[4] ? parseInt(match[4]) : undefined
      const reference = formatReference(book, chapter, verseStart, verseEnd)
      const hasExplicitVerse = !!match[3]
      // v0.5.33 — pattern indices: full-name = 0, 2, 4, 6; abbreviated = 1, 3, 7.
      const bookFull = pi === 0 || pi === 2 || pi === 4 || pi === 6
      // v0.5.33 — LOOSE patterns (no colon, e.g. "John 3 16") only
      // commit when the input was normalised from spoken numbers
      // ("John three sixteen") or has a strong context word nearby.
      // This lets sermon transcripts work while still blocking the
      // raw "John 3 16" / "John had 3 apples and 16" false positives.
      if (LOOSE_PATTERN_INDICES.has(pi) && !wasNormalized && !hasContext) continue
      const confidence = scoreReference({
        bookFull,
        hasExplicitVerse,
        hasContextWord: hasContext,
        fromSpokenNumbers: wasNormalized,
        chapter,
        verseStart,
        book,
      })
      // v0.5.32 — raise the commit floor from 0 to 0.55 so word-soup
      // matches that scrape past the regex but fail every signal
      // (no explicit verse, no context phrase, no full book name)
      // never reach the operator. The previous floor of 0 let
      // anything with a recognisable book name through.
      if (confidence < 0.55) continue
      const prev = seen.get(reference)
      if (!prev || confidence > prev.confidence) {
        seen.set(reference, {
          reference,
          book,
          chapter,
          verseStart,
          verseEnd,
          confidence,
          hasExplicitVerse,
          matched: match[0],
        })
      }
    }
  }
  return [...seen.values()].sort((a, b) => b.confidence - a.confidence)
}

export function detectVersesInText(text: string): string[] {
  return detectVersesInTextWithScore(text).map((r) => r.reference)
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
    // v0.7.77 — Twi via wldeh/bible-api. We do NOT fall through to
    // KJV when Twi is missing for a passage — silently substituting
    // English for an explicitly-requested Twi verse would be worse
    // than returning null (which short-circuits the slide push).
    if (info?.source === 'wldeh') {
      const { fetchTwiVerse } = await import('@/lib/bibles/twi-bible')
      return await fetchTwiVerse(parsed, reference)
    }
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
      // v0.7.59 — NEVER return a placeholder verse with the literal
      // string "unable to fetch from API." as the text. The previous
      // behaviour leaked that error message all the way to the live
      // projector during a service (operator report: "the whole
      // congregation saw it, so embarrassing"). Returning null causes
      // /api/bible to respond 404, fetchBibleVerse() resolves to null,
      // and the speech-provider live-detection path skips pushing the
      // verse to the slide deck. Silent failure is correct here.
      return null
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
// Poison-text guard (defense in depth)
// ──────────────────────────────────────────────
// Old builds (≤ v0.7.58) returned a placeholder BibleVerse whose `.text`
// was literally `"Verse text for John 3:16 (KJV) — unable to fetch from
// API."`. That string ended up on the live projector during a service.
// The root cause is fixed (v0.7.59), but a few of those strings may
// already be persisted in the SQLite verse cache on operator machines.
// This guard ensures NONE of them ever reach the renderer.
export function isPoisonedVerseText(text: string | null | undefined): boolean {
  if (!text) return false
  return /\bunable to fetch from API\b/i.test(text) ||
    /^Verse text for .+\(.+\) — unable to fetch/i.test(text)
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

    // Defense in depth: never pass an error-string-as-verse-text to the
    // renderer, even if the server cached one from an old build.
    if (isPoisonedVerseText(data.text)) {
      console.error('[bible-api] dropped poisoned cached verse for', reference)
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

// ── Sermon-style transcript normalisation ────────────────────────────
// Web Speech results come in lower-case and unpunctuated, with proper
// nouns mangled ("god" / "jesus" / "matthew chapter five verse three").
// This function takes a raw transcript and produces a much more
// readable version: capitalised proper nouns, capitalised Bible book
// names (incl. "1 John", "II Corinthians"), spelled-out chapter/verse
// numbers folded into proper "Book 5:3" form, sentence-start
// capitalisation, and a few common ASR mishears fixed ("hey men" →
// "Amen", "the lord jesus crisis" → "the Lord Jesus Christ"). Pure
// presentation — does NOT mutate the underlying store transcript so
// detection logic stays untouched.
type ReplaceFn = (substring: string, ...args: string[]) => string
const PROPER_NOUNS: Array<[RegExp, string | ReplaceFn]> = [
  [/\bjesus\b/gi, 'Jesus'],
  [/\bchrist\b/gi, 'Christ'],
  [/\bjesus\s+christ\b/gi, 'Jesus Christ'],
  [/\bthe\s+lord\b/gi, 'the Lord'],
  [/\blord\s+(jesus|god)\b/gi, (_m, n) => `Lord ${n[0].toUpperCase()}${n.slice(1)}`],
  [/\bgod\b/gi, 'God'],
  [/\bholy\s+spirit\b/gi, 'Holy Spirit'],
  [/\bholy\s+ghost\b/gi, 'Holy Ghost'],
  [/\bfather\s+god\b/gi, 'Father God'],
  [/\bson\s+of\s+god\b/gi, 'Son of God'],
  [/\bson\s+of\s+man\b/gi, 'Son of Man'],
  [/\bthe\s+father\b/gi, 'the Father'],
  [/\bthe\s+son\b/gi, 'the Son'],
  [/\bsatan\b/gi, 'Satan'],
  [/\bthe\s+devil\b/gi, 'the Devil'],
  [/\bmessiah\b/gi, 'Messiah'],
  [/\b(?:savior|saviour)\b/gi, (m: string) => m[0].toUpperCase() + m.slice(1)],
  [/\bgospel\b/gi, 'Gospel'],
  [/\bbible\b/gi, 'Bible'],
  [/\bscriptures?\b/gi, (m) => m[0].toUpperCase() + m.slice(1)],
  [/\bword\s+of\s+god\b/gi, 'Word of God'],
  [/\bkingdom\s+of\s+(god|heaven)\b/gi, (_m, n) => `Kingdom of ${n[0].toUpperCase()}${n.slice(1)}`],
  // Disciples & key OT figures often spoken in sermons
  [/\b(peter|paul|john|james|matthew|mark|luke|andrew|philip|thomas|judas|stephen|barnabas|timothy|titus|moses|aaron|joshua|david|solomon|abraham|isaac|jacob|joseph|noah|adam|eve|elijah|elisha|isaiah|jeremiah|ezekiel|daniel|jonah|samuel|saul|gideon|samson|ruth|esther|mary|martha|lazarus|herod|pilate)\b/gi,
    (m) => m[0].toUpperCase() + m.slice(1).toLowerCase()],
  [/\b(?:jerusalem|bethlehem|nazareth|galilee|judea|samaria|israel|egypt|babylon|rome|corinth|ephesus|antioch|damascus|jericho|gethsemane|calvary|golgotha|sinai|zion)\b/gi,
    (m) => m[0].toUpperCase() + m.slice(1).toLowerCase()],
  // Common ASR mishears in sermon contexts
  [/\bhey\s+men\b/gi, 'Amen'],
  [/\bay\s+men\b/gi, 'Amen'],
  [/\bamen\b/gi, 'Amen'],
  [/\bhallelujah\b/gi, 'Hallelujah'],
  [/\balleluia\b/gi, 'Alleluia'],
  [/\bcrisis\b(?=[^.!?]*\bjesus\b)/gi, 'Christ'], // "lord jesus crisis" → "Lord Jesus Christ"
]

// Fold spoken "chapter X verse Y" into compact "X:Y" so the readable
// transcript looks like "John 3:16" instead of "john chapter three
// verse sixteen". Reuses the spoken-number normaliser used for
// reference detection so the styles stay in lock-step.
function compactReferences(text: string, books: string[]): string {
  // Build a once-per-call book regex
  const bookPattern = books
    .map((b) => b.replace(/\s+/g, '\\s+'))
    .sort((a, b) => b.length - a.length)
    .join('|')
  const re = new RegExp(`\\b(${bookPattern})\\s+(?:chapter\\s+)?(\\d+)(?:\\s*[:.]\\s*|\\s+verse[s]?\\s+)(\\d+)(?:\\s*(?:to|-|through|and)\\s*(\\d+))?\\b`, 'gi')
  return text.replace(re, (_m, b, c, v, v2) => {
    const book = b
      .toLowerCase()
      .split(/\s+/)
      .map((w: string) => w[0].toUpperCase() + w.slice(1))
      .join(' ')
    return v2 ? `${book} ${c}:${v}-${v2}` : `${book} ${c}:${v}`
  })
}

export function normalizeTranscriptForDisplay(raw: string): string {
  if (!raw) return ''
  // First: collapse spoken numbers ("chapter three verse sixteen")
  // into their digit form so the references compactor below can
  // recognise them.
  let s = normalizeSpokenNumbers(raw)
  // Apply the proper-noun map. The map preserves intra-word casing
  // (already-capped words pass through untouched).
  for (const [re, repl] of PROPER_NOUNS) {
    s = typeof repl === 'string'
      ? s.replace(re, repl)
      : s.replace(re, repl as (substring: string, ...args: unknown[]) => string)
  }
  // Compact "Book Chapter:Verse" wherever we can spot it.
  s = compactReferences(s, BOOK_NAMES)
  // Sentence-start capitalisation: first letter of the string and
  // first letter after . ! ? gets uppercased. We do this AFTER
  // proper-noun replacement so we don't double-process.
  s = s.replace(/(^\s*|[.!?]\s+)([a-z])/g, (_m, gap, ch) => gap + ch.toUpperCase())
  // "i" pronoun should always be capital.
  s = s.replace(/\bi\b/g, 'I')
  // Tidy spaces.
  s = s.replace(/\s+/g, ' ').trim()
  return s
}
