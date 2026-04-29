// v0.5.48 — Admin Settings persistence.
//
// GET  → returns the current owner-saved RuntimeConfig + the compiled
//        defaults so the UI can render "current vs default" hints.
// POST → merges the supplied patch into RuntimeConfig and persists it
//        to ~/.scripturelive/license.json under `config`. Server-side
//        helpers in plans.ts (getEffectivePlans, getEffectiveMoMo,
//        getEffectiveNotificationTargets) consult this on every call,
//        so changes apply without a process restart.

import { NextRequest, NextResponse } from 'next/server'
import { getConfig, saveConfig, type RuntimeConfig } from '@/lib/licensing/storage'
import { requireAdmin } from '@/lib/licensing/admin-auth'
import {
  PLANS,
  MOMO_RECIPIENT,
  NOTIFICATION_EMAIL,
  NOTIFICATION_WHATSAPP,
} from '@/lib/licensing/plans'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Defaults {
  trialMinutes: number
  momoName: string
  momoNumber: string
  notifyEmail: string
  whatsappNumber: string
  planPrices: Record<string, number>
}

function defaults(): Defaults {
  const planPrices: Record<string, number> = {}
  for (const p of PLANS) planPrices[p.code] = p.amountGhs
  return {
    trialMinutes: 60,
    momoName: MOMO_RECIPIENT.name,
    momoNumber: MOMO_RECIPIENT.number,
    notifyEmail: NOTIFICATION_EMAIL,
    whatsappNumber: NOTIFICATION_WHATSAPP,
    planPrices,
  }
}

export async function GET(req: NextRequest) {
  const guard = requireAdmin(req)
  if (guard) return guard
  const config = getConfig() ?? {}
  return NextResponse.json(
    { config, defaults: defaults() },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

interface SavePayload {
  adminPassword?: string | null
  trialMinutes?: number | null
  momoName?: string | null
  momoNumber?: string | null
  whatsappNumber?: string | null
  notifyEmail?: string | null
  planPriceOverrides?: Record<string, number | null> | null
  /** v0.5.52 — admin-paste cloud key overrides. */
  adminOpenAIKey?: string | null
  adminDeepgramKey?: string | null
}

function clean(v: unknown): unknown {
  if (v === null) return null
  if (typeof v === 'string') {
    const t = v.trim()
    return t === '' ? null : t
  }
  return v
}

export async function POST(req: NextRequest) {
  const guard = requireAdmin(req)
  if (guard) return guard
  let body: SavePayload
  try {
    body = (await req.json()) as SavePayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const patch: Partial<Record<keyof RuntimeConfig, unknown>> = {}

  if ('adminPassword' in body) patch.adminPassword = clean(body.adminPassword)
  if ('adminOpenAIKey' in body) patch.adminOpenAIKey = clean(body.adminOpenAIKey)
  if ('adminDeepgramKey' in body) patch.adminDeepgramKey = clean(body.adminDeepgramKey)
  if ('momoName' in body) patch.momoName = clean(body.momoName)
  if ('momoNumber' in body) patch.momoNumber = clean(body.momoNumber)
  if ('whatsappNumber' in body) patch.whatsappNumber = clean(body.whatsappNumber)
  if ('notifyEmail' in body) patch.notifyEmail = clean(body.notifyEmail)

  if ('trialMinutes' in body) {
    if (body.trialMinutes === null) {
      patch.trialMinutes = null
    } else if (typeof body.trialMinutes === 'number' && body.trialMinutes > 0) {
      patch.trialMinutes = Math.min(24 * 60, Math.max(1, Math.floor(body.trialMinutes)))
    }
  }

  if ('planPriceOverrides' in body && body.planPriceOverrides) {
    const map: Record<string, number> = {}
    for (const [code, value] of Object.entries(body.planPriceOverrides)) {
      if (value === null) continue // skip — null means "clear"
      if (typeof value === 'number' && value > 0) {
        map[code] = Math.round(value)
      }
    }
    // Merge with existing overrides so per-row clears work.
    // existing may have undefined values per the partial type — strip them.
    const existing = getConfig()?.planPriceOverrides ?? {}
    const merged: Record<string, number> = {}
    for (const [k, v] of Object.entries(existing)) {
      if (typeof v === 'number') merged[k] = v
    }
    for (const [k, v] of Object.entries(map)) merged[k] = v
    // Apply explicit clears (null) by removing those keys.
    for (const [code, value] of Object.entries(body.planPriceOverrides)) {
      if (value === null) delete merged[code]
    }
    patch.planPriceOverrides = merged
  }

  const next = saveConfig(patch)
  return NextResponse.json(
    { ok: true, config: next, defaults: defaults() },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
