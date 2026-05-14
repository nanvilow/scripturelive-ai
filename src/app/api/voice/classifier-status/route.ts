// v0.7.29 — GET /api/voice/classifier-status
//
// Cheap public probe so the renderer can decide whether to even
// ATTEMPT a /api/voice/classify call. Speech-provider fetches this
// once on mount (and on admin-modal save). Polling is unnecessary —
// the toggle changes almost never, and a stale "true" cache on a
// just-disabled install costs at most one wasted POST that the
// /classify route immediately rejects with `reason: 'disabled'`.
//
// Resp: {
//   ok: true,
//   enabled:    boolean,    // RuntimeConfig.enableLlmClassifier
//   hasApiKey:  boolean,    // is an OpenAI key resolvable on the server?
// }

import { NextResponse } from 'next/server'

import { getConfig, isLlmClassifierEnabled } from '@/lib/licensing/storage'
import { getOpenAIKey as getBakedOpenAIKey } from '@/lib/baked-credentials'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function hasResolvableKey(): boolean {
  const envKey = process.env.OPENAI_API_KEY
  if (envKey && envKey.trim().length > 0) return true
  try {
    const cfg = getConfig()
    if (cfg?.adminOpenAIKey && cfg.adminOpenAIKey.trim().length > 0) return true
  } catch {
    /* noop */
  }
  try {
    const baked = getBakedOpenAIKey()
    if (baked && baked.trim().length > 0) return true
  } catch {
    /* noop */
  }
  return false
}

export async function GET() {
  const cfg = getConfig()
  return NextResponse.json(
    {
      ok: true,
      // v0.7.32 — default ON; only an explicit `false` from a
      // dismissed kill switch returns false here. Helper enforces
      // the default-on contract — see storage.ts.
      enabled: isLlmClassifierEnabled(cfg),
      hasApiKey: hasResolvableKey(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
