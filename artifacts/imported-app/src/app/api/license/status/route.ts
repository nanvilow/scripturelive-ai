// GET /api/license/status
//
// Polled by the front-end every ~30 s and on focus. Returns the
// current subscription state, days/ms remaining, trial status, and
// the install id. v0.5.48 also returns a `subscription` block with
// human-friendly plan label, expires ISO, days remaining, the
// activation code, and the originating payment ref so the customer
// Settings → License row can render without a second roundtrip.

import { NextRequest, NextResponse } from 'next/server'
import os from 'node:os'
import {
  computeStatus,
  getFile,
  markTelemetryInstallPinged,
  recordCodeHeartbeat,
  shouldSendTelemetryInstallPing,
} from '@/lib/licensing/storage'
import { findPlan } from '@/lib/licensing/plans'
import { captureGeoFromRequest } from '@/lib/licensing/geoip'
import { pingHeartbeat, pingInstall } from '@/lib/licensing/telemetry-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Resolve the running app version once (read at module load). Pulled
// from the bundled package.json so we don't have to thread it through
// every telemetry call site.
let CACHED_APP_VERSION: string | undefined
function appVersion(): string | undefined {
  if (CACHED_APP_VERSION) return CACHED_APP_VERSION
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    CACHED_APP_VERSION = (require('../../../../../package.json') as { version?: string }).version
  } catch {
    CACHED_APP_VERSION = undefined
  }
  return CACHED_APP_VERSION
}

export async function GET(req: NextRequest) {
  const s = computeStatus()
  const file = getFile()

  // v0.7.13 — Central telemetry. Two fire-and-forget POSTs the admin
  // Records dashboard depends on:
  //   1. install ping (one-shot per install)
  //   2. heartbeat (every status poll, ~30s while the app is open)
  // Both are best-effort and wrapped in try/catch so a telemetry
  // outage cannot break licensing.
  try {
    if (shouldSendTelemetryInstallPing()) {
      void pingInstall({
        installId: file.installId,
        appVersion: appVersion(),
        os: `${os.platform()} ${os.release()}`,
      })
      markTelemetryInstallPinged()
    }
  } catch { /* never block status */ }

  // v0.7.0 — Heartbeat: refresh lastSeenAt + lastSeenIp + location
  // for the activation code currently powering this device's
  // subscription so the admin dashboard sees real-time liveness.
  // Best-effort, never blocks the response.
  let geoLocation: string | undefined
  if (s.activeSubscription?.activationCode) {
    try {
      const geo = await captureGeoFromRequest(req)
      geoLocation = geo.location
      recordCodeHeartbeat(s.activeSubscription.activationCode, geo)
    } catch { /* heartbeat is best-effort */ }
  }

  // v0.7.13 — Central heartbeat (always, even when no active sub, so
  // trial / expired installs still register as "active now"). Sent
  // fire-and-forget so a slow/unreachable backend never delays the
  // response.
  try {
    void pingHeartbeat({
      installId: file.installId,
      code: s.activeSubscription?.activationCode,
      appVersion: appVersion(),
      location: geoLocation,
      features: {
        hasActiveSub: !!s.activeSubscription,
        isMaster: s.isMaster,
      },
    })
  } catch { /* never block status */ }

  // Build the customer-facing subscription summary if there's an
  // active sub. Master codes get the "Lifetime" label so the row
  // doesn't print a year-3000 expiry that confuses operators.
  let subscription:
    | {
        planCode: string
        planLabel: string
        days: number
        activatedAt: string
        expiresAt: string
        daysLeft: number
        isMaster: boolean
        activationCode: string
        paymentRef?: string
      }
    | null = null

  if (s.activeSubscription) {
    const plan = findPlan(s.activeSubscription.planCode)
    const activation = file.activationCodes.find(
      (a) => a.code === s.activeSubscription!.activationCode,
    )
    subscription = {
      planCode: s.activeSubscription.planCode,
      planLabel: s.activeSubscription.isMaster
        ? 'Lifetime (Master)'
        : plan?.label ?? s.activeSubscription.planCode,
      days: s.activeSubscription.days,
      activatedAt: s.activeSubscription.activatedAt,
      expiresAt: s.activeSubscription.expiresAt,
      daysLeft: s.activeSubscription.isMaster ? 36500 : s.daysLeft,
      isMaster: s.activeSubscription.isMaster,
      activationCode: s.activeSubscription.activationCode,
      paymentRef: activation?.generatedFor?.paymentRef,
    }
  }

  return NextResponse.json(
    {
      state: s.state,
      daysLeft: s.daysLeft,
      msLeft: Math.min(s.msLeft, Number.MAX_SAFE_INTEGER),
      isMaster: s.isMaster,
      activeSubscription: s.activeSubscription,
      trial: s.trial,
      installId: s.installId,
      subscription,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
