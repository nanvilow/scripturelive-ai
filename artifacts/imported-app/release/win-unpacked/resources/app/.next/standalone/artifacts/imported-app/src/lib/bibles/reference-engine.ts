// Bible Reference Engine v2 — full rewrite for v0.5.52.
//
// Supersedes the regex-only detection inside src/lib/bible-api.ts for
// the speech-detection path. The legacy file remains in tree for
// callers (UI typeahead, manual lookup) that still rely on it; the
// SpeechProvider's detection loop is rewired to call detectReference()
// here exclusively.
//
// Pipeline:
//   1. NORMALISE       lowercase, strip filler, word→digit, " : " → ":"
//   2. TOKENIZE        split into ordered tokens, keep positions
//   3. PATTERN MATCH   sliding window over tokens against:
//                        a) "<book> <chapter>:<verse>[-<verseEnd>]"
//                        b) "<book> <chapter> <verse>[ to <verseEnd>]"
//                        c) "<book> chapter <chapter> verse <verse>[ to <verseEnd>]"
//   4. NORMALISE BOOK  exact alias → fuzzy alias (Levenshtein ≤ 2)
//   5. VALIDATE        book ∈ structure, chapter ∈ [1, chapterCount],
//                      verseStart ∈ [1, verseCount], verseEnd if present
//                      ∈ [verseStart, verseCount]
//   6. SCORE           0..100 confidence (book exact 40 / fuzzy 30,
//                      chapter valid 20, verse valid 20, pattern
//                      clarity 10 — colon present / "chapter|verse"
//                      keyword present, clean transcription 10 — no
//                      filler words around the match)
//
// Output: zero or more `DetectedReference` objects, each with
// `displayCandidate`-grade fields and a `confidence` score.
//
// The engine NEVER fetches verse text. It only confirms the address
// is plausible. The caller (SpeechProvider) decides whether to fetch
// the verse text from the offline cache via /api/bible.

import bibleStructure from '@/data/bible-structure.json'
import { canonicalBook, canonicalBookFuzzy } from './book-mapping'

// ─────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────
export interface DetectedReference {
  /** Canonical book name as it appears in src/data/bible-structure.json. */
  book: string
  chapter: number
  verseStart: number
  /** Inclusive end of a verse range. Equal to verseStart for single. */
  verseEnd: number
  /** True when verseEnd > verseStart. */
  isRange: boolean
  /** Confidence 0..100. */
  confidence: number
  /** Human-readable reference like "John 3:16" or "1 Cor 13:4-7". */
  reference: string
  /** Raw substring of the source text that triggered the match. */
  matchedText: string
  /** Index into the original (non-normalised) text where the match started. */
  startIndex: number
  /** Was the book matched exactly or via fuzzy? */
  bookMatch: 'exact' | 'fuzzy'
  /** Was the pattern unambiguous (colon or "chapter X verse Y")? */
  patternClarity: 'high' | 'low'
}

// ─────────────────────────────────────────────────────────────────────
// Number-word → digit conversion (1..199 plus a handful of misspeaks)
// ─────────────────────────────────────────────────────────────────────
const ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19,
}
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
}
// Common misspellings / homophones that Whisper / Deepgram emit on
// numerical tokens. Whisper is especially fond of "for" → "four".
const NUM_HOMOPHONES: Record<string, string> = {
  for: 'four', tu: 'two', too: 'two', won: 'one', ate: 'eight',
  fer: 'four', fore: 'four',
}

/**
 * Convert spoken number words (one … one hundred ninety nine) into
 * digits. Conservative — refuses to fold an ambiguous span (e.g. "one
 * to" stays as "one to" because "to" might be the range keyword the
 * pattern matcher needs intact).
 *
 * "first/second/third" stay intact so the book matcher can pick them
 * up as ordinals on a book name. Anything past 199 stays untouched
 * (no Bible chapter or verse exceeds 176, the max in Psalm 119).
 */
export function wordsToNumbers(text: string): string {
  const tokens = text.split(/(\s+|[,;:.?!])/) // keep separators
  const out: string[] = []
  let i = 0
  while (i < tokens.length) {
    const t = tokens[i]
    const lower = t.toLowerCase()
    // Skip whitespace / punctuation tokens.
    if (!/\S/.test(t) || /^[,;:.?!]$/.test(t)) {
      out.push(t)
      i++
      continue
    }
    const word = NUM_HOMOPHONES[lower] ?? lower

    // Try a 3-word sequence first: "one hundred fifty"
    if (
      ONES[word] != null && ONES[word] >= 1 &&
      tokens[i + 2]?.toLowerCase() === 'hundred'
    ) {
      // unsupported (Bible doesn't need >199)
    }
    // "one hundred" + optional " <ones|tens>"
    if (ONES[word] != null && tokens[i + 2]?.toLowerCase() === 'hundred') {
      const hundreds = ONES[word] * 100
      // Look ahead for "and|<ones|tens>"
      let value = hundreds
      let consumed = 3 // word, sep, hundred
      // Skip optional "and"
      if (tokens[i + 4]?.toLowerCase() === 'and') {
        consumed += 2
      }
      const nextIdx = i + consumed + 1
      const nextTok = tokens[nextIdx]?.toLowerCase()
      if (nextTok && TENS[nextTok] != null) {
        value += TENS[nextTok]
        consumed += 2
        const afterTen = tokens[i + consumed + 1]?.toLowerCase()
        if (afterTen && ONES[afterTen] != null && ONES[afterTen] >= 1) {
          value += ONES[afterTen]
          consumed += 2
        }
      } else if (nextTok && ONES[nextTok] != null && ONES[nextTok] >= 1) {
        value += ONES[nextTok]
        consumed += 2
      }
      out.push(String(value))
      i += consumed + 1
      continue
    }
    // "twenty three"
    if (TENS[word] != null) {
      const next = tokens[i + 2]?.toLowerCase()
      if (next && ONES[next] != null && ONES[next] >= 1 && ONES[next] < 10) {
        out.push(String(TENS[word] + ONES[next]))
        i += 3
        continue
      }
      out.push(String(TENS[word]))
      i++
      continue
    }
    // Single-word number
    if (ONES[word] != null) {
      out.push(String(ONES[word]))
      i++
      continue
    }
    out.push(t)
    i++
  }
  return out.join('').replace(/\s+/g, ' ').trim()
}

// ─────────────────────────────────────────────────────────────────────
// Filler stripping
// ─────────────────────────────────────────────────────────────────────
const FILLER_PHRASES = [
  "let us read", "let's read", "lets read", "if you have your bibles",
  "if you have your bible", "open your bibles to", "open your bible to",
  "open to", "turn with me to", "turn to", "please turn to",
  "we'll be reading", "we will be reading", "the reading is from",
  "the scripture for today", "today's scripture is",
  "if you'd like to follow along", "follow along with me",
  "read along with me", "in your bible", "the word of god",
]

function stripFiller(text: string): string {
  let out = text.toLowerCase()
  for (const p of FILLER_PHRASES) {
    // Use a literal replace (allowing repeated matches) so we don't
    // need to escape regex metacharacters in the phrase list.
    while (out.includes(p)) out = out.replace(p, ' ')
  }
  return out.replace(/\s+/g, ' ').trim()
}

// ─────────────────────────────────────────────────────────────────────
// Validation against the bundled Bible structure
// ─────────────────────────────────────────────────────────────────────
const STRUCTURE = bibleStructure as unknown as Record<string, number[] | string>

function chaptersOf(book: string): number {
  const v = STRUCTURE[book]
  if (!Array.isArray(v)) return 0
  return v.length
}

function versesOf(book: string, chapter: number): number {
  const v = STRUCTURE[book]
  if (!Array.isArray(v)) return 0
  return v[chapter - 1] ?? 0
}

export function isValidReference(
  book: string,
  chapter: number,
  verseStart: number,
  verseEnd?: number,
): boolean {
  const cc = chaptersOf(book)
  if (!cc || chapter < 1 || chapter > cc) return false
  const vc = versesOf(book, chapter)
  if (!vc || verseStart < 1 || verseStart > vc) return false
  if (verseEnd != null) {
    if (verseEnd < verseStart || verseEnd > vc) return false
  }
  return true
}

// ─────────────────────────────────────────────────────────────────────
// Pattern matcher
// ─────────────────────────────────────────────────────────────────────
// We support these forms (after normalisation):
//
//   <book>          <chapter> : <vStart>            (high clarity)
//   <book>          <chapter> : <vStart> - <vEnd>   (high clarity)
//   <book> chapter  <chapter> verse <vStart>         (high clarity)
//   <book> chapter  <chapter> verse <vStart> to|- <vEnd> (high clarity)
//   <book>          <chapter>   <vStart>            (low clarity)
//   <book>          <chapter>   <vStart> to <vEnd>  (low clarity)
//
// "<book>" may itself span 1-3 tokens (e.g. "song of solomon",
// "1 corinthians", "first corinthians"). We greedily try book spans
// of length 3 → 2 → 1, with both exact and fuzzy lookups.

interface BookMatch {
  book: string
  exact: boolean
  startToken: number
  endTokenExclusive: number
}

const ORDINAL_WORDS = new Set(['1', '2', '3', '1st', '2nd', '3rd', 'first', 'second', 'third', 'i', 'ii', 'iii'])

function tryBookSpan(tokens: string[], start: number): BookMatch | null {
  // Try widest span first — "song of solomon" (3), "1 corinthians" (2),
  // "john" (1).
  for (const span of [4, 3, 2, 1]) {
    if (start + span > tokens.length) continue
    const slice = tokens.slice(start, start + span).join(' ')
    const exact = canonicalBook(slice)
    if (exact) {
      return { book: exact, exact: true, startToken: start, endTokenExclusive: start + span }
    }
  }
  // Fuzzy fallback — only worth it on single-token spans (the alias
  // table indexes them); for ordinal books we try "<ord> <fuzzy(base)>".
  // Step 1: ordinal + base.
  if (ORDINAL_WORDS.has(tokens[start]?.toLowerCase() ?? '')) {
    const base = tokens[start + 1]
    if (base) {
      const fuzzyBase = canonicalBookFuzzy(`${tokens[start]} ${base}`, 2)
      if (fuzzyBase) {
        return { book: fuzzyBase.book, exact: fuzzyBase.exact, startToken: start, endTokenExclusive: start + 2 }
      }
    }
  }
  // Step 2: bare single token fuzzy.
  const single = tokens[start]
  if (single) {
    const fuzzy = canonicalBookFuzzy(single, 2)
    if (fuzzy) {
      return { book: fuzzy.book, exact: fuzzy.exact, startToken: start, endTokenExclusive: start + 1 }
    }
  }
  return null
}

function asInt(s: string): number | null {
  if (!/^\d+$/.test(s)) return null
  const n = parseInt(s, 10)
  return Number.isFinite(n) ? n : null
}

interface MatchResult {
  ref: DetectedReference
  endTokenExclusive: number
}

function matchAt(tokens: string[], originalText: string, start: number): MatchResult | null {
  const book = tryBookSpan(tokens, start)
  if (!book) return null

  let i = book.endTokenExclusive
  let chapter: number | null = null
  let verseStart: number | null = null
  let verseEnd: number | null = null
  let patternClarity: 'high' | 'low' = 'low'

  // After the book token(s), try the structured "chapter X verse Y" form
  // first because it's the most explicit signal.
  if (tokens[i] === 'chapter' && tokens[i + 1] && asInt(tokens[i + 1]) != null) {
    chapter = asInt(tokens[i + 1])
    i += 2
    if (tokens[i] === 'verse' && tokens[i + 1] && asInt(tokens[i + 1]) != null) {
      verseStart = asInt(tokens[i + 1])
      i += 2
      if ((tokens[i] === 'to' || tokens[i] === '-' || tokens[i] === 'through') && tokens[i + 1] && asInt(tokens[i + 1]) != null) {
        verseEnd = asInt(tokens[i + 1])
        i += 2
      }
      patternClarity = 'high'
    }
  } else {
    // Look for "<chapter>"
    const c = asInt(tokens[i] ?? '')
    if (c == null) return null
    chapter = c
    i++

    // Either ":<verse>" came across as a separate ":" token, or " <verse>" follows
    if (tokens[i] === ':' && tokens[i + 1] && asInt(tokens[i + 1]) != null) {
      verseStart = asInt(tokens[i + 1])
      i += 2
      patternClarity = 'high'
    } else if (tokens[i] === 'verse' && tokens[i + 1] && asInt(tokens[i + 1]) != null) {
      verseStart = asInt(tokens[i + 1])
      i += 2
      patternClarity = 'high'
    } else if (tokens[i] && asInt(tokens[i]) != null) {
      verseStart = asInt(tokens[i])
      i++
      // patternClarity stays 'low' — bare "John 3 16"
    }

    if (verseStart != null) {
      if ((tokens[i] === '-' || tokens[i] === 'to' || tokens[i] === 'through') && tokens[i + 1] && asInt(tokens[i + 1]) != null) {
        verseEnd = asInt(tokens[i + 1])
        i += 2
      }
    }
  }

  if (chapter == null || verseStart == null) return null
  if (verseEnd != null && verseEnd < verseStart) return null

  // Validate against bundled structure.
  if (!isValidReference(book.book, chapter, verseStart, verseEnd ?? undefined)) {
    return null
  }

  // Build display reference.
  const refStr = verseEnd != null && verseEnd !== verseStart
    ? `${book.book} ${chapter}:${verseStart}-${verseEnd}`
    : `${book.book} ${chapter}:${verseStart}`

  // Best-effort matchedText / startIndex — use the substring of the
  // ORIGINAL text from the position of the first token through the
  // last consumed token. Tokens here are post-normalisation, but the
  // original text usually has the same word order so we approximate
  // by joining the consumed slice.
  const matchedText = tokens.slice(book.startToken, i).join(' ')
  // Position in the original text: search for the first book word
  // case-insensitively. Fallback to 0 if not found.
  const probe = tokens[book.startToken]
  const startIndex = probe ? originalText.toLowerCase().indexOf(probe) : 0

  return {
    endTokenExclusive: i,
    ref: {
      book: book.book,
      chapter,
      verseStart,
      verseEnd: verseEnd ?? verseStart,
      isRange: verseEnd != null && verseEnd !== verseStart,
      confidence: 0, // filled below
      reference: refStr,
      matchedText,
      startIndex: startIndex < 0 ? 0 : startIndex,
      bookMatch: book.exact ? 'exact' : 'fuzzy',
      patternClarity,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────
// Confidence scoring
// ─────────────────────────────────────────────────────────────────────
function scoreReference(ref: DetectedReference, normalisedText: string): number {
  let s = 0
  s += ref.bookMatch === 'exact' ? 40 : 30
  s += 20 // chapter valid (already enforced)
  s += 20 // verseStart valid (already enforced)
  s += ref.patternClarity === 'high' ? 10 : 0
  // Clean transcription bonus: if the matched text isn't surrounded by
  // a giveaway filler word (e.g. "John had three apples" — "had" right
  // after the book name) we give the +10. Cheap heuristic; full NLP
  // is overkill.
  const surrounded = /(?:had|met|saw|told|asked|took|gave|like)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/.test(
    normalisedText.slice(Math.max(0, ref.startIndex - 8), ref.startIndex + ref.matchedText.length + 8),
  )
  if (!surrounded) s += 10
  return Math.max(0, Math.min(100, s))
}

// ─────────────────────────────────────────────────────────────────────
// Public entry points
// ─────────────────────────────────────────────────────────────────────
export interface DetectOptions {
  /** Drop matches below this confidence (0..100). Default 60. */
  minConfidence?: number
}

/**
 * Tokenise text into atoms the matcher walks across. Treats `:` and
 * `-` as their own tokens so `John 3:16-18` becomes
 * `["john","3",":","16","-","18"]`. Other punctuation is dropped.
 */
function tokenize(text: string): string[] {
  return text
    .replace(/[—–]/g, '-')                    // em/en dash → hyphen
    .replace(/([:\-])/g, ' $1 ')              // expand : - into own tokens
    .replace(/[.,;!?'"`()\[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((t) => t.toLowerCase())
}

/**
 * Run the full pipeline over the input text and return all valid
 * references found, scored and filtered by minConfidence.
 *
 * Detection is deterministic — no I/O, no async, no network. Returns
 * within milliseconds even on long transcripts.
 */
export function detectReferences(text: string, opts: DetectOptions = {}): DetectedReference[] {
  if (!text || !text.trim()) return []
  const minConfidence = opts.minConfidence ?? 60

  const stripped = stripFiller(text)
  const numerified = wordsToNumbers(stripped)
  const tokens = tokenize(numerified)
  if (!tokens.length) return []

  const out: DetectedReference[] = []
  let i = 0
  while (i < tokens.length) {
    const m = matchAt(tokens, numerified, i)
    if (m) {
      m.ref.confidence = scoreReference(m.ref, numerified)
      if (m.ref.confidence >= minConfidence) out.push(m.ref)
      // Skip past the matched span so we don't re-detect the same
      // reference starting one token later.
      i = m.endTokenExclusive
    } else {
      i++
    }
  }
  // Dedupe identical references emitted by overlapping windows.
  const seen = new Set<string>()
  return out.filter((r) => {
    const key = `${r.book}|${r.chapter}|${r.verseStart}|${r.verseEnd}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Convenience: detect a single best reference (highest confidence). */
export function detectBestReference(text: string, opts: DetectOptions = {}): DetectedReference | null {
  const all = detectReferences(text, opts)
  if (!all.length) return null
  return all.reduce((best, cur) => (cur.confidence > best.confidence ? cur : best), all[0])
}

/**
 * Parse an EXPLICIT reference string the operator typed (e.g. "John
 * 3:16-18", "1 cor 13 4 7"). Always returns the parse result regardless
 * of confidence — caller is the operator typing, so we trust them.
 */
export function parseExplicitReference(text: string): DetectedReference | null {
  if (!text || !text.trim()) return null
  const numerified = wordsToNumbers(text.toLowerCase())
  const tokens = tokenize(numerified)
  if (!tokens.length) return null
  // Try every starting token; pick the first valid match.
  for (let i = 0; i < tokens.length; i++) {
    const m = matchAt(tokens, numerified, i)
    if (m) {
      m.ref.confidence = 100 // operator-typed
      return m.ref
    }
  }
  return null
}
