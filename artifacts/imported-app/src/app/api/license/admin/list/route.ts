// GET /api/license/admin/list
//
// Returns the full audit-state the admin panel needs:
//   - active subscription
//   - all payment codes (filterable; default = last 30 by createdAt desc)
//   - all activation codes (last 30 by generatedAt desc)
//   - last 30 notifications (especially useful when SMTP isn't wired —
//     the operator can copy text out of the panel into their own
//     email / WhatsApp client)
//
// No mutation; safe to poll.

import { NextRequest, NextResponse } from 'next/server'
import { getFile, computeStatus } from '@/lib/licensing/storage'
import { requireAdmin } from '@/lib/licensing/admin-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// v0.5.50 — Tells the admin panel which delivery channels actually
// have credentials configured, so the operator can see at a glance
// (and from a banner) why notifications are stuck in 'pending' state.
// Mirrors the env-var checks done inline in lib/licensing/notifications
// (sendEmailViaSmtp) and lib/licensing/sms (sendViaArkesel) — the same
// fields that those modules look at, no more, no less.
//
// v0.5.54 — Detector now consults the baked-credentials resolver,
// which prefers process.env when set and falls back to the values
// baked into the .exe at build time. This is what fixed the post-
// v0.5.53 operator complaint where the banner reported "SMTP not
// configured" on every install — the packaged .exe has no env vars
// by default but DOES carry the operator's keys baked in.
//
// IMPORTANT: sendEmailViaSmtp treats MAIL_FROM as OPTIONAL — it falls
// back to MAIL_USER when MAIL_FROM is not set. So we must NOT require
// MAIL_FROM here; otherwise the banner would falsely report
// "credentials missing" on installs that can in fact send (Gmail SMTP
// being the canonical example, where MAIL_USER doubles as From).
import { detectNotificationDelivery } from '@/lib/baked-credentials'

export async function GET(req: NextRequest) {
  const guard = requireAdmin(req)
  if (guard) return guard
  const f = getFile()
  const status = computeStatus()
  const recent = <T extends { createdAt?: string; generatedAt?: string; ts?: string }>(arr: T[], n: number) =>
    [...arr]
      .sort((a, b) => (b.createdAt ?? b.generatedAt ?? b.ts ?? '').localeCompare(a.createdAt ?? a.generatedAt ?? a.ts ?? ''))
      .slice(0, n)

  return NextResponse.json({
    installId: f.installId,
    firstLaunchAt: f.firstLaunchAt,
    masterCode: f.masterCode,
    masterCodeEmailedAt: f.masterCodeEmailedAt,
    activeSubscription: f.activeSubscription,
    status: {
      state: status.state,
      daysLeft: status.daysLeft,
      msLeft: Math.min(status.msLeft, Number.MAX_SAFE_INTEGER),
      isMaster: status.isMaster,
    },
    paymentCodes: recent(f.paymentCodes, 30),
    activationCodes: recent(f.activationCodes, 30),
    notifications: recent(f.notifications, 30),
    notificationDelivery: detectNotificationDelivery(),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
