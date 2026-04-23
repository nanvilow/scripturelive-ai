import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

/**
 * /api/transcribe — Whisper-based speech-to-text endpoint.
 *
 * Why this exists: the desktop (Electron) build cannot use the browser's
 * built-in webkitSpeechRecognition because Chromium ships without the
 * Google speech-to-text API key Chrome bundles. Web Speech bounces on
 * `network` errors forever inside any packaged Electron app.
 *
 * The renderer in the desktop build records short audio chunks via
 * MediaRecorder (webm/opus) and POSTs them here as multipart form-data.
 *
 * Auth strategy (in priority order):
 *   1. X-OpenAI-Key header — supplied by the renderer from the user's
 *      Settings page. This is the ONLY path that works in the packaged
 *      desktop installer, because the Replit AI Integrations env vars
 *      do not exist on the customer's PC.
 *   2. AI_INTEGRATIONS_OPENAI_* env vars — Replit-only proxy creds for
 *      development inside Replit's container.
 *   3. OPENAI_API_KEY env var — for self-hosted operators who set it
 *      via the OS environment.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

interface ClientSpec {
  baseURL?: string
  apiKey: string
}

// Cache one OpenAI client per (baseURL|apiKey) tuple so we don't spin
// up a fresh HTTPS agent for every chunk. LRU-capped at 8 entries —
// enough for a few rotating keys in dev plus the proxy slot, but
// bounded so a long-lived process can't grow the map indefinitely
// (e.g. a public preview that sees random keys for hours).
const CLIENT_CACHE_MAX = 8
const clientCache = new Map<string, OpenAI>()
function getClientFor(spec: ClientSpec | null): OpenAI | null {
  if (!spec) return null
  const cacheKey = `${spec.baseURL || 'https://api.openai.com/v1'}|${spec.apiKey.slice(0, 12)}`
  const existing = clientCache.get(cacheKey)
  if (existing) {
    // Touch — re-insert to mark as most-recently-used.
    clientCache.delete(cacheKey)
    clientCache.set(cacheKey, existing)
    return existing
  }
  const fresh = new OpenAI(spec.baseURL ? { baseURL: spec.baseURL, apiKey: spec.apiKey } : { apiKey: spec.apiKey })
  clientCache.set(cacheKey, fresh)
  // Evict oldest entries while over cap.
  while (clientCache.size > CLIENT_CACHE_MAX) {
    const oldest = clientCache.keys().next().value
    if (oldest === undefined) break
    clientCache.delete(oldest)
  }
  return fresh
}

function resolveClientSpec(req: NextRequest): ClientSpec | null {
  // 1) User-supplied key from Settings (works on installed desktop app).
  const headerKey = req.headers.get('x-openai-key')?.trim()
  if (headerKey) return { apiKey: headerKey }
  // 2) Replit AI Integrations proxy (dev only).
  const proxyKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY
  const proxyBase = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
  if (proxyKey && proxyBase) return { apiKey: proxyKey, baseURL: proxyBase }
  // 3) Plain env var fallback.
  const envKey = process.env.OPENAI_API_KEY
  if (envKey) return { apiKey: envKey }
  return null
}

// Same-origin gate. /api/transcribe spends server-side OpenAI credits,
// so we refuse cross-origin POSTs to keep a public-facing dev URL from
// being scraped into a free transcription endpoint. The desktop
// (Electron) renderer loads the same Next.js origin, so requests there
// pass this check naturally. We compare Origin / Referer against the
// request host, falling back to the absence of an Origin header (which
// browsers omit for same-origin form-data POSTs only sometimes — we
// also accept that case).
function isSameOriginRequest(req: NextRequest): boolean {
  const origin = req.headers.get('origin')
  const referer = req.headers.get('referer')
  const host = req.headers.get('host')
  if (!host) return false
  const expected = new Set([host, `localhost:${host.split(':')[1] || ''}`])
  const sources = [origin, referer].filter(Boolean) as string[]
  if (sources.length === 0) {
    // Same-origin form POSTs sometimes ship with no Origin/Referer.
    // Accept only when both are absent (cross-origin requests almost
    // always carry one or the other).
    return true
  }
  for (const src of sources) {
    try {
      const u = new URL(src)
      if (expected.has(u.host)) return true
    } catch { /* malformed — reject */ }
  }
  return false
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: 'Cross-origin requests are not permitted.' },
      { status: 403 },
    )
  }
  const spec = resolveClientSpec(request)
  const openai = getClientFor(spec)
  if (!openai) {
    return NextResponse.json(
      {
        error:
          'No OpenAI key configured. Open Settings → Voice Recognition and paste your OpenAI API key (starts with sk-…) to enable speech-to-text.',
      },
      { status: 503 },
    )
  }

  try {
    const form = await request.formData()
    const file = form.get('audio')
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: 'Missing "audio" file' }, { status: 400 })
    }
    if (file.size < 1024) {
      // Below ~1KB Whisper returns gibberish or empty — treat as silence.
      return NextResponse.json({ text: '' })
    }
    const lang = (form.get('language') as string | null) || 'en'

    // Wrap the Blob as a File so the SDK can submit it with a filename
    // (Whisper sniffs the format from the extension).
    const named = new File([file], 'chunk.webm', {
      type: file.type || 'audio/webm',
    })

    const result = await openai.audio.transcriptions.create({
      file: named,
      model: 'gpt-4o-mini-transcribe',
      language: lang,
      response_format: 'json',
    })

    const text = (result?.text || '').trim()
    return NextResponse.json({ text })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Transcription failed'
    console.error('[transcribe] failed:', msg)
    // Surface a clearer message for the most common operator-facing
    // failure: bad / expired key. The OpenAI SDK throws a string that
    // includes "Incorrect API key" or "401" — translate that into
    // operator-grade guidance.
    if (/Incorrect API key|401|Invalid.*api.*key|authentication/i.test(msg)) {
      return NextResponse.json(
        { error: 'OpenAI rejected the API key. Open Settings → Voice Recognition and paste a valid key (starts with sk-…).' },
        { status: 401 },
      )
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
