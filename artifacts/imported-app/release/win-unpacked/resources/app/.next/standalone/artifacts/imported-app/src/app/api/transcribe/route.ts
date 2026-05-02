import { NextRequest, NextResponse } from 'next/server'

/**
 * /api/transcribe — Deepgram-based speech-to-text endpoint.
 *
 * Why this exists: the desktop (Electron) build cannot use the browser's
 * built-in webkitSpeechRecognition because Chromium ships without the
 * Google speech-to-text API key Chrome bundles. Web Speech bounces on
 * `network` errors forever inside any packaged Electron app.
 *
 * The renderer in the desktop build records short audio chunks via
 * MediaRecorder (webm/opus) and POSTs them here as multipart form-data.
 *
 * ─── Resolution strategy ──────────────────────────────────────────────
 *
 * v0.7.19 — OpenAI removed entirely (the operator's project key was
 * rotated and the rotation never propagated cleanly to the Replit
 * deployment, so customers in Ghana were getting 401s on every
 * MediaRecorder chunk). We now use Deepgram for both the streaming WS
 * path AND this batched HTTP path, so a single DEEPGRAM_API_KEY runs
 * the whole transcription stack.
 *
 *   1. `DEEPGRAM_API_KEY`             — direct call to Deepgram's
 *                                       /v1/listen REST endpoint. Used
 *                                       when this Next.js server is
 *                                       itself deployed on Replit (or
 *                                       running in dev) with the
 *                                       secret set.
 *   2. `TRANSCRIBE_PROXY_URL`         — forward this request as-is to a
 *                                       remote proxy (the api-server
 *                                       artifact deployed on Replit).
 *                                       The bundled Electron app sets
 *                                       this env when it spawns the
 *                                       Next.js standalone server, so
 *                                       customers' machines never see
 *                                       a Deepgram key.
 *   else                              503.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

// Deepgram REST endpoint for prerecorded audio. We include the same
// model + post-processing the streaming path uses so transcripts stay
// consistent between the two paths.
//   - model=nova-2 → Deepgram's general-purpose, English-tuned model.
//     Same as the streaming path, picked because it handles Ghanaian
//     English and named Bible terms well in operator field-tests.
//   - smart_format → adds capitalisation, punctuation and number
//     normalisation that the verse detector downstream expects.
//   - punctuate → enable end-of-sentence punctuation. Needed because
//     reference-engine's regex anchors on sentence boundaries.
//   - language=en → force English; auto-detect adds 200-300 ms latency
//     and risks misclassifying short chunks as another language.
const DEEPGRAM_REST_URL =
  'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true&language=en'

function pickMime(incomingType: string): string {
  const t = (incomingType || '').toLowerCase()
  if (t.includes('wav') || t.includes('x-wav')) return 'audio/wav'
  if (t.includes('mp3') || t.includes('mpeg')) return 'audio/mpeg'
  if (t.includes('ogg')) return 'audio/ogg'
  if (t.includes('m4a') || t.includes('mp4') || t.includes('aac')) return 'audio/mp4'
  if (t.includes('flac')) return 'audio/flac'
  if (t.includes('webm')) return t || 'audio/webm'
  return t || 'audio/webm'
}

// Deepgram's prerecorded response shape (the relevant subset).
// Top-level result.results.channels[0].alternatives[0].transcript
// holds the recognised text.
interface DeepgramPrerecordedResponse {
  results?: {
    channels?: Array<{
      alternatives?: Array<{
        transcript?: string
      }>
    }>
  }
}

async function callDeepgram(
  apiKey: string,
  audio: Blob,
): Promise<{ text: string }> {
  const mime = pickMime(audio.type || '')
  const body = await audio.arrayBuffer()
  const res = await fetch(DEEPGRAM_REST_URL, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': mime,
    },
    body,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Deepgram HTTP ${res.status}: ${detail.slice(0, 200)}`)
  }
  const json = (await res.json()) as DeepgramPrerecordedResponse
  const text = json.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? ''
  return { text: text.trim() }
}

// ── Forward to remote proxy ────────────────────────────────────────────
// When DEEPGRAM_API_KEY is absent (the Electron-bundled standalone case),
// the request is forwarded as-is to TRANSCRIBE_PROXY_URL — typically the
// api-server artifact deployed on Replit at
// https://<your-deployment>.replit.app/api/transcribe.
//
// The proxy receives a fresh multipart form-data body so we don't have
// to pipe the raw request stream (Edge / Node fetch wrappers handle the
// body correctly when you pass FormData directly).
async function forwardToProxy(
  proxyUrl: string,
  audio: Blob,
  language: string,
): Promise<Response> {
  const fd = new FormData()
  fd.append('audio', audio, 'chunk.bin')
  fd.append('language', language)
  return fetch(proxyUrl, { method: 'POST', body: fd })
}

export async function POST(request: NextRequest) {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 })
  }
  const file = form.get('audio')
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'Missing "audio" file' }, { status: 400 })
  }
  if (file.size < 1024) {
    return NextResponse.json({ text: '' })
  }
  const lang = (form.get('language') as string | null) || 'en'

  // Resolution path 1: we have a Deepgram key → call Deepgram directly.
  const deepgramKey = (process.env.DEEPGRAM_API_KEY || '').trim()
  if (deepgramKey) {
    try {
      const { text } = await callDeepgram(deepgramKey, file)
      return NextResponse.json({ text })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Transcription failed'
      // v0.7.19 — same last-6-suffix diagnostic we used for OpenAI, now
      // for Deepgram. Helps distinguish "deployment loaded the wrong
      // key" from "Deepgram is genuinely down" when triaging customer
      // reports against the deployment logs.
      const keyTail = deepgramKey.slice(-6)
      console.error(`[transcribe] Deepgram REST call failed (loaded key tail=...${keyTail}):`, msg)
      if (/401|403|invalid.*credentials|unauthor/i.test(msg)) {
        return NextResponse.json(
          { error: 'Deepgram rejected the API key configured on the server.' },
          { status: 401 },
        )
      }
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  // Resolution path 2: forward to remote Replit-hosted proxy.
  const proxyUrl = process.env.TRANSCRIBE_PROXY_URL
  if (proxyUrl) {
    try {
      const upstream = await forwardToProxy(proxyUrl, file, lang)
      const body = await upstream.text()
      return new NextResponse(body, {
        status: upstream.status,
        headers: { 'Content-Type': upstream.headers.get('Content-Type') || 'application/json' },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Proxy request failed'
      console.error('[transcribe] proxy forward failed:', msg)
      return NextResponse.json(
        {
          error:
            'Speech-to-text proxy is unreachable. Check your internet connection and try again.',
        },
        { status: 502 },
      )
    }
  }

  return NextResponse.json(
    {
      error:
        'Speech-to-text is not configured on this server. Set DEEPGRAM_API_KEY or TRANSCRIBE_PROXY_URL.',
    },
    { status: 503 },
  )
}
