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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { useLicense } from './license-provider'
import { ShieldCheck, Copy, Mail, Phone, RefreshCw, KeyRound, AlertTriangle, CheckCircle2, Loader2, Settings as SettingsIcon, Save, Sparkles, UserPlus, Trash2, ListChecks, MapPin, Clock, Ban, CalendarPlus, Undo2, Trash, CheckSquare, X } from 'lucide-react'
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
    /** v0.5.52 — admin override for the BAKED OpenAI key. */
    adminOpenAIKey?: string
    /** v0.5.52 — admin override for the BAKED Deepgram key. */
    adminDeepgramKey?: string
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

type AdminTab = 'overview' | 'codes' | 'settings'

// v0.7.0 — Admin activation-code dashboard. Mirrors the AdminCodeRow
// shape returned by GET /api/license/admin/codes. We keep the union
// here so the type lives next to the consumer; storage.ts is the
// source of truth.
type AdminCodeStatus = 'never-used' | 'active' | 'expired' | 'used' | 'cancelled' | 'deleted' | 'master'
interface AdminCodeRow {
  code: string
  planCode: string
  days: number
  durationMs?: number
  generatedAt: string
  generatedFor?: { email?: string; whatsapp?: string; paymentRef?: string; note?: string }
  buyerPhone?: string
  isMaster: boolean
  isUsed: boolean
  usedAt?: string
  subscriptionExpiresAt?: string
  cancelledAt?: string
  cancelReason?: string
  lastSeenAt?: string
  lastSeenIp?: string
  lastSeenLocation?: string
  softDeletedAt?: string
  status: AdminCodeStatus
  daysRemaining: number | null
  binMsRemaining: number | null
}
interface AdminCodesResp {
  codes: AdminCodeRow[]
  bin: AdminCodeRow[]
  stats: {
    total: number; active: number; neverUsed: number; expired: number;
    cancelled: number; used: number; master: number; inBin: number
  }
}

const STATUS_PILL: Record<AdminCodeStatus, string> = {
  active:       'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  'never-used': 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  expired:      'bg-rose-500/15 text-rose-300 border-rose-500/40',
  used:         'bg-zinc-500/15 text-zinc-300 border-zinc-500/40',
  cancelled:    'bg-orange-500/15 text-orange-300 border-orange-500/40',
  deleted:      'bg-rose-500/15 text-rose-300 border-rose-500/40',
  master:       'bg-violet-500/15 text-violet-300 border-violet-500/40',
}

function fmtRel(iso?: string): string {
  if (!iso) return '—'
  const t = Date.parse(iso); if (!Number.isFinite(t)) return iso
  const diff = Date.now() - t
  const abs = Math.abs(diff)
  const past = diff >= 0
  const sec = Math.floor(abs / 1000)
  if (sec < 60) return past ? `${sec}s ago` : `in ${sec}s`
  const min = Math.floor(sec / 60)
  if (min < 60) return past ? `${min}m ago` : `in ${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 48) return past ? `${hr}h ago` : `in ${hr}h`
  const d = Math.floor(hr / 24)
  return past ? `${d}d ago` : `in ${d}d`
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
  // v0.5.48 — "Generate Activation Code" section state. Lets the
  // owner mint a code by hand for free trials, partnerships, or
  // out-of-band payments (cash, bank transfer).
  const [genPlan, setGenPlan] = useState<string>('1M')
  const [genDays, setGenDays] = useState<string>('') // empty ⇒ use plan default
  // v0.6.0 — sub-day granularity. Operators asked for hour + minute
  // precision so they can mint short-lived demo / training codes
  // ("Pastor John, here's a 4-hour code for tonight's rehearsal").
  // The server adds (days + hours + minutes) into a total before
  // computing expiresAt, so any combination works.
  const [genHours, setGenHours] = useState<string>('')
  const [genMinutes, setGenMinutes] = useState<string>('')
  // v0.6.2 — Months input. Operator complaint: "I want to be able to
  // mint anything from a 1-minute test code up to N months without
  // multiplying by 30 in my head." We expose Months as a first-class
  // field that the client converts to days (×30) and folds into the
  // existing days payload — no backend change needed.
  const [genMonths, setGenMonths] = useState<string>('')
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
  // v0.5.52 — Cloud key overrides (paste-only; never round-tripped
  // back into the form on reload — they're treated as write-once
  // secrets so an over-the-shoulder glance can't read them).
  const [fOpenAIKey, setFOpenAIKey] = useState('')
  const [fDeepgramKey, setFDeepgramKey] = useState('')
  const [keyStatus, setKeyStatus] = useState<{ openai: boolean; deepgram: boolean }>({
    openai: false,
    deepgram: false,
  })

  // v0.7.0 — Codes tab. Operator dashboard listing every activation
  // code with status, days remaining, geo location, buyer phone, and
  // cancel/renew/restore actions. Soft-deleted codes live in the bin
  // for 90 days before automatic purge (v0.7.3 — was 7).
  const [codesData, setCodesData] = useState<AdminCodesResp | null>(null)
  const [codesLoading, setCodesLoading] = useState(false)
  const [codesShowBin, setCodesShowBin] = useState(false)
  const [codesQuery, setCodesQuery] = useState('')
  const [codesFilter, setCodesFilter] = useState<'all' | AdminCodeStatus>('all')
  const [codeBusy, setCodeBusy] = useState<string | null>(null) // code currently mutating

  // v0.7.1 — Server-side auth gate. The Ctrl+Shift+P shortcut now
  // OPENS this modal but does NOT grant access — every admin API
  // route requires a valid session cookie obtained by POSTing the
  // operator password to /api/license/admin/login. We probe
  // /whoami on every open so a returning operator with a still-
  // valid cookie skips the password screen entirely.
  type AuthState = 'checking' | 'needs-password' | 'authed'
  const [authState, setAuthState] = useState<AuthState>('checking')
  const [pwdInput, setPwdInput] = useState('')
  const [pwdError, setPwdError] = useState<string | null>(null)
  const [pwdBusy, setPwdBusy] = useState(false)
  const authed = authState === 'authed'

  // ─── v0.7.5 — In-modal confirmation dialog (T501) ────────────────
  //
  // ROOT CAUSE for "buttons in CODES / Recent Payments / Recent
  // Activations don't fire": every action handler used native
  // window.confirm() / window.prompt(). Inside the packaged Electron
  // build (and inside the embedded preview iframe used during dev)
  // those native dialogs are blocked by the host shell — the call
  // returns `false` immediately and the action silently no-ops, so
  // the operator sees nothing happen and assumes the button is dead.
  //
  // Replacement: a single in-modal AlertDialog driven by `pending`
  // state. Each action that previously called window.confirm/prompt
  // now calls askConfirm({...}) which opens the dialog; the user
  // hits "Confirm" and we invoke the supplied callback. Because the
  // dialog renders inside the same React tree as the rest of the
  // panel it can never be blocked by the host shell.
  interface PendingAction {
    title: string
    description: string
    confirmLabel: string
    destructive?: boolean
    /** Optional free-text input collected before confirming. */
    input?: { label: string; placeholder?: string; defaultValue?: string }
    onConfirm: (value: string | null) => void | Promise<void>
  }
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [pendingValue, setPendingValue] = useState('')
  const [pendingBusy, setPendingBusy] = useState(false)
  const askConfirm = useCallback((action: PendingAction) => {
    setPending(action)
    setPendingValue(action.input?.defaultValue ?? '')
  }, [])
  const closePending = useCallback(() => {
    setPending(null)
    setPendingValue('')
    setPendingBusy(false)
  }, [])
  const runPending = useCallback(async () => {
    if (!pending) return
    setPendingBusy(true)
    try {
      await pending.onConfirm(pending.input ? pendingValue : null)
      closePending()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
      setPendingBusy(false)
    }
  }, [pending, pendingValue, closePending])

  // ─── v0.7.5 — Multi-select state per section (T501) ──────────────
  //
  // Each of the three sections (Recent Payments, Recent Activations,
  // CODES) gets its own selection mode toggle + Set<string> of ids
  // currently checked. Toggling the mode off clears the selection.
  // The bulk-delete action bar appears whenever the corresponding
  // selection set is non-empty.
  const [paySelectMode, setPaySelectMode] = useState(false)
  const [paySelected, setPaySelected] = useState<Set<string>>(new Set())
  const [actSelectMode, setActSelectMode] = useState(false)
  const [actSelected, setActSelected] = useState<Set<string>>(new Set())
  const [codesSelectMode, setCodesSelectMode] = useState(false)
  const [codesSelected, setCodesSelected] = useState<Set<string>>(new Set())
  // Helper: toggle a single id in/out of a Set without mutating it.
  const toggleSet = (set: Set<string>, id: string): Set<string> => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  }
  // Whenever the operator leaves a tab or closes the modal, clear
  // selection state so reopening doesn't surprise them with stale
  // checkboxes still ticked.
  useEffect(() => {
    if (!open) {
      setPaySelectMode(false); setPaySelected(new Set())
      setActSelectMode(false); setActSelected(new Set())
      setCodesSelectMode(false); setCodesSelected(new Set())
      setPending(null); setPendingValue(''); setPendingBusy(false)
    }
  }, [open])

  // Probe the session whenever the modal opens. We deliberately
  // re-probe on every open (not once on mount) so a logout in
  // another tab / cookie expiry between opens is caught.
  useEffect(() => {
    if (!open) {
      // Reset gate state when the modal closes so the next open
      // shows the spinner briefly, not the wrong content.
      setAuthState('checking')
      setPwdInput('')
      setPwdError(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const r = await fetch('/api/license/admin/whoami', {
          cache: 'no-store',
          credentials: 'same-origin',
        })
        if (cancelled) return
        setAuthState(r.ok ? 'authed' : 'needs-password')
      } catch {
        if (cancelled) return
        setAuthState('needs-password')
      }
    })()
    return () => { cancelled = true }
  }, [open])

  const submitPassword = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!pwdInput) { setPwdError('Enter the admin password'); return }
    setPwdBusy(true)
    setPwdError(null)
    try {
      const r = await fetch('/api/license/admin/login', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwdInput }),
      })
      if (r.ok) {
        setAuthState('authed')
        setPwdInput('')
      } else {
        const j = await r.json().catch(() => ({}))
        setPwdError((j as { error?: string })?.error ?? 'Invalid password')
      }
    } catch {
      setPwdError('Network error — is the app reachable?')
    } finally {
      setPwdBusy(false)
    }
  }, [pwdInput])

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/license/admin/list', { cache: 'no-store' })
      const j = await r.json()
      if (r.ok) setData(j as AdminListResp)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    // v0.7.1 — also gate on `authed` so we don't 401-spam the
    // server (and pollute the audit log) before the operator
    // submits the password.
    if (!open || !authed) return
    reload()
    const id = setInterval(reload, 5_000)
    return () => clearInterval(id)
  }, [open, authed, reload])

  // v0.7.0 — Codes tab loader. Polls every 5 s while the tab is open
  // so heartbeat-driven location/lastSeen updates appear in real time.
  const reloadCodes = useCallback(async () => {
    setCodesLoading(true)
    try {
      const r = await fetch(`/api/license/admin/codes?includeDeleted=1`, { cache: 'no-store' })
      const j = await r.json()
      if (r.ok) setCodesData(j as AdminCodesResp)
    } catch { /* ignore — toast on user action only */ }
    finally { setCodesLoading(false) }
  }, [])

  useEffect(() => {
    if (!open || !authed || tab !== 'codes') return
    reloadCodes()
    const id = setInterval(reloadCodes, 5_000)
    return () => clearInterval(id)
  }, [open, authed, tab, reloadCodes])

  // Action helpers for the Codes tab. Each toasts on success/failure
  // and re-loads the dashboard so the new status / row position
  // appears without a manual refresh.
  const codeAction = useCallback(async (
    code: string,
    endpoint: 'cancel' | 'renew' | 'restore' | 'delete-activation',
    body: Record<string, unknown>,
    successMsg: string,
  ) => {
    setCodeBusy(code)
    try {
      const r = await fetch(`/api/license/admin/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, ...body }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({} as Record<string, unknown>))
        throw new Error((j as { error?: string }).error || `HTTP ${r.status}`)
      }
      toast.success(successMsg)
      await reloadCodes()
      await reload()
      await refresh()
    } catch (e) {
      toast.error(`${successMsg.split(' ')[0]} failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally { setCodeBusy(null) }
  }, [reloadCodes, reload, refresh])

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

  // v0.5.53 — Generic delete helper used by the trash-icon buttons on
  // the Recent Payments / Activations / Notifications tables. Each of
  // the three POST endpoints accepts a small body identifying the row;
  // the helper just centralises the error toast + reload.
  const delRow = async (
    endpoint: 'delete-payment' | 'delete-activation' | 'delete-notification',
    body: Record<string, string>,
    label: string,
  ) => {
    try {
      const r = await fetch(`/api/license/admin/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({} as Record<string, unknown>))
        throw new Error((j as { error?: string }).error || `HTTP ${r.status}`)
      }
      toast.success(`${label} deleted`)
      await reload()
    } catch (e) {
      toast.error(`Delete failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // v0.7.5 — Bulk-delete helper (T501). Hits the new
  // /api/license/admin/bulk-delete endpoint with the kind discriminator
  // + the appropriate id list, then reloads the corresponding panel
  // section + the codes dashboard so the operator sees the rows
  // disappear immediately. `permanent` only matters for activations
  // (payments + notifications are always hard-deleted because they're
  // audit log rows, not subscription state).
  const bulkDelete = useCallback(async (
    kind: 'payment' | 'activation' | 'notification',
    ids: string[],
    opts: { permanent?: boolean } = {},
  ) => {
    if (ids.length === 0) return
    try {
      const body: Record<string, unknown> = { kind }
      if (kind === 'payment') body.refs = ids
      else if (kind === 'activation') { body.codes = ids; body.permanent = !!opts.permanent }
      else body.ids = ids
      const r = await fetch('/api/license/admin/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({} as Record<string, unknown>))
        throw new Error((j as { error?: string }).error || `HTTP ${r.status}`)
      }
      const j = await r.json().catch(() => ({ deleted: ids.length }))
      const n = (j as { deleted?: number }).deleted ?? ids.length
      toast.success(`Deleted ${n} ${kind}${n === 1 ? '' : 's'}`)
      // Clear the corresponding selection set + reload data.
      if (kind === 'payment') { setPaySelected(new Set()); setPaySelectMode(false) }
      if (kind === 'activation') { setActSelected(new Set()); setActSelectMode(false); setCodesSelected(new Set()); setCodesSelectMode(false) }
      await reload()
      await reloadCodes()
      await refresh()
    } catch (e) {
      toast.error(`Bulk delete failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }, [reload, reloadCodes, refresh])

  const generateCode = async () => {
    setGenResult(null)
    if (!genPlan) { setGenResult({ ok: false, msg: 'Pick a plan or CUSTOM.' }); return }
    const daysNum = genDays.trim() === '' ? undefined : Math.floor(Number(genDays))
    if (genDays.trim() !== '' && (!Number.isFinite(daysNum) || (daysNum as number) < 1 || (daysNum as number) > 36500)) {
      setGenResult({ ok: false, msg: 'Days must be a whole number between 1 and 36500.' })
      return
    }
    // v0.6.0 — validate hours / minutes ranges. Empty = 0.
    const hoursNum = genHours.trim() === '' ? 0 : Math.floor(Number(genHours))
    const minutesNum = genMinutes.trim() === '' ? 0 : Math.floor(Number(genMinutes))
    if (!Number.isFinite(hoursNum) || hoursNum < 0 || hoursNum > 23) {
      setGenResult({ ok: false, msg: 'Hours must be a whole number between 0 and 23.' })
      return
    }
    if (!Number.isFinite(minutesNum) || minutesNum < 0 || minutesNum > 59) {
      setGenResult({ ok: false, msg: 'Minutes must be a whole number between 0 and 59.' })
      return
    }
    // v0.6.2 — Months is converted to days client-side at 30 d/mo.
    // Empty = 0. Combined with explicit days / hours / minutes the
    // server still computes one final integer day count, so e.g.
    // "Months 6, Days 5" = 185 days, "Months 0, Hours 4" = 1 day.
    const monthsNum = genMonths.trim() === '' ? 0 : Math.floor(Number(genMonths))
    if (!Number.isFinite(monthsNum) || monthsNum < 0 || monthsNum > 1200) {
      setGenResult({ ok: false, msg: 'Months must be a whole number between 0 and 1200.' })
      return
    }
    const combinedDays = (daysNum ?? 0) + monthsNum * 30
    const finalDays = combinedDays > 0 ? combinedDays : undefined
    if (genPlan === 'CUSTOM' && finalDays == null && hoursNum === 0 && minutesNum === 0) {
      setGenResult({ ok: false, msg: 'CUSTOM plan requires a duration (Minutes, Hours, Days, or Months).' })
      return
    }
    setGenBusy(true)
    try {
      const r = await fetch('/api/license/admin/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planCode: genPlan,
          days: finalDays,
          hours: hoursNum || undefined,
          minutes: minutesNum || undefined,
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
        // plan + days/hours/minutes so issuing 5 in a row is one click each.
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

  // v0.5.57 — Test buttons in the Settings tab so the operator can
  // verify SMTP / Arkesel without waiting for a real customer payment.
  // Both endpoints already existed (/api/license/test-email, /test-sms);
  // we just expose them in the UI alongside the Cloud Keys section so
  // a key paste can be verified in the same panel.
  const [testBusy, setTestBusy] = useState<{ email: boolean; sms: boolean }>({ email: false, sms: false })
  const sendTestEmail = async () => {
    setTestBusy((b) => ({ ...b, email: true }))
    try {
      const r = await fetch('/api/license/test-email', { method: 'POST' })
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; status?: string; note?: { error?: string } }
      if (j.ok) toast.success(`Test email sent (${j.status})`)
      else toast.error(`Email failed: ${j.note?.error || j.status || `HTTP ${r.status}`}`)
      await reload()
    } catch (e) {
      toast.error(`Email request failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setTestBusy((b) => ({ ...b, email: false }))
    }
  }
  const sendTestSms = async () => {
    setTestBusy((b) => ({ ...b, sms: true }))
    try {
      const r = await fetch('/api/license/test-sms', { method: 'POST' })
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; status?: string; note?: { error?: string } }
      if (j.ok) toast.success(`Test SMS sent (${j.status})`)
      else toast.error(`SMS failed: ${j.note?.error || j.status || `HTTP ${r.status}`}`)
      await reload()
    } catch (e) {
      toast.error(`SMS request failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setTestBusy((b) => ({ ...b, sms: false }))
    }
  }
  // v0.5.57 — Per-row "Resend" for any pending/failed notification.
  // POSTs the notification id to the new admin retry endpoint which
  // dispatches a fresh attempt through the same notify* helper that
  // produced the original row. The original row stays as history.
  const resendNotification = async (id: string) => {
    try {
      const r = await fetch('/api/license/admin/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; status?: string; note?: { error?: string } }
      if (j.ok) toast.success(`Resent (${j.status})`)
      else toast.error(`Resend failed: ${j.note?.error || j.status || `HTTP ${r.status}`}`)
      await reload()
    } catch (e) {
      toast.error(`Resend failed: ${e instanceof Error ? e.message : String(e)}`)
    }
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
      // v0.5.52 — Show only WHETHER an override is set, never the value.
      setKeyStatus({
        openai: !!(j.config.adminOpenAIKey && j.config.adminOpenAIKey.length > 0),
        deepgram: !!(j.config.adminDeepgramKey && j.config.adminDeepgramKey.length > 0),
      })
      setFOpenAIKey('')
      setFDeepgramKey('')
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
    if (open && authed && tab === 'settings' && !cfg && !cfgLoading) loadCfg()
  }, [open, authed, tab, cfg, cfgLoading, loadCfg])

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
      const body: Record<string, unknown> = {
        adminPassword: fAdminPwd.trim() === '' ? null : fAdminPwd,
        trialMinutes: trialMinNum,
        momoName: fMomoName.trim() === '' ? null : fMomoName.trim(),
        momoNumber: fMomoNum.trim() === '' ? null : fMomoNum.trim(),
        whatsappNumber: fWhatsapp.trim() === '' ? null : fWhatsapp.trim(),
        notifyEmail: fNotifyEmail.trim() === '' ? null : fNotifyEmail.trim(),
        planPriceOverrides: priceOverrides,
      }
      // v0.5.52 — Only send key overrides when the operator typed
      // something (a non-empty paste sets the override, the literal
      // string "CLEAR" clears it back to the baked default). An
      // empty input is left UNCHANGED so a half-filled save doesn't
      // wipe a previously-saved override.
      if (fOpenAIKey.trim().toUpperCase() === 'CLEAR') body.adminOpenAIKey = null
      else if (fOpenAIKey.trim() !== '') body.adminOpenAIKey = fOpenAIKey.trim()
      if (fDeepgramKey.trim().toUpperCase() === 'CLEAR') body.adminDeepgramKey = null
      else if (fDeepgramKey.trim() !== '') body.adminDeepgramKey = fDeepgramKey.trim()
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
      // v0.5.52 — Refresh runtime keys cache so the next mic start
      // picks up the new override without an app reload.
      try {
        const { refreshKeyOverrides } = await import('@/lib/runtime-keys')
        await refreshKeyOverrides()
      } catch { /* ignore */ }
      setKeyStatus({
        openai: !!(j.config.adminOpenAIKey && j.config.adminOpenAIKey.length > 0),
        deepgram: !!(j.config.adminDeepgramKey && j.config.adminDeepgramKey.length > 0),
      })
      setFOpenAIKey('')
      setFDeepgramKey('')
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
      <DialogContent className="sm:max-w-[820px] max-h-[90vh] overflow-y-auto bg-background border-border text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            ScriptureLive AI — Admin Panel
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs">
            Owner-only. Confirm MoMo payments, generate activation codes, monitor subscription state.
          </DialogDescription>
        </DialogHeader>

        {/* v0.7.1 — Server-side auth gate. Until the operator
            successfully POSTs the password to /login, every other
            admin endpoint returns 401 and we hide the dashboard. */}
        {authState === 'checking' && (
          <div className="flex items-center justify-center py-12 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Checking session…
          </div>
        )}
        {authState === 'needs-password' && (
          <form
            onSubmit={submitPassword}
            className="flex flex-col gap-3 py-6 px-2 max-w-sm mx-auto"
          >
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              Enter the admin password to continue.
            </div>
            <input
              type="password"
              autoFocus
              autoComplete="current-password"
              value={pwdInput}
              onChange={(e) => { setPwdInput(e.target.value); if (pwdError) setPwdError(null) }}
              disabled={pwdBusy}
              placeholder="Admin password"
              className="w-full px-3 py-2 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:border-emerald-400 disabled:opacity-50"
            />
            {pwdError && (
              <div className="text-xs text-rose-300 -mt-1">{pwdError}</div>
            )}
            <button
              type="submit"
              disabled={pwdBusy || !pwdInput}
              className="w-full px-3 py-2 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-200 rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {pwdBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              Unlock
            </button>
            <div className="text-[10px] text-muted-foreground/70 mt-1 leading-relaxed">
              Default password is <code className="font-mono">admin</code> on first run — change it in Settings → Admin Password.
            </div>
          </form>
        )}

        {authed && (<>
        {/* Tab bar (v0.5.48). Overview keeps the existing payment +
            activation + notifications view; Settings shows the
            owner-tunable runtime config. */}
        <div className="flex gap-1 border-b border-border -mt-1 mb-1">
          <button
            type="button"
            onClick={() => setTab('overview')}
            className={cn(
              'px-3 py-1.5 text-[11px] uppercase tracking-wider border-b-2 -mb-px transition-colors',
              tab === 'overview'
                ? 'border-emerald-400 text-emerald-300'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >Overview</button>
          <button
            type="button"
            onClick={() => setTab('codes')}
            className={cn(
              'px-3 py-1.5 text-[11px] uppercase tracking-wider border-b-2 -mb-px transition-colors flex items-center gap-1.5',
              tab === 'codes'
                ? 'border-emerald-400 text-emerald-300'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          ><ListChecks className="h-3 w-3" /> Codes
            {codesData && (
              <span className="ml-1 text-[9px] font-mono bg-background border border-border rounded px-1 py-0.5">
                {codesData.stats.active}/{codesData.stats.total}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setTab('settings')}
            className={cn(
              'px-3 py-1.5 text-[11px] uppercase tracking-wider border-b-2 -mb-px transition-colors flex items-center gap-1.5',
              tab === 'settings'
                ? 'border-emerald-400 text-emerald-300'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          ><SettingsIcon className="h-3 w-3" /> Settings</button>
        </div>

        {!data && tab === 'overview' && (
          <div className="py-12 text-center text-muted-foreground text-sm">
            <Loader2 className="h-6 w-6 mx-auto animate-spin mb-2" /> Loading…
          </div>
        )}

        {data && tab === 'overview' && (
          <div className="space-y-5">
            {/* ── Install + Master ──────────────────────────────────────── */}
            <section className="rounded-lg border border-border bg-card/40 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><KeyRound className="h-3.5 w-3.5" /> Install + Master</div>
                <Badge className={cn('text-[9px]', data.status.state === 'active' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' : data.status.state === 'trial' ? 'bg-amber-500/15 text-amber-300 border-amber-500/40' : 'bg-rose-500/15 text-rose-300 border-rose-500/40')}>
                  {data.status.state.toUpperCase()} · {data.status.daysLeft}d
                </Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div>
                  <div className="text-muted-foreground uppercase tracking-wider text-[9px]">Install ID</div>
                  <div className="font-mono break-all">{data.installId}</div>
                </div>
                <div>
                  <div className="text-muted-foreground uppercase tracking-wider text-[9px]">First launch</div>
                  <div className="font-mono">{new Date(data.firstLaunchAt).toLocaleString()}</div>
                </div>
                <div className="sm:col-span-2">
                  <div className="text-muted-foreground uppercase tracking-wider text-[9px] flex items-center justify-between">
                    Master code (never expires)
                    {data.masterCodeEmailedAt && <span className="text-emerald-400">Emailed {new Date(data.masterCodeEmailedAt).toLocaleDateString()}</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="font-mono bg-background border border-border rounded px-2 py-1.5 flex-1 break-all">{data.masterCode}</code>
                    <Button size="sm" variant="ghost" onClick={() => copy(data.masterCode)}><Copy className="h-3 w-3" /></Button>
                    <Button size="sm" variant="outline" onClick={emailMaster} className="border-border text-foreground"><Mail className="h-3 w-3 mr-1.5" /> Email</Button>
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
                  className="bg-background border-border text-foreground font-mono"
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
                        <code className="font-mono bg-background border border-border rounded px-2 py-1">{confirmResult.code}</code>
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
            {/* v0.6.4 — Wrap the Generate Activation Code section in a
                <form> so:
                  • the browser pairs labels (htmlFor) with inputs
                    correctly (clicking a label focuses the field —
                    fixes the "cursor not working" complaint where
                    operators clicked the small label text instead of
                    the field itself), and
                  • Enter inside any input submits the form via
                    onSubmit ⇒ generateCode(), instead of bubbling out
                    of the Dialog and triggering an accidental close.
                Also explicitly set pointerEvents:auto on the section
                so any inherited pointer-events:none from a Radix
                portal layer can never silently swallow clicks. */}
            <section
              className="rounded-lg border border-violet-500/40 bg-violet-950/10 p-3.5 space-y-3"
              style={{ pointerEvents: 'auto' }}
            >
              <div className="text-[11px] uppercase tracking-wider text-violet-300 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> Generate Activation Code (no payment required)
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!genBusy) generateCode()
                }}
                autoComplete="off"
                className="space-y-3"
              >
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <div className="sm:col-span-4 space-y-1">
                  <label htmlFor="gen-plan" className="block text-[10px] uppercase tracking-wider text-muted-foreground cursor-pointer">Plan</label>
                  <select
                    id="gen-plan"
                    value={genPlan}
                    onChange={(e) => {
                      setGenPlan(e.target.value)
                      // Switching to a fixed plan clears the duration
                      // overrides so the canonical plan length applies.
                      if (e.target.value !== 'CUSTOM') {
                        setGenDays('')
                        setGenMonths('')
                      }
                    }}
                    className="w-full bg-background border border-border text-foreground rounded-md px-2 py-1.5 text-xs h-9 cursor-pointer"
                  >
                    <option value="1M">1 Month (31 d)</option>
                    <option value="2M">2 Months (62 d)</option>
                    <option value="3M">3 Months (93 d)</option>
                    <option value="4M">4 Months (124 d)</option>
                    <option value="5M">5 Months (155 d)</option>
                    <option value="6M">6 Months (186 d)</option>
                    <option value="1Y">1 Year (365 d)</option>
                    <option value="CUSTOM">Custom (any duration)</option>
                  </select>
                </div>
                {/* v0.6.2 — four equal duration inputs. Operator can
                    fill any single one or combine them; the client
                    folds Months × 30 into Days before posting and the
                    server adds days + hours + minutes into a final
                    integer day count. So "1 minute" = (0/0/0/1),
                    "6 months" = (6/0/0/0), "1 year" = (12/0/0/0). */}
                <div className="sm:col-span-2 space-y-1">
                  <label htmlFor="gen-months" className="block text-[10px] uppercase tracking-wider text-muted-foreground cursor-pointer">
                    Months {genPlan !== 'CUSTOM' && <span className="text-muted-foreground">(opt)</span>}
                  </label>
                  <Input
                    id="gen-months"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={1200}
                    placeholder="0"
                    value={genMonths}
                    onChange={(e) => setGenMonths(e.target.value)}
                    className="bg-background border-border text-foreground font-mono cursor-text"
                  />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <label htmlFor="gen-days" className="block text-[10px] uppercase tracking-wider text-muted-foreground cursor-pointer">
                    Days {genPlan !== 'CUSTOM' && <span className="text-muted-foreground">(opt)</span>}
                  </label>
                  <Input
                    id="gen-days"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={36500}
                    placeholder="0"
                    value={genDays}
                    onChange={(e) => setGenDays(e.target.value)}
                    className="bg-background border-border text-foreground font-mono cursor-text"
                  />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <label htmlFor="gen-hours" className="block text-[10px] uppercase tracking-wider text-muted-foreground cursor-pointer">Hours</label>
                  <Input
                    id="gen-hours"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={23}
                    placeholder="0"
                    value={genHours}
                    onChange={(e) => setGenHours(e.target.value)}
                    className="bg-background border-border text-foreground font-mono cursor-text"
                  />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <label htmlFor="gen-minutes" className="block text-[10px] uppercase tracking-wider text-muted-foreground cursor-pointer">Minutes</label>
                  <Input
                    id="gen-minutes"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={59}
                    placeholder="0"
                    value={genMinutes}
                    onChange={(e) => setGenMinutes(e.target.value)}
                    className="bg-background border-border text-foreground font-mono cursor-text"
                  />
                </div>
                <div className="sm:col-span-12 space-y-1">
                  <label htmlFor="gen-note" className="block text-[10px] uppercase tracking-wider text-muted-foreground cursor-pointer">Username / label</label>
                  <Input
                    id="gen-note"
                    placeholder="e.g. Pastor John — Cathedral Lagos"
                    value={genNote}
                    onChange={(e) => setGenNote(e.target.value)}
                    className="bg-background border-border text-foreground cursor-text"
                  />
                </div>
                <div className="sm:col-span-6 space-y-1">
                  <label htmlFor="gen-email" className="block text-[10px] uppercase tracking-wider text-muted-foreground cursor-pointer">Email (optional)</label>
                  <Input
                    id="gen-email"
                    type="email"
                    placeholder="customer@example.com"
                    value={genEmail}
                    onChange={(e) => setGenEmail(e.target.value)}
                    className="bg-background border-border text-foreground cursor-text"
                  />
                </div>
                <div className="sm:col-span-6 space-y-1">
                  <label htmlFor="gen-whatsapp" className="block text-[10px] uppercase tracking-wider text-muted-foreground cursor-pointer">WhatsApp (optional)</label>
                  <Input
                    id="gen-whatsapp"
                    placeholder="0530686367"
                    value={genWhatsapp}
                    onChange={(e) => setGenWhatsapp(e.target.value)}
                    className="bg-background border-border text-foreground font-mono cursor-text"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] text-muted-foreground">
                  Pick a plan, or CUSTOM and fill any combo of Minutes / Hours / Days / Months, then click Generate. The code appears below — copy it and send it to the customer.
                </p>
                <Button
                  type="submit"
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
                        <code className="font-mono bg-background border border-border rounded px-2 py-1 text-emerald-300 font-bold flex-1 break-all">{genResult.code}</code>
                        <Button size="sm" variant="ghost" onClick={() => copy(genResult.code!)}><Copy className="h-3 w-3" /></Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
              </form>
            </section>

            {/* ── Pending + recent payments ────────────────────────────── */}
            <section>
              <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Recent Payments ({data.paymentCodes.length})</div>
                <div className="flex items-center gap-1">
                  {/* v0.7.5 — Selection mode toggle (T501). Reveals
                      a checkbox column + bulk action bar. Toggling
                      off clears any pending selection so the next
                      open is clean. */}
                  <Button
                    size="sm" variant="ghost"
                    className={cn('h-7 text-[10px]', paySelectMode && 'bg-primary/10 text-primary')}
                    onClick={() => {
                      setPaySelectMode((v) => !v)
                      setPaySelected(new Set())
                    }}
                  >
                    {paySelectMode ? <X className="h-3 w-3 mr-1" /> : <CheckSquare className="h-3 w-3 mr-1" />}
                    {paySelectMode ? 'Cancel' : 'Select'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={reload} disabled={loading}><RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} /></Button>
                </div>
              </div>
              {/* v0.7.5 — Bulk action bar appears whenever any row is
                  ticked. Edit is enabled only with a single row picked
                  (it just opens the existing per-row Confirm flow);
                  Delete (N) hits the new bulk-delete endpoint. */}
              {paySelectMode && paySelected.size > 0 && (
                <div className="mb-1.5 flex items-center gap-2 rounded border border-primary/40 bg-primary/5 px-2 py-1.5 text-[11px]">
                  <span className="font-semibold">{paySelected.size} selected</span>
                  <div className="flex-1" />
                  <Button
                    size="sm" variant="outline" className="h-7 text-[10px]"
                    disabled={paySelected.size !== 1}
                    onClick={() => {
                      const ref = Array.from(paySelected)[0]
                      const row = data.paymentCodes.find((p) => p.ref === ref)
                      if (!row) return
                      if (row.status === 'WAITING_PAYMENT') void confirm(ref)
                      else if (row.activationCode) copy(row.activationCode)
                      else toast.info('Nothing to edit on this row')
                    }}
                  >Edit</Button>
                  <Button
                    size="sm" className="h-7 text-[10px] bg-rose-600 hover:bg-rose-500"
                    onClick={() => askConfirm({
                      title: `Delete ${paySelected.size} payment row${paySelected.size === 1 ? '' : 's'}?`,
                      description: 'Removes the rows from the audit log only. Active subscriptions are unaffected.',
                      confirmLabel: `Delete ${paySelected.size}`,
                      destructive: true,
                      onConfirm: () => bulkDelete('payment', Array.from(paySelected)),
                    })}
                  ><Trash2 className="h-3 w-3 mr-1" />Delete ({paySelected.size})</Button>
                </div>
              )}
              <div className="rounded-lg border border-border overflow-hidden">
                {data.paymentCodes.length === 0 ? (
                  <div className="p-4 text-center text-[11px] text-muted-foreground">No payments yet.</div>
                ) : (
                  <table className="w-full text-[11px]">
                    <thead className="bg-card/60 text-muted-foreground uppercase tracking-wider text-[9px]">
                      <tr>
                        {paySelectMode && (
                          <th className="px-2 py-1.5 w-8 text-center">
                            <Checkbox
                              checked={paySelected.size > 0 && paySelected.size === data.paymentCodes.length}
                              onCheckedChange={(c) => {
                                if (c) setPaySelected(new Set(data.paymentCodes.map((p) => p.ref)))
                                else setPaySelected(new Set())
                              }}
                              aria-label="Select all payments"
                            />
                          </th>
                        )}
                        <th className="text-left px-2 py-1.5">Ref</th><th className="text-left px-2 py-1.5">Plan</th><th className="text-left px-2 py-1.5">Amount</th><th className="text-left px-2 py-1.5">Customer</th><th className="text-left px-2 py-1.5">Status</th><th className="text-right px-2 py-1.5">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.paymentCodes.map((p) => (
                        <tr key={p.ref + p.createdAt} className={cn('border-t border-border hover:bg-card/40', paySelectMode && paySelected.has(p.ref) && 'bg-primary/5')}>
                          {paySelectMode && (
                            <td className="px-2 py-1.5 text-center">
                              <Checkbox
                                checked={paySelected.has(p.ref)}
                                onCheckedChange={() => setPaySelected((s) => toggleSet(s, p.ref))}
                                aria-label={`Select payment ${p.ref}`}
                              />
                            </td>
                          )}
                          <td className="px-2 py-1.5 font-mono font-bold text-emerald-300">{p.ref}</td>
                          <td className="px-2 py-1.5">{p.planCode}</td>
                          <td className="px-2 py-1.5 font-mono">GHS {p.amountGhs}</td>
                          <td className="px-2 py-1.5"><div className="truncate max-w-[160px]">{p.email}</div><div className="text-muted-foreground font-mono text-[10px]">{p.whatsapp}</div></td>
                          <td className="px-2 py-1.5"><Badge className={cn('text-[9px]', p.status === 'WAITING_PAYMENT' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : p.status === 'PAID' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : p.status === 'CONSUMED' ? 'bg-sky-500/20 text-sky-300 border-sky-500/40' : 'bg-muted text-foreground border-border')}>{p.status}</Badge></td>
                          <td className="px-2 py-1.5 text-right">
                            <div className="inline-flex items-center gap-1">
                              {p.status === 'WAITING_PAYMENT' && (
                                <Button size="sm" className="h-6 text-[10px] bg-emerald-600 hover:bg-emerald-500" onClick={() => confirm(p.ref)} disabled={confirmBusy}>Confirm</Button>
                              )}
                              {p.activationCode && (
                                <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => copy(p.activationCode!)}>Copy code</Button>
                              )}
                              {/* v0.5.53 — owner can clear a stale row */}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40"
                                title={`Delete payment ${p.ref}`}
                                onClick={() => askConfirm({
                                  title: `Delete payment ${p.ref}?`,
                                  description: 'This only removes the row from the audit log.',
                                  confirmLabel: 'Delete',
                                  destructive: true,
                                  onConfirm: () => delRow('delete-payment', { ref: p.ref }, `Payment ${p.ref}`),
                                })}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
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
              <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Recent Activations ({data.activationCodes.length})</div>
                <Button
                  size="sm" variant="ghost"
                  className={cn('h-7 text-[10px]', actSelectMode && 'bg-primary/10 text-primary')}
                  onClick={() => {
                    setActSelectMode((v) => !v)
                    setActSelected(new Set())
                  }}
                >
                  {actSelectMode ? <X className="h-3 w-3 mr-1" /> : <CheckSquare className="h-3 w-3 mr-1" />}
                  {actSelectMode ? 'Cancel' : 'Select'}
                </Button>
              </div>
              {actSelectMode && actSelected.size > 0 && (
                <div className="mb-1.5 flex items-center gap-2 rounded border border-primary/40 bg-primary/5 px-2 py-1.5 text-[11px]">
                  <span className="font-semibold">{actSelected.size} selected</span>
                  <div className="flex-1" />
                  <Button
                    size="sm" variant="outline" className="h-7 text-[10px]"
                    disabled={actSelected.size !== 1}
                    onClick={() => {
                      const code = Array.from(actSelected)[0]
                      copy(code)
                    }}
                  >Edit</Button>
                  <Button
                    size="sm" className="h-7 text-[10px] bg-rose-600 hover:bg-rose-500"
                    onClick={() => askConfirm({
                      title: `Delete ${actSelected.size} activation row${actSelected.size === 1 ? '' : 's'}?`,
                      description: 'Soft-deletes the activations into the bin (recoverable for 90 days). Active subscriptions on this install are unaffected.',
                      confirmLabel: `Delete ${actSelected.size}`,
                      destructive: true,
                      onConfirm: () => bulkDelete('activation', Array.from(actSelected), { permanent: false }),
                    })}
                  ><Trash2 className="h-3 w-3 mr-1" />Delete ({actSelected.size})</Button>
                </div>
              )}
              <div className="rounded-lg border border-border overflow-hidden">
                {data.activationCodes.length === 0 ? (
                  <div className="p-4 text-center text-[11px] text-muted-foreground">No activations yet.</div>
                ) : (
                  <table className="w-full text-[11px]">
                    <thead className="bg-card/60 text-muted-foreground uppercase tracking-wider text-[9px]">
                      <tr>
                        {actSelectMode && (
                          <th className="px-2 py-1.5 w-8 text-center">
                            <Checkbox
                              checked={actSelected.size > 0 && actSelected.size === data.activationCodes.length}
                              onCheckedChange={(c) => {
                                if (c) setActSelected(new Set(data.activationCodes.map((a) => a.code)))
                                else setActSelected(new Set())
                              }}
                              aria-label="Select all activations"
                            />
                          </th>
                        )}
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
                          <tr key={a.code} className={cn('border-t border-border hover:bg-card/40', actSelectMode && actSelected.has(a.code) && 'bg-primary/5')}>
                            {actSelectMode && (
                              <td className="px-2 py-1.5 text-center">
                                <Checkbox
                                  checked={actSelected.has(a.code)}
                                  onCheckedChange={() => setActSelected((s) => toggleSet(s, a.code))}
                                  aria-label={`Select activation ${a.code}`}
                                />
                              </td>
                            )}
                            <td className="px-2 py-1.5 font-mono">{a.code}</td>
                            <td className="px-2 py-1.5">{a.planCode}</td>
                            <td className="px-2 py-1.5">{a.days}</td>
                            <td className="px-2 py-1.5 max-w-[200px]"><div className="truncate" title={forLabel}>{forLabel}</div></td>
                            <td className="px-2 py-1.5">{a.isUsed ? <span className="text-emerald-400">Yes</span> : <span className="text-amber-400">No</span>}</td>
                            <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground">{a.subscriptionExpiresAt ? new Date(a.subscriptionExpiresAt).toLocaleDateString() : '—'}</td>
                            <td className="px-2 py-1.5 text-right">
                              <div className="inline-flex items-center gap-1">
                                <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => copy(a.code)}>
                                  <Copy className="h-3 w-3 mr-1" /> Copy
                                </Button>
                                {/* v0.5.53 — owner can purge a row */}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40"
                                  title={`Delete activation ${a.code}`}
                                  onClick={() => askConfirm({
                                    title: `Delete activation ${a.code}?`,
                                    description: 'The active subscription on this install is unaffected — this only clears the audit log.',
                                    confirmLabel: 'Delete',
                                    destructive: true,
                                    onConfirm: () => delRow('delete-activation', { code: a.code }, `Activation ${a.code}`),
                                  })}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
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
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Notifications ({data.notifications.length})</div>
              <div className="rounded-lg border border-border max-h-[200px] overflow-y-auto">
                {data.notifications.length === 0 ? (
                  <div className="p-4 text-center text-[11px] text-muted-foreground">No notifications yet.</div>
                ) : (
                  <ul className="divide-y divide-border">
                    {data.notifications.map((n) => (
                      <li key={n.id} className="p-2.5 text-[11px]">
                        <div className="flex items-center gap-2 mb-1">
                          {n.channel === 'email' ? <Mail className="h-3 w-3 text-sky-400" /> : <Phone className="h-3 w-3 text-emerald-400" />}
                          <span className="font-semibold">{n.subject}</span>
                          <Badge className={cn('text-[9px] ml-auto', n.status === 'sent' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : n.status === 'pending' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-rose-500/20 text-rose-300 border-rose-500/40')}>{n.status}</Badge>
                          {/* v0.5.57 — Resend a queued/failed delivery
                              after the operator fixes credentials.
                              Hidden for already-sent rows. */}
                          {n.status !== 'sent' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-5 px-1.5 text-[10px] text-sky-400 hover:text-sky-300 hover:bg-sky-950/40"
                              title="Re-send this notification"
                              onClick={() => resendNotification(n.id)}
                            >
                              Resend
                            </Button>
                          )}
                          {/* v0.5.53 — owner can dismiss a notification row */}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-5 w-5 p-0 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40"
                            title="Delete notification"
                            onClick={() => askConfirm({
                              title: 'Dismiss notification?',
                              description: 'Removes this row from the audit log. The original message (already sent or queued) is unaffected.',
                              confirmLabel: 'Dismiss',
                              destructive: true,
                              onConfirm: () => delRow('delete-notification', { id: n.id }, 'Notification'),
                            })}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="text-muted-foreground text-[10px]">to {n.to} · {new Date(n.ts).toLocaleString()}</div>
                        {n.status !== 'sent' && (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-muted-foreground text-[10px] hover:text-foreground">Show body & copy</summary>
                            <pre className="mt-1 whitespace-pre-wrap break-all bg-background border border-border rounded p-2 text-[10px] text-foreground">{n.body}</pre>
                            <Button size="sm" variant="ghost" className="mt-1 h-6 text-[10px]" onClick={() => copy(n.body)}><Copy className="h-3 w-3 mr-1" /> Copy</Button>
                          </details>
                        )}
                        {/* v0.6.4 — `n.error` is overloaded: the backend stores
                            success-info there too (queue ids, "mNotify OK · …",
                            "SMTP OK · …"). Inspect `n.status` so a successful
                            send is labeled "Info" in emerald and only an
                            actual failure shows the red "Error". */}
                        {/* v0.6.4 review fix — three-way branch on n.status:
                            sent ⇒ green "Info:" (success audit string),
                            pending ⇒ amber "Info:" (queued, not failed yet),
                            failed ⇒ red "Error:". The pending branch was
                            previously falling through to the rose default
                            and mis-labelled the operator's queued sends. */}
                        {n.error && (
                          <div
                            className={cn(
                              'text-[10px] mt-0.5',
                              n.status === 'sent'
                                ? 'text-emerald-400'
                                : n.status === 'pending'
                                  ? 'text-amber-300'
                                  : 'text-rose-400',
                            )}
                          >
                            {n.status === 'failed' ? 'Error: ' : 'Info: '}
                            {n.error}
                          </div>
                        )}
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
              <div className="py-12 text-center text-muted-foreground text-sm">
                <Loader2 className="h-6 w-6 mx-auto animate-spin mb-2" /> Loading settings…
              </div>
            )}
            {cfg && (
              <>
                <section className="rounded-lg border border-border bg-card/40 p-3.5 space-y-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Access &amp; Trial</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Admin password</label>
                      <Input
                        type="password"
                        placeholder="(leave blank for default)"
                        value={fAdminPwd}
                        onChange={(e) => setFAdminPwd(e.target.value)}
                        className="bg-background border-border text-foreground font-mono"
                        autoComplete="new-password"
                      />
                      <p className="text-[10px] text-muted-foreground">Stored locally. Leave blank to disable owner gate.</p>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Trial length (minutes)</label>
                      <Input
                        type="number"
                        min={1}
                        max={1440}
                        placeholder={String(cfg.defaults.trialMinutes)}
                        value={fTrialMin}
                        onChange={(e) => setFTrialMin(e.target.value)}
                        className="bg-background border-border text-foreground font-mono"
                      />
                      <p className="text-[10px] text-muted-foreground">Default {cfg.defaults.trialMinutes} min. Range 1–1440. Applies to new installs; existing trial windows keep their original end-time.</p>
                    </div>
                  </div>
                </section>

                <section className="rounded-lg border border-border bg-card/40 p-3.5 space-y-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">MoMo Recipient (paid into)</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Recipient name</label>
                      <Input
                        placeholder={cfg.defaults.momoName}
                        value={fMomoName}
                        onChange={(e) => setFMomoName(e.target.value)}
                        className="bg-background border-border text-foreground"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground">MoMo phone number</label>
                      <Input
                        placeholder={cfg.defaults.momoNumber}
                        value={fMomoNum}
                        onChange={(e) => setFMomoNum(e.target.value)}
                        className="bg-background border-border text-foreground font-mono"
                      />
                    </div>
                  </div>
                </section>

                <section className="rounded-lg border border-border bg-card/40 p-3.5 space-y-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Notification Targets</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Notify email</label>
                      <Input
                        type="email"
                        placeholder={cfg.defaults.notifyEmail}
                        value={fNotifyEmail}
                        onChange={(e) => setFNotifyEmail(e.target.value)}
                        className="bg-background border-border text-foreground"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Notify WhatsApp</label>
                      <Input
                        placeholder={cfg.defaults.whatsappNumber}
                        value={fWhatsapp}
                        onChange={(e) => setFWhatsapp(e.target.value)}
                        className="bg-background border-border text-foreground font-mono"
                      />
                    </div>
                  </div>
                </section>

                {/* v0.5.52 — Cloud-key overrides. Both keys are baked into the
                    .exe at build time; this section lets the operator paste a
                    different key per install (useful when the baked one hits a
                    quota or you want to rotate without a redeploy). Empty input =
                    keep current; type "CLEAR" = revert to baked default. */}
                <section className="rounded-lg border border-border bg-card/40 p-3.5 space-y-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    Cloud Keys (override baked-in)
                    <Badge className="bg-muted text-muted-foreground border-border text-[9px]">v0.5.52</Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground -mt-1">
                    Both keys are baked into the installer. Paste a key here to override on this install only.
                    Type <span className="font-mono text-foreground">CLEAR</span> to revert to the baked default. Leave blank to keep current.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                        <span>OpenAI Whisper key</span>
                        <span className={cn('text-[9px]', keyStatus.openai ? 'text-emerald-400' : 'text-muted-foreground')}>
                          {keyStatus.openai ? 'override active' : 'using baked default'}
                        </span>
                      </label>
                      <Input
                        type="password"
                        placeholder={keyStatus.openai ? '(override saved — paste to replace)' : 'sk-...'}
                        value={fOpenAIKey}
                        onChange={(e) => setFOpenAIKey(e.target.value)}
                        className="bg-background border-border text-foreground font-mono"
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                        <span>Deepgram key</span>
                        <span className={cn('text-[9px]', keyStatus.deepgram ? 'text-emerald-400' : 'text-muted-foreground')}>
                          {keyStatus.deepgram ? 'override active' : 'using baked default'}
                        </span>
                      </label>
                      <Input
                        type="password"
                        placeholder={keyStatus.deepgram ? '(override saved — paste to replace)' : 'paste Deepgram key'}
                        value={fDeepgramKey}
                        onChange={(e) => setFDeepgramKey(e.target.value)}
                        className="bg-background border-border text-foreground font-mono"
                        autoComplete="off"
                      />
                    </div>
                  </div>

                  {/* v0.5.57 — Test Email + Test SMS buttons. Both
                      endpoints already existed but had no UI; with
                      these the operator can verify SMTP / Arkesel
                      delivery in seconds without faking a real
                      payment. Result toast surfaces the underlying
                      provider error (e.g. Arkesel 401) so a stale
                      baked key is obvious. The Notifications log
                      records every attempt as a row, with Resend
                      one click away. */}
                  <div className="pt-2 border-t border-border">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Verify Delivery</div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={testBusy.email}
                        onClick={sendTestEmail}
                        className="border-border text-foreground hover:bg-muted"
                      >
                        {testBusy.email ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Mail className="h-3 w-3 mr-1.5" />}
                        Send test email
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={testBusy.sms}
                        onClick={sendTestSms}
                        className="border-border text-foreground hover:bg-muted"
                      >
                        {testBusy.sms ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Phone className="h-3 w-3 mr-1.5" />}
                        Send test SMS
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1.5">
                      Sends to the configured Owner Email / Phone. Result is logged in the Notifications panel above.
                    </p>
                  </div>
                </section>

                <section className="rounded-lg border border-border bg-card/40 p-3.5 space-y-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Plan Prices (GHS)</div>
                  <p className="text-[10px] text-muted-foreground -mt-1">Leave a field blank to use the default. New prices apply immediately to all customers without a redeploy.</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {Object.entries(cfg.defaults.planPrices).map(([code, def]) => (
                      <div key={code} className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                          <span>{code}</span>
                          <span className="text-muted-foreground">def {def}</span>
                        </label>
                        <Input
                          type="number"
                          min={1}
                          placeholder={String(def)}
                          value={fPrices[code] ?? ''}
                          onChange={(e) => setFPrices((p) => ({ ...p, [code]: e.target.value }))}
                          className="bg-background border-border text-foreground font-mono"
                        />
                      </div>
                    ))}
                  </div>
                </section>

                <div className="flex items-center justify-between">
                  <div className="text-[10px] text-muted-foreground">
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

        {tab === 'codes' && (
          <div className="space-y-4">
            {/* ── Stat strip ──────────────────────────────────────────── */}
            <section className="grid grid-cols-3 sm:grid-cols-7 gap-2 text-center text-[11px]">
              {([
                ['Total',     codesData?.stats.total      ?? 0, 'text-foreground'],
                ['Active',    codesData?.stats.active     ?? 0, 'text-emerald-300'],
                ['Unused',    codesData?.stats.neverUsed  ?? 0, 'text-sky-300'],
                ['Expired',   codesData?.stats.expired    ?? 0, 'text-rose-300'],
                ['Used',      codesData?.stats.used       ?? 0, 'text-zinc-300'],
                ['Cancelled', codesData?.stats.cancelled  ?? 0, 'text-orange-300'],
                ['Bin',       codesData?.stats.inBin      ?? 0, 'text-rose-300'],
              ] as const).map(([label, n, color]) => (
                <div key={label} className="rounded border border-border bg-card/40 px-2 py-1.5">
                  <div className={cn('font-mono text-base leading-tight', color)}>{n}</div>
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
                </div>
              ))}
            </section>

            {/* ── Toolbar ─────────────────────────────────────────────── */}
            <section className="flex flex-wrap items-center gap-2">
              <Input
                value={codesQuery}
                onChange={(e) => setCodesQuery(e.target.value)}
                placeholder="Search code, phone, email, location, note…"
                className="bg-background border-border text-foreground text-xs h-8 flex-1 min-w-[220px]"
              />
              <select
                value={codesFilter}
                onChange={(e) => setCodesFilter(e.target.value as 'all' | AdminCodeStatus)}
                className="h-8 rounded border border-border bg-background text-foreground text-xs px-2"
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="never-used">Never used</option>
                <option value="expired">Expired</option>
                <option value="used">Used</option>
                <option value="cancelled">Cancelled</option>
                <option value="master">Master</option>
              </select>
              <Button
                size="sm" variant="outline"
                onClick={() => setCodesShowBin((v) => !v)}
                className={cn(
                  'border-border text-foreground h-8',
                  codesShowBin && 'bg-rose-500/10 border-rose-500/40 text-rose-200',
                )}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                {codesShowBin ? 'Hide bin' : `Bin (${codesData?.bin.length ?? 0})`}
              </Button>
              <Button
                size="sm" variant="outline"
                className={cn('border-border text-foreground h-8', codesSelectMode && 'bg-primary/10 border-primary/40 text-primary')}
                onClick={() => {
                  setCodesSelectMode((v) => !v)
                  setCodesSelected(new Set())
                }}
              >
                {codesSelectMode ? <X className="h-3.5 w-3.5 mr-1.5" /> : <CheckSquare className="h-3.5 w-3.5 mr-1.5" />}
                {codesSelectMode ? 'Cancel select' : 'Select'}
              </Button>
              <Button
                size="sm" variant="ghost"
                onClick={reloadCodes}
                disabled={codesLoading}
                className="h-8"
              >
                {codesLoading
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <RefreshCw className="h-3.5 w-3.5" />}
              </Button>
            </section>

            {/* v0.7.5 — Bulk action bar for the CODES tab. Lives just
                below the toolbar so it scrolls with the table; appears
                only when at least one row is ticked. Edit (single) opens
                the existing renew dialog so the operator doesn't have
                to scroll back to the row; Delete (N) bulk-soft-deletes
                into the bin via the new endpoint. */}
            {codesSelectMode && codesSelected.size > 0 && (
              <section className="flex items-center gap-2 rounded border border-primary/40 bg-primary/5 px-3 py-2 text-[11px]">
                <span className="font-semibold">{codesSelected.size} code{codesSelected.size === 1 ? '' : 's'} selected</span>
                <div className="flex-1" />
                <Button
                  size="sm" variant="outline" className="h-7 text-[10px]"
                  disabled={codesSelected.size !== 1}
                  onClick={() => {
                    const code = Array.from(codesSelected)[0]
                    askConfirm({
                      title: `Renew ${code}`,
                      description: 'Add days to the active subscription (or to the unused grant). Whole positive numbers only.',
                      confirmLabel: 'Add days',
                      input: { label: 'Days to add', placeholder: '30', defaultValue: '30' },
                      onConfirm: (raw) => {
                        const addDays = Number(raw)
                        if (!Number.isFinite(addDays) || addDays <= 0) {
                          throw new Error('Enter a positive number of days')
                        }
                        return codeAction(code, 'renew', { addDays }, `Renewed ${code} +${addDays}d`)
                      },
                    })
                  }}
                >Edit</Button>
                <Button
                  size="sm" className="h-7 text-[10px] bg-rose-600 hover:bg-rose-500"
                  onClick={() => askConfirm({
                    title: `Move ${codesSelected.size} code${codesSelected.size === 1 ? '' : 's'} to bin?`,
                    description: 'Soft-delete — recoverable from the Bin for 90 days, then auto-purges.',
                    confirmLabel: `Move ${codesSelected.size} to bin`,
                    destructive: true,
                    onConfirm: () => bulkDelete('activation', Array.from(codesSelected), { permanent: false }),
                  })}
                ><Trash2 className="h-3 w-3 mr-1" />Delete ({codesSelected.size})</Button>
              </section>
            )}

            {/* ── Loading state ───────────────────────────────────────── */}
            {!codesData && (
              <div className="py-12 text-center text-muted-foreground text-sm">
                <Loader2 className="h-6 w-6 mx-auto animate-spin mb-2" /> Loading codes…
              </div>
            )}

            {/* ── Active codes table ──────────────────────────────────── */}
            {codesData && !codesShowBin && (() => {
              const q = codesQuery.trim().toLowerCase()
              const rows = codesData.codes.filter((r) => {
                if (codesFilter !== 'all' && r.status !== codesFilter) return false
                if (!q) return true
                const haystack = [
                  r.code, r.planCode, r.buyerPhone, r.lastSeenLocation, r.lastSeenIp,
                  r.generatedFor?.email, r.generatedFor?.whatsapp, r.generatedFor?.note,
                  r.generatedFor?.paymentRef,
                ].filter(Boolean).join(' ').toLowerCase()
                return haystack.includes(q)
              })
              if (rows.length === 0) {
                return (
                  <div className="py-10 text-center text-muted-foreground text-xs border border-dashed border-border rounded-lg">
                    No codes match the current filter.
                  </div>
                )
              }
              return (
                <section className="rounded-lg border border-border bg-card/40 overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead className="text-[9px] uppercase tracking-wider text-muted-foreground bg-background/50">
                      <tr>
                        {codesSelectMode && (
                          <th className="px-2 py-1.5 w-8 text-center">
                            <Checkbox
                              checked={codesSelected.size > 0 && codesSelected.size === rows.length}
                              onCheckedChange={(c) => {
                                if (c) setCodesSelected(new Set(rows.map((r) => r.code)))
                                else setCodesSelected(new Set())
                              }}
                              aria-label="Select all visible codes"
                            />
                          </th>
                        )}
                        <th className="text-left px-2 py-1.5">Code / Plan</th>
                        <th className="text-left px-2 py-1.5">Status</th>
                        <th className="text-left px-2 py-1.5">Buyer</th>
                        <th className="text-left px-2 py-1.5">Days left</th>
                        <th className="text-left px-2 py-1.5">Expires</th>
                        <th className="text-left px-2 py-1.5">Last seen</th>
                        <th className="text-right px-2 py-1.5">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {rows.map((r) => {
                        const busy = codeBusy === r.code
                        const days = r.daysRemaining
                        const daysCell =
                          r.status === 'master' ? '∞'
                          : r.status === 'never-used' ? `${r.days}d granted`
                          : days == null ? '—'
                          : days >= 0 ? `${days}d`
                          : `${Math.abs(days)}d ago`
                        return (
                          <tr key={r.code} className={cn('hover:bg-background/30', codesSelectMode && codesSelected.has(r.code) && 'bg-primary/5')}>
                            {codesSelectMode && (
                              <td className="px-2 py-1.5 text-center align-top">
                                <Checkbox
                                  checked={codesSelected.has(r.code)}
                                  onCheckedChange={() => setCodesSelected((s) => toggleSet(s, r.code))}
                                  disabled={r.status === 'master'}
                                  aria-label={`Select code ${r.code}`}
                                />
                              </td>
                            )}
                            <td className="px-2 py-1.5 align-top">
                              <div className="flex items-center gap-1">
                                <code className="font-mono text-[10px] break-all">{r.code}</code>
                                <button onClick={() => copy(r.code)} className="text-muted-foreground hover:text-foreground" title="Copy">
                                  <Copy className="h-3 w-3" />
                                </button>
                              </div>
                              <div className="text-[9px] text-muted-foreground mt-0.5">
                                {r.planCode} · {r.days}d
                                {r.generatedFor?.note && <> · {r.generatedFor.note}</>}
                              </div>
                            </td>
                            <td className="px-2 py-1.5 align-top">
                              <Badge className={cn('text-[9px] border', STATUS_PILL[r.status])}>
                                {r.status.toUpperCase()}
                              </Badge>
                              {r.cancelReason && (
                                <div className="text-[9px] text-orange-300 mt-0.5 truncate max-w-[140px]" title={r.cancelReason}>
                                  {r.cancelReason}
                                </div>
                              )}
                            </td>
                            <td className="px-2 py-1.5 align-top">
                              {r.buyerPhone && (
                                <div className="flex items-center gap-1">
                                  <Phone className="h-2.5 w-2.5 text-muted-foreground" />
                                  <span className="font-mono text-[10px]">{r.buyerPhone}</span>
                                </div>
                              )}
                              {r.generatedFor?.email && (
                                <div className="flex items-center gap-1 mt-0.5">
                                  <Mail className="h-2.5 w-2.5 text-muted-foreground" />
                                  <span className="text-[10px] truncate max-w-[140px]" title={r.generatedFor.email}>{r.generatedFor.email}</span>
                                </div>
                              )}
                              {!r.buyerPhone && !r.generatedFor?.email && (
                                <span className="text-muted-foreground text-[10px]">—</span>
                              )}
                            </td>
                            <td className={cn(
                              'px-2 py-1.5 align-top font-mono text-[10px]',
                              r.status === 'active' && 'text-emerald-300',
                              r.status === 'expired' && 'text-rose-300',
                              r.status === 'never-used' && 'text-sky-300',
                            )}>
                              {daysCell}
                            </td>
                            <td className="px-2 py-1.5 align-top text-[10px]">
                              {r.subscriptionExpiresAt
                                ? new Date(r.subscriptionExpiresAt).toLocaleDateString()
                                : <span className="text-muted-foreground">—</span>}
                              <div className="text-[9px] text-muted-foreground">
                                {r.usedAt ? `used ${fmtRel(r.usedAt)}` : `created ${fmtRel(r.generatedAt)}`}
                              </div>
                            </td>
                            <td className="px-2 py-1.5 align-top">
                              {r.lastSeenLocation || r.lastSeenIp ? (
                                <div>
                                  <div className="flex items-center gap-1 text-[10px]">
                                    <MapPin className="h-2.5 w-2.5 text-muted-foreground" />
                                    <span className="truncate max-w-[160px]" title={r.lastSeenLocation || r.lastSeenIp}>
                                      {r.lastSeenLocation || r.lastSeenIp}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1 text-[9px] text-muted-foreground mt-0.5">
                                    <Clock className="h-2.5 w-2.5" />
                                    {fmtRel(r.lastSeenAt)}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-[10px]">never</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 align-top">
                              <div className="flex items-center justify-end gap-1">
                                {r.status !== 'cancelled' && r.status !== 'master' && (
                                  <button
                                    type="button"
                                    onClick={() => askConfirm({
                                      title: `Cancel code ${r.code}?`,
                                      description: 'The code will refuse to activate on any new install, and any active subscription using it will be killed immediately.',
                                      confirmLabel: 'Cancel code',
                                      destructive: true,
                                      input: { label: 'Reason (optional, visible in dashboard)', placeholder: 'e.g. customer requested refund' },
                                      onConfirm: (reason) => codeAction(r.code, 'cancel', { reason: reason ?? '' }, `Cancelled ${r.code}`),
                                    })}
                                    disabled={busy}
                                    title="Cancel — code refuses to activate, active sub killed"
                                    className="p-1 rounded hover:bg-orange-500/15 text-orange-300 disabled:opacity-40"
                                  ><Ban className="h-3 w-3" /></button>
                                )}
                                {r.status !== 'master' && (
                                  <button
                                    type="button"
                                    onClick={() => askConfirm({
                                      title: `Renew ${r.code}`,
                                      description: 'Add days to the active subscription (or to the unused grant). Whole positive numbers only.',
                                      confirmLabel: 'Add days',
                                      input: { label: 'Days to add', placeholder: '30', defaultValue: '30' },
                                      onConfirm: (raw) => {
                                        const addDays = Number(raw)
                                        if (!Number.isFinite(addDays) || addDays <= 0) {
                                          throw new Error('Enter a positive number of days')
                                        }
                                        return codeAction(r.code, 'renew', { addDays }, `Renewed ${r.code} +${addDays}d`)
                                      },
                                    })}
                                    disabled={busy}
                                    title="Renew — extend subscription / add days to grant"
                                    className="p-1 rounded hover:bg-emerald-500/15 text-emerald-300 disabled:opacity-40"
                                  ><CalendarPlus className="h-3 w-3" /></button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => askConfirm({
                                    title: `Move ${r.code} to bin?`,
                                    description: 'Soft delete — recoverable from the Bin for 90 days, then auto-purges.',
                                    confirmLabel: 'Move to bin',
                                    destructive: true,
                                    onConfirm: () => codeAction(r.code, 'delete-activation', { permanent: false }, `Moved ${r.code} to bin`),
                                  })}
                                  disabled={busy}
                                  title="Soft-delete — moves to bin for 90 days"
                                  className="p-1 rounded hover:bg-rose-500/15 text-rose-300 disabled:opacity-40"
                                >
                                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </section>
              )
            })()}

            {/* ── Bin view ────────────────────────────────────────────── */}
            {codesData && codesShowBin && (
              <section className="rounded-lg border border-rose-500/30 bg-rose-950/10 overflow-x-auto">
                <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-rose-300 border-b border-rose-500/30 flex items-center justify-between">
                  <span>Bin · auto-purges 90 days after delete (recoverable until then)</span>
                  <span className="text-muted-foreground normal-case">{codesData.bin.length} item(s)</span>
                </div>
                {codesData.bin.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground text-xs">Bin is empty.</div>
                ) : (
                  <table className="w-full text-[11px]">
                    <thead className="text-[9px] uppercase tracking-wider text-muted-foreground bg-background/30">
                      <tr>
                        <th className="text-left px-2 py-1.5">Code</th>
                        <th className="text-left px-2 py-1.5">Plan</th>
                        <th className="text-left px-2 py-1.5">Buyer</th>
                        <th className="text-left px-2 py-1.5">Deleted</th>
                        <th className="text-left px-2 py-1.5">Purges in</th>
                        <th className="text-right px-2 py-1.5">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {codesData.bin.map((r) => {
                        const busy = codeBusy === r.code
                        const purgeDays = r.binMsRemaining != null
                          ? Math.max(0, Math.ceil(r.binMsRemaining / 86400000))
                          : null
                        return (
                          <tr key={r.code}>
                            <td className="px-2 py-1.5 font-mono text-[10px] break-all">{r.code}</td>
                            <td className="px-2 py-1.5 text-[10px]">{r.planCode} · {r.days}d</td>
                            <td className="px-2 py-1.5 text-[10px]">
                              {r.buyerPhone || r.generatedFor?.email || <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className="px-2 py-1.5 text-[10px]">{fmtRel(r.softDeletedAt)}</td>
                            <td className="px-2 py-1.5 text-[10px] text-rose-300">
                              {purgeDays == null ? '—' : `${purgeDays}d`}
                            </td>
                            <td className="px-2 py-1.5">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => void codeAction(r.code, 'restore', {}, `Restored ${r.code}`)}
                                  disabled={busy}
                                  title="Restore from bin"
                                  className="p-1 rounded hover:bg-emerald-500/15 text-emerald-300 disabled:opacity-40"
                                ><Undo2 className="h-3 w-3" /></button>
                                <button
                                  type="button"
                                  onClick={() => askConfirm({
                                    title: `Permanently delete ${r.code}?`,
                                    description: 'This cannot be undone. The activation row will be wiped from the audit log forever.',
                                    confirmLabel: 'Delete forever',
                                    destructive: true,
                                    onConfirm: () => codeAction(r.code, 'delete-activation', { permanent: true }, `Purged ${r.code}`),
                                  })}
                                  disabled={busy}
                                  title="Delete forever"
                                  className="p-1 rounded hover:bg-rose-500/15 text-rose-300 disabled:opacity-40"
                                >
                                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash className="h-3 w-3" />}
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </section>
            )}
          </div>
        )}
        </>)}
      </DialogContent>
      {/* v0.7.5 — In-modal confirmation dialog (T501). Replaces every
          window.confirm/window.prompt site that was silently no-op'ing
          inside the packaged Electron build. Renders as a sibling to
          the main DialogContent so Radix portals it above the panel
          but inside the same React tree — no host shell can suppress
          it. The free-text input is conditional on `pending.input`
          being supplied (cancel/renew); pure confirms hide it. */}
      <AlertDialog open={!!pending} onOpenChange={(o) => { if (!o) closePending() }}>
        <AlertDialogContent className="bg-background border-border text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.title ?? ''}</AlertDialogTitle>
            <AlertDialogDescription>{pending?.description ?? ''}</AlertDialogDescription>
          </AlertDialogHeader>
          {pending?.input && (
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground">{pending.input.label}</label>
              <Input
                value={pendingValue}
                onChange={(e) => setPendingValue(e.target.value)}
                placeholder={pending.input.placeholder}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !pendingBusy) {
                    e.preventDefault()
                    void runPending()
                  }
                }}
                className="bg-card border-border text-foreground"
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendingBusy} onClick={closePending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pendingBusy}
              onClick={(e) => { e.preventDefault(); void runPending() }}
              className={cn(pending?.destructive && 'bg-rose-600 hover:bg-rose-500 text-white')}
            >
              {pendingBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              {pending?.confirmLabel ?? 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
