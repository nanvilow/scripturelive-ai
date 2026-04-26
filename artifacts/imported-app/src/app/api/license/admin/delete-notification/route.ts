// v0.5.53 — Admin-only: dismiss a notification row from the audit log.
//
// Body: { id: string }
// Resp: { ok: true } | { error }

import { NextRequest, NextResponse } from 'next/server'
import { deleteNotificationById } from '@/lib/licensing/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
  }
  const id = String((body as Record<string, unknown>)?.id ?? '').trim()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const removed = deleteNotificationById(id)
  if (!removed) return NextResponse.json({ error: 'No notification with that id' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
