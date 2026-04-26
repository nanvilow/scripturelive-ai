'use client'

// v1 licensing — Admin Panel modal.
//
// Opened by the OWNER via the global Ctrl+Shift+P shortcut. Lets the
// owner:
//   • see the current install ID + master code
//   • email the master code to themselves (one-shot helper)
//   • see all WAITING payments + confirm them with a single click
//   • see recent activations
//   • read the notification audit log so they can copy/paste any
//     pending email/WhatsApp messages while SMTP isn't configured
//
// We re-fetch /api/license/admin/list each time the panel opens, and
// every 5 s while it's open. Confirmation is a separate POST.

import { useCallback, useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useLicense } from './license-provider'
import { ShieldCheck, Copy, Mail, Phone, RefreshCw, KeyRound, AlertTriangle, CheckCircle2, Loader2, Settings as SettingsIcon, Save, Sparkles, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface AdminPayment {
  ref: string; planCode: string; amountGhs: number; email: string; whatsapp: string;
  status: 'WAITING_PAYMENT' | 'PAID' | 'EXPIRED' | 'CONSUMED'
  createdAt: string; expiresAt: string; paidAt?: string; activationCode?: string
}
interface AdminActivation {
  code: string; planCode: string; days: number; generatedAt: string; isUsed: boolean;
  usedAt?: string; subscriptionExpiresAt?: string; isMaster?: boolean
  generatedFor?: { email?: string; whatsapp?: string; paymentRef?: string; note?: string }
}
interface AdminNotification {
  id: string; ts: string; channel: 'email' | 'whatsapp'; to: string; subject: string;
  body: string; status: 'sent' | 'pending' | 'failed'; error?: string
}
interface AdminListResp {
  installId: string
  firstLaunchAt: string
  masterCode: string
  masterCodeEmailedAt?: string
  status: { state: string; daysLeft: number; isMaster: boolean }
  paymentCodes: AdminPayment[]
  activationCodes: AdminActivation[]
  notifications: AdminNotification[]
  // v0.5.50 — server-derived flags telling the panel whether SMTP /
  // SMS credentials are actually configured. Used to render a clear
  // banner above the notifications log so the operator knows
  // immediately why messages are queued in 'pending' rather than
  // delivered.
  notificationDelivery?: { smtpConfigured: boolean; smsConfigured: boolean }
}

// v0.5.48 — owner-tunable runtime config returned by
// GET /api/license/admin/config. `defaults` shows the compiled
// fallback so the form can render placeholders + "reset to default"
// affordances. `config` is the currently-saved override map (any
// field may be missing → use the default).
interface AdminConfigResp {
  config: {
    adminPassword?: string
    trialMinutes?: number
    momoName?: string
    momoNumber?: string
    whatsappNumber?: string
    notifyEmail?: string
    planPriceOverrides?: Record<string, number>
    updatedAt?: string
  }
  defaults: {
    trialMinutes: number
    momoName: string
    momoNumber: string
    notifyEmail: string
    whatsappNumber: string
    planPrices: Record<string, number>
  }
}

function copy(t: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(t).then(() => toast.success('Copied'), () => toast.error('Copy failed'))
  }
}

type AdminTab = 'overview' | 'settings'

export function AdminModal() {
  const { ui, refresh } = useLicense()
  const open = ui.adminOpen
  const setOpen = ui.setAdminOpen
  const [data, setData] = useState<AdminListResp | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirmRef, setConfirmRef] = useState('')
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [confirmResult, setConfirmResult] = useState<{ ok: boolean; msg: string; code?: string } | null>(null)
  // v0.5.48 — "Generate Activation Code" section state. Lets the
  // owner mint a code by hand for free trials, partnerships, or
  // out-of-band payments (cash, bank transfer).
  const [genPlan, setGenPlan] = useState<string>('1M')
  const [genDays, setGenDays] = useState<string>('') // empty ⇒ use plan default
  const [genNote, setGenNote] = useState<string>('') // username / church / label
  const [genEmail, setGenEmail] = useState<string>('')
  const [genWhatsapp, setGenWhatsapp] = useState<string>('')
  const [genBusy, setGenBusy] = useState(false)
  const [genResult, setGenResult] = useState<{ ok: boolean; msg: string; code?: string; days?: number } | null>(null)
  // v0.5.48 — Settings tab state. Loaded lazily the first time the
  // tab is shown so the Overview tab opens instantly.
  const [tab, setTab] = useState<AdminTab>('overview')
  const [cfg, setCfg] = useState<AdminConfigResp | null>(null)
  const [cfgLoading, setCfgLoading] = useState(false)
  const [cfgSaving, setCfgSaving] = useState(false)
  // Form fields — strings so empty input means "use default".
  const [fAdminPwd, setFAdminPwd] = useState('')
  const [fTrialMin, setFTrialMin] = useState('')
  const [fMomoName, setFMomoName] = useState('')
  const [fMomoNum, setFMomoNum] = useState('')
  const [fWhatsapp, setFWhatsapp] = useState('')
  const [fNotifyEmail, setFNotifyEmail] = useState('')
  const [fPrices, setFPrices] = useState<Record<string, string>>({})

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/license/admin/list', { cache: 'no-store' })
      const j = await r.json()
      if (r.ok) setData(j as AdminListResp)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (!open) return
    reload()
    const id = setInterval(reload, 5_000)
    return () => clearInterval(id)
  }, [open, reload])

  const confirm = async (ref: string) => {
    setConfirmBusy(true); setConfirmResult(null)
    try {
      const r = await fetch('/api/license/admin/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: ref.trim() }),
      })
      const j = await r.json()
      if (!r.ok) {
        setConfirmResult({ ok: false, msg: j.error || `HTTP ${r.status}` })
      } else {
        setConfirmResult({
          ok: true,
          msg: j.newlyGenerated
            ? `Confirmed payment ${j.payment.ref}. Activation code generated.`
            : `Already confirmed (${j.payment.ref}). Re-using existing activation code.`,
          code: j.activation.code,
        })
        setConfirmRef('')
        await reload(); await refresh()
      }
    } catch (e) {
      setConfirmResult({ ok: false, msg: e instanceof Error ? e.message : String(e) })
    } finally { setConfirmBusy(false) }
  }

  const generateCode = async () => {
    setGenResult(null)
    if (!genPlan) { setGenResult({ ok: false, msg: 'Pick a plan or CUSTOM.' }); return }
    const daysNum = genDays.trim() === '' ? undefined : Math.floor(Number(genDays))
    if (genDays.trim() !== '' && (!Number.isFinite(daysNum) || (daysNum as number) < 1 || (daysNum as number) > 36500)) {
      setGenResult({ ok: false, msg: 'Days must be a whole number between 1 and 36500.' })
      return
    }
    if (genPlan === 'CUSTOM' && daysNum == null) {
      setGenResult({ ok: false, msg: 'CUSTOM plan requires a days value.' })
      return
    }
    setGenBusy(true)
    try {
      const r = await fetch('/api/license/admin/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planCode: genPlan,
          days: daysNum,
          note: genNote.trim() || undefined,
          email: genEmail.trim() || undefined,
          whatsapp: genWhatsapp.trim() || undefined,
        }),
      })
      const j = await r.json()
      if (!r.ok) {
        setGenResult({ ok: false, msg: j.error || `HTTP ${r.status}` })
      } else {
        setGenResult({
          ok: true,
          msg: `Issued ${j.activation.days}-day code${genNote.trim() ? ` for ${genNote.trim()}` : ''}.`,
          code: j.activation.code,
          days: j.activation.days,
        })
        // Reset note + contact so the next code starts clean; keep
        // plan + days so issuing 5 in a row is one click each.
        setGenNote('')
        setGenEmail('')
        setGenWhatsapp('')
        await reload()
        await refresh()
      }
    } catch (e) {
      setGenResult({ ok: false, msg: e instanceof Error ? e.message : String(e) })
    } finally { setGenBusy(false) }
  }

  const emailMaster = async () => {
    const r = await fetch('/api/license/master', { method: 'POST' })
    if (r.ok) { toast.success('Master code queued for email + WhatsApp'); reload() }
    else toast.error('Failed to queue master code')
  }

  // ─── Settings tab ──────────────────────────────────────────────────
  // Load owner config the first time the Settings tab opens (and every
  // time it's re-opened — config changes are owner-driven so this is
  // cheap and gives us write-after-read consistency).
  const loadCfg = useCallback(async () => {
    setCfgLoading(true)
    try {
      const r = await fetch('/api/license/admin/config', { cache: 'no-store' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = (await r.json()) as AdminConfigResp
      setCfg(j)
      // Hydrate form fields from saved config (NOT defaults). Empty
      // string in a field means "fall back to default at save time".
      setFAdminPwd(j.config.adminPassword ?? '')
      setFTrialMin(j.config.trialMinutes != null ? String(j.config.trialMinutes) : '')
      setFMomoName(j.config.momoName ?? '')
      setFMomoNum(j.config.momoNumber ?? '')
      setFWhatsapp(j.config.whatsappNumber ?? '')
      setFNotifyEmail(j.config.notifyEmail ?? '')
      const next: Record<string, string> = {}
      for (const code of Object.keys(j.defaults.planPrices)) {
        const o = j.config.planPriceOverrides?.[code]
        next[code] = o != null ? String(o) : ''
      }
      setFPrices(next)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load settings')
    } finally { setCfgLoading(false) }
  }, [])

  useEffect(() => {
    if (open && tab === 'settings' && !cfg && !cfgLoading) loadCfg()
  }, [open, tab, cfg, cfgLoading, loadCfg])

  const saveCfg = async () => {
    if (!cfg) return
    setCfgSaving(true)
    try {
      // Build the patch — empty string ⇒ null (clear override).
      const trialMinNum = fTrialMin.trim() === '' ? null : Math.floor(Number(fTrialMin))
      const priceOverrides: Record<string, number | null> = {}
      for (const [code, val] of Object.entries(fPrices)) {
        if (val.trim() === '') priceOverrides[code] = null
        else {
          const n = Math.floor(Number(val))
          if (Number.isFinite(n) && n > 0) priceOverrides[code] = n
        }
      }
      const body = {
        adminPassword: fAdminPwd.trim() === '' ? null : fAdminPwd,
        trialMinutes: trialMinNum,
        momoName: fMomoName.trim() === '' ? null : fMomoName.trim(),
        momoNumber: fMomoNum.trim() === '' ? null : fMomoNum.trim(),
        whatsappNumber: fWhatsapp.trim() === '' ? null : fWhatsapp.trim(),
        notifyEmail: fNotifyEmail.trim() === '' ? null : fNotifyEmail.trim(),
        planPriceOverrides: priceOverrides,
      }
      const r = await fetch('/api/license/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.error || `HTTP ${r.status}`)
      }
      const j = (await r.json()) as { ok: boolean; config: AdminConfigResp['config']; defaults: AdminConfigResp['defaults'] }
      setCfg({ config: j.config, defaults: j.defaults })
      toast.success('Settings saved')
      // Re-poll license status so the overview tab + main UI pick up
      // any trial-length / price changes immediately.
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save settings')
    } finally { setCfgSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[820px] max-h-[90vh] overflow-y-auto bg-zinc-950 border-zinc-800 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            ScriptureLive AI — Admin Panel
            <Badge className="ml-2 bg-zinc-800 text-zinc-400 border-zinc-700 text-[9px]">Ctrl+Shift+P</Badge>
          </DialogTitle>
          <DialogDescription className="text-zinc-400 text-xs">
            Owner-only. Confirm MoMo payments, generate activation codes, monitor subscription state.
          </DialogDescription>
        </DialogHeader>

        {/* Tab bar (v0.5.48). Overview keeps the existing payment +
            activation + notifications view; Settings shows the
            owner-tunable runtime config. */}
        <div className="flex gap-1 border-b border-zinc-800 -mt-1 mb-1">
          <button
            type="button"
            onClick={() => setTab('overview')}
            className={cn(
              'px-3 py-1.5 text-[11px] uppercase tracking-wider border-b-2 -mb-px transition-colors',
              tab === 'overview'
                ? 'border-emerald-400 text-emerald-300'
                : 'border-transparent text-zinc-500 hover:text-zinc-300',
            )}
          >Overview</button>
          <button
            type="button"
            onClick={() => setTab('settings')}
            className={cn(
              'px-3 py-1.5 text-[11px] uppercase tracking-wider border-b-2 -mb-px transition-colors flex items-center gap-1.5',
              tab === 'settings'
                ? 'border-emerald-400 text-emerald-300'
                : 'border-transparent text-zinc-500 hover:text-zinc-300',
            )}
          ><SettingsIcon className="h-3 w-3" /> Settings</button>
        </div>

        {!data && tab === 'overview' && (
          <div className="py-12 text-center text-zinc-400 text-sm">
            <Loader2 className="h-6 w-6 mx-auto animate-spin mb-2" /> Loading…
          </div>
        )}

        {data && tab === 'overview' && (
          <div className="space-y-5">
            {/* ── Install + Master ──────────────────────────────────────── */}
            <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-wider text-zinc-400 flex items-center gap-1.5"><KeyRound className="h-3.5 w-3.5" /> Install + Master</div>
                <Badge className={cn('text-[9px]', data.status.state === 'active' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' : data.status.state === 'trial' ? 'bg-amber-500/15 text-amber-300 border-amber-500/40' : 'bg-rose-500/15 text-rose-300 border-rose-500/40')}>
                  {data.status.state.toUpperCase()} · {data.status.daysLeft}d
                </Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div>
                  <div className="text-zinc-500 uppercase tracking-wider text-[9px]">Install ID</div>
                  <div className="font-mono break-all">{data.installId}</div>
                </div>
                <div>
                  <div className="text-zinc-500 uppercase tracking-wider text-[9px]">First launch</div>
                  <div className="font-mono">{new Date(data.firstLaunchAt).toLocaleString()}</div>
                </div>
                <div className="sm:col-span-2">
                  <div className="text-zinc-500 uppercase tracking-wider text-[9px] flex items-center justify-between">
                    Master code (never expires)
                    {data.masterCodeEmailedAt && <span className="text-emerald-400">Emailed {new Date(data.masterCodeEmailedAt).toLocaleDateString()}</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="font-mono bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 flex-1 break-all">{data.masterCode}</code>
                    <Button size="sm" variant="ghost" onClick={() => copy(data.masterCode)}><Copy className="h-3 w-3" /></Button>
                    <Button size="sm" variant="outline" onClick={emailMaster} className="border-zinc-700 text-zinc-200"><Mail className="h-3 w-3 mr-1.5" /> Email</Button>
                  </div>
                </div>
              </div>
            </section>

            {/* ── Confirm payment ──────────────────────────────────────── */}
            <section className="rounded-lg border border-emerald-500/40 bg-emerald-950/10 p-3.5 space-y-2">
              <div className="text-[11px] uppercase tracking-wider text-emerald-300">Confirm a Payment (after MoMo received)</div>
              <div className="flex gap-2">
                <Input
                  placeholder="3-digit reference code (e.g. 472)"
                  value={confirmRef}
                  onChange={(e) => setConfirmRef(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="bg-zinc-950 border-zinc-800 text-zinc-100 font-mono"
                />
                <Button onClick={() => confirm(confirmRef)} disabled={confirmBusy || !confirmRef} className="bg-emerald-600 hover:bg-emerald-500">
                  {confirmBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Confirm Payment</>}
                </Button>
              </div>
              {confirmResult && (
                <div className={cn('text-[11px] flex items-start gap-1.5', confirmResult.ok ? 'text-emerald-300' : 'text-rose-300')}>
                  {confirmResult.ok ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
                  <div>
                    <div>{confirmResult.msg}</div>
                    {confirmResult.code && (
                      <div className="mt-1 flex items-center gap-2">
                        <code className="font-mono bg-zinc-950 border border-zinc-800 rounded px-2 py-1">{confirmResult.code}</code>
                        <Button size="sm" variant="ghost" onClick={() => copy(confirmResult.code!)}><Copy className="h-3 w-3" /></Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* ── Generate Activation Code (v0.5.48) ─────────────────────
                Mints a code by hand for free trials, partnerships,
                or out-of-band payments (cash, bank transfer). The
                recipient still types the code into the activation
                modal on their PC — that's what binds it to a
                specific install. */}
            <section className="rounded-lg border border-violet-500/40 bg-violet-950/10 p-3.5 space-y-3">
              <div className="text-[11px] uppercase tracking-wider text-violet-300 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> Generate Activation Code (no payment required)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <div className="sm:col-span-3 space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-zinc-500">Plan</label>
                  <select
                    value={genPlan}
                    onChange={(e) => {
                      setGenPlan(e.target.value)
                      // Switching to a fixed plan clears the days
                      // override so the canonical duration applies.
                      if (e.target.value !== 'CUSTOM') setGenDays('')
                    }}
                    className="w-full bg-zinc-950 border border-zinc-800 text-zinc-100 rounded-md px-2 py-1.5 text-xs h-9"
                  >
                    <option value="1M">1 Month (31 d)</option>
                    <option value="2M">2 Months (62 d)</option>
                    <option value="3M">3 Months (93 d)</option>
                    <option value="4M">4 Months (124 d)</option>
                    <option value="5M">5 Months (155 d)</option>
                    <option value="6M">6 Months (186 d)</option>
                    <option value="1Y">1 Year (365 d)</option>
                    <option value="CUSTOM">Custom (any days)</option>
                  </select>
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-zinc-500">
                    Days {genPlan !== 'CUSTOM' && <span className="text-zinc-600">(opt)</span>}
                  </label>
                  <Input
                    type="number"
                    min={1}
                    max={36500}
                    placeholder={genPlan === 'CUSTOM' ? 'e.g. 30' : 'default'}
                    value={genDays}
                    onChange={(e) => setGenDays(e.target.value)}
                    className="bg-zinc-950 border-zinc-800 text-zinc-100 font-mono"
                  />
                </div>
                <div className="sm:col-span-7 space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-zinc-500">Username / label</label>
                  <Input
                    placeholder="e.g. Pastor John — Cathedral Lagos"
                    value={genNote}
                    onChange={(e) => setGenNote(e.target.value)}
                    className="bg-zinc-950 border-zinc-800 text-zinc-100"
                  />
                </div>
                <div className="sm:col-span-6 space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-zinc-500">Email (optional)</label>
                  <Input
                    type="email"
                    placeholder="customer@example.com"
                    value={genEmail}
                    onChange={(e) => setGenEmail(e.target.value)}
                    className="bg-zinc-950 border-zinc-800 text-zinc-100"
                  />
                </div>
                <div className="sm:col-span-6 space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-zinc-500">WhatsApp (optional)</label>
                  <Input
                    placeholder="0246798526"
                    value={genWhatsapp}
                    onChange={(e) => setGenWhatsapp(e.target.value)}
                    className="bg-zinc-950 border-zinc-800 text-zinc-100 font-mono"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] text-zinc-500">
                  Pick a plan (or CUSTOM with explicit days), add the customer's name in the label field, then click Generate. The code appears below — copy it and send it to the customer on WhatsApp / email.
                </p>
                <Button
                  onClick={generateCode}
                  disabled={genBusy}
                  className="bg-violet-600 hover:bg-violet-500 shrink-0"
                >
                  {genBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><UserPlus className="h-3.5 w-3.5 mr-1.5" /> Generate Code</>}
                </Button>
              </div>
              {genResult && (
                <div className={cn('text-[11px] flex items-start gap-1.5', genResult.ok ? 'text-violet-200' : 'text-rose-300')}>
                  {genResult.ok ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
                  <div className="flex-1">
                    <div>{genResult.msg}</div>
                    {genResult.code && (
                      <div className="mt-1 flex items-center gap-2">
                        <code className="font-mono bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-emerald-300 font-bold flex-1 break-all">{genResult.code}</code>
                        <Button size="sm" variant="ghost" onClick={() => copy(genResult.code!)}><Copy className="h-3 w-3" /></Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* ── Pending + recent payments ────────────────────────────── */}
            <section>
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[11px] uppercase tracking-wider text-zinc-400">Recent Payments ({data.paymentCodes.length})</div>
                <Button size="sm" variant="ghost" onClick={reload} disabled={loading}><RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} /></Button>
              </div>
              <div className="rounded-lg border border-zinc-800 overflow-hidden">
                {data.paymentCodes.length === 0 ? (
                  <div className="p-4 text-center text-[11px] text-zinc-500">No payments yet.</div>
                ) : (
                  <table className="w-full text-[11px]">
                    <thead className="bg-zinc-900/60 text-zinc-400 uppercase tracking-wider text-[9px]">
                      <tr><th className="text-left px-2 py-1.5">Ref</th><th className="text-left px-2 py-1.5">Plan</th><th className="text-left px-2 py-1.5">Amount</th><th className="text-left px-2 py-1.5">Customer</th><th className="text-left px-2 py-1.5">Status</th><th className="text-right px-2 py-1.5">Action</th></tr>
                    </thead>
                    <tbody>
                      {data.paymentCodes.map((p) => (
                        <tr key={p.ref + p.createdAt} className="border-t border-zinc-800 hover:bg-zinc-900/40">
                          <td className="px-2 py-1.5 font-mono font-bold text-emerald-300">{p.ref}</td>
                          <td className="px-2 py-1.5">{p.planCode}</td>
                          <td className="px-2 py-1.5 font-mono">GHS {p.amountGhs}</td>
                          <td className="px-2 py-1.5"><div className="truncate max-w-[160px]">{p.email}</div><div className="text-zinc-500 font-mono text-[10px]">{p.whatsapp}</div></td>
                          <td className="px-2 py-1.5"><Badge className={cn('text-[9px]', p.status === 'WAITING_PAYMENT' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : p.status === 'PAID' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : p.status === 'CONSUMED' ? 'bg-sky-500/20 text-sky-300 border-sky-500/40' : 'bg-zinc-700 text-zinc-300 border-zinc-600')}>{p.status}</Badge></td>
                          <td className="px-2 py-1.5 text-right">
                            {p.status === 'WAITING_PAYMENT' && (
                              <Button size="sm" className="h-6 text-[10px] bg-emerald-600 hover:bg-emerald-500" onClick={() => confirm(p.ref)} disabled={confirmBusy}>Confirm</Button>
                            )}
                            {p.activationCode && (
                              <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => copy(p.activationCode!)}>Copy code</Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            {/* ── Recent activations ────────────────────────────────────── */}
            <section>
              <div className="text-[11px] uppercase tracking-wider text-zinc-400 mb-1.5">Recent Activations ({data.activationCodes.length})</div>
              <div className="rounded-lg border border-zinc-800 overflow-hidden">
                {data.activationCodes.length === 0 ? (
                  <div className="p-4 text-center text-[11px] text-zinc-500">No activations yet.</div>
                ) : (
                  <table className="w-full text-[11px]">
                    <thead className="bg-zinc-900/60 text-zinc-400 uppercase tracking-wider text-[9px]">
                      <tr>
                        <th className="text-left px-2 py-1.5">Code</th>
                        <th className="text-left px-2 py-1.5">Plan</th>
                        <th className="text-left px-2 py-1.5">Days</th>
                        <th className="text-left px-2 py-1.5">For</th>
                        <th className="text-left px-2 py-1.5">Used?</th>
                        <th className="text-left px-2 py-1.5">Expires</th>
                        <th className="text-right px-2 py-1.5">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.activationCodes.map((a) => {
                        // v0.5.48 — surface the owner-supplied label
                        // first (most useful), then fall back to the
                        // captured payment email / WhatsApp / ref.
                        const forLabel =
                          a.generatedFor?.note
                            ?? a.generatedFor?.email
                            ?? a.generatedFor?.whatsapp
                            ?? (a.generatedFor?.paymentRef ? `ref ${a.generatedFor.paymentRef}` : '—')
                        return (
                          <tr key={a.code} className="border-t border-zinc-800 hover:bg-zinc-900/40">
                            <td className="px-2 py-1.5 font-mono">{a.code}</td>
                            <td className="px-2 py-1.5">{a.planCode}</td>
                            <td className="px-2 py-1.5">{a.days}</td>
                            <td className="px-2 py-1.5 max-w-[200px]"><div className="truncate" title={forLabel}>{forLabel}</div></td>
                            <td className="px-2 py-1.5">{a.isUsed ? <span className="text-emerald-400">Yes</span> : <span className="text-amber-400">No</span>}</td>
                            <td className="px-2 py-1.5 font-mono text-[10px] text-zinc-400">{a.subscriptionExpiresAt ? new Date(a.subscriptionExpiresAt).toLocaleDateString() : '—'}</td>
                            <td className="px-2 py-1.5 text-right">
                              <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => copy(a.code)}>
                                <Copy className="h-3 w-3 mr-1" /> Copy
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            {/* ── Notification audit log ───────────────────────────────── */}
            <section>
              <div className="text-[11px] uppercase tracking-wider text-zinc-400 mb-1.5">Notifications ({data.notifications.length})</div>
              <div className="rounded-lg border border-zinc-800 max-h-[200px] overflow-y-auto">
                {data.notifications.length === 0 ? (
                  <div className="p-4 text-center text-[11px] text-zinc-500">No notifications yet.</div>
                ) : (
                  <ul className="divide-y divide-zinc-800">
                    {data.notifications.map((n) => (
                      <li key={n.id} className="p-2.5 text-[11px]">
                        <div className="flex items-center gap-2 mb-1">
                          {n.channel === 'email' ? <Mail className="h-3 w-3 text-sky-400" /> : <Phone className="h-3 w-3 text-emerald-400" />}
                          <span className="font-semibold">{n.subject}</span>
                          <Badge className={cn('text-[9px] ml-auto', n.status === 'sent' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : n.status === 'pending' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-rose-500/20 text-rose-300 border-rose-500/40')}>{n.status}</Badge>
                        </div>
                        <div className="text-zinc-500 text-[10px]">to {n.to} · {new Date(n.ts).toLocaleString()}</div>
                        {n.status !== 'sent' && (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-zinc-400 text-[10px] hover:text-zinc-200">Show body & copy</summary>
                            <pre className="mt-1 whitespace-pre-wrap break-all bg-zinc-950 border border-zinc-800 rounded p-2 text-[10px] text-zinc-300">{n.body}</pre>
                            <Button size="sm" variant="ghost" className="mt-1 h-6 text-[10px]" onClick={() => copy(n.body)}><Copy className="h-3 w-3 mr-1" /> Copy</Button>
                          </details>
                        )}
                        {n.error && <div className="text-[10px] text-rose-400 mt-0.5">Error: {n.error}</div>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {/* v0.5.50 — replaced the static SMTP tip with a
                  dynamic banner that explicitly tells the operator
                  which delivery channels (email + SMS) actually have
                  credentials configured on the running install. The
                  notification log already records pending/error per
                  row; this banner explains the WHY at the top of the
                  section so it doesn't take a click to figure out
                  that the messages are stuck because env-vars are
                  missing. */}
              {data.notificationDelivery && (() => {
                const { smtpConfigured, smsConfigured } = data.notificationDelivery
                if (smtpConfigured && smsConfigured) {
                  return (
                    <div className="text-[10px] mt-1.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 px-2 py-1.5">
                      <span className="font-semibold">Delivery: live.</span> SMTP + SMS credentials are configured. Activation messages are sent automatically when you confirm a payment.
                    </div>
                  )
                }
                return (
                  <div className="text-[10px] mt-1.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-200 px-2 py-1.5 space-y-1">
                    <div className="font-semibold uppercase tracking-wider text-[9px] text-amber-300">
                      Notifications queued — credentials missing
                    </div>
                    {!smtpConfigured && (
                      <div>
                        <span className="font-mono text-amber-100">SMTP not configured.</span>{' '}
                        Set <span className="font-mono">MAIL_HOST</span> / <span className="font-mono">MAIL_USER</span> /{' '}
                        <span className="font-mono">MAIL_PASS</span> / <span className="font-mono">MAIL_FROM</span> in the deployment secrets to deliver activation emails automatically.
                      </div>
                    )}
                    {!smsConfigured && (
                      <div>
                        <span className="font-mono text-amber-100">SMS not configured.</span>{' '}
                        Set <span className="font-mono">SMS_API_KEY</span> (Arkesel) in the deployment secrets to deliver activation SMS automatically.
                      </div>
                    )}
                    <div className="text-amber-300/80">
                      Until then, every queued row above shows a Copy button — paste the body into your own email / WhatsApp client to deliver it manually.
                    </div>
                  </div>
                )
              })()}
            </section>
          </div>
        )}

        {/* ── SETTINGS TAB (v0.5.48) ─────────────────────────────────── */}
        {tab === 'settings' && (
          <div className="space-y-5">
            {cfgLoading && !cfg && (
              <div className="py-12 text-center text-zinc-400 text-sm">
                <Loader2 className="h-6 w-6 mx-auto animate-spin mb-2" /> Loading settings…
              </div>
            )}
            {cfg && (
              <>
                <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3.5 space-y-3">
                  <div className="text-[11px] uppercase tracking-wider text-zinc-400">Access &amp; Trial</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wider text-zinc-500">Admin password</label>
                      <Input
                        type="password"
                        placeholder="(leave blank for default)"
                        value={fAdminPwd}
                        onChange={(e) => setFAdminPwd(e.target.value)}
                        className="bg-zinc-950 border-zinc-800 text-zinc-100 font-mono"
                        autoComplete="new-password"
                      />
                      <p className="text-[10px] text-zinc-500">Stored locally. Leave blank to disable owner gate. (Currently the modal opens via Ctrl+Shift+P only.)</p>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wider text-zinc-500">Trial length (minutes)</label>
                      <Input
                        type="number"
                        min={1}
                        max={1440}
                        placeholder={String(cfg.defaults.trialMinutes)}
                        value={fTrialMin}
                        onChange={(e) => setFTrialMin(e.target.value)}
                        className="bg-zinc-950 border-zinc-800 text-zinc-100 font-mono"
                      />
                      <p className="text-[10px] text-zinc-500">Default {cfg.defaults.trialMinutes} min. Range 1–1440. Applies to new installs; existing trial windows keep their original end-time.</p>
                    </div>
                  </div>
                </section>

                <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3.5 space-y-3">
                  <div className="text-[11px] uppercase tracking-wider text-zinc-400">MoMo Recipient (paid into)</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wider text-zinc-500">Recipient name</label>
                      <Input
                        placeholder={cfg.defaults.momoName}
                        value={fMomoName}
                        onChange={(e) => setFMomoName(e.target.value)}
                        className="bg-zinc-950 border-zinc-800 text-zinc-100"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wider text-zinc-500">MoMo phone number</label>
                      <Input
                        placeholder={cfg.defaults.momoNumber}
                        value={fMomoNum}
                        onChange={(e) => setFMomoNum(e.target.value)}
                        className="bg-zinc-950 border-zinc-800 text-zinc-100 font-mono"
                      />
                    </div>
                  </div>
                </section>

                <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3.5 space-y-3">
                  <div className="text-[11px] uppercase tracking-wider text-zinc-400">Notification Targets</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wider text-zinc-500">Notify email</label>
                      <Input
                        type="email"
                        placeholder={cfg.defaults.notifyEmail}
                        value={fNotifyEmail}
                        onChange={(e) => setFNotifyEmail(e.target.value)}
                        className="bg-zinc-950 border-zinc-800 text-zinc-100"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wider text-zinc-500">Notify WhatsApp</label>
                      <Input
                        placeholder={cfg.defaults.whatsappNumber}
                        value={fWhatsapp}
                        onChange={(e) => setFWhatsapp(e.target.value)}
                        className="bg-zinc-950 border-zinc-800 text-zinc-100 font-mono"
                      />
                    </div>
                  </div>
                </section>

                <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3.5 space-y-3">
                  <div className="text-[11px] uppercase tracking-wider text-zinc-400">Plan Prices (GHS)</div>
                  <p className="text-[10px] text-zinc-500 -mt-1">Leave a field blank to use the default. New prices apply immediately to all customers without a redeploy.</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {Object.entries(cfg.defaults.planPrices).map(([code, def]) => (
                      <div key={code} className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wider text-zinc-500 flex items-center justify-between">
                          <span>{code}</span>
                          <span className="text-zinc-600">def {def}</span>
                        </label>
                        <Input
                          type="number"
                          min={1}
                          placeholder={String(def)}
                          value={fPrices[code] ?? ''}
                          onChange={(e) => setFPrices((p) => ({ ...p, [code]: e.target.value }))}
                          className="bg-zinc-950 border-zinc-800 text-zinc-100 font-mono"
                        />
                      </div>
                    ))}
                  </div>
                </section>

                <div className="flex items-center justify-between">
                  <div className="text-[10px] text-zinc-500">
                    {cfg.config.updatedAt
                      ? <>Last saved {new Date(cfg.config.updatedAt).toLocaleString()}</>
                      : <>No owner overrides saved yet.</>}
                  </div>
                  <Button
                    onClick={saveCfg}
                    disabled={cfgSaving}
                    className="bg-emerald-600 hover:bg-emerald-500"
                  >
                    {cfgSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Save className="h-3.5 w-3.5 mr-1.5" /> Save Settings</>}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
