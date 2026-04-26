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

  const submitActivation = async (override?: string) => {
    setError(null)
    const trimmed = (override ?? code).trim()
    if (!trimmed) { setError('Enter the activation code first.'); return }
    setBusy(true); setPhase('activating')
    try {
      const r = await fetch('/api/license/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setReceipt(j as ActivateResp)
      setPhase('active')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('payment')
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
      <DialogContent className="sm:max-w-[680px] max-h-[88vh] overflow-y-auto bg-zinc-950 border-zinc-800 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            Activate AI Detection
          </DialogTitle>
          <DialogDescription className="text-zinc-400 text-xs">
            ScriptureLive AI helps churches display scripture instantly — no manual typing,
            no delays, just smooth, accurate, powerful live Bible detection.
          </DialogDescription>
        </DialogHeader>

        {/* ── PHASE 1 — PLAN SELECTION ──────────────────────────────────── */}
        {phase === 'plans' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {plans.map((p) => (
                <button
                  key={p.code}
                  type="button"
                  onClick={() => { setSelected(p); setPhase('payment') }}
                  className={cn(
                    'group relative text-left rounded-lg border bg-zinc-900/50 hover:bg-zinc-800/60',
                    'border-zinc-800 hover:border-emerald-500/50 transition p-3',
                    selected?.code === p.code && 'border-emerald-500 bg-emerald-950/30',
                  )}
                >
                  {p.discountLabel && (
                    <Badge className="absolute -top-2 -right-2 bg-amber-500 text-amber-950 border-amber-300 text-[9px] uppercase">{p.discountLabel}</Badge>
                  )}
                  <div className="text-[11px] uppercase tracking-wider text-zinc-400">{p.label}</div>
                  <div className="text-xl font-bold text-emerald-300 mt-1">GHS {p.amountGhs.toLocaleString()}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">{p.days} days</div>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-zinc-500 text-center">
              Already have an activation code? Choose any plan above to enter it.
            </p>
          </div>
        )}

        {/* ── PHASE 2 — PAYMENT ─────────────────────────────────────────── */}
        {phase === 'payment' && selected && (
          <div className="space-y-4">
            {/* Selected plan summary */}
            <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2.5">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">Selected Plan</div>
                <div className="text-sm font-semibold">{selected.label} — <span className="text-emerald-300">GHS {selected.amountGhs.toLocaleString()}</span></div>
              </div>
              <Button variant="ghost" size="sm" className="text-[10px] text-zinc-400" onClick={() => { setPhase('plans'); setPayment(null) }}>Change</Button>
            </div>

            {!payment && (
              <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3.5">
                <div className="text-[11px] uppercase tracking-wider text-zinc-400">Step 1 — Get your payment code</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="lic-email" className="text-[10px] uppercase tracking-wider text-zinc-400">Email Address</Label>
                    <Input id="lic-email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="bg-zinc-950 border-zinc-800 text-zinc-100" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="lic-wa" className="text-[10px] uppercase tracking-wider text-zinc-400">WhatsApp Number</Label>
                    <Input id="lic-wa" type="tel" placeholder="0244 123 456" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className="bg-zinc-950 border-zinc-800 text-zinc-100" />
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
                    <div className="text-[10px] text-zinc-500 mt-0.5">Use the code below as your MoMo reference</div>
                  </div>
                  <Badge className={cn('font-mono text-xs', expired ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : 'bg-amber-500/20 text-amber-200 border-amber-500/40')}>
                    {expired ? 'EXPIRED' : `Expires in ${fmtCountdown(msLeft)}`}
                  </Badge>
                </div>

                <div className="rounded-md bg-zinc-950 border border-zinc-800 p-4 text-center">
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500">Your Payment Code</div>
                  <div className="mt-1 flex items-center justify-center gap-2">
                    <div className="text-5xl font-bold font-mono tracking-[0.3em] text-emerald-300">{payment.ref}</div>
                    <Button size="icon" variant="ghost" onClick={() => copy(payment.ref)} className="h-9 w-9"><Copy className="h-3.5 w-3.5" /></Button>
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-2">{payment.planLabel} · GHS {payment.amountGhs.toLocaleString()}</div>
                </div>

                <div className="space-y-1.5 text-[12px] text-zinc-200">
                  <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-emerald-300" /> <span className="text-zinc-400">Send MoMo to</span></div>
                  <div className="rounded-md bg-zinc-950 border border-zinc-800 px-3 py-2 flex items-center justify-between">
                    <div>
                      <div className="font-semibold">{payment.momoRecipient.name}</div>
                      <div className="font-mono text-zinc-300">{payment.momoRecipient.number}</div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => copy(payment.momoRecipient.number)}><Copy className="h-3.5 w-3.5" /></Button>
                  </div>
                  {/* v0.5.53 — Operator-requested NOTE under the MoMo number. */}
                  <div className="rounded-md border border-emerald-500/30 bg-emerald-950/20 px-3 py-2 text-[11px] text-emerald-200/90 leading-relaxed">
                    <span className="font-semibold uppercase tracking-wider text-[10px] text-emerald-300">NOTE:</span>{' '}
                    Make sure the recipient name shows as <span className="font-semibold">{payment.momoRecipient.name}</span> before
                    you confirm the MoMo transaction. If the name is different, STOP and contact support — your funds may be
                    sent to the wrong account.
                  </div>
                </div>

                <div className="text-[10px] text-amber-300/90 leading-relaxed flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  Use the generated payment code <span className="font-mono">{payment.ref}</span> as your MoMo reference. Failure to use it may result in loss of funds.
                </div>
              </div>
            )}

            {/* Activation entry — visible whether or not payment exists */}
            <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3.5">
              <div className="text-[11px] uppercase tracking-wider text-zinc-400">Step 3 — Enter activation code after payment</div>
              <div className="flex gap-2">
                <Input
                  placeholder="SL-1Y-XXXXXX"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  onContextMenu={(e) => { e.preventDefault(); pasteIntoInput(setCode) }}
                  className="bg-zinc-950 border-zinc-800 text-zinc-100 font-mono"
                />
                <Button onClick={() => submitActivation(code)} disabled={busy} className="bg-emerald-600 hover:bg-emerald-500 text-white">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Activate'}
                </Button>
              </div>
              <p className="text-[10px] text-zinc-500">Right-click the box above to paste from clipboard.</p>

              {/* v0.5.53 — Second slot for an operator-issued
                  generated/master code. Same endpoint, but kept on
                  its own line so the operator can paste either kind
                  without overwriting a half-typed customer code. */}
              <div className="text-[11px] uppercase tracking-wider text-zinc-400 pt-2 border-t border-zinc-800">
                Or — Enter your generated and master code in here
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="SL-MASTER-XXXXXX or generated code"
                  value={masterCode}
                  onChange={(e) => setMasterCode(e.target.value.toUpperCase())}
                  onContextMenu={(e) => { e.preventDefault(); pasteIntoInput(setMasterCode) }}
                  className="bg-zinc-950 border-zinc-800 text-zinc-100 font-mono"
                />
                <Button onClick={() => submitActivation(masterCode)} disabled={busy} className="bg-amber-600 hover:bg-amber-500 text-white">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Activate'}
                </Button>
              </div>

              {error && phase === 'payment' && <div className="text-[11px] text-rose-400 flex items-start gap-1.5"><AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{error}</div>}
            </div>
          </div>
        )}

        {/* ── PHASE 3 — ACTIVATING ──────────────────────────────────────── */}
        {phase === 'activating' && (
          <div className="py-12 text-center">
            <Loader2 className="h-10 w-10 mx-auto text-emerald-400 animate-spin" />
            <div className="mt-4 text-sm text-zinc-300">Activating your subscription…</div>
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
              <p className="text-[12px] text-zinc-400 mt-0.5">{receipt.activated.planLabel} · {receipt.activated.days} days</p>
            </div>
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/20 p-3 text-left text-[11px] font-mono text-emerald-200 whitespace-pre-line">{receipt.receipt.text}</div>
            <div className="flex flex-wrap gap-2 justify-center">
              <Button size="sm" variant="outline" onClick={() => copy(receipt.receipt.text)} className="border-zinc-700 text-zinc-200"><Copy className="h-3 w-3 mr-1.5" /> Copy receipt</Button>
              {receipt.receipt.whatsappLink && (
                <a href={receipt.receipt.whatsappLink} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-200"><Phone className="h-3 w-3 mr-1.5" /> Send via WhatsApp</Button>
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
