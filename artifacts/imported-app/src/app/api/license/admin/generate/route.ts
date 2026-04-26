// v0.5.48 — POST /api/license/admin/generate
//
// Owner-only. Mints a NEW activation code without going through the
// MoMo payment flow. Used for:
//   • free trials / promotional codes
//   • cash / bank-transfer customers (paid out of band)
//   • partnership grants ("give Cathedral Lagos 1 year free")
//
// Body: {
//   planCode:  string   // '1M' | '2M' | … | '1Y' | 'CUSTOM'
//   days?:     number   // optional override; required if planCode = CUSTOM
//   note?:     string   // free-text label, e.g. "Pastor John — Lagos"
//   email?:    string   // optional contact for record-keeping
//   whatsapp?: string
// }
//
// Resp: { ok: true, activation: { code, planCode, days, generatedAt, generatedFor } }
//
// The mint is irreversible (we never delete activation rows). The
// recipient still has to type the code into the activation modal on
// their PC — that's what binds the code to a specific install.

import { NextRequest, NextResponse } from 'next/server'
import { findPlan } from '@/lib/licensing/plans'
import { generateStandaloneActivation } from '@/lib/licensing/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Body {
  planCode?: string
  days?: number
  note?: string
  email?: string
  whatsapp?: string
}

export async function POST(req: NextRequest) {
  let body: Body
  try { body = (await req.json()) as Body } catch { return bad('Body must be JSON') }

  const planCode = String(body.planCode ?? '').trim().toUpperCase()
  if (!planCode) return bad('planCode is required')

  // Custom plan code lets the owner mint an arbitrary-duration code
  // not tied to one of the 7 standard plans.
  const isCustom = planCode === 'CUSTOM'
  if (!isCustom && !findPlan(planCode)) {
    return bad(`Unknown planCode "${planCode}". Use one of the published plans or 'CUSTOM'.`)
  }

  // Days validation. CUSTOM requires explicit days; standard plans
  // accept an optional override (e.g. give a 1M plan 45 days as a
  // goodwill bump).
  let days: number | undefined
  if (body.days != null) {
    const n = Math.floor(Number(body.days))
    if (!Number.isFinite(n) || n < 1 || n > 36500) {
      return bad('days must be an integer between 1 and 36500')
    }
    days = n
  }
  if (isCustom && days == null) {
    return bad("CUSTOM plan requires explicit 'days' (1–36500)")
  }

  try {
    const activation = generateStandaloneActivation(
      {
        planCode,
        days,
        note: body.note,
        email: body.email,
        whatsapp: body.whatsapp,
      },
      (code) => {
        const p = findPlan(code)
        return p ? { days: p.days } : null
      },
    )
    return NextResponse.json(
      {
        ok: true,
        activation: {
          code: activation.code,
          planCode: activation.planCode,
          days: activation.days,
          generatedAt: activation.generatedAt,
          generatedFor: activation.generatedFor,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (e) {
    return bad(e instanceof Error ? e.message : String(e))
  }
}

function bad(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 })
}
