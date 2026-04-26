import { NextResponse } from 'next/server'

/**
 * /api/transcribe-stream/info — discovery endpoint for the renderer.
 *
 * Returns the WebSocket URL the desktop renderer should connect to
 * for Deepgram-streamed transcription. The renderer cannot trivially
 * derive this itself because Next.js runs on a different port than
 * the api-server in dev, and the Electron build embeds a Next.js
 * standalone server that needs the api-server's public domain.
 *
 * Resolution order:
 *   1. TRANSCRIBE_STREAM_WSS_URL        — explicit WSS override
 *   2. TRANSCRIBE_PROXY_URL             — derive WSS by replacing
 *                                          https://…/api/transcribe →
 *                                          wss://…/api/transcribe-stream
 *      (the Electron main sets TRANSCRIBE_PROXY_URL on every spawn)
 *   3. NEXT_PUBLIC_TRANSCRIBE_PROXY_URL — same derivation, dev-only
 *      escape hatch baked at build time
 *   else                                 503 (renderer falls back to
 *                                          showing a clear error in
 *                                          the speech-provider toast)
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function deriveWssFromHttp(httpUrl: string): string | null {
  try {
    const u = new URL(httpUrl)
    // Force WSS regardless of input scheme — http→ws and https→wss.
    u.protocol = u.protocol === 'http:' ? 'ws:' : 'wss:'
    // Strip the trailing /api/transcribe (with or without trailing
    // slash) and append /api/transcribe-stream.
    u.pathname = u.pathname.replace(/\/api\/transcribe\/?$/, '') + '/api/transcribe-stream'
    u.search = ''
    u.hash = ''
    return u.toString()
  } catch {
    return null
  }
}

export async function GET() {
  const explicit = process.env.TRANSCRIBE_STREAM_WSS_URL
  if (explicit) {
    return NextResponse.json({ wssUrl: explicit, source: 'TRANSCRIBE_STREAM_WSS_URL' })
  }

  const proxyHttp = process.env.TRANSCRIBE_PROXY_URL || process.env.NEXT_PUBLIC_TRANSCRIBE_PROXY_URL
  if (proxyHttp) {
    const wss = deriveWssFromHttp(proxyHttp)
    if (wss) {
      return NextResponse.json({ wssUrl: wss, source: 'TRANSCRIBE_PROXY_URL' })
    }
  }

  return NextResponse.json(
    {
      error:
        'Streaming transcription is not configured on this server. ' +
        'Set TRANSCRIBE_STREAM_WSS_URL or TRANSCRIBE_PROXY_URL.',
    },
    { status: 503 },
  )
}
