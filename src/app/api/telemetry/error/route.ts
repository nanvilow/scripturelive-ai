// POST /api/telemetry/error
//
// v0.7.15 — Centralised error sink. Both the desktop's Next.js layer
// and the Electron main process (via electron/telemetry.ts) post
// uncaught exceptions / unhandled rejections / SMTP failures /
// payment-code dispatch failures here so the operator's admin Records
// dashboard surfaces them in real-time without operators having to
// pull customer log files.
//
// Open POST (no auth) — payloads are clamped by zod, IP-anonymized
// downstream consumers, and bound to a random installId so a malicious
// client can only generate noise tied to its own install.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { dbSet, randSuffix, type ErrorRow } from '@/lib/telemetry-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  installId: z.string().min(8).max(128),
  code: z.string().max(64).optional(),
  appVersion: z.string().max(32).optional(),
  errorType: z.string().min(1).max(64),
  message: z.string().min(1).max(2000),
  stack: z.string().max(8000).optional(),
  // v0.7.43 — Reporter contact fields. OPTIONAL at this layer
  // (system errors don't have them); the upstream /api/license/
  // report-issue route enforces them as REQUIRED for user
  // reports before it forwards here.
  reporterName: z.string().max(120).optional(),
  reporterPhone: z.string().max(40).optional(),
  reporterLocation: z.string().max(160).optional(),
})

export async function POST(req: NextRequest) {
  let parsed
  try {
    const body = await req.json()
    parsed = schema.safeParse(body)
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 })
  }
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 })
  }
  const p = parsed.data
  const tsIso = new Date().toISOString()
  const id = `${tsIso}_${randSuffix()}`
  const row: ErrorRow = {
    id,
    installId: p.installId,
    code: p.code ?? null,
    appVersion: p.appVersion ?? null,
    errorType: p.errorType,
    message: p.message,
    stack: p.stack ?? null,
    ts: tsIso,
    reporterName: p.reporterName ?? null,
    reporterPhone: p.reporterPhone ?? null,
    reporterLocation: p.reporterLocation ?? null,
  }
  try {
    await dbSet(`err:${tsIso}:${randSuffix()}`, JSON.stringify(row))
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[telemetry/error] failed', err)
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }
}
