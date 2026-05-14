// v0.7.7 — Admin password recovery flow.
//
// Trigger: operator clicks "Forgot password?" on the admin login screen.
//
// What we do:
//   1. Mint a 6-digit one-time OTP (15-minute TTL) and persist it to
//      license.json under `pendingAdminReset`.
//   2. Send the OTP via SMS to ADMIN_NOTIFICATION_PHONE (operator's
//      personal phone, currently 0246798526) so they can read it off
//      their handset.
//   3. Email the same OTP to NOTIFICATION_EMAIL (currently
//      nanvilow@gmail.com) as a redundant delivery channel.
//   4. Tell the caller "OK, code sent" — never echo the code in the
//      HTTP response. The operator must read it from SMS or email.
//
// The OTP is consumed by /api/license/admin/login (via passwordMatches
// in admin-auth.ts) so it's a true one-shot. Master code remains a
// permanent fallback for the case where SMS + email both fail.
//
// Public route — no auth gate, by design. Anyone who can reach the
// app can request a reset, but the OTP only goes to the operator's
// own phone and inbox (numbers/addresses are baked, not user input).

import { NextResponse } from 'next/server'
import { setPendingAdminReset } from '@/lib/licensing/storage'
import { notifyEmail, notifySms } from '@/lib/licensing/notifications'
import { getEffectiveAdminPhone } from '@/lib/licensing/plans'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const { code, expiresAt } = setPendingAdminReset()
  const expMins = Math.round(
    (new Date(expiresAt).getTime() - Date.now()) / 60_000,
  )
  const adminPhone = getEffectiveAdminPhone()

  const subject = 'ScriptureLive AI — Admin password reset code'
  const body = [
    'ScriptureLive AI — Admin password reset',
    '',
    `One-time code: ${code}`,
    `Valid for:     ${expMins} minutes`,
    '',
    'Enter this code on the admin login screen to unlock the panel.',
    'It can only be used once. If you did NOT request this reset,',
    'simply ignore this message — no further action is needed.',
  ].join('\n')

  // Fire the dispatches; capture any failure but don't fail the
  // whole request — so long as the OTP is persisted, the operator
  // can read it off the license.json file as a last resort.
  const [smsRes, emailRes] = await Promise.allSettled([
    notifySms({
      to: adminPhone,
      subject,
      body: `ScriptureLive AI admin reset code: ${code} (valid ${expMins} min). One-time use.`,
    }),
    notifyEmail({ subject, body }),
  ])

  const smsOk =
    smsRes.status === 'fulfilled' &&
    (smsRes.value.status === 'sent' || smsRes.value.status === 'pending')
  const emailOk =
    emailRes.status === 'fulfilled' &&
    (emailRes.value.status === 'sent' || emailRes.value.status === 'pending')

  return NextResponse.json({
    ok: true,
    expiresAt,
    expMinutes: expMins,
    sms: { dispatched: smsOk, to: adminPhone },
    email: { dispatched: emailOk },
  })
}
