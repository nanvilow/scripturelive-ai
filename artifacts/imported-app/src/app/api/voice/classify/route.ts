// v0.7.29 — POST /api/voice/classify
//
// Phase 2 of the v0.8.0 plan: server-side bridge to the LLM voice
// classifier (src/lib/voice/llm-classifier.ts, scaffold shipped in
// v0.7.27). Called by the speech-provider as a fallback when the
// regex classifier (commands.ts → detectCommand) returns null or
// low confidence AND the utterance passes the command-likeness
// gate (src/lib/voice/llm-gate.ts).
//
// Body: {
//   transcript:  string                 // a transcript phrase
//   context?: {                         // live slide context
//     currentReference?:    string
//     currentTranslation?:  string
//     currentVerseIndex?:   number
//     chapterVerseCount?:   number
//     autoscrollActive?:    boolean
//   }
//   confidenceFloor?: number            // override (1..100)
// }
//
// Resp: {
//   ok: true,
//   command: VoiceCommand | null,       // null = no command / disabled / no key
//   reason?: 'disabled' | 'no_api_key'  // when command === null
// }
//
// The endpoint MUST be cheap to call when disabled — speech-provider
// caches the enabled flag from /api/voice/classifier-status, so this
// endpoint should normally only be invoked when enabled. The defensive
// flag check here guards against a stale client cache after the admin
// toggles the flag off.

import { NextRequest, NextResponse } from 'next/server'

import { classifyIntent, type LlmClassifierContext } from '@/lib/voice/llm-classifier'
import { getConfig, isLlmClassifierEnabled } from '@/lib/licensing/storage'
import { getOpenAIKey as getBakedOpenAIKey } from '@/lib/baked-credentials'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Body {
  transcript?: string
  context?: LlmClassifierContext
  confidenceFloor?: number
}

// v0.7.61 — Mirror semantic-matcher.resolveOpenAICreds(): proxy
// first (Replit AI Integrations — auto-provisioned, no admin key
// entry needed), then env, admin override, baked credential.
interface OpenAIClientCreds { apiKey: string; baseURL?: string }
function resolveOpenAICreds(): OpenAIClientCreds | undefined {
  const proxyUrl = (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || '').trim()
  const proxyKey = (process.env.AI_INTEGRATIONS_OPENAI_API_KEY || '').trim()
  if (proxyUrl && proxyKey) return { apiKey: proxyKey, baseURL: proxyUrl }
  const envKey = process.env.OPENAI_API_KEY
  if (envKey && envKey.trim().length > 0) return { apiKey: envKey.trim() }
  try {
    const cfg = getConfig()
    const adminKey = cfg?.adminOpenAIKey
    if (adminKey && adminKey.trim().length > 0) return { apiKey: adminKey.trim() }
  } catch {
    /* noop — see semantic-matcher.ts for rationale */
  }
  try {
    const baked = getBakedOpenAIKey()
    if (baked && baked.trim().length > 0) return { apiKey: baked.trim() }
  } catch {
    /* noop */
  }
  return undefined
}

export async function POST(req: NextRequest) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ ok: false, error: 'Body must be JSON' }, { status: 400 })
  }

  const transcript = String(body.transcript ?? '').trim()
  if (!transcript) {
    return NextResponse.json({ ok: false, error: 'transcript is required' }, { status: 400 })
  }

  // Gate on the per-PC enable flag. As of v0.7.32 the default is ON,
  // so this only short-circuits when an operator has explicitly
  // unticked the kill switch in Admin Modal → Cloud Keys (which
  // persists `enableLlmClassifier: false`). Use the helper rather
  // than an inline `=== true` check — see storage.ts for rationale.
  // Defensive against a stale client cache; the speech-provider also
  // caches the flag value so most disabled installs never hit this
  // endpoint at all.
  const cfg = getConfig()
  if (!isLlmClassifierEnabled(cfg)) {
    return NextResponse.json(
      { ok: true, command: null, reason: 'disabled' as const },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const creds = resolveOpenAICreds()
  if (!creds) {
    return NextResponse.json(
      { ok: true, command: null, reason: 'no_api_key' as const },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  // Bound the transcript size — runaway transcript chunks shouldn't
  // be able to blow up the chat completion token budget.
  const MAX_CHARS = 600
  const safe = transcript.length > MAX_CHARS ? transcript.slice(0, MAX_CHARS) : transcript

  // Floor: clamp 1..100, honouring per-PC override from the admin
  // settings if present, then the request override on top of that.
  const persistedFloor = typeof cfg?.llmClassifierConfidenceFloor === 'number'
    ? Math.min(100, Math.max(1, Math.floor(cfg.llmClassifierConfidenceFloor)))
    : undefined
  const reqFloor = typeof body.confidenceFloor === 'number'
    ? Math.min(100, Math.max(1, Math.floor(body.confidenceFloor)))
    : undefined
  const confidenceFloor = reqFloor ?? persistedFloor

  try {
    const command = await classifyIntent(safe, body.context, {
      apiKey: creds.apiKey,
      ...(creds.baseURL ? { baseURL: creds.baseURL } : {}),
      ...(confidenceFloor !== undefined ? { confidenceFloor } : {}),
    })
    return NextResponse.json(
      { ok: true, command },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (e) {
    // classifyIntent NEVER throws by contract, so reaching this path
    // means the storage or key resolution threw. Surface the error
    // to the renderer so the dev console shows it; the caller falls
    // back to the regex result either way.
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    )
  }
}
