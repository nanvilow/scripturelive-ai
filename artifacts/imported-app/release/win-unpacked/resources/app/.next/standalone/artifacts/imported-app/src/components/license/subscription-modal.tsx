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
import { Copy, ShieldCheck, Lock, Sparkles, AlertTriangle, Phone, Mail, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface Plan {
  code: string
  label: string
  amountGhs: number
  days: number
  discountLabel?: string
}

// v0.5.48 — compiled defaults used as a fallback BEFORE the public
// /api/license/plans endpoint resolves (e.g. cold-start, offline).
// The modal fetches the EFFECTIVE plan list (with any owner-set
// price overrides applied) on mount so price changes from Admin
// Settings show up without rebuilding the renderer bundle.
const FALLBACK_PLANS: Plan[] = [
  { code: '1M', label: '1 Month',  amountGhs: 200,  days: 31 },
  { code: '2M', label: '2 Months', amountGhs: 350,  days: 62 },
  { code: '3M', label: '3 Months', amountGhs: 550,  days: 93 },
  { code: '4M', label: '4 Months', amountGhs: 750,  days: 124 },
  { code: '5M', label: '5 Months', amountGhs: 900,  days: 155 },
  { code: '6M', label: '6 Months', amountGhs: 1200, days: 186 },
  { code: '1Y', label: '1 Year',   amountGhs: 1800, days: 365, discountLabel: '25% Off' },
]

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
  // v0.5.53 — second activation slot for an operator-supplied
  // generated/master code, surfaced as its own input box right under
  // Step 3. Both slots feed the same /api/license/activate endpoint;
  // the only difference is which value is sent on click.
  const [masterCode, setMasterCode] = useState('')
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
        setMasterCode('')
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
      <DialogContent className="sm:max-w-[680px] max-h-[88vh] overflow-y-auto bg-background border-border text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            Activate AI Detection
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            ScriptureLive AI helps churches display scripture instantly — no manual typing,
            no delays, just smooth, accurate, powerful live Bible detection.
          </DialogDescription>
        </DialogHeader>

        {/* ── PHASE 1 — PLAN SELECTION ──────────────────────────────────── */}
        {/* v0.6.1 — STEP 3 (activation entry) was moved out of PHASE 2 and
            into PHASE 1 per operator request: customers who already have
            a code (renewal, master, generated) shouldn't have to pick a
            plan first. The two activation slots now sit directly below
            the plan grid so they fill the empty space next to the 1-Year
            tile. */}
        {phase === 'plans' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {plans.map((p) => (
                <button
                  key={p.code}
                  type="button"
                  onClick={() => { setSelected(p); setPhase('payment') }}
                  className={cn(
                    'group relative text-left rounded-lg border bg-card/50 hover:bg-muted/60',
                    'border-border hover:border-emerald-500/50 transition p-3',
                    selected?.code === p.code && 'border-emerald-500 bg-emerald-950/30',
                  )}
                >
                  {p.discountLabel && (
                    <Badge className="absolute -top-2 -right-2 bg-amber-500 text-amber-950 border-amber-300 text-[9px] uppercase">{p.discountLabel}</Badge>
                  )}
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{p.label}</div>
                  <div className="text-xl font-bold text-emerald-300 mt-1">GHS {p.amountGhs.toLocaleString()}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{p.days} days</div>
                </button>
              ))}
            </div>

            {/* v0.6.1 — relocated activation entry. Same two slots that
                used to live in PHASE 2 (post-plan-pick): a customer
                code slot (emerald Activate) and a master / generated
                code slot (amber Activate). Either one bypasses the
                payment flow entirely — the activation endpoint
                returns the plan info embedded in the code itself. */}
            <div className="space-y-2 rounded-lg border border-border bg-card/40 p-3.5">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Step 3 — Enter activation code after payment</div>
              <div className="flex gap-2">
                <Input
                  placeholder="SL-1Y-XXXXXX"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  onContextMenu={(e) => { e.preventDefault(); pasteIntoInput(setCode) }}
                  className="bg-background border-border text-foreground font-mono"
                />
                <Button onClick={() => submitActivation(code, 'activation')} disabled={busy} className="bg-emerald-600 hover:bg-emerald-500 text-white">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Activate'}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">Right-click the box above to paste from clipboard.</p>

              <div className="text-[11px] uppercase tracking-wider text-muted-foreground pt-2 border-t border-border">
                Or — Enter your generated and master code in here
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="SL-MASTER-XXXXXX or generated code"
                  value={masterCode}
                  onChange={(e) => setMasterCode(e.target.value.toUpperCase())}
                  onContextMenu={(e) => { e.preventDefault(); pasteIntoInput(setMasterCode) }}
                  className="bg-background border-border text-foreground font-mono"
                />
                <Button onClick={() => submitActivation(masterCode, 'master')} disabled={busy} className="bg-amber-600 hover:bg-amber-500 text-white">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Activate'}
                </Button>
              </div>

              {error && phase === 'plans' && <div className="text-[11px] text-rose-400 flex items-start gap-1.5"><AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{error}</div>}
            </div>
          </div>
        )}

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
