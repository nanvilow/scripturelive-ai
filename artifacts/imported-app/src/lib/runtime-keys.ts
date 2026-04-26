// v0.5.52 — Effective cloud key resolver for the renderer.
//
// The Electron build bakes the operator's keys into the JS bundle via
// next.config.ts `env`. The admin (Ctrl+Shift+P → Settings) can paste
// per-install overrides which are persisted server-side in
// `~/.scripturelive/license.json`. This module fetches the override
// pair once on app start, caches it, and exposes:
//
//   getOpenAIKey() / getDeepgramKey() — synchronous, returns the
//     OVERRIDE if cached, else the BAKED key, else null.
//   refreshKeyOverrides() — re-fetch from /api/license/admin/keys,
//     used right after the admin saves a new value.
//
// The hooks (use-deepgram-streaming, use-whisper-speech-recognition)
// import these directly. No proxy through the api-server.

const BAKED_OPENAI =
  (typeof process !== 'undefined'
    ? process.env.NEXT_PUBLIC_SCRIPTURELIVE_OPENAI_KEY
    : '') || ''
const BAKED_DEEPGRAM =
  (typeof process !== 'undefined'
    ? process.env.NEXT_PUBLIC_SCRIPTURELIVE_DEEPGRAM_KEY
    : '') || ''

let overrideOpenAI: string | null = null
let overrideDeepgram: string | null = null
let bootstrapPromise: Promise<void> | null = null

interface KeyOverridesResponse {
  openai?: string | null
  deepgram?: string | null
}

async function fetchOverrides(): Promise<void> {
  if (typeof fetch === 'undefined') return
  try {
    const r = await fetch('/api/license/admin/keys', { cache: 'no-store' })
    if (!r.ok) return
    const j = (await r.json()) as KeyOverridesResponse
    overrideOpenAI = (j.openai ?? '').trim() || null
    overrideDeepgram = (j.deepgram ?? '').trim() || null
  } catch {
    /* ignore — falls back to baked */
  }
}

/** Kick off the override fetch once. Safe to call from many places. */
export function bootstrapRuntimeKeys(): Promise<void> {
  if (!bootstrapPromise) bootstrapPromise = fetchOverrides()
  return bootstrapPromise
}

/** Force a re-fetch (call after admin saves new override values). */
export async function refreshKeyOverrides(): Promise<void> {
  bootstrapPromise = fetchOverrides()
  return bootstrapPromise
}

export function getOpenAIKey(): string | null {
  if (overrideOpenAI) return overrideOpenAI
  return BAKED_OPENAI || null
}

export function getDeepgramKey(): string | null {
  if (overrideDeepgram) return overrideDeepgram
  return BAKED_DEEPGRAM || null
}

/** Diagnostic — used by Settings UI to render "managed by admin" badges. */
export function getKeyStatus(): {
  openai: { source: 'override' | 'baked' | 'missing' }
  deepgram: { source: 'override' | 'baked' | 'missing' }
} {
  return {
    openai: {
      source: overrideOpenAI ? 'override' : BAKED_OPENAI ? 'baked' : 'missing',
    },
    deepgram: {
      source: overrideDeepgram
        ? 'override'
        : BAKED_DEEPGRAM
        ? 'baked'
        : 'missing',
    },
  }
}
