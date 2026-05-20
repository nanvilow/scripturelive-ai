// v0.7.122 — AI Detection / AI Search latency self-test.
//
// Operator request: "Test and optimize the response time and
// accuracy for the LLM, AI Search, and AI Detection."
//
// This endpoint exercises every external AI dependency the live
// pipeline touches and reports per-stage wall-clock latency back to
// the admin panel:
//
//   • EMBEDDING  — text-embedding-3-small round-trip on a fixed
//                  warm-up phrase. Mirrors the per-utterance call
//                  semantic-matcher.ts makes for AI Search.
//   • LLM        — gpt-4o-mini chat.completions round-trip on a
//                  trivial yes/no prompt. Mirrors llm-classifier.ts
//                  for voice command interpretation.
//   • SEMANTIC   — full matchTranscriptToVerses() call (ensures the
//                  embedding cache is warm + measures cosine compute).
//
// Each stage is wrapped in try/catch and reports its own ok/error so
// the operator can tell at a glance which dependency is slow / down.
// No mutation — safe to call repeatedly.

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/licensing/admin-auth'
import { matchTranscriptToVerses, resolveOpenAICreds, semanticMatcherStatus } from '@/lib/ai/semantic-matcher'
import OpenAI from 'openai'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface StageResult {
  ok: boolean
  ms: number
  error?: string
  detail?: unknown
}

const WARMUP_PHRASE = 'For God so loved the world that he gave his only begotten son'
const LLM_PROMPT = 'Reply with the single word OK and nothing else.'

async function timeStage(fn: () => Promise<unknown>): Promise<StageResult> {
  const start = performance.now()
  try {
    const detail = await fn()
    return { ok: true, ms: Math.round(performance.now() - start), detail }
  } catch (e) {
    return {
      ok: false,
      ms: Math.round(performance.now() - start),
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

export async function GET(req: NextRequest) {
  const guard = requireAdmin(req)
  if (guard) return guard

  const creds = resolveOpenAICreds()
  if (!creds) {
    return NextResponse.json({
      ok: false,
      error: 'No OpenAI API key configured (process.env.OPENAI_API_KEY or admin Cloud Keys).',
      stages: {},
      cache: semanticMatcherStatus(),
    })
  }

  const client = new OpenAI(creds.baseURL ? { apiKey: creds.apiKey, baseURL: creds.baseURL } : { apiKey: creds.apiKey })

  // Run the three stages SEQUENTIALLY so the operator gets clean
  // per-stage timings (parallel runs would inflate every stage by
  // the slowest network round-trip).
  const embedding = await timeStage(async () => {
    const resp = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: WARMUP_PHRASE,
    })
    return { dim: resp.data[0]?.embedding?.length ?? 0 }
  })

  const llm = await timeStage(async () => {
    const resp = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: LLM_PROMPT }],
      max_tokens: 4,
      temperature: 0,
    })
    return { reply: resp.choices?.[0]?.message?.content?.trim() ?? '' }
  })

  const semantic = await timeStage(async () => {
    const matches = await matchTranscriptToVerses(WARMUP_PHRASE, { topK: 3 })
    return {
      matchCount: matches.length,
      topReference: matches[0]?.reference ?? null,
      topScore: matches[0]?.score ?? null,
    }
  })

  const stages = { embedding, llm, semantic }
  const ok = embedding.ok && llm.ok && semantic.ok

  return NextResponse.json({
    ok,
    stages,
    cache: semanticMatcherStatus(),
    timestamp: new Date().toISOString(),
  })
}
