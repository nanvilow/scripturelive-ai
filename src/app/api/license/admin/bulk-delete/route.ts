// v0.7.5 — Admin: bulk-delete rows from any of the three dashboard
// sections (payments, activations, notifications) in a single round-
// trip. Backs the new "Click to select → Delete all" action bar.
//
// Body:
//   { kind: 'payment',  refs:  string[] }
//   { kind: 'activation', codes: string[], permanent?: boolean }   // soft-delete by default
//   { kind: 'notification', ids: string[] }
//
// Resp: { ok: true, removed: number }

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/licensing/admin-auth'
import {
  deletePaymentsByRefs,
  deleteActivationsByCodes,
  deleteNotificationsByIds,
  softDeleteActivationsByCodes,
} from '@/lib/licensing/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const guard = requireAdmin(req)
  if (guard) return guard
  let body: Record<string, unknown>
  try { body = (await req.json()) as Record<string, unknown> } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
  }
  const kind = String(body.kind ?? '')
  if (kind === 'payment') {
    const refs = Array.isArray(body.refs) ? body.refs.map(String) : []
    if (refs.length === 0) return NextResponse.json({ error: 'refs is required' }, { status: 400 })
    const removed = deletePaymentsByRefs(refs)
    return NextResponse.json({ ok: true, removed })
  }
  if (kind === 'activation') {
    const codes = Array.isArray(body.codes) ? body.codes.map(String) : []
    if (codes.length === 0) return NextResponse.json({ error: 'codes is required' }, { status: 400 })
    const permanent = body.permanent === true
    const removed = permanent
      ? deleteActivationsByCodes(codes)
      : softDeleteActivationsByCodes(codes)
    return NextResponse.json({ ok: true, removed, mode: permanent ? 'hard' as const : 'soft' as const })
  }
  if (kind === 'notification') {
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : []
    if (ids.length === 0) return NextResponse.json({ error: 'ids is required' }, { status: 400 })
    const removed = deleteNotificationsByIds(ids)
    return NextResponse.json({ ok: true, removed })
  }
  return NextResponse.json({ error: `Unknown kind "${kind}" (expected payment | activation | notification)` }, { status: 400 })
}
