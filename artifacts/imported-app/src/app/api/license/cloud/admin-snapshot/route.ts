// v0.7.153 — Cloud-side endpoint: return the full admin-ledger
// snapshot (paymentCodes, activationCodes, notifications, shared
// config) so a remote desktop install can merge it into its local
// view BEFORE rendering the admin panel.
//
// Lives ONLY on the cloud deployment at scripturelive.replit.app.
// Desktop installs call this from src/lib/licensing/cloud-sync.ts
// (cloudPullAdminLedger) on every admin/list and admin/codes read.
//
// Body: { cloudAdminCode: string, installId: string }
// Resp: { ok: true, snapshot: AdminLedgerSnapshot }
//   401 — credential missing or wrong (constant-time compared)
//   400 — body malformed
//
// Auth: the cloud's `masterCode` is the shared secret. Each desktop
// install pairs ONCE by saving that string as `cloudAdminCode` in
// its RuntimeConfig (or via SCRIPTURELIVE_CLOUD_ADMIN_CODE env var).
// We compare in constant time so an attacker can't time-attack the
// credential character-by-character.

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { getFile, extractAdminLedgerSnapshot } from '@/lib/licensing/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function constantTimeEq(expected: string, submitted: string): boolean {
  const len = Math.max(expected.length, submitted.length, 1)
  const a = Buffer.alloc(len)
  const b = Buffer.alloc(len)
  Buffer.from(expected, 'utf8').copy(a)
  Buffer.from(submitted, 'utf8').copy(b)
  let ok = false
  try { ok = timingSafeEqual(a, b) } catch { ok = false }
  return ok && expected.length === submitted.length
}

export async function POST(req: NextRequest) {
  try {
    let body: unknown
    try { body = await req.json() } catch {
      return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
    }
    const b = body as Record<string, unknown>
    const submitted = String(b?.cloudAdminCode ?? '').trim()
    const installId = String(b?.installId ?? '').trim()
    if (!submitted) return NextResponse.json({ error: 'cloudAdminCode required' }, { status: 400 })
    if (!installId) return NextResponse.json({ error: 'installId required' }, { status: 400 })

    const f = getFile()
    if (!constantTimeEq(f.masterCode, submitted)) {
      // eslint-disable-next-line no-console
      console.warn(`[cloud/admin-snapshot] auth rejected for installId=${installId.slice(0, 8)}…`)
      return NextResponse.json({ error: 'cloudAdminCode does not match' }, { status: 401 })
    }

    const snapshot = extractAdminLedgerSnapshot(f)
    return NextResponse.json({ ok: true, snapshot })
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[cloud/admin-snapshot] unhandled error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Cloud snapshot failed' },
      { status: 500 },
    )
  }
}
