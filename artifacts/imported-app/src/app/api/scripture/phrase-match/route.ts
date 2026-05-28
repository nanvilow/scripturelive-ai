// v0.7.239 — POST /api/scripture/phrase-match
//
// Fast in-memory n-gram (1-4 word) Bible quotation matcher. Companion
// to /api/scripture/semantic-match (which embeds full quotes and runs
// cosine similarity via OpenAI). This route is:
//
//   • Network-free      — pure local Map lookup, no API key required.
//   • Sub-millisecond   — O(1) per n-gram probe.
//   • Short-fragment    — answers the 1-4 word voice command case the
//                         semantic matcher's ≥8 char gate explicitly
//                         leaves open.
//
// Body: {
//   text:                      string   // transcript fragment
//   topK?:                     number   // 1..50, default 5
//   minN?:                     number   // 1..4, default 2 (single-word matches off by default)
//   allowDuplicateReferences?: boolean  // expose per-surface-form matches
// }
//
// Resp: {
//   ok: true,
//   matches: PhraseMatch[],
//   queryTokens: number,
//   probedNgrams: number,
//   status: { ready, corpusSize, ngramCount }
// }

import { NextRequest, NextResponse } from 'next/server'
import {
  matchTranscript,
  phraseIndexStatus,
  warmPhraseIndex,
} from '@/lib/ai/phrase-index'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Body {
  text?: string
  topK?: number
  minN?: number
  allowDuplicateReferences?: boolean
}

export async function POST(req: NextRequest) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ ok: false, error: 'Body must be JSON' }, { status: 400 })
  }

  const text = String(body.text ?? '').trim()
  if (!text) {
    return NextResponse.json(
      { ok: false, error: 'text is required' },
      { status: 400 },
    )
  }

  // Defensive cap — phrase-index is fast enough to handle large
  // transcripts but a runaway sermon block would still allocate
  // O(N) n-grams unnecessarily.
  const MAX_CHARS = 2000
  const safe = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text

  try {
    const result = matchTranscript(safe, {
      topK: body.topK,
      minN: body.minN,
      allowDuplicateReferences: body.allowDuplicateReferences === true,
    })
    return NextResponse.json(
      {
        ok: true,
        matches: result.matches,
        queryTokens: result.queryTokens,
        probedNgrams: result.probedNgrams,
        status: phraseIndexStatus(),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        status: phraseIndexStatus(),
      },
      { status: 500 },
    )
  }
}

// GET: warm-up + diagnostics. Called once by the SpeechProvider on
// first listen-start so the cold-start index-build cost lands BEFORE
// the operator's first transcript phrase, not in the critical path.
export async function GET() {
  try {
    warmPhraseIndex()
  } catch {
    /* swallow — status() still surfaces the failure */
  }
  return NextResponse.json(
    { ok: true, status: phraseIndexStatus() },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
