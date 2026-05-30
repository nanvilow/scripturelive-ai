// v0.7.239 — Fast n-gram Bible quotation recognition.
//
// Why this exists:
//   The semantic-matcher (src/lib/ai/semantic-matcher.ts) is the
//   heavyweight path — it embeds every catalogue entry once at boot
//   and runs cosine similarity per query against ~1300 vectors via
//   OpenAI's text-embedding-3-small endpoint (≈80–150 ms per query,
//   requires API key, requires ≥8 chars input). That works great for
//   full-sentence paraphrases but it cannot answer the operator's
//   "spoken phrase of up to 4 words instantly matches a Bible verse"
//   ask:
//
//        Spoken words:  "king couldn't sleep"
//        Match result:  Esther 6:1
//        Verse:         "That night, the king couldn't sleep."
//
//   The phrase-index is the lightweight path that handles exactly
//   that case. It is:
//
//     • In-memory (no network, no API key required, works offline).
//     • Sub-millisecond per query (O(1) hash lookup on each n-gram).
//     • Catches 1–4 word fragments — the gap the semantic matcher's
//       ≥8 char gate explicitly leaves open.
//     • Indexes the same corpus the semantic matcher embeds:
//       PARAPHRASE_VERSES (1081 entries as of Tier 1B/1C) +
//       POPULAR_VERSES_KJV (~200) + PREACHER_PHRASES (Bible-addressed
//       only). All three were already trusted by the cosine path —
//       reusing them avoids a fork-of-truth.
//
// Algorithm:
//   1. At first call, normalise every catalogue entry's `text` and
//      tokenise it into lowercase content tokens (stopwords + ASCII
//      punctuation stripped). Generate every 1–4 token contiguous
//      n-gram from that token stream.
//   2. Insert each n-gram into a Map<phrase, IndexedEntry[]>. The
//      same phrase frequently maps to multiple verses ("god so loved"
//      is unique to John 3:16, but "the lord" appears thousands of
//      times) — the index keeps the full list and the matcher ranks
//      candidates by phrase length (longer n-gram = more specific
//      match) then by phrase rarity (fewer hits = more discriminating)
//      then by first occurrence.
//   3. At query time, tokenise the transcript the same way and slide
//      a 1–4 token window across it. For every window, look up the
//      phrase in the index. The longest matching n-gram wins; ties
//      are broken by rarity (fewer index entries = more
//      discriminating).
//
// Why 1–4 words?
//   • 1-word phrases are noisy ("light" matches dozens of verses) but
//     useful as a tiebreak signal and for very short pulpit fragments.
//   • 2-3 word phrases are the sweet spot ("god so loved", "valley
//     shadow", "born again") — high specificity, low noise.
//   • 4-word phrases capture nearly every distinctive paraphrase
//     ("the just shall live", "fight the good fight").
//   • Beyond 4 words the semantic matcher's cosine path is strictly
//     better — it tolerates word reorder and synonyms, both of which
//     defeat exact n-gram lookup.
//
// Stopword list:
//   Standard English function words PLUS Bible-prosody fillers ("o",
//   "lo", "verily", "amen") that add no discriminating signal. The
//   list is deliberately small — every stopword removed from queries
//   means a fewer-word n-gram match could still fire.
//
// This module is the engine. It does NOT replace the semantic matcher
// or the local preacher-phrase engine; it's a new in-memory tier that
// can run BEFORE either (zero cost, instant answer for short
// fragments). The dispatcher wiring is intentionally NOT changed in
// this commit — operator integrates when ready.

import { POPULAR_VERSES_KJV, type PopularVerse } from './popular-verses'
import { PARAPHRASE_VERSES } from './paraphrase-verses'
import { PREACHER_PHRASES } from '@/lib/bibles/preacher-phrases'

// Source tag — useful for the diagnostic / debug panel so the
// operator can see which catalogue a given match came from.
export type PhraseSource = 'paraphrase' | 'popular' | 'preacher'

export interface PhraseEntry {
  /** Canonical "Book Chapter:Verse" reference. */
  reference: string
  /**
   * The exact text that was indexed and matched. This is one of:
   *   • a hand-curated paraphrase (PARAPHRASE_VERSES) — short,
   *     modern, conversational. For paraphrase wins this IS the
   *     operator-visible verse-row text (e.g. "That night the king
   *     couldn't sleep." for Esther 6:1).
   *   • the full KJV verse text (POPULAR_VERSES_KJV).
   *   • a short preacher fragment (PREACHER_PHRASES) — e.g. "the
   *     just shall live by faith".
   * Callers that need the verse in the operator's currently-selected
   * translation MUST re-fetch by `reference` from the existing
   * /api/bible endpoint (same contract as semantic-matcher.ts L286).
   * This mirrors the established multi-translation pattern: the
   * matcher returns WHAT IT MATCHED, the chip layer renders the
   * operator's chosen translation.
   */
  text: string
  book: string
  chapter: number
  verseStart: number
  verseEnd?: number
  /** Which catalogue this entry came from. */
  source: PhraseSource
}

export interface PhraseMatch extends PhraseEntry {
  /** The n-gram (1–4 lowercase tokens, space-joined) that matched. */
  matchedPhrase: string
  /** Length of the matched n-gram in tokens. */
  phraseLength: number
  /**
   * Heuristic score 0..1.
   *   • phraseLength contributes the bulk (1-token = .25, 4-token = 1.0)
   *   • rarity bonus: 1 / log(index hits + 1), capped at +.25
   *   • exact-text match (whole catalogue text appears in transcript)
   *     pins score to 1.0
   */
  score: number
}

// ── Tokeniser ────────────────────────────────────────────────────────

// Stopwords removed before n-gram extraction. Kept intentionally
// short — anything in this list will never anchor a match.
const STOPWORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'the',
  'and', 'or', 'but', 'nor', 'so', 'yet', 'for',
  'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
  'do', 'does', 'did', 'doing',
  'have', 'has', 'had', 'having',
  'to', 'of', 'in', 'on', 'at', 'by', 'with', 'from', 'as',
  'i', 'me', 'my', 'we', 'us', 'our', 'you', 'your', 'he', 'him',
  'his', 'she', 'her', 'it', 'its', 'they', 'them', 'their',
  'that', 'this', 'these', 'those', 'which', 'who', 'whom', 'whose',
  'what', 'where', 'when', 'why', 'how',
  'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might',
  'must', 'ought',
  'not', 'no', 'nor', 'never',
  // Bible-prosody fillers
  'o', 'lo', 'verily', 'amen', 'unto', 'thee', 'thou', 'thy', 'thine',
  'ye', 'yea',
])

// "couldn't" → "couldnt"; "Lord's" → "lords"; em-dash → space.
// Numbers (e.g. verse numbers, ordinal prefixes in book names) are
// preserved so "1 corinthians" indexes both "1" and "corinthians" as
// content tokens — operator-spoken book names route through this same
// tokeniser at query time.
function normalise(text: string): string {
  return text
    .toLowerCase()
    // Curly apostrophes / quotes → ASCII so contractions normalise.
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    // Strip apostrophes WITHOUT inserting space so contractions
    // collapse ("couldn't" → "couldnt", "lord's" → "lords"). Then
    // strip remaining punctuation WITH space so adjacent words
    // don't fuse ("king,sleep" → "king sleep" not "kingsleep").
    .replace(/'+/g, '')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function tokenise(text: string): string[] {
  if (!text) return []
  const normalised = normalise(text)
  if (!normalised) return []
  return normalised.split(' ').filter((t) => t.length > 0 && !STOPWORDS.has(t))
}

// Generate every contiguous 1..maxN token n-gram from a token list.
function ngrams(tokens: string[], maxN: number): string[] {
  const out: string[] = []
  const n = tokens.length
  for (let len = 1; len <= maxN; len++) {
    if (len > n) break
    for (let i = 0; i + len <= n; i++) {
      out.push(tokens.slice(i, i + len).join(' '))
    }
  }
  return out
}

// ── Catalogue → PhraseEntry[] ────────────────────────────────────────

const REF_RE = /^(\d?\s*[A-Za-z]+(?:\s+[A-Za-z]+)?)\s+(\d+):(\d+)(?:-(\d+))?$/

function preacherEntries(): PhraseEntry[] {
  const out: PhraseEntry[] = []
  for (const p of PREACHER_PHRASES) {
    if (p.sermonOnly) continue
    const m = REF_RE.exec((p.reference || '').trim())
    if (!m) continue
    const chapter = Number(m[2])
    const verseStart = Number(m[3])
    if (!Number.isFinite(chapter) || !Number.isFinite(verseStart)) continue
    out.push({
      reference: p.reference,
      text: p.phrase,
      book: m[1].trim(),
      chapter,
      verseStart,
      verseEnd: m[4] ? Number(m[4]) : undefined,
      source: 'preacher',
    })
  }
  return out
}

function paraphraseEntries(): PhraseEntry[] {
  return PARAPHRASE_VERSES.map((v: PopularVerse) => ({
    reference: v.reference,
    text: v.text,
    book: v.book,
    chapter: v.chapter,
    verseStart: v.verseStart,
    verseEnd: v.verseEnd,
    source: 'paraphrase' as const,
  }))
}

function popularEntries(): PhraseEntry[] {
  return POPULAR_VERSES_KJV.map((v) => ({
    reference: v.reference,
    text: v.text,
    book: v.book,
    chapter: v.chapter,
    verseStart: v.verseStart,
    verseEnd: v.verseEnd,
    source: 'popular' as const,
  }))
}

// Order matters — when two catalogues both contain the same n-gram
// the FIRST entry in the indexed list wins ties. Paraphrases are
// listed first because they're shorter and more operator-facing
// (Tier 1B/1C was hand-curated against actual operator-reported
// misses); popular-verses next; preacher catalogue last.
function buildCorpus(): PhraseEntry[] {
  return [...paraphraseEntries(), ...popularEntries(), ...preacherEntries()]
}

// ── Index build + cache ──────────────────────────────────────────────

const MAX_NGRAM = 4

interface IndexedRef {
  /** Index into the corpus array (cheap pointer). */
  entryIdx: number
  /** Number of tokens in the matched phrase. */
  phraseLength: number
}

interface PhraseIndex {
  corpus: PhraseEntry[]
  /** phrase → list of (entry, length) pairs. */
  index: Map<string, IndexedRef[]>
}

let cache: PhraseIndex | null = null

function ensureIndex(): PhraseIndex {
  if (cache) return cache
  const corpus = buildCorpus()
  const index = new Map<string, IndexedRef[]>()
  for (let i = 0; i < corpus.length; i++) {
    const entry = corpus[i]
    const tokens = tokenise(entry.text)
    if (tokens.length === 0) continue
    const grams = ngrams(tokens, MAX_NGRAM)
    // Dedupe within a single entry so "the lord the lord" doesn't
    // double-weight a single catalogue row.
    const seen = new Set<string>()
    for (const g of grams) {
      if (seen.has(g)) continue
      seen.add(g)
      let bucket = index.get(g)
      if (!bucket) {
        bucket = []
        index.set(g, bucket)
      }
      bucket.push({ entryIdx: i, phraseLength: g.split(' ').length })
    }
  }
  cache = { corpus, index }
  return cache
}

// ── Public matcher ───────────────────────────────────────────────────

export interface MatchOptions {
  /** Maximum results to return. Default 5. Clamped to 1..50. */
  topK?: number
  /**
   * Only consider n-grams of at least this many tokens. Default 2 —
   * single-word matches are extremely noisy and would dominate the
   * result list with low-signal hits. Caller can drop to 1 for the
   * diagnostic panel by passing { minN: 1 }.
   */
  minN?: number
  /**
   * Allow same `reference` to appear multiple times in the result
   * (one per distinct surface form). Default false — chip layer
   * already dedupes on reference at display time. Diagnostic panel
   * can opt in.
   */
  allowDuplicateReferences?: boolean
}

export interface MatchTranscriptResult {
  /** Sorted desc by score. */
  matches: PhraseMatch[]
  /** Total tokens after stopword strip. */
  queryTokens: number
  /** Total distinct n-grams probed against the index. */
  probedNgrams: number
}

/**
 * Find Bible verses whose indexed text contains any 1–4 token n-gram
 * from the transcript. Synchronous, in-memory, no network.
 *
 * Example:
 *   matchTranscript("king couldn't sleep")
 *     → matches[0] = { reference: "Esther 6:1", matchedPhrase: "king couldnt sleep", phraseLength: 3, score: ~0.85 }
 */
export function matchTranscript(
  text: string,
  opts: MatchOptions = {},
): MatchTranscriptResult {
  const { corpus, index } = ensureIndex()
  const trimmed = (text || '').trim()
  if (!trimmed) {
    return { matches: [], queryTokens: 0, probedNgrams: 0 }
  }
  const tokens = tokenise(trimmed)
  if (tokens.length === 0) {
    return { matches: [], queryTokens: 0, probedNgrams: 0 }
  }

  const minN = Math.max(1, Math.min(MAX_NGRAM, opts.minN ?? 2))
  const topK = Math.max(1, Math.min(50, opts.topK ?? 5))
  const allowDup = opts.allowDuplicateReferences === true

  // Accumulate the BEST (longest, then rarest) hit per entry index.
  interface Hit {
    entryIdx: number
    matchedPhrase: string
    phraseLength: number
    bucketSize: number
  }
  const bestByEntry = new Map<number, Hit>()

  const probed = new Set<string>()
  // Sweep longest n-gram first so we can short-circuit per-window:
  // once a window matches at length L, we don't need to also record
  // its L-1, L-2, … sub-spans for that same entry.
  for (let len = MAX_NGRAM; len >= minN; len--) {
    if (len > tokens.length) continue
    for (let i = 0; i + len <= tokens.length; i++) {
      const gram = tokens.slice(i, i + len).join(' ')
      if (probed.has(gram)) continue
      probed.add(gram)
      const bucket = index.get(gram)
      if (!bucket) continue
      for (const ref of bucket) {
        const prior = bestByEntry.get(ref.entryIdx)
        if (
          !prior ||
          ref.phraseLength > prior.phraseLength ||
          (ref.phraseLength === prior.phraseLength &&
            bucket.length < prior.bucketSize)
        ) {
          bestByEntry.set(ref.entryIdx, {
            entryIdx: ref.entryIdx,
            matchedPhrase: gram,
            phraseLength: ref.phraseLength,
            bucketSize: bucket.length,
          })
        }
      }
    }
  }

  // Score: phraseLength contributes the bulk; rarity a small bonus;
  // exact-text hit pins to 1.0.
  const normalisedQuery = normalise(trimmed)
  const scored: PhraseMatch[] = []
  for (const hit of bestByEntry.values()) {
    const entry = corpus[hit.entryIdx]
    const lengthBase = Math.min(1, hit.phraseLength / MAX_NGRAM) // .25 .. 1.0
    const rarityBonus = Math.min(0.25, 1 / Math.log2(hit.bucketSize + 2))
    let score = lengthBase * 0.75 + rarityBonus
    const entryNorm = normalise(entry.text)
    if (entryNorm && normalisedQuery.includes(entryNorm)) {
      score = 1
    }
    scored.push({
      ...entry,
      matchedPhrase: hit.matchedPhrase,
      phraseLength: hit.phraseLength,
      score: Math.max(0, Math.min(1, score)),
    })
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (b.phraseLength !== a.phraseLength) return b.phraseLength - a.phraseLength
    return a.reference.localeCompare(b.reference)
  })

  let out: PhraseMatch[] = scored
  if (!allowDup) {
    const seenRef = new Set<string>()
    out = []
    for (const m of scored) {
      if (seenRef.has(m.reference)) continue
      seenRef.add(m.reference)
      out.push(m)
      if (out.length >= topK) break
    }
  } else {
    out = scored.slice(0, topK)
  }

  return { matches: out, queryTokens: tokens.length, probedNgrams: probed.size }
}

/** Diagnostic: report index state for the admin / health endpoint. */
export function phraseIndexStatus(): {
  ready: boolean
  corpusSize: number
  ngramCount: number
} {
  const built = cache !== null
  if (!built) {
    return { ready: false, corpusSize: 0, ngramCount: 0 }
  }
  return {
    ready: true,
    corpusSize: cache!.corpus.length,
    ngramCount: cache!.index.size,
  }
}

/** Force-build the index up front (called by the API GET handler). */
export function warmPhraseIndex(): void {
  ensureIndex()
}

/** Test-only: clear cached index so unit tests can rebuild fresh. */
export function __resetPhraseIndexForTests(): void {
  cache = null
}
