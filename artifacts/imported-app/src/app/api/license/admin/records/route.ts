// GET /api/license/admin/records
//
// v0.7.13 — Backs the new admin Records dashboard (replaces the
// removed Reference Code section). Proxies to the central telemetry
// backend's GET /api/telemetry/records using this install's master
// code as the auth credential, so the operator sees live stats from
// every ScriptureLive AI install in the world (active now, total
// installs, system status, sessions today, top features, recent
// errors).
//
// Auth: requireAdmin — same gate as every other /admin/* route.
//   The operator must already have a valid admin session cookie.
//
// Response (passthrough from telemetry backend):
//   {
//     ok: boolean
//     generatedAt: ISO
//     activeNow: number
//     totalInstalls: number
//     sessionsToday: number
//     errorsToday: number
//     topFeatures: [{ name, count }]
//     recentErrors: [{ id, errorType, message, ts, installId, code, appVersion }]
//     systemStatus: { server, ai, ndi }   // 'ok' | 'idle' | 'down'
//   }

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/licensing/admin-auth'
import { getFile } from '@/lib/licensing/storage'
import { fetchRecords } from '@/lib/licensing/telemetry-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const guard = requireAdmin(req)
  if (guard) return guard
  const masterKey = getFile().masterCode
  const data = await fetchRecords(masterKey)
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}
