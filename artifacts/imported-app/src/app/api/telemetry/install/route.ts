// POST /api/telemetry/install
//
// v0.7.15 — Idempotent install registration. The desktop client posts
// once on first launch (after writing telemetryInstallPingedAt to
// license.json). Re-posts are harmless: we only overwrite firstSeenAt
// if the row didn't exist and always bump lastSeenAt to "now" so the
// install counts as freshly active.
//
// Privacy: payload carries only the random installId UUID + coarse
// version/os/countryCode strings. No IP, no PII — consistent with the
// v0.7.13 contract.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { dbGet, dbSet, type InstallRow } from '@/lib/telemetry-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  installId: z.string().min(8).max(128),
  appVersion: z.string().max(32).optional(),
  os: z.string().max(64).optional(),
  countryCode: z.string().max(8).optional(),
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
  try {
    const key = `inst:${p.installId}`
    const now = new Date().toISOString()
    const existing = await dbGet(key)
    let row: InstallRow
    if (existing) {
      try {
        const prev = JSON.parse(existing) as InstallRow
        row = {
          ...prev,
          lastSeenAt: now,
          appVersion: p.appVersion ?? prev.appVersion ?? null,
          os: p.os ?? prev.os ?? null,
          countryCode: p.countryCode ?? prev.countryCode ?? null,
        }
      } catch {
        row = {
          installId: p.installId,
          firstSeenAt: now,
          lastSeenAt: now,
          appVersion: p.appVersion ?? null,
          os: p.os ?? null,
          countryCode: p.countryCode ?? null,
        }
      }
    } else {
      row = {
        installId: p.installId,
        firstSeenAt: now,
        lastSeenAt: now,
        appVersion: p.appVersion ?? null,
        os: p.os ?? null,
        countryCode: p.countryCode ?? null,
      }
    }
    await dbSet(key, JSON.stringify(row))
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[telemetry/install] failed', err)
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 })
  }
}
