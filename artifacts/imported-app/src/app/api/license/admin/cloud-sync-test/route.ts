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

const DEFAULT_CLOUD_BASE = 'https://cloud.scriptureliveai.com'

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
      detail: 'This IS the cloud install. Phone admin panels that point at https://cloud.scriptureliveai.com already read this same data directly — no sync needed.',
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
      detail: 'No cloud admin code is configured on this device and no value was baked into the build. Open https://cloud.scriptureliveai.com/?admin in a browser, copy the masterCode under "Master code", and paste it into the Cloud Sync field below — then press Test connection again.',
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
        detail: `The cloud at ${base} is reachable but rejected the configured cloud admin code. Open https://cloud.scriptureliveai.com/?admin in a browser, copy the EXACT masterCode shown there, and paste it into the Cloud Sync field below — capitalisation matters.`,
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
    // v0.7.162 — Compute rich, accurate global usage stats from the
    // pulled cloud snapshot so the admin panel can show meaningful
    // numbers (active subscriptions, revenue, customer count, etc.)
    // not just raw record counts. Mirrors computeCodeStatus() from
    // storage.ts so the buckets match what the Records tab shows.
    type RawPay = {
      ref?: string; status?: string; amountGhs?: number; planCode?: string;
      email?: string; whatsapp?: string; createdAt?: string;
    }
    type RawAct = {
      code?: string; isUsed?: boolean; isMaster?: boolean;
      cancelledAt?: string; softDeletedAt?: string;
      subscriptionExpiresAt?: string; generatedAt?: string;
      generatedFor?: { email?: string; whatsapp?: string };
      buyerPhone?: string;
    }
    type RawNotif = { ts?: string; channel?: string; status?: string }
    const j = (await r.json().catch(() => ({}))) as {
      ok?: boolean
      snapshot?: {
        paymentCodes?: RawPay[]
        activationCodes?: RawAct[]
        notifications?: RawNotif[]
      }
    }
    const s = j?.snapshot ?? {}
    const pays: RawPay[] = Array.isArray(s.paymentCodes) ? s.paymentCodes : []
    const acts: RawAct[] = Array.isArray(s.activationCodes) ? s.activationCodes : []
    const notifs: RawNotif[] = Array.isArray(s.notifications) ? s.notifications : []
    const now = Date.now()

    // Activation buckets — match storage.computeCodeStatus precedence:
    // deleted > cancelled > master > never-used > active/expired/used
    let actActive = 0, actNeverUsed = 0, actUsed = 0, actExpired = 0
    let actCancelled = 0, actDeleted = 0, actMaster = 0
    for (const a of acts) {
      if (a.softDeletedAt) { actDeleted++; continue }
      if (a.cancelledAt) { actCancelled++; continue }
      if (a.isMaster) { actMaster++; continue }
      if (!a.isUsed) { actNeverUsed++; continue }
      if (a.subscriptionExpiresAt) {
        const exp = Date.parse(a.subscriptionExpiresAt)
        if (Number.isFinite(exp)) {
          if (exp > now) actActive++; else actExpired++
          continue
        }
      }
      actUsed++
    }

    // Payment buckets + total revenue (only paid/consumed count toward revenue).
    let payPaid = 0, payWaiting = 0, payConsumed = 0, payExpiredP = 0, revenue = 0
    for (const p of pays) {
      const st = String(p.status ?? '').toUpperCase()
      const amt = Number(p.amountGhs) || 0
      if (st === 'PAID') { payPaid++; revenue += amt; continue }
      if (st === 'CONSUMED') { payConsumed++; revenue += amt; continue }
      if (st === 'WAITING_PAYMENT') { payWaiting++; continue }
      if (st === 'EXPIRED') { payExpiredP++; continue }
    }

    // Unique customer count across both record types — dedup by
    // email lower-case OR by phone (whichever the record carries).
    const customerKeys = new Set<string>()
    for (const p of pays) {
      if (p.email) customerKeys.add('e:' + p.email.trim().toLowerCase())
      else if (p.whatsapp) customerKeys.add('p:' + p.whatsapp.trim())
    }
    for (const a of acts) {
      const e = a.generatedFor?.email
      const w = a.generatedFor?.whatsapp ?? a.buyerPhone
      if (e) customerKeys.add('e:' + e.trim().toLowerCase())
      else if (w) customerKeys.add('p:' + String(w).trim())
    }

    // Notification recency.
    const day = 24 * 60 * 60 * 1000
    let notif24 = 0, notif7 = 0
    for (const n of notifs) {
      const t = Date.parse(n.ts ?? '')
      if (!Number.isFinite(t)) continue
      const ageMs = now - t
      if (ageMs <= day) notif24++
      if (ageMs <= 7 * day) notif7++
    }

    return NextResponse.json({
      ok: true,
      stage: 'connected',
      detail: `Connected to ${base}. Showing the ${base.replace(/^https?:\/\//, '')} install's full admin ledger — every code, payment, and notification across all devices is now mirrored to this PC. Reopen the admin panel tabs to see merged data.`,
      cloudBase: base,
      pulledCounts: {
        paymentCodes: pays.length,
        activationCodes: acts.length,
        notifications: notifs.length,
      },
      stats: {
        activationsActive: actActive,
        activationsNeverUsed: actNeverUsed,
        activationsUsed: actUsed,
        activationsExpired: actExpired,
        activationsCancelled: actCancelled,
        activationsDeleted: actDeleted,
        activationsMaster: actMaster,
        paymentsPaid: payPaid,
        paymentsWaiting: payWaiting,
        paymentsConsumed: payConsumed,
        paymentsExpired: payExpiredP,
        revenueGhs: Math.round(revenue * 100) / 100,
        uniqueCustomers: customerKeys.size,
        notificationsLast24h: notif24,
        notificationsLast7d: notif7,
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
