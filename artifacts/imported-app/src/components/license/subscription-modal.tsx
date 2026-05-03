'use client'

// v1 licensing — subscription modal (customer-facing).
//
// 4 phases driven by `phase` state:
//   1. plans      — operator picks one of 7 plans (1M…1Y)
//   2. payment    — show MoMo recipient, ref code, 15-min countdown,
//                   email + WhatsApp inputs, activation-code input
//   3. activating — POST /api/license/activate, brief spinner
//   4. active     — receipt with copy buttons + close
//
// The "owner has activation code already" path is the same input
// field in phase 2 — no separate flow.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useLicense } from './license-provider'
import { Copy, ShieldCheck, Lock, Sparkles, AlertTriangle, Phone, Mail, Loader2, Check, Crown, Building2, Gift } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface Plan {
  code: string
  label: string
  amountGhs: number
  days: number
  discountLabel?: string
  hidden?: boolean
}

// v0.5.48 — compiled defaults used as a fallback BEFORE the public
// /api/license/plans endpoint resolves (e.g. cold-start, offline).
// The modal fetches the EFFECTIVE plan list (with any owner-set
// price overrides applied) on mount so price changes from Admin
// Settings show up without rebuilding the renderer bundle.
//
// v0.7.64 — Sourced from @workspace/pricing (the canonical
// catalogue) instead of being hand-duplicated here. The previous
// hand-typed copy had silently drifted off the lib (it still
// listed 2M–6M and the GHS 200 / 25% Off legacy values after they
// were collapsed). Importing keeps both surfaces in lockstep
// forever and makes future price changes a one-file edit.
//
// IMPORTANT: import DIRECTLY from `@workspace/pricing` (the zero-deps
// catalogue lib), NOT from `@/lib/licensing/plans` — the licensing
// barrel transitively imports `storage.ts`, which uses `node:fs`,
// and this file ships into the client bundle. Pulling it through
// the barrel breaks the Turbopack/Next client build with
// "the chunking context does not support external modules
// (request: node:fs)".
import { getPurchasablePlans } from '@workspace/pricing'
const FALLBACK_PLANS: Plan[] = getPurchasablePlans().map((p) => ({
  code: p.code,
  label: p.label,
  amountGhs: p.amountGhs,
  days: p.days,
  discountLabel: p.discountLabel,
}))

interface PaymentResp {
  ref: string
  planCode: string
  planLabel: string
  amountGhs: number
  createdAt: string
  expiresAt: string
  momoRecipient: { name: string; number: string }
}

interface ActivateResp {
  status: { state: string; daysLeft: number; isMaster: boolean }
  activated: { code: string; planLabel: string; days: number; subscriptionExpiresAt?: string; usedAt?: string }
  receipt: { text: string; whatsappLink: string | null }
}

function copy(text: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(text).then(
      () => toast.success('Copied to clipboard'),
      () => toast.error('Copy failed'),
    )
  }
}

function fmtCountdown(msLeft: number): string {
  const total = Math.max(0, Math.floor(msLeft / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function SubscriptionModal() {
  const { ui, status, refresh } = useLicense()
  const open = ui.subscribeOpen
  const setOpen = ui.setSubscribeOpen

  type Phase = 'plans' | 'payment' | 'activating' | 'active'
  const [phase, setPhase] = useState<Phase>('plans')
  const [selected, setSelected] = useState<Plan | null>(null)
  const [email, setEmail] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [payment, setPayment] = useState<PaymentResp | null>(null)
  const [code, setCode] = useState('')
  // v0.7.75 — Single activation input. The legacy "master code" slot
  // was collapsed into the same field; we auto-detect master vs
  // customer codes by SL-MASTER prefix at submit time so the API
  // still gets the right `expectedType`.
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<ActivateResp | null>(null)
  const [now, setNow] = useState(() => Date.now())
  // v0.5.48 — live plans fetched from /api/license/plans so owner
  // price overrides apply.
  const [plans, setPlans] = useState<Plan[]>(FALLBACK_PLANS)
  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetch('/api/license/plans', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j?.plans) return
        if (Array.isArray(j.plans) && j.plans.length) setPlans(j.plans as Plan[])
      })
      .catch(() => { /* keep fallback */ })
    return () => { cancelled = true }
  }, [open])

  // 1-Hz tick for the 15-min countdown
  useEffect(() => {
    if (phase !== 'payment' || !payment) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [phase, payment])

  // Reset on close
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setPhase(status.state === 'active' ? 'plans' : 'plans')
        setSelected(null)
        setPayment(null)
        setCode('')
        setBusy(false)
        setError(null)
        setReceipt(null)
      }, 250)
    }
  }, [open, status.state])

  const msLeft = useMemo(() => payment ? new Date(payment.expiresAt).getTime() - now : 0, [payment, now])
  const expired = msLeft <= 0 && payment !== null

  const requestPaymentCode = async () => {
    if (!selected) return
    setError(null)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address.')
      return
    }
    if (whatsapp.replace(/\D/g, '').length < 7) {
      setError('Please enter a valid WhatsApp number.')
      return
    }
    setBusy(true)
    try {
      const r = await fetch('/api/license/payment-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planCode: selected.code, email: email.trim(), whatsapp: whatsapp.trim() }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setPayment(j as PaymentResp)
      setNow(Date.now())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  const submitActivation = async (override?: string, expectedType?: 'activation' | 'master') => {
    setError(null)
    const trimmed = (override ?? code).trim()
    if (!trimmed) { setError('Enter the activation code first.'); return }
    // v0.6.1 — Remember which phase the operator was on BEFORE the
    // 'activating' transition. Originally the catch branch always
    // fell back to 'payment', which meant a failed activation from
    // PHASE 1 (no plan picked) would leave the modal blank because
    // PHASE 2's render is gated by `phase === 'payment' && selected`.
    // Now we return to whichever phase the user actually came from.
    const originPhase: Phase = selected ? 'payment' : 'plans'
    setBusy(true); setPhase('activating')
    try {
      // v0.6.5 — pass which BOX the customer typed into so the route
      // can cross-reject (paid activation code in master box, master
      // code in activation box, etc.) with a precise error.
      const r = await fetch('/api/license/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed, expectedType }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setReceipt(j as ActivateResp)
      setPhase('active')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase(originPhase)
    } finally { setBusy(false) }
  }

  // v0.5.53 — Right-click in Electron sometimes swallows the native
  // paste menu. Bind a paste-on-context-menu handler so the operator
  // can long-press / right-click any of these inputs and have the
  // clipboard contents land normalised (uppercased, whitespace
  // stripped) without ever touching the keyboard.
  const pasteIntoInput = async (setter: (v: string) => void) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        const txt = (await navigator.clipboard.readText()) || ''
        setter(txt.trim().toUpperCase())
      }
    } catch { /* clipboard permission denied — silent */ }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className={cn(
        'max-h-[92vh] overflow-y-auto bg-background border-border text-foreground p-4 sm:p-5 gap-3',
        phase === 'plans' ? 'sm:max-w-[1080px]' : 'sm:max-w-[680px]',
      )}>
        <DialogHeader className="space-y-1">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            Activate AI Detection
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-[11px] leading-snug">
            Already paid? Enter your activation code below. New here? Pick a plan.
          </DialogDescription>
        </DialogHeader>

        {/* ── PHASE 1 — PLAN SELECTION ──────────────────────────────────── */}
        {/* v0.6.1 — STEP 3 (activation entry) was moved out of PHASE 2 and
            into PHASE 1 per operator request: customers who already have
            a code (renewal, master, generated) shouldn't have to pick a
            plan first. The two activation slots now sit directly below
            the plan grid so they fill the empty space next to the 1-Year
            tile. */}
        {phase === 'plans' && (() => {
          // v0.7.68 — Professional 3-tier pricing layout (Starter / Pro /
          // Church License) replacing the legacy 7-cell duration grid.
          // Tiers map to the canonical @workspace/pricing catalogue:
          //   • Starter      → no plan code (1-hour activity-gated trial
          //                    is auto-running for unactivated installs).
          //   • Pro          → 1M plan code, billed monthly via MoMo.
          //   • Church License → 1Y plan code, billed yearly via MoMo.
          // Prices and durations are pulled from the live `plans` array
          // (which already merges in operator overrides from /api/license/plans),
          // so any future price change in the admin panel propagates to
          // both cards without a code edit. The legacy 1M / 1Y direct
          // tiles are kept reachable through this same picker — clicking
          // Pro sets selected = 1M plan, clicking Church sets 1Y plan.
          const proPlan = plans.find((p) => p.code === '1M') ?? null
          const churchPlan = plans.find((p) => p.code === '1Y') ?? null
          const tiers: Array<{
            id: 'starter' | 'pro' | 'church'
            name: string
            blurb: string
            price: string
            priceSuffix: string
            icon: typeof Crown
            features: string[]
            ctaLabel: string
            featured: boolean
            onSelect: () => void
            disabled?: boolean
          }> = [
            {
              id: 'starter',
              name: 'Starter',
              blurb: 'Perfect for small churches just getting started with smart scripture display.',
              price: 'Free',
              priceSuffix: '',
              icon: Gift,
              features: [
                'AI Verse Detection (Free Trial)',
                'Dual Screen Display',
                'Basic Typography Customization',
                'Up to 2 screens',
                'Email Support',
              ],
              ctaLabel: 'Get Started',
              featured: false,
              onSelect: () => setOpen(false),
            },
            {
              id: 'pro',
              name: 'Pro',
              blurb: 'The full ScriptureLive experience for growing congregations.',
              price: proPlan ? `GHS ${proPlan.amountGhs.toLocaleString()}` : 'GHS —',
              priceSuffix: '/per month',
              icon: Crown,
              features: [
                'AI Verse Detection (OpenAI Mode)',
                'NDI Output Integration',
                'Unlimited Screens',
                'Full Typography & Styling',
                'Smart Chapter Navigator',
                'Priority Support',
                'All future updates',
              ],
              ctaLabel: 'Get Started',
              featured: true,
              disabled: !proPlan,
              onSelect: () => { if (proPlan) { setSelected(proPlan); setPhase('payment') } },
            },
            {
              id: 'church',
              name: 'Church License',
              blurb: 'A permanent license for established ministries — pay once, own it forever.',
              price: churchPlan ? `GHS ${churchPlan.amountGhs.toLocaleString()}` : 'GHS —',
              priceSuffix: '/Year',
              icon: Building2,
              features: [
                'Everything in Pro',
                'Lifetime license (no subscription)',
                'Install on up to 5 machines',
                'Setup & onboarding call',
                'Dedicated WhatsApp support',
                'Custom branding options',
              ],
              ctaLabel: 'Get Started',
              featured: false,
              disabled: !churchPlan,
              onSelect: () => { if (churchPlan) { setSelected(churchPlan); setPhase('payment') } },
            },
          ]
          return (
          <div className="space-y-4">
            {/* v0.7.75 — Activation entry MOVED TO TOP per operator
                feedback: "make sure when users open it, they should be
                able to see where to enter the activation code too."
                Previously the activation field sat below all three
                pricing tiers, which pushed it below the fold on a
                1280×720 stage so customers with a code in hand
                couldn't find where to type it. Now it's the first
                thing visible — pricing tiers follow underneath for
                customers who don't have a code yet. The two slots
                (customer code / master code) are collapsed into a
                single tabbed control to keep the top section short. */}
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/15 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-wider text-emerald-300 font-semibold">
                  Already have an activation code?
                </div>
                <span className="text-[10px] text-muted-foreground">Right-click box to paste</span>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="SL-1Y-XXXXXX  (or master / generated code)"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  onContextMenu={(e) => { e.preventDefault(); pasteIntoInput(setCode) }}
                  className="bg-background border-border text-foreground font-mono h-9"
                />
                <Button
                  onClick={() => {
                    // Auto-detect master vs customer code by prefix so
                    // we collapse the two old buttons into one without
                    // losing the cross-reject precision in the API.
                    const v = code.trim().toUpperCase()
                    const looksMaster = /^SL-MASTER/i.test(v) || /^MASTER/i.test(v)
                    submitActivation(code, looksMaster ? 'master' : 'activation')
                  }}
                  disabled={busy}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 h-9"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Activate'}
                </Button>
              </div>
              {error && phase === 'plans' && (
                <div className="text-[11px] text-rose-400 flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  {error}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Or pick a plan
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 lg:gap-4">
              {tiers.map((tier) => {
                const Icon = tier.icon
                return (
                  <div
                    key={tier.id}
                    className={cn(
                      'relative rounded-xl border p-3.5 sm:p-4 flex flex-col bg-card/40',
                      tier.featured
                        ? 'border-amber-500/70 bg-gradient-to-b from-amber-950/30 via-card/40 to-card/40 shadow-[0_0_30px_-12px_rgba(245,158,11,0.45)]'
                        : 'border-border hover:border-border/80',
                    )}
                  >
                    {tier.featured && (
                      <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-amber-500 text-amber-950 text-[9px] font-bold uppercase tracking-wider shadow-lg whitespace-nowrap">
                        Most Popular
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <Icon className={cn('h-3.5 w-3.5', tier.featured ? 'text-amber-300' : 'text-muted-foreground')} />
                      <h3 className="text-sm font-semibold text-foreground">{tier.name}</h3>
                    </div>
                    <p className="mt-1 text-[10.5px] leading-snug text-muted-foreground min-h-[28px]">{tier.blurb}</p>
                    <div className="mt-2 mb-2">
                      <div className="flex items-baseline gap-1">
                        <span className={cn('text-2xl font-bold tracking-tight', tier.featured ? 'text-amber-200' : 'text-foreground')}>{tier.price}</span>
                        {tier.priceSuffix && (
                          <span className="text-[10px] text-muted-foreground">{tier.priceSuffix}</span>
                        )}
                      </div>
                    </div>
                    <ul className="space-y-1 mb-3">
                      {tier.features.map((f) => (
                        <li key={f} className="flex items-start gap-1.5 text-[11px] text-foreground leading-snug">
                          <Check className={cn('h-3 w-3 mt-[2px] shrink-0', tier.featured ? 'text-amber-300' : 'text-emerald-400')} />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      onClick={tier.onSelect}
                      disabled={tier.disabled}
                      className={cn(
                        'mt-auto w-full h-8 text-[11px] font-semibold uppercase tracking-wider',
                        tier.featured
                          ? 'bg-amber-500 hover:bg-amber-400 text-amber-950 border border-amber-300'
                          : 'bg-transparent hover:bg-muted text-foreground border border-border',
                      )}
                    >
                      {tier.ctaLabel}
                    </Button>
                  </div>
                )
              })}
            </div>
          </div>
          )
        })()}

        {/* ── PHASE 2 — PAYMENT ─────────────────────────────────────────── */}
        {phase === 'payment' && selected && (
          <div className="space-y-4">
            {/* Selected plan summary */}
            <div className="flex items-center justify-between rounded-lg border border-border bg-card/40 px-3 py-2.5">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Selected Plan</div>
                <div className="text-sm font-semibold">{selected.label} — <span className="text-emerald-300">GHS {selected.amountGhs.toLocaleString()}</span></div>
              </div>
              <Button variant="ghost" size="sm" className="text-[10px] text-muted-foreground" onClick={() => { setPhase('plans'); setPayment(null) }}>Change</Button>
            </div>

            {!payment && (
              <div className="space-y-3 rounded-lg border border-border bg-card/40 p-3.5">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Step 1 — Get your payment code</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="lic-email" className="text-[10px] uppercase tracking-wider text-muted-foreground">Email Address</Label>
                    <Input id="lic-email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="bg-background border-border text-foreground" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="lic-wa" className="text-[10px] uppercase tracking-wider text-muted-foreground">SMS Number to Receive Activation Code</Label>
                    <Input id="lic-wa" type="tel" placeholder="0244 123 456" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className="bg-background border-border text-foreground" />
                  </div>
                </div>
                {error && <div className="text-[11px] text-rose-400 flex items-start gap-1.5"><AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{error}</div>}
                <Button onClick={requestPaymentCode} disabled={busy} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white">
                  {busy ? <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />Generating…</> : 'Generate Payment Code'}
                </Button>
              </div>
            )}

            {payment && (
              <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-950/10 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-amber-300">Step 2 — Send MoMo Now</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Use the code below as your MoMo reference</div>
                  </div>
                  <Badge className={cn('font-mono text-xs', expired ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : 'bg-amber-500/20 text-amber-200 border-amber-500/40')}>
                    {expired ? 'EXPIRED' : `Expires in ${fmtCountdown(msLeft)}`}
                  </Badge>
                </div>

                <div className="rounded-md bg-background border border-border p-4 text-center">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Your Payment Code</div>
                  <div className="mt-1 flex items-center justify-center gap-2">
                    <div className="text-5xl font-bold font-mono tracking-[0.3em] text-emerald-300">{payment.ref}</div>
                    <Button size="icon" variant="ghost" onClick={() => copy(payment.ref)} className="h-9 w-9"><Copy className="h-3.5 w-3.5" /></Button>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-2">{payment.planLabel} · GHS {payment.amountGhs.toLocaleString()}</div>
                </div>

                <div className="space-y-1.5 text-[12px] text-foreground">
                  <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-emerald-300" /> <span className="text-muted-foreground">Send MoMo to</span></div>
                  <div className="rounded-md bg-background border border-border px-3 py-2 flex items-center justify-between">
                    <div>
                      <div className="font-semibold">{payment.momoRecipient.name}</div>
                      <div className="font-mono text-foreground">{payment.momoRecipient.number}</div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => copy(payment.momoRecipient.number)}><Copy className="h-3.5 w-3.5" /></Button>
                  </div>
                  {/* v0.6.0 — Operator updated the NOTE wording: now
                      includes a WhatsApp escalation channel and an
                      explicit instruction to send a payment-proof
                      screenshot for verification.
                      v0.6.5 — NOTE re-themed RED (was emerald) for higher
                      visual urgency. The two embedded WhatsApp numbers
                      switched from hard-coded "0246798526" to
                      {payment.momoRecipient.number} so admin edits to
                      the MoMo number propagate to ALL three places
                      (display, escalation, screenshot proof) instead of
                      just the display row. */}
                  <div className="rounded-md border border-red-500/40 bg-red-950/30 px-3 py-2 text-[11px] text-red-100 leading-relaxed">
                    <span className="font-semibold uppercase tracking-wider text-[10px] text-red-300">NOTE:</span>{' '}
                    Make sure the recipient name shows as <span className="font-semibold">{payment.momoRecipient.name}</span> before
                    you confirm the MoMo transaction. If the name is different, STOP and contact support on
                    {' '}<span className="font-semibold">WhatsApp ({payment.momoRecipient.number})</span> — your funds may be sent to the wrong account.{' '}
                    <span className="font-semibold uppercase tracking-wider text-[10px] text-red-300">SEND A SCREENSHOT TO &quot;{payment.momoRecipient.number}&quot; on WhatsApp for payment proof.</span>
                  </div>
                </div>

                {/* v0.6.5 — Failure-to-use warning was a tiny amber line
                    that got lost in the modal. Promoted to a red ring
                    container with bold text so customers cannot miss
                    it; losing funds because they typed a different MoMo
                    reference was a recurring support ticket. */}
                <div className="rounded-md border border-red-500/50 bg-red-950/30 px-3 py-2.5 text-[12px] text-red-100 leading-relaxed flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-red-300" />
                  <strong className="font-bold">
                    Use the generated payment code <span className="font-mono text-red-200">{payment.ref}</span> as your MoMo reference. Failure to use it may result in loss of funds.
                  </strong>
                </div>
              </div>
            )}

            {/* v0.6.1 — STEP 3 activation entry MOVED OUT of PHASE 2.
                Customers who already have a code now use the panel
                in PHASE 1 (plan picker). The "Change" pill above
                returns them there if they need to enter one mid-pay. */}
            <p className="text-[10px] text-muted-foreground text-center">
              Once you receive your activation code by email or WhatsApp, click <span className="font-semibold">Change</span> above to return to the plan picker and enter it there.
            </p>

            {error && phase === 'payment' && <div className="text-[11px] text-rose-400 flex items-start gap-1.5"><AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{error}</div>}
          </div>
        )}

        {/* ── PHASE 3 — ACTIVATING ──────────────────────────────────────── */}
        {phase === 'activating' && (
          <div className="py-12 text-center">
            <Loader2 className="h-10 w-10 mx-auto text-emerald-400 animate-spin" />
            <div className="mt-4 text-sm text-foreground">Activating your subscription…</div>
          </div>
        )}

        {/* ── PHASE 4 — ACTIVE ──────────────────────────────────────────── */}
        {phase === 'active' && receipt && (
          <div className="space-y-4 text-center">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-emerald-500/15 border border-emerald-500/40 mx-auto">
              <ShieldCheck className="h-8 w-8 text-emerald-300" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">AI Detection Active</h3>
              <p className="text-[12px] text-muted-foreground mt-0.5">{receipt.activated.planLabel} · {receipt.activated.days} days</p>
            </div>
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/20 p-3 text-left text-[11px] font-mono text-emerald-200 whitespace-pre-line">{receipt.receipt.text}</div>
            <div className="flex flex-wrap gap-2 justify-center">
              <Button size="sm" variant="outline" onClick={() => copy(receipt.receipt.text)} className="border-border text-foreground"><Copy className="h-3 w-3 mr-1.5" /> Copy receipt</Button>
              {receipt.receipt.whatsappLink && (
                <a href={receipt.receipt.whatsappLink} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="outline" className="border-border text-foreground"><Phone className="h-3 w-3 mr-1.5" /> Send via WhatsApp</Button>
                </a>
              )}
            </div>
            <Button className="bg-emerald-600 hover:bg-emerald-500" onClick={() => setOpen(false)}>Close</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
