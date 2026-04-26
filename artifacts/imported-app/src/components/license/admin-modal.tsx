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
import { ShieldCheck, Copy, Mail, Phone, RefreshCw, KeyRound, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
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
  generatedFor?: { email?: string; whatsapp?: string; paymentRef?: string }
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
}

function copy(t: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(t).then(() => toast.success('Copied'), () => toast.error('Copy failed'))
  }
}

export function AdminModal() {
  const { ui, refresh } = useLicense()
  const open = ui.adminOpen
  const setOpen = ui.setAdminOpen
  const [data, setData] = useState<AdminListResp | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirmRef, setConfirmRef] = useState('')
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [confirmResult, setConfirmResult] = useState<{ ok: boolean; msg: string; code?: string } | null>(null)

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

  const emailMaster = async () => {
    const r = await fetch('/api/license/master', { method: 'POST' })
    if (r.ok) { toast.success('Master code queued for email + WhatsApp'); reload() }
    else toast.error('Failed to queue master code')
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

        {!data && (
          <div className="py-12 text-center text-zinc-400 text-sm">
            <Loader2 className="h-6 w-6 mx-auto animate-spin mb-2" /> Loading…
          </div>
        )}

        {data && (
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
                      <tr><th className="text-left px-2 py-1.5">Code</th><th className="text-left px-2 py-1.5">Plan</th><th className="text-left px-2 py-1.5">Days</th><th className="text-left px-2 py-1.5">Used?</th><th className="text-left px-2 py-1.5">Expires</th></tr>
                    </thead>
                    <tbody>
                      {data.activationCodes.map((a) => (
                        <tr key={a.code} className="border-t border-zinc-800 hover:bg-zinc-900/40">
                          <td className="px-2 py-1.5 font-mono">{a.code}</td>
                          <td className="px-2 py-1.5">{a.planCode}</td>
                          <td className="px-2 py-1.5">{a.days}</td>
                          <td className="px-2 py-1.5">{a.isUsed ? <span className="text-emerald-400">Yes</span> : <span className="text-amber-400">No</span>}</td>
                          <td className="px-2 py-1.5 font-mono text-[10px] text-zinc-400">{a.subscriptionExpiresAt ? new Date(a.subscriptionExpiresAt).toLocaleDateString() : '—'}</td>
                        </tr>
                      ))}
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
              <div className="text-[10px] text-zinc-500 mt-1.5 italic">
                Tip: SMTP is unconfigured by default. Set MAIL_HOST / MAIL_USER / MAIL_PASS / MAIL_FROM in the deployment secrets to send emails automatically. Until then, copy any pending message above into your own email or WhatsApp client.
              </div>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
