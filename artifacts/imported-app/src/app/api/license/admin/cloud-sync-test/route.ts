// v0.7.157 — Cloud Sync diagnostic endpoint.
//
// The user's pain point: cross-device admin sync (added in v0.7.153)
// silently no-ops when `cloudAdminCode` is unset OR when the cloud
// rejects the supplied code, and the operator has NO visibility
// into why phone/desktop admin panels disagree. This endpoint
// pings the cloud's /api/license/cloud/admin-snapshot route and
// returns a structured result the admin UI can render as a clear
// status badge ("Connected", "Wrong key", "Cloud unreachable",
// "Sync disabled").
//
// Body: {} (uses the locally-saved cloudAdminCode automatically)
// Resp: {
//   ok: boolean,
//   stage: 'disabled'|'unreachable'|'unauthorized'|'connected',
//   detail: string,        // human-readable
//   cloudBase: string,     // which cloud URL we tested
//   pulledCounts?: { paymentCodes, activationCodes, notifications },
// }

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/licensing/admin-auth'
import { getConfig, getFile } from '@/lib/licensing/storage'
import { isCloudInstance } from '@/lib/licensing/cloud-sync'
import { getCloudAdminCode } from '@/lib/baked-credentials'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEFAULT_CLOUD_BASE = 'https://scripturelive.replit.app'

function cloudBaseUrl(): string | null {
  const raw = process.env.SCRIPTURELIVE_CLOUD_BASE
  if (raw === '') return null
  return (raw ?? DEFAULT_CLOUD_BASE).replace(/\/+$/, '')
}

export async function POST(req: NextRequest) {
  const guard = requireAdmin(req)
  if (guard) return guard

  // Cloud talking to itself = always "connected" trivially. The phone
  // and any other browser pointing AT the cloud are reading directly
  // from the source of truth, not via this sync surface.
  if (isCloudInstance()) {
    return NextResponse.json({
      ok: true,
      stage: 'connected',
      detail: 'This IS the cloud install. Phone admin panels that point at https://scripturelive.replit.app already read this same data directly — no sync needed.',
      cloudBase: 'self',
    })
  }

  const base = cloudBaseUrl()
  if (!base) {
    return NextResponse.json({
      ok: false,
      stage: 'disabled',
      detail: 'SCRIPTURELIVE_CLOUD_BASE is set to empty string — cloud sync is disabled in this environment.',
      cloudBase: '',
    })
  }

  const cfg = getConfig() ?? {}
  // v0.7.161 — Resolution chain: per-PC RuntimeConfig override →
  // process.env → build-baked masterCode (auto-sync OOTB).
  const code = (cfg.cloudAdminCode ?? process.env.SCRIPTURELIVE_CLOUD_ADMIN_CODE ?? getCloudAdminCode() ?? '').trim()
  if (!code) {
    return NextResponse.json({
      ok: false,
      stage: 'disabled',
      detail: 'No cloud admin code is configured on this device and no value was baked into the build. Open https://scripturelive.replit.app/?admin in a browser, copy the masterCode under "Master code", and paste it into the Cloud Sync field below — then press Test connection again.',
      cloudBase: base,
    })
  }

  let installId = 'test'
  try { installId = getFile().installId } catch { /* fall through */ }

  try {
    const r = await fetch(`${base}/api/license/cloud/admin-snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cloudAdminCode: code, installId }),
      signal: AbortSignal.timeout(8000),
    })
    if (r.status === 401) {
      return NextResponse.json({
        ok: false,
        stage: 'unauthorized',
        detail: `The cloud at ${base} is reachable but rejected the configured cloud admin code. Open https://scripturelive.replit.app/?admin in a browser, copy the EXACT masterCode shown there, and paste it into the Cloud Sync field below — capitalisation matters.`,
        cloudBase: base,
      })
    }
    if (!r.ok) {
      return NextResponse.json({
        ok: false,
        stage: 'unreachable',
        detail: `Cloud responded with HTTP ${r.status}. The cloud install at ${base} may need to be redeployed from the same release as this desktop app (the v0.7.153 admin sync routes are only available after a cloud redeploy).`,
        cloudBase: base,
      })
    }
    const j = (await r.json().catch(() => ({}))) as {
      ok?: boolean
      snapshot?: {
        paymentCodes?: unknown[]
        activationCodes?: unknown[]
        notifications?: unknown[]
      }
    }
    const s = j?.snapshot ?? {}
    return NextResponse.json({
      ok: true,
      stage: 'connected',
      detail: `Connected to ${base}. Phone-side admin actions will now appear here, and desktop-side actions will appear on phone. Reopen the admin panel to see merged data.`,
      cloudBase: base,
      pulledCounts: {
        paymentCodes: Array.isArray(s.paymentCodes) ? s.paymentCodes.length : 0,
        activationCodes: Array.isArray(s.activationCodes) ? s.activationCodes.length : 0,
        notifications: Array.isArray(s.notifications) ? s.notifications.length : 0,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({
      ok: false,
      stage: 'unreachable',
      detail: `Could not reach the cloud at ${base}: ${msg}. Check this PC's internet connection, then try again.`,
      cloudBase: base,
    })
  }
}
