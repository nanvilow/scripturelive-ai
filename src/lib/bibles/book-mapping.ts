// Bible book name normalization. Maps every spoken / typed / abbreviated
// / common-misspelled / accent-mangled form back to the canonical book
// name (matches src/data/bible-structure.json keys). Used by the new
// reference engine to turn "first corintians" → "1 Corinthians",
// "psam" → "Psalms", "song of solomon" / "song of songs" → "Song of
// Solomon", "jn" → "John" etc.
//
// Coverage:
//   • Full canonical name (case-insensitive)
//   • Standard 3-4 char abbreviation (Gen, Exo, Lev, Num, Deu, Jos, ...)
//   • OSIS / SBL alternate abbrevs (Pss, Sg, etc.)
//   • Spoken ordinal forms ("first", "second", "third")
//   • "1st" / "2nd" / "3rd" written ordinal forms
//   • Common typos / phonetic misspellings frequently emitted by
//     Whisper / Deepgram on accented English (corintians, corinshans,
//     efishans, lukas, mathew, mathews, judes, james, jeems, gospel of)
//   • Alt names: Song of Solomon ↔ Song of Songs ↔ Canticles, Psalms ↔
//     Psalm, Revelation ↔ Revelations (very common slip)
//
// We expose:
//   - canonicalBook(input): returns the canonical name (string) or null
//   - canonicalBookFuzzy(input, maxDistance=2): returns the canonical
//     name even when the input has up to `maxDistance` Levenshtein
//     edits from any registered alias (single-word books). Returns
//     `{ book, distance, exact: boolean }` or null.

import bibleStructure from '@/data/bible-structure.json'

export type CanonicalBook = string

const CANONICAL_BOOKS: CanonicalBook[] = Object.keys(bibleStructure).filter(
  (k) => !k.startsWith('_'),
)

interface AliasEntry {
  alias: string
  canonical: CanonicalBook
}

// ─────────────────────────────────────────────────────────────────────
// Alias table. Order doesn't matter — duplicates are deduped. Aliases
// must already be lowercased + trimmed when registered (the lookup
// helpers normalise input the same way).
// ─────────────────────────────────────────────────────────────────────
const RAW_ALIASES: AliasEntry[] = []

function addAlias(canonical: CanonicalBook, ...aliases: string[]) {
  for (const a of aliases) {
    RAW_ALIASES.push({ alias: a.toLowerCase(), canonical })
  }
  // Always include the canonical itself + a no-space variant.
  RAW_ALIASES.push({ alias: canonical.toLowerCase(), canonical })
  RAW_ALIASES.push({ alias: canonical.toLowerCase().replace(/\s+/g, ''), canonical })
}

// ── Pentateuch ───────────────────────────────────────────────────────
addAlias('Genesis', 'gen', 'gn', 'ge', 'genisis', 'genis', 'genesys')
addAlias('Exodus', 'exo', 'ex', 'exod', 'exidus', 'exudus')
addAlias('Leviticus', 'lev', 'lv', 'levit', 'leviticis', 'leviticous')
addAlias('Numbers', 'num', 'nm', 'nu', 'numbres')
addAlias('Deuteronomy', 'deut', 'dt', 'deu', 'deutoronomy', 'deuternomy', 'duteronomy')

// ── Historical ───────────────────────────────────────────────────────
addAlias('Joshua', 'josh', 'jos', 'jsh', 'jashua', 'yoshua')
addAlias('Judges', 'judg', 'jdg', 'jud', 'juges')
addAlias('Ruth', 'ru', 'rth', 'roof')

// Ordinal books — first/second/third + 1st/2nd/3rd + roman + bare digit.
function addOrdinalAlias(canonical: CanonicalBook, base: string, num: 1 | 2 | 3, ...extra: string[]) {
  const ord =
    num === 1 ? ['1', '1st', 'first', 'i', 'one'] :
    num === 2 ? ['2', '2nd', 'second', 'ii', 'two'] :
                ['3', '3rd', 'third', 'iii', 'three']
  const baseForms = [base.toLowerCase(), ...extra.map((e) => e.toLowerCase())]
  for (const o of ord) {
    for (const b of baseForms) {
      RAW_ALIASES.push({ alias: `${o} ${b}`, canonical })
      RAW_ALIASES.push({ alias: `${o}${b}`, canonical })
      RAW_ALIASES.push({ alias: `${o}.${b}`, canonical })
      RAW_ALIASES.push({ alias: `${o} ${b}s`, canonical }) // catches "samuels" etc.
    }
  }
  // The bare canonical too
  RAW_ALIASES.push({ alias: canonical.toLowerCase(), canonical })
  RAW_ALIASES.push({ alias: canonical.toLowerCase().replace(/\s+/g, ''), canonical })
}

addOrdinalAlias('1 Samuel', 'samuel', 1, 'sam', 'sm', 'samul', 'samule')
addOrdinalAlias('2 Samuel', 'samuel', 2, 'sam', 'sm', 'samul', 'samule')
addOrdinalAlias('1 Kings', 'kings', 1, 'kgs', 'kng', 'king')
addOrdinalAlias('2 Kings', 'kings', 2, 'kgs', 'kng', 'king')
addOrdinalAlias('1 Chronicles', 'chronicles', 1, 'chron', 'chr', 'chronicals', 'cronicles', 'chronicle')
addOrdinalAlias('2 Chronicles', 'chronicles', 2, 'chron', 'chr', 'chronicals', 'cronicles', 'chronicle')

addAlias('Ezra', 'ezr', 'eza')
addAlias('Nehemiah', 'neh', 'nehemia', 'nehemya', 'nehmiah')
addAlias('Esther', 'est', 'esth', 'ester')

// ── Wisdom / Poetry ──────────────────────────────────────────────────
addAlias('Job', 'jb', 'jobe')
addAlias('Psalms', 'ps', 'psa', 'pss', 'psalm', 'salms', 'salm', 'psam', 'psm', 'psms', 'sams', 'sam', 'sums', 'palms', 'palm')
addAlias('Proverbs', 'prov', 'pr', 'prv', 'proverb', 'provebs', 'proverbes')
addAlias('Ecclesiastes', 'eccl', 'ecc', 'qoh', 'ecclesiates', 'eclesiastes', 'ecclesiast', 'ecclesiastis')
addAlias('Song of Solomon', 'song', 'songs', 'sg', 'sos', 'so', 'cant', 'canticles', 'song of songs', 'song of song', 'song solomon', 'songs of solomon', 'songs of song')

// ── Major prophets ───────────────────────────────────────────────────
addAlias('Isaiah', 'isa', 'is', 'isaia', 'isias', 'isiah')
addAlias('Jeremiah', 'jer', 'jr', 'jeremia', 'jeremih', 'jeremaiah', 'jeromiah')
addAlias('Lamentations', 'lam', 'la', 'lament', 'lamentation', 'lamintations')
addAlias('Ezekiel', 'ezek', 'eze', 'ezk', 'ezekial', 'ezekel', 'ezechial')
addAlias('Daniel', 'dan', 'dn', 'danl', 'danyel', 'daneil')

// ── Minor prophets ───────────────────────────────────────────────────
addAlias('Hosea', 'hos', 'ho', 'hoseah', 'osea')
addAlias('Joel', 'joe', 'jl', 'jole')
addAlias('Amos', 'am', 'amo')
addAlias('Obadiah', 'oba', 'obad', 'ob', 'obadia', 'abdias')
addAlias('Jonah', 'jon', 'jnh', 'jona', 'jonas')
addAlias('Micah', 'mic', 'mi', 'mich', 'micha', 'mika', 'mikah')
addAlias('Nahum', 'nah', 'na', 'naum')
addAlias('Habakkuk', 'hab', 'hb', 'habakuk', 'habacuc', 'habbakuk')
addAlias('Zephaniah', 'zep', 'zeph', 'zph', 'zephania', 'sophonias')
addAlias('Haggai', 'hag', 'hg', 'hagai', 'aggeus')
addAlias('Zechariah', 'zec', 'zech', 'zch', 'zecharia', 'zacharia', 'zachariah')
addAlias('Malachi', 'mal', 'ml', 'malach', 'malaki')

// ── Gospels & Acts ───────────────────────────────────────────────────
addAlias('Matthew', 'mt', 'matt', 'mat', 'matth', 'mathew', 'mathews', 'mathew', 'matthews', 'mateo')
addAlias('Mark', 'mk', 'mr', 'mrk', 'marko', 'marc')
addAlias('Luke', 'lk', 'lu', 'luk', 'lukas', 'lukus', 'lucas')
addAlias('John', 'jn', 'jhn', 'joh', 'jon', 'jons', 'jonh', 'gospel of john', 'st john', 'saint john')
addAlias('Acts', 'ac', 'act', 'acs', 'acts of the apostles', 'acts apostles')

// ── Pauline epistles ────────────────────────────────────────────────
addAlias('Romans', 'rom', 'rm', 'ro', 'roman', 'rooms')
addOrdinalAlias('1 Corinthians', 'corinthians', 1, 'cor', 'co', 'corinth', 'corinthian', 'corintians', 'corintian', 'corintns', 'corinshians', 'corinshans', 'corintheans', 'korinthians')
addOrdinalAlias('2 Corinthians', 'corinthians', 2, 'cor', 'co', 'corinth', 'corinthian', 'corintians', 'corintian', 'corintns', 'corinshians', 'corinshans', 'corintheans', 'korinthians')
addAlias('Galatians', 'gal', 'ga', 'galat', 'galatian', 'galations')
addAlias('Ephesians', 'eph', 'ephes', 'ephesian', 'efesians', 'efishans', 'ephisians', 'ephessians')
addAlias('Philippians', 'phil', 'php', 'philipians', 'philipian', 'philippian', 'phillipians', 'fillipians', 'fillipins')
addAlias('Colossians', 'col', 'colos', 'colosian', 'colosians', 'colossian', 'colossins')
addOrdinalAlias('1 Thessalonians', 'thessalonians', 1, 'thess', 'thes', 'th', 'thessalonian', 'thesalonians', 'tessalonians')
addOrdinalAlias('2 Thessalonians', 'thessalonians', 2, 'thess', 'thes', 'th', 'thessalonian', 'thesalonians', 'tessalonians')
addOrdinalAlias('1 Timothy', 'timothy', 1, 'tim', 'tm', 'timoth', 'timothee')
addOrdinalAlias('2 Timothy', 'timothy', 2, 'tim', 'tm', 'timoth', 'timothee')
addAlias('Titus', 'tit', 'tts', 'titus')
addAlias('Philemon', 'phlm', 'phm', 'philem', 'philemnon', 'phileon')

// ── General epistles & Revelation ───────────────────────────────────
addAlias('Hebrews', 'heb', 'hb', 'hebrew', 'hebrws', 'ebrews', 'hebros')
addAlias('James', 'jas', 'jm', 'jms', 'jas', 'jeems')
addOrdinalAlias('1 Peter', 'peter', 1, 'pet', 'pt', 'pete', 'peters')
addOrdinalAlias('2 Peter', 'peter', 2, 'pet', 'pt', 'pete', 'peters')
addOrdinalAlias('1 John', 'john', 1, 'jn', 'jhn', 'joh', 'jons')
addOrdinalAlias('2 John', 'john', 2, 'jn', 'jhn', 'joh', 'jons')
addOrdinalAlias('3 John', 'john', 3, 'jn', 'jhn', 'joh', 'jons')
addAlias('Jude', 'jud', 'jd', 'judes', 'judah')
addAlias('Revelation', 'rev', 'rv', 're', 'revelations', 'revelashions', 'apocalypse', 'apocalips')

// ─────────────────────────────────────────────────────────────────────
// Index + lookup helpers
// ─────────────────────────────────────────────────────────────────────
const ALIAS_TO_BOOK = new Map<string, CanonicalBook>()
for (const { alias, canonical } of RAW_ALIASES) {
  // Last write wins — but since we registered the canonical for every
  // book at the top of addAlias(), the canonical name always points to
  // itself even if some rare alias accidentally collides.
  ALIAS_TO_BOOK.set(alias, canonical)
}

const ALL_ALIASES: string[] = Array.from(ALIAS_TO_BOOK.keys())

/** Strip punctuation, collapse whitespace, lowercase. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,;:!?'"`()\[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Look up a book by exact-or-cleaned alias. Returns the canonical book
 * name or null. This is the fast path — the engine should call this
 * first before reaching for fuzzy matching.
 */
export function canonicalBook(input: string): CanonicalBook | null {
  const n = norm(input)
  if (!n) return null
  return ALIAS_TO_BOOK.get(n) ?? ALIAS_TO_BOOK.get(n.replace(/\s+/g, '')) ?? null
}

/**
 * Levenshtein distance, capped at `cap` for early-exit. We never need
 * more than 2-3 edits; anything beyond that is too noisy to claim as a
 * Bible book name.
 */
function levenshtein(a: string, b: string, cap: number): number {
  if (a === b) return 0
  const la = a.length, lb = b.length
  if (Math.abs(la - lb) > cap) return cap + 1
  let prev = new Array(lb + 1)
  let curr = new Array(lb + 1)
  for (let j = 0; j <= lb; j++) prev[j] = j
  for (let i = 1; i <= la; i++) {
    curr[0] = i
    let rowMin = curr[0]
    for (let j = 1; j <= lb; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
      if (curr[j] < rowMin) rowMin = curr[j]
    }
    if (rowMin > cap) return cap + 1
    ;[prev, curr] = [curr, prev]
  }
  return prev[lb]
}

export interface FuzzyBookResult {
  book: CanonicalBook
  distance: number
  exact: boolean
  alias: string
}

/**
 * Fuzzy book name lookup with bounded Levenshtein. Returns the closest
 * registered alias if its distance is ≤ `maxDistance` (default 2).
 *
 * Used when the operator's mic produced a mangled token that didn't
 * hit the exact-alias table — e.g. "corintheons" → "corinthians"
 * (distance 1), "ephisians" → "ephesians" (distance 1).
 *
 * For ordinal books ("1 Corinthians" et al.) we ALSO try the bare base
 * ("corintheons") and re-attach the spoken ordinal we detected
 * separately. The reference engine handles that — this function only
 * does single-token fuzzy.
 */
export function canonicalBookFuzzy(input: string, maxDistance = 2): FuzzyBookResult | null {
  const n = norm(input)
  if (!n) return null
  const exact = ALIAS_TO_BOOK.get(n) ?? ALIAS_TO_BOOK.get(n.replace(/\s+/g, ''))
  if (exact) return { book: exact, distance: 0, exact: true, alias: n }

  let best: FuzzyBookResult | null = null
  for (const alias of ALL_ALIASES) {
    // Cheap pre-filter: skip if length is way off — Levenshtein cap
    // would reject it anyway.
    if (Math.abs(alias.length - n.length) > maxDistance) continue
    const d = levenshtein(n, alias, maxDistance)
    if (d <= maxDistance && (best === null || d < best.distance)) {
      const canonical = ALIAS_TO_BOOK.get(alias)!
      best = { book: canonical, distance: d, exact: false, alias }
      if (d === 0) break
    }
  }
  return best
}

export function listCanonicalBooks(): CanonicalBook[] {
  return CANONICAL_BOOKS.slice()
}

/**
 * All registered aliases — exported only for tests. The engine uses
 * the lookup helpers above, never this list directly.
 */
export const __ALL_ALIASES_FOR_TESTS = ALL_ALIASES
