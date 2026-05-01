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
 * ─── Resolution strategy (Option A — Replit-hosted proxy) ─────────────
 *
 * The OpenAI key NEVER ships inside the customer's Electron install. We
 * resolve a target in this order:
 *
 *   1. `OPENAI_API_KEY`               — direct call to OpenAI. Used when
 *                                       this Next.js server is itself
 *                                       deployed on Replit with the
 *                                       secret set.
 *   2. `AI_INTEGRATIONS_OPENAI_*`    — Replit AI Integrations proxy creds
 *                                       for in-Replit dev / preview.
 *   3. `TRANSCRIBE_PROXY_URL`         — forward this request as-is to a
 *                                       remote proxy (the api-server
 *                                       artifact deployed on Replit).
 *                                       The bundled Electron app sets
 *                                       this env when it spawns the
 *                                       Next.js standalone server, so
 *                                       customers' machines never see
 *                                       an OpenAI key.
 *   else                              503.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const BIBLE_PROMPT =
  'The speaker is delivering a Christian sermon and may quote the Bible. ' +
  'Common Bible book names: Genesis, Exodus, Leviticus, Numbers, Deuteronomy, ' +
  'Joshua, Judges, Ruth, Samuel, Kings, Chronicles, Ezra, Nehemiah, Esther, ' +
  'Job, Psalms, Proverbs, Ecclesiastes, Song of Solomon, Isaiah, Jeremiah, ' +
  'Lamentations, Ezekiel, Daniel, Hosea, Joel, Amos, Obadiah, Jonah, Micah, ' +
  'Nahum, Habakkuk, Zephaniah, Haggai, Zechariah, Malachi, Matthew, Mark, ' +
  'Luke, John, Acts, Romans, Corinthians, Galatians, Ephesians, Philippians, ' +
  'Colossians, Thessalonians, Timothy, Titus, Philemon, Hebrews, James, Peter, ' +
  'Jude, Revelation. Common terms: Jesus, Christ, Lord, God, Holy Spirit, ' +
  'gospel, salvation, righteousness, kingdom, covenant, prophet, apostle, ' +
  'disciple, faith, grace, mercy, sin, repentance, baptism, communion, amen.'

interface ClientSpec {
  baseURL?: string
  apiKey: string
}

let cachedClient: { spec: ClientSpec; client: OpenAI } | null = null

function resolveClientSpec(): ClientSpec | null {
  const envKey = process.env.OPENAI_API_KEY
  if (envKey) return { apiKey: envKey }
  const proxyKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY
  const proxyBase = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
  if (proxyKey && proxyBase) return { apiKey: proxyKey, baseURL: proxyBase }
  return null
}

function getClient(): OpenAI | null {
  const spec = resolveClientSpec()
  if (!spec) return null
  if (
    cachedClient &&
    cachedClient.spec.apiKey === spec.apiKey &&
    cachedClient.spec.baseURL === spec.baseURL
  ) {
    return cachedClient.client
  }
  const client = spec.baseURL
    ? new OpenAI({ apiKey: spec.apiKey, baseURL: spec.baseURL })
    : new OpenAI({ apiKey: spec.apiKey })
  cachedClient = { spec, client }
  return client
}

function pickExtAndMime(incomingType: string): { ext: string; mime: string } {
  const t = (incomingType || '').toLowerCase()
  if (t.includes('wav') || t.includes('x-wav')) return { ext: 'wav', mime: 'audio/wav' }
  if (t.includes('mp3') || t.includes('mpeg')) return { ext: 'mp3', mime: 'audio/mpeg' }
  if (t.includes('ogg')) return { ext: 'ogg', mime: 'audio/ogg' }
  if (t.includes('m4a') || t.includes('mp4') || t.includes('aac'))
    return { ext: 'm4a', mime: 'audio/mp4' }
  if (t.includes('flac')) return { ext: 'flac', mime: 'audio/flac' }
  if (t.includes('webm')) return { ext: 'webm', mime: t }
  return { ext: 'webm', mime: t || 'audio/webm' }
}

// ── Forward to remote proxy ────────────────────────────────────────────
// When OPENAI_API_KEY is absent (the Electron-bundled standalone case),
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

  // Resolution path 1+2: we have credentials → call OpenAI directly.
  const openai = getClient()
  if (openai) {
    try {
      const { ext, mime } = pickExtAndMime(file.type || '')
      const named = new File([file], `chunk.${ext}`, { type: mime })
      const result = await openai.audio.transcriptions.create({
        file: named,
        model: 'gpt-4o-mini-transcribe',
        language: 'en',
        prompt: BIBLE_PROMPT,
        response_format: 'json',
      })
      const text = (result?.text || '').trim()
      return NextResponse.json({ text })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Transcription failed'
      // v0.7.18-hotfix — include the loaded key's last-6 suffix in the
      // log so we can distinguish "deployment loaded the new key but
      // OpenAI still rejects it" from "deployment never picked up the
      // new env var". OpenAI's own 401 response already echoes the same
      // suffix, so this leaks no extra information.
      const keyTail = (process.env.OPENAI_API_KEY || '').trim().slice(-6) || '(unset)'
      console.error(`[transcribe] direct OpenAI call failed (loaded key tail=...${keyTail}):`, msg)
      if (/Incorrect API key|401|Invalid.*api.*key|authentication/i.test(msg)) {
        return NextResponse.json(
          { error: 'OpenAI rejected the API key configured on the server.' },
          { status: 401 },
        )
      }
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  // Resolution path 3: forward to remote Replit-hosted proxy.
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
        'Speech-to-text is not configured on this server. Set OPENAI_API_KEY or TRANSCRIBE_PROXY_URL.',
    },
    { status: 503 },
  )
}
