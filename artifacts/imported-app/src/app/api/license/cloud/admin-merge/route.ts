// v0.7.153 — Cloud-side endpoint: accept a remote install's full
// admin-ledger snapshot, merge it into the cloud's ledger by primary
// key, and echo the merged snapshot back so the caller can refresh
// its local cache in one round-trip.
//
// Lives ONLY on the cloud deployment at scripturelive.replit.app.
// Desktop installs call this from src/lib/licensing/cloud-sync.ts
// (cloudPushAdminLedger) on the debounced fan-out triggered by every
// persist() — i.e. every admin write.
//
// Body: { cloudAdminCode: string, installId: string,
//         snapshot: AdminLedgerSnapshot }
// Resp: { ok: true, snapshot: AdminLedgerSnapshot, changed: number }
//   401 — credential missing or wrong (constant-time compared)
//   400 — body malformed
//
// Merge semantics live in storage.ts → applyAdminLedgerSnapshot:
// union by primary key, latest-write-wins on mutable status fields,
// notification cap at 500. Idempotent (re-pushing the same snapshot
// returns changed=0).

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import {
  getFile,
  extractAdminLedgerSnapshot,
  applyAdminLedgerSnapshot,
} from '@/lib/licensing/storage'
import type { AdminLedgerSnapshot } from '@/lib/licensing/cloud-sync'

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
    const snap = b?.snapshot as AdminLedgerSnapshot | undefined
    if (!submitted) return NextResponse.json({ error: 'cloudAdminCode required' }, { status: 400 })
    if (!installId) return NextResponse.json({ error: 'installId required' }, { status: 400 })
    if (!snap || typeof snap !== 'object') {
      return NextResponse.json({ error: 'snapshot required' }, { status: 400 })
    }

    const f = getFile()
    if (!constantTimeEq(f.masterCode, submitted)) {
      // eslint-disable-next-line no-console
      console.warn(`[cloud/admin-merge] auth rejected for installId=${installId.slice(0, 8)}…`)
      return NextResponse.json({ error: 'cloudAdminCode does not match' }, { status: 401 })
    }

    const changed = applyAdminLedgerSnapshot({
      paymentCodes: Array.isArray(snap.paymentCodes) ? snap.paymentCodes : [],
      activationCodes: Array.isArray(snap.activationCodes) ? snap.activationCodes : [],
      notifications: Array.isArray(snap.notifications) ? snap.notifications : [],
      config: snap.config,
      deletedPaymentRefs: Array.isArray(snap.deletedPaymentRefs) ? snap.deletedPaymentRefs : [],
      deletedActivationCodes: Array.isArray(snap.deletedActivationCodes) ? snap.deletedActivationCodes : [],
      deletedNotificationIds: Array.isArray(snap.deletedNotificationIds) ? snap.deletedNotificationIds : [],
    })
    if (changed > 0) {
      // eslint-disable-next-line no-console
      console.log(`[cloud/admin-merge] merged ${changed} record(s) from install ${installId.slice(0, 8)}…`)
    }
    const merged = extractAdminLedgerSnapshot()
    return NextResponse.json({ ok: true, snapshot: merged, changed })
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[cloud/admin-merge] unhandled error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Cloud merge failed' },
      { status: 500 },
    )
  }
}
