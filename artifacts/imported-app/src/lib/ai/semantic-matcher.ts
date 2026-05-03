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
import { PREACHER_PHRASES } from '@/lib/bibles/preacher-phrases'
import { getConfig } from '@/lib/licensing/storage'
import { getOpenAIKey as getBakedOpenAIKey } from '@/lib/baked-credentials'

// v0.7.67 — Bring the preacher-phrase catalogue into the embedding
// pool so the AI (semantic) detector can match the same un-addressed
// quotations the LOCAL detector in preacher-phrases.ts already
// catches. Background: the local engine runs first in
// speech-provider.tsx and handles exact + ≥80% fuzzy matches with
// zero network cost. The semantic matcher is the next stop and was
// only embedding POPULAR_VERSES_KJV — so when a preacher said
// something the local engine MISSED (e.g. heavy paraphrase, severe
// transcription noise that knocked token-overlap below 80%, or a
// reference present in the preacher catalogue but not the popular
// canon — "though he slay me yet will I trust him", "trouble don't
// last always", "let the weak say I am strong"), the AI Detection
// chip stayed silent. Folding the catalogue into the cache fixes
// that: the LLM now scores cosine similarity against EVERY
// preacher-catalogue entry too, so deeper paraphrases of those
// phrases still surface as MEDIUM/HIGH chips.
//
// Implementation: each preacher phrase is synthesized as a
// PopularVerse-shaped record with the phrase itself as `text` (the
// catalogue is what the operator wants the AI to recognise, even
// though the canonical scripture text would be more verbose). The
// reference is parsed back into book/chapter/verse so the chip and
// re-fetch path work identically to a popular-verse hit. Sermon-only
// entries ("say amen somebody", reference === "General Sermon
// Phrase") are excluded — they have no Bible address to project.
//
// Dedupe: when a preacher phrase shares a reference with a popular
// verse (e.g. both have "Psalm 23:1"), BOTH embeddings are kept.
// They embed different surface forms ("the lord is my shepherd"
// vs the full KJV "The LORD is my shepherd; I shall not want.") so
// keeping both gives the matcher more recall — the cosine winner
// is still scored against the same reference, and the chip layer
// already dedupes on reference at display time.
export function preacherCatalogueAsVerses(): PopularVerse[] {
  // "Psalm 23:1" / "1 Samuel 17:47" / "Psalm 113:5-6"
  const REF_RE = /^(\d?\s*[A-Za-z]+(?:\s+[A-Za-z]+)?)\s+(\d+):(\d+)(?:-(\d+))?$/
  const out: PopularVerse[] = []
  for (const entry of PREACHER_PHRASES) {
    if (entry.sermonOnly) continue
    const m = REF_RE.exec(entry.reference.trim())
    if (!m) continue
    const book = m[1].trim()
    const chapter = Number(m[2])
    const verseStart = Number(m[3])
    const verseEnd = m[4] ? Number(m[4]) : undefined
    if (!Number.isFinite(chapter) || !Number.isFinite(verseStart)) continue
    out.push({
      reference: entry.reference,
      book,
      chapter,
      verseStart,
      verseEnd,
      text: entry.phrase,
    })
  }
  return out
}

// v0.7.25 — Resolve the OpenAI API key from THREE sources, in
// priority order. This matches the Deepgram philosophy
// (runtime-keys.ts): the .exe ships working out of the box, but
// admins can override per-PC if they want to use their own
// OpenAI account.
//
//   1. process.env.OPENAI_API_KEY
//        Dev override; also what the GitHub Actions build sets so
//        the inject-keys script can bake it. At runtime in a
//        packaged .exe this is normally empty.
//   2. License config `adminOpenAIKey`
//        Per-PC override an admin paste into the Admin modal
//        (src/components/license/admin-modal.tsx). Lets a single
//        church re-bill a different account without touching the
//        installer.
//   3. BAKED_OPENAI_KEY (via getBakedOpenAIKey)
//        The build-time bake, populated by scripts/inject-keys.mjs
//        from the OPENAI_API_KEY env var. This is what makes AI
//        features work for every operator out of the box, with no
//        configuration required.
//
// History:
//   v0.7.20 ripped the OpenAI bake out entirely (operator was
//   moving to Deepgram-only at the time). v0.7.23 added AI Verse
//   Search and v0.7.24 added passive AI Scripture Detection — both
//   need OpenAI. v0.7.24 wired through the per-PC license override
//   only, which still required every operator to paste their own
//   key. v0.7.25 restores the bake on the SERVER side (the matcher
//   runs in the Next.js API route, never in the renderer) so the
//   key never reaches the browser bundle.
// v0.7.61 — Resolve {apiKey, baseURL} from FOUR sources, in priority
// order. The new top entry is the Replit AI Integrations proxy:
// when AI_INTEGRATIONS_OPENAI_BASE_URL + AI_INTEGRATIONS_OPENAI_API_KEY
// are present (auto-provisioned on Replit by the platform — no admin
// key entry needed, charges go to the workspace owner's Replit
// credits) we route every OpenAI call through the proxy. This is the
// "just works like Deepgram" path the operator asked for. The other
// three sources remain as fallbacks for end-user .exe distributions
// that ship outside Replit.
//
//   1. AI_INTEGRATIONS_OPENAI_API_KEY + AI_INTEGRATIONS_OPENAI_BASE_URL
//        Replit-managed proxy. No setup required by the operator.
//   2. process.env.OPENAI_API_KEY
//        Dev override / GitHub Actions build-time injection.
//   3. License config `adminOpenAIKey`
//        Per-PC override via Admin Modal (used by packaged .exe).
//   4. BAKED_OPENAI_KEY (via getBakedOpenAIKey)
//        Build-time bake from inject-keys.mjs.
export interface OpenAIClientCreds {
  apiKey: string
  baseURL?: string
}

function resolveOpenAICreds(): OpenAIClientCreds | undefined {
  const proxyUrl = (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || '').trim()
  const proxyKey = (process.env.AI_INTEGRATIONS_OPENAI_API_KEY || '').trim()
  if (proxyUrl && proxyKey) {
    return { apiKey: proxyKey, baseURL: proxyUrl }
  }
  const envKey = process.env.OPENAI_API_KEY
  if (envKey && envKey.trim().length > 0) return { apiKey: envKey.trim() }
  try {
    const cfg = getConfig()
    const adminKey = cfg?.adminOpenAIKey
    if (adminKey && adminKey.trim().length > 0) return { apiKey: adminKey.trim() }
  } catch {
    // Defensive — license storage may not be initialised in unit
    // tests / SSR contexts. Fall through to the bake.
  }
  try {
    const baked = getBakedOpenAIKey()
    if (baked && baked.trim().length > 0) return { apiKey: baked.trim() }
  } catch {
    /* see prior comment */
  }
  return undefined
}

// Back-compat shim: callers that only need the key (e.g. the wiring
// test, the hasApiKey diagnostic) can keep using the old name.
function resolveOpenAIKey(): string | undefined {
  return resolveOpenAICreds()?.apiKey
}

const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIM = 1536

// v0.7.28 — Strip operator "introducing" preambles before embedding.
//
// Operator-reported regression: when the preacher said "here's a
// verse about loving your enemies" the passive AI Scripture Detection
// chip never surfaced. Root cause: the matcher embedded the FULL
// sentence (meta-wrapper included) and computed cosine similarity
// against the embedded popular verses. The wrapper words ("here's a
// verse about") dominate the embedding vector and drag the
// similarity score below the 0.50 medium threshold even when the
// trailing topic ("loving your enemies") is a near-perfect match
// for Matthew 5:44 ("Love your enemies, bless them that curse
// you…").
//
// The active find_by_quote VOICE COMMAND already extracts just the
// topic (because it parses "find the verse about X" with a regex
// that captures group 1). This fix gives the PASSIVE detector the
// same advantage by stripping the same family of preamble phrases
// before embedding.
//
// We are deliberately CONSERVATIVE about which preambles to strip:
// every pattern requires an explicit "verse|scripture|passage" token
// followed by an "about|on|that says|where|which" continuation. This
// guarantees we never strip leading words from a real paraphrased
// verse like "the Lord is my shepherd I shall not want" or "for God
// so loved the world" — both of which start with words our preamble
// regexes would otherwise match (the / for) but lack the
// verse/scripture/passage signal.
//
// If no preamble matches, the original phrase is returned unchanged
// so genuine paraphrases keep working exactly as they did before.
const PREAMBLE_PATTERNS: RegExp[] = [
  // "here's a verse about X", "here is the verse about X", "this is
  // a scripture about X", "there's a passage about X".
  /^(?:here'?s|here\s+is|there'?s|there\s+is|this\s+is)\s+(?:a|an|the|that|another|one)\s+(?:verse|scripture|passage|bible\s+verse)\s+(?:about|on|that\s+says|that\s+talks?\s+about|that\s+mentions?|where|which|saying)\s+/i,
  // "let me read a verse about X", "let's look at a passage about X",
  // "I want to share a verse about X", "I'll read the scripture
  // where X".
  /^(?:let'?s|let\s+me|let\s+us|i\s+(?:want|need|will|am\s+going|would\s+like)(?:\s+to)?|i'?ll|we\s+(?:want|need|will)(?:\s+to)?|we'?ll)\s+(?:read|share|look\s+at|see|find|hear|consider|examine|study)\s+(?:a|an|the|that|another)\s+(?:verse|scripture|passage|bible\s+verse)\s+(?:about|on|that\s+says|that\s+talks?\s+about|that\s+mentions?|where|which|saying)\s+/i,
  // "we have a verse about X", "I have a verse where X", "I've got
  // a scripture about X".
  /^(?:we\s+have|i\s+have|i'?ve\s+got|we'?ve\s+got)\s+(?:a|an|the|that|another)\s+(?:verse|scripture|passage|bible\s+verse)\s+(?:about|on|that\s+says|that\s+talks?\s+about|that\s+mentions?|where|which|saying)\s+/i,
  // "the verse about X" / "the scripture about X" / "the passage
  // where X". Bare opener — only stripped when an explicit
  // verse-token is present, so "the Lord is my shepherd" survives.
  /^the\s+(?:verse|scripture|passage|bible\s+verse)\s+(?:about|on|that\s+says|that\s+talks?\s+about|that\s+mentions?|where|which|saying)\s+/i,
  // "a verse about X" / "another scripture where X".
  /^(?:a|an|another)\s+(?:verse|scripture|passage|bible\s+verse)\s+(?:about|on|that\s+says|that\s+talks?\s+about|that\s+mentions?|where|which|saying)\s+/i,
  // Bare "scripture about X" / "passage about X" — unprefixed.
  /^(?:scripture|passage|bible\s+verse)\s+(?:about|on|that\s+says|that\s+talks?\s+about|that\s+mentions?|where|which|saying)\s+/i,
]

/**
 * v0.7.28 — Public for unit testing. Returns the topic phrase with
 * any recognised "operator introducing a verse" preamble stripped.
 * Returns the original (trimmed) text if no preamble matched. The
 * minimum-length guard (≥ 3 word characters in the result) prevents
 * stripping that would leave nothing useful to embed.
 */
export function stripIntroducingPreamble(text: string): string {
  const trimmed = (text || '').trim()
  if (!trimmed) return ''
  for (const re of PREAMBLE_PATTERNS) {
    if (!re.test(trimmed)) continue
    const stripped = trimmed.replace(re, '').trim()
    // Strip a trailing courtesy / punctuation tail too — preachers
    // often follow the topic with "right?" / "you know" / "amen".
    // Two-pass: strip trailing punctuation, then any trailing
    // courtesy word ("right", "amen", "you know"), then punctuation
    // again so a sequence like "salvation, amen" → "salvation".
    const cleaned = stripped
      .replace(/[\s,.;:!?]+$/, '')
      .replace(/[\s,.;:!?]*(?:right|you\s+know|amen|please|okay|ok)\s*[.!?]?\s*$/i, '')
      .replace(/[\s,.;:!?]+$/, '')
      .trim()
    const wordChars = cleaned.replace(/[^a-zA-Z0-9]/g, '')
    if (wordChars.length < 3) return trimmed
    return cleaned
  }
  return trimmed
}

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

// v0.7.24 — Track the key the cached client was created with so we
// rebuild the client when the admin rotates their key in the Admin
// modal without requiring an app restart. v0.7.61 — also rebuild
// when the baseURL changes (i.e. on switch between proxy and
// direct-key modes within a single dev session).
let openaiClientKey: string | undefined
let openaiClientBaseUrl: string | undefined

function getClient(): OpenAI | null {
  const creds = resolveOpenAICreds()
  if (!creds) return null
  const sameKey = openaiClientKey === creds.apiKey
  const sameBase = openaiClientBaseUrl === creds.baseURL
  if (!openaiClient || !sameKey || !sameBase) {
    openaiClient = new OpenAI(
      creds.baseURL
        ? { apiKey: creds.apiKey, baseURL: creds.baseURL }
        : { apiKey: creds.apiKey },
    )
    openaiClientKey = creds.apiKey
    openaiClientBaseUrl = creds.baseURL
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
    // v0.7.67 — Combine the canonical popular-verses set with the
    // preacher-phrase catalogue (Bible-addressed entries only) so
    // the AI Detection chip catches the same un-addressed
    // quotations the local engine already does, even when the
    // local engine's ≥80% token-overlap fuzzy gate dropped the
    // utterance.
    const verses = [...POPULAR_VERSES_KJV, ...preacherCatalogueAsVerses()]
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

  // v0.7.28 — Strip operator introducing preamble ("here's a verse
  // about X" → "X") before embedding so the cosine similarity is
  // computed against the actual topic phrase, not the meta-wrapper.
  // No-op when no preamble matches, so genuine paraphrases are
  // unaffected.
  const queryText = stripIntroducingPreamble(trimmed)
  if (queryText.length < 3) return []

  const client = getClient()
  if (!client) return []

  const verses = await ensureCache()
  if (verses.length === 0) return []

  // Embed the query phrase.
  let queryVec: Float32Array
  try {
    const resp = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: queryText,
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
    // v0.7.24 — true when EITHER process.env OR admin license key
    // is populated; matches the resolution order used by getClient().
    hasApiKey: !!resolveOpenAIKey(),
  }
}

/** Force-warm the cache (called by the API route the first time it is hit
 *  so the operator's first transcript phrase doesn't pay the cold-start
 *  embedding cost). */
export async function warmSemanticMatcher(): Promise<void> {
  await ensureCache()
}
