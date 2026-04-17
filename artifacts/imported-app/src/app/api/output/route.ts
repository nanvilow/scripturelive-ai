import { NextRequest } from 'next/server'
import { getOutputState, updateOutputState, getSubscriberCount } from '@/lib/output-broadcast'

/**
 * GET /api/output
 *
 * SSE endpoint for congregation display clients.
 * Clients connect here to receive real-time slide updates.
 *
 * Also returns current state as JSON if ?format=json is specified.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const format = searchParams.get('format')

  // JSON health check / state query
  if (format === 'json') {
    return Response.json({
      status: 'ok',
      subscribers: getSubscriberCount(),
      state: getOutputState(),
    })
  }

  // SSE stream
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      // Send initial comment to establish the connection
      controller.enqueue(encoder.encode(': connected\n\n'))

      // Subscribe to broadcast
      const { unsubscribe } = subscribeToOutput((data: string) => {
        try {
          controller.enqueue(encoder.encode(data))
        } catch {
          unsubscribe()
        }
      })

      // Send keepalive every 15 seconds
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`))
        } catch {
          clearInterval(keepalive)
          unsubscribe()
        }
      }, 15000)

      // Cleanup on close
      request.signal.addEventListener('abort', () => {
        clearInterval(keepalive)
        unsubscribe()
        try { controller.close() } catch { /* already closed */ }
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  })
}

/**
 * POST /api/output
 *
 * Receive slide updates from the live presenter and broadcast to all congregation displays.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const state = updateOutputState(body)
    return Response.json({ ok: true, subscribers: getSubscriberCount(), state: { type: state.type, timestamp: state.timestamp } })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Invalid request' }, { status: 400 })
  }
}

/**
 * OPTIONS /api/output — CORS preflight
 */
export async function OPTIONS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  })
}
