// v0.6.0 — AI semantic Bible verse matcher.
//
// Pipeline:
//   1.  At first call, batch-embed every entry in POPULAR_VERSES_KJV
//       via the OpenAI text-embedding-3-small endpoint (1536-dim).
//       The result is cached in process memory for the lifetime of
//       the Next.js worker, so subsequent matches are pure cosine
//       math — no network roundtrip.
//   2.  For each transcript phrase, embed once, then compute cosine
//       similarity against every cached verse vector. Sort desc.
//   3.  Apply confidence thresholds:
//          ≥ 0.75  →  HIGH    (auto-display, send live)
//          0.55–0.75 →  MEDIUM (preview / suggestion only)
//          < 0.55  →  LOW     (ignore — no match)
//   4.  Return the canonical KJV reference, the ORIGINAL KJV text
//       used for the match, and the confidence score. The caller is
//       responsible for re-fetching the same reference in the
//       operator's currently-selected translation (NIV/ESV/etc.) via
//       the existing /api/bible endpoint — that's the multi-
//       translation mapping promised in the v0.6.0 spec.
//
// Why text-embedding-3-small?
//   • Cheap: $0.02 / 1M tokens, ≈ $0.0006 to embed all popular verses
//     once at boot.
//   • Fast: per-query embedding latency ≈ 80–150 ms in our region.
//   • Adequate semantic recall for paraphrased preaching text — a
//     pastor saying "Jesus is my way, the truth, and the life" still
//     scores 0.85+ against John 14:6.
//
// The matcher gracefully no-ops if OPENAI_API_KEY is unset (returns
// LOW confidence for everything), so the desktop installer keeps
// working in air-gapped venues — the caller falls through to the
// existing regex-based detector.

import OpenAI from 'openai'
import { POPULAR_VERSES_KJV, type PopularVerse } from './popular-verses'

const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIM = 1536

/** Confidence buckets per the v0.6.0 spec. */
export type ConfidenceLevel = 'high' | 'medium' | 'low'
export const CONFIDENCE_HIGH_THRESHOLD = 0.75
// v0.6.4 — Lowered from 0.55 to 0.50. Operator feedback: more
// paraphrased verses should at least surface as a SUGGESTION chip
// (medium) so the operator can one-click confirm; HIGH stays at 0.75
// so auto-display only fires on near-verbatim matches. The matcher
// still hides anything below this threshold from the response.
export const CONFIDENCE_MEDIUM_THRESHOLD = 0.50

export interface SemanticMatch {
  /** Canonical KJV reference, e.g. "John 3:16" — re-fetch in any translation. */
  reference: string
  /** Verse metadata copied from POPULAR_VERSES_KJV. */
  book: string
  chapter: number
  verseStart: number
  verseEnd?: number
  /** The KJV text used for the embedding match. */
  text: string
  /** Cosine similarity 0..1 (1 = identical). */
  score: number
  /** High / medium / low bucket. */
  confidence: ConfidenceLevel
}

interface CachedVerse extends PopularVerse {
  embedding: Float32Array
}

let cache: CachedVerse[] | null = null
let cacheLoading: Promise<CachedVerse[]> | null = null
let openaiClient: OpenAI | null = null

function getClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return openaiClient
}

/** Cosine similarity for two equal-length Float32 vectors. */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0
  let normA = 0
  let normB = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

function classify(score: number): ConfidenceLevel {
  if (score >= CONFIDENCE_HIGH_THRESHOLD) return 'high'
  if (score >= CONFIDENCE_MEDIUM_THRESHOLD) return 'medium'
  return 'low'
}

/**
 * Lazily embed every popular verse on the first call. Subsequent calls
 * resolve instantly. A concurrent caller during the first cold start
 * shares the same in-flight promise rather than re-embedding.
 */
async function ensureCache(): Promise<CachedVerse[]> {
  if (cache) return cache
  if (cacheLoading) return cacheLoading

  const client = getClient()
  if (!client) {
    cache = []
    return cache
  }

  cacheLoading = (async () => {
    const verses = [...POPULAR_VERSES_KJV]
    const out: CachedVerse[] = []
    // OpenAI embeddings endpoint accepts arrays of up to ~2048 inputs.
    // 200 verses fits comfortably in a single request — but we batch
    // by 100 just to keep payloads small and easier to retry.
    const BATCH = 100
    for (let i = 0; i < verses.length; i += BATCH) {
      const batch = verses.slice(i, i + BATCH)
      const inputs = batch.map((v) => `${v.reference} — ${v.text}`)
      const resp = await client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: inputs,
      })
      resp.data.forEach((row, j) => {
        const v = batch[j]
        const e = row.embedding as number[]
        if (!Array.isArray(e) || e.length !== EMBEDDING_DIM) {
          // Skip silently — falls through to "no match" for that verse.
          return
        }
        out.push({ ...v, embedding: Float32Array.from(e) })
      })
    }
    cache = out
    cacheLoading = null
    return cache
  })()
  return cacheLoading
}

/**
 * Public matcher. Returns up to `topK` matches sorted by descending
 * score. Filters out anything below CONFIDENCE_MEDIUM_THRESHOLD by
 * default — the caller can opt back in to LOW matches by passing
 * `includeLow: true` (used by the debug panel).
 */
export async function matchTranscriptToVerses(
  text: string,
  opts?: { topK?: number; includeLow?: boolean },
): Promise<SemanticMatch[]> {
  const trimmed = (text || '').trim()
  if (trimmed.length < 8) return []

  const client = getClient()
  if (!client) return []

  const verses = await ensureCache()
  if (verses.length === 0) return []

  // Embed the query phrase.
  let queryVec: Float32Array
  try {
    const resp = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: trimmed,
    })
    const e = resp.data[0]?.embedding as number[] | undefined
    if (!e || e.length !== EMBEDDING_DIM) return []
    queryVec = Float32Array.from(e)
  } catch {
    // Network / quota error → fail open so the regex matcher in the
    // caller still has a chance to find references in the same text.
    return []
  }

  // Score every cached verse.
  const scored: SemanticMatch[] = verses.map((v) => {
    const score = cosineSimilarity(queryVec, v.embedding)
    return {
      reference: v.reference,
      book: v.book,
      chapter: v.chapter,
      verseStart: v.verseStart,
      verseEnd: v.verseEnd,
      text: v.text,
      score,
      confidence: classify(score),
    }
  })

  scored.sort((a, b) => b.score - a.score)
  const topK = Math.max(1, Math.min(20, opts?.topK ?? 5))
  const top = scored.slice(0, topK)
  if (opts?.includeLow) return top
  return top.filter((m) => m.confidence !== 'low')
}

/** Diagnostic: report cache state for the admin / health endpoint. */
export function semanticMatcherStatus(): {
  ready: boolean
  cacheSize: number
  loading: boolean
  hasApiKey: boolean
} {
  return {
    ready: cache !== null && cache.length > 0,
    cacheSize: cache?.length ?? 0,
    loading: cacheLoading !== null,
    hasApiKey: !!process.env.OPENAI_API_KEY,
  }
}

/** Force-warm the cache (called by the API route the first time it is hit
 *  so the operator's first transcript phrase doesn't pay the cold-start
 *  embedding cost). */
export async function warmSemanticMatcher(): Promise<void> {
  await ensureCache()
}
