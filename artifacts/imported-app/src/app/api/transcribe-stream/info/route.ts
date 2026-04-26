import { NextRequest, NextResponse } from 'next/server'

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
 *   4. Replit dev fallback              — derive
 *                                          wss://<request-host>/__api-server/api/transcribe-stream
 *      so that the workspace-preview proxy hands the upgrade to the
 *      api-server (which strips the /__api-server prefix internally).
 *      Only fires when REPLIT_DEV_DOMAIN is set so we never silently
 *      do this in a customer's installed Electron build.
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

function deriveReplitWss(req: NextRequest): string | null {
  // v0.5.48 ROOT-CAUSE FIX — the previous version of this function
  // was gated on REPLIT_DEV_DOMAIN being set, which meant it ONLY
  // worked in workspace dev. In a deployed Replit Autoscale build
  // REPLIT_DEV_DOMAIN is not set, so this returned null, the GET
  // handler fell through to the 503 branch, the renderer surfaced
  // "Streaming transcription is not configured", the WebSocket
  // could not be opened, and the operator saw "1006: WebSocket
  // could not be established".
  //
  // Reality: BOTH workspace dev AND deployed Replit use the same
  // path-based artifact router. The api-server is registered at
  // `/__api-server` in `.replit-artifact/artifact.toml`, and its
  // WS upgrade handler in artifacts/api-server/src/routes/
  // transcribe-stream.ts strips the `/__api-server` prefix before
  // matching routes. So the same `wss://${host}/__api-server/...`
  // URL works in workspace dev AND in production deployments —
  // the `REPLIT_DEV_DOMAIN` gate was a left-over from before
  // path-based routing existed.
  //
  // We do still want to refuse to invent a URL when the request
  // host isn't a Replit-style domain (i.e. someone's running this
  // outside of Replit entirely without setting any of the explicit
  // env vars). Detect that by checking for `.replit.dev` /
  // `.replit.app` in the host header. Anything else falls through
  // to the 503 branch with the clear "set TRANSCRIBE_STREAM_WSS_URL"
  // hint, which is the correct error for, say, a customer-installed
  // Electron build whose main process forgot to set the env var.
  const host = req.headers.get('host')
  if (!host) return null
  const looksReplit =
    host.endsWith('.replit.dev') ||
    host.endsWith('.replit.app') ||
    host.endsWith('.repl.co') ||
    host.startsWith('localhost') ||
    host.startsWith('127.0.0.1') ||
    host.startsWith('0.0.0.0')
  if (!looksReplit) return null
  // localhost in workspace dev is plain http, so use ws:// for it.
  // Replit public domains are always TLS-fronted, so wss://.
  const isInsecure = host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('0.0.0.0')
  const scheme = isInsecure ? 'ws' : 'wss'
  return `${scheme}://${host}/__api-server/api/transcribe-stream`
}

export async function GET(req: NextRequest) {
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

  const replitWss = deriveReplitWss(req)
  if (replitWss) {
    return NextResponse.json({
      wssUrl: replitWss,
      source: process.env.REPLIT_DEV_DOMAIN ? 'REPLIT_DEV_FALLBACK' : 'REPLIT_HOST_FALLBACK',
    })
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
