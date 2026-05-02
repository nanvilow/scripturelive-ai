// POST /api/license/report-issue
//
// v0.7.14 — Customer-facing "Report Issue" button on the lock
// overlay (and any future "something's wrong" surfaces) posts here.
// We forward the user's free-text description to the central
// /api/telemetry/error endpoint as errorType='user_report' so the
// operator's admin Records dashboard surfaces it in the recent-
// errors panel.
//
// v0.7.43 — Reporter contact fields are now COMPULSORY on every
// user report. The operator was getting too many anonymous
// "something is broken" reports with no way to follow up. Each
// report now includes the user's name, phone, and location so
// the operator can call/text them back. The fields are clamped
// to reasonable lengths to bound abuse.
//
// Body: { message, context?, reporterName, reporterPhone, reporterLocation }
//   message          — required, the user's description, up to 1500 chars
//   context          — optional, current page / state hint from the caller
//   reporterName     — REQUIRED, max 120 chars
//   reporterPhone    — REQUIRED, max 40 chars (loose validation: any digits/+/space/dash)
//   reporterLocation — REQUIRED, max 160 chars (free text, e.g. "Accra, Ghana")
//
// Resp: { ok: true } on success; we always return ok even if
// telemetry fails because the user must NOT be left wondering
// whether their report went through. The fire-and-forget POST
// pattern + our 4s timeout means the worst case is a silent drop;
// the user's message lives only in the central log either way.

import { NextRequest, NextResponse } from 'next/server'
import { getFile } from '@/lib/licensing/storage'
import { pingError } from '@/lib/licensing/telemetry-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Body {
  message?: unknown
  context?: unknown
  reporterName?: unknown
  reporterPhone?: unknown
  reporterLocation?: unknown
}

/** Loose phone validator: at least 7 digits somewhere in the string,
 *  allowing +, space, dash, parens. Strict E.164 would reject valid
 *  domestic numbers (e.g. "024 555 1234" in Ghana). The operator
 *  needs something dial-able, not a perfectly-formatted entry. */
function looksLikePhone(s: string): boolean {
  const digits = s.replace(/\D/g, '')
  return digits.length >= 7 && digits.length <= 20
}

export async function POST(req: NextRequest) {
  let raw: Body
  try {
    raw = (await req.json()) as Body
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  const message = String(raw.message ?? '').trim()
  if (!message) {
    return NextResponse.json({ ok: false, error: 'message_required' }, { status: 400 })
  }
  if (message.length > 1500) {
    return NextResponse.json({ ok: false, error: 'message_too_long' }, { status: 400 })
  }

  // v0.7.43 — Compulsory reporter contact fields. Returning a
  // distinct error code per missing field so the client can
  // highlight the offending input.
  const reporterName = String(raw.reporterName ?? '').trim()
  if (!reporterName) {
    return NextResponse.json({ ok: false, error: 'name_required' }, { status: 400 })
  }
  if (reporterName.length > 120) {
    return NextResponse.json({ ok: false, error: 'name_too_long' }, { status: 400 })
  }

  const reporterPhone = String(raw.reporterPhone ?? '').trim()
  if (!reporterPhone) {
    return NextResponse.json({ ok: false, error: 'phone_required' }, { status: 400 })
  }
  if (reporterPhone.length > 40) {
    return NextResponse.json({ ok: false, error: 'phone_too_long' }, { status: 400 })
  }
  if (!looksLikePhone(reporterPhone)) {
    return NextResponse.json({ ok: false, error: 'phone_invalid' }, { status: 400 })
  }

  const reporterLocation = String(raw.reporterLocation ?? '').trim()
  if (!reporterLocation) {
    return NextResponse.json({ ok: false, error: 'location_required' }, { status: 400 })
  }
  if (reporterLocation.length > 160) {
    return NextResponse.json({ ok: false, error: 'location_too_long' }, { status: 400 })
  }

  const context = typeof raw.context === 'string' ? raw.context.slice(0, 200) : undefined

  try {
    const f = getFile()
    void pingError({
      installId: f.installId,
      code: f.activeSubscription?.activationCode,
      errorType: 'user_report',
      message: context ? `[${context}] ${message}` : message,
      reporterName,
      reporterPhone,
      reporterLocation,
    })
  } catch {
    /* never block a user report — fall through to ok */
  }

  return NextResponse.json({ ok: true })
}
