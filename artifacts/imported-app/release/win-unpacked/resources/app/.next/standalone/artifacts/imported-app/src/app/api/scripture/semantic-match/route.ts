// v0.6.0 — POST /api/scripture/semantic-match
//
// Body: {
//   text:        string   // a transcript phrase, ideally a full sentence
//   topK?:       number   // 1..20, defaults to 5
//   includeLow?: boolean  // include below-medium confidence matches
// }
//
// Resp: {
//   ok: true,
//   matches: SemanticMatch[],   // sorted desc by score, gated by threshold
//   status: { ready, cacheSize, loading, hasApiKey }
// }
//
// Used by the Live Scripture Detection panel to find verses that the
// preacher PARAPHRASED or quoted out of order — cases the regex
// detector in `bible-api.ts` misses because there's no "Book X:Y"
// reference token in the transcript. The two detectors run in
// parallel; their results are merged in the caller, with the regex
// matches preferred when they overlap (because they carry the
// operator's own translation pick).

import { NextRequest, NextResponse } from 'next/server'
import {
  matchTranscriptToVerses,
  semanticMatcherStatus,
  warmSemanticMatcher,
} from '@/lib/ai/semantic-matcher'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Body {
  text?: string
  topK?: number
  includeLow?: boolean
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

  // Hard upper bound — we don't want a runaway transcript chunk to
  // blow up the embedding token budget. text-embedding-3-small caps
  // at 8191 tokens (~32k chars); we cut at 2k chars defensively
  // because preaching context windows are typically <500 chars.
  const MAX_CHARS = 2000
  const safe = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text

  try {
    const matches = await matchTranscriptToVerses(safe, {
      topK: body.topK,
      includeLow: body.includeLow === true,
    })
    return NextResponse.json(
      {
        ok: true,
        matches,
        status: semanticMatcherStatus(),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        status: semanticMatcherStatus(),
      },
      { status: 500 },
    )
  }
}

// GET: warm-up + diagnostics. Called once by the SpeechProvider on
// first listen-start so the cold-start embedding cost (≈ 200 ms for
// the popular verse batch) lands BEFORE the operator's first
// transcript phrase, not in the critical path.
export async function GET() {
  try {
    await warmSemanticMatcher()
  } catch {
    /* swallow — status() still surfaces the failure */
  }
  return NextResponse.json(
    { ok: true, status: semanticMatcherStatus() },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
