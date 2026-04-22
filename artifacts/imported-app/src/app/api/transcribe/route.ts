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
 * We forward to OpenAI's gpt-4o-mini-transcribe through Replit's AI
 * Integrations proxy (no user API key required) and return the
 * transcript text. The renderer chains chunks into a running transcript.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

let client: OpenAI | null = null
function getClient(): OpenAI | null {
  if (client) return client
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY
  if (!baseURL || !apiKey) return null
  client = new OpenAI({ baseURL, apiKey })
  return client
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
  const openai = getClient()
  if (!openai) {
    return NextResponse.json(
      { error: 'Transcription service is not configured.' },
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
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
