'use client'

// v0.7.16 — In-app "Report an Issue" button.
//
// Lives in the TopToolbar (always visible, in every view). Opens an
// inline Dialog with a textarea + Send button. Posts to
// /api/license/report-issue, which forwards to the central telemetry
// /api/telemetry/error endpoint as errorType='user_report'.
//
// v0.7.43 — Name, phone, and location are now COMPULSORY fields.
// The operator was getting too many anonymous "something is broken"
// reports with no way to follow up. The fields persist in
// localStorage between submissions so a returning user only types
// their contact info once. The textarea remains the focus of the
// form (largest, autoFocus on first open) so the dialog still feels
// quick to fire off.
//
// The lock-overlay version (in license/lock-overlay.tsx) carries
// the same compulsory fields — the two surfaces share the API
// contract in /api/license/report-issue/route.ts.

import { useState, useEffect } from 'react'
import { Flag, Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const STORAGE_KEY = 'sl.reportContact.v1'

interface SavedContact {
  name?: string
  phone?: string
  location?: string
}

function loadSavedContact(): SavedContact {
  try {
    if (typeof window === 'undefined') return {}
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as SavedContact
    return {
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
      phone: typeof parsed.phone === 'string' ? parsed.phone : undefined,
      location: typeof parsed.location === 'string' ? parsed.location : undefined,
    }
  } catch {
    return {}
  }
}

function saveContact(c: SavedContact): void {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(c))
  } catch {
    /* ignore — storage may be disabled in private mode */
  }
}

interface Props {
  /** Optional context hint stored alongside the report. Defaults
   *  to "topbar". Pass "topbar:settings" or similar from caller
   *  when the surface is more specific. */
  context?: string
  /** Compact icon-only button when true; full label when false. */
  compact?: boolean
  className?: string
}

export function ReportIssueButton({ context = 'topbar', compact = true, className }: Props) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [location, setLocation] = useState('')
  const [busy, setBusy] = useState(false)

  // Restore saved contact details on first open of the dialog so
  // returning users don't retype their name/phone/location every time.
  useEffect(() => {
    if (!open) return
    if (name || phone || location) return
    const s = loadSavedContact()
    if (s.name) setName(s.name)
    if (s.phone) setPhone(s.phone)
    if (s.location) setLocation(s.location)
  }, [open, name, phone, location])

  const trimmedMessage = message.trim()
  const trimmedName = name.trim()
  const trimmedPhone = phone.trim()
  const trimmedLocation = location.trim()

  const phoneDigits = trimmedPhone.replace(/\D/g, '')
  const phoneLooksValid =
    trimmedPhone.length === 0 || (phoneDigits.length >= 7 && phoneDigits.length <= 20)

  const canSubmit =
    !busy &&
    trimmedMessage.length > 0 &&
    trimmedName.length > 0 &&
    trimmedPhone.length > 0 &&
    trimmedLocation.length > 0 &&
    phoneLooksValid

  const submit = async () => {
    if (!canSubmit) return
    if (trimmedMessage.length > 1500) {
      toast.error('Message is too long — please keep it under 1500 characters.')
      return
    }
    setBusy(true)
    try {
      const r = await fetch('/api/license/report-issue', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmedMessage,
          context,
          reporterName: trimmedName,
          reporterPhone: trimmedPhone,
          reporterLocation: trimmedLocation,
        }),
      })
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (r.ok && j.ok) {
        toast.success('Report sent — thank you. The operator has been notified.')
        // Persist contact details so next submission is one-click.
        saveContact({ name: trimmedName, phone: trimmedPhone, location: trimmedLocation })
        setMessage('')
        // Auto-close so the user gets out of the way of their work
        // but with enough delay that they read the success toast.
        setTimeout(() => setOpen(false), 1200)
      } else {
        // Map the server's distinct error codes to actionable messages
        // so the user knows which field to fix.
        const map: Record<string, string> = {
          name_required: 'Please enter your name.',
          phone_required: 'Please enter a phone number we can reach you on.',
          phone_invalid: 'That phone number does not look right — please re-enter it.',
          location_required: 'Please enter your location (city / town).',
          message_required: 'Please describe the issue.',
          message_too_long: 'Message is too long — please keep it under 1500 characters.',
        }
        toast.error(map[j.error ?? ''] || j.error || 'Could not send report — try again or contact support.')
      }
    } catch {
      toast.error('Network error — please check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(
          'h-7 gap-1 text-[10px] uppercase tracking-wider',
          compact ? 'px-2' : 'px-2.5',
          className,
        )}
        onClick={() => setOpen(true)}
        title="Report an issue to the operator"
      >
        <Flag className="h-3 w-3" />
        {!compact && <span>Report Issue</span>}
      </Button>
      <Dialog open={open} onOpenChange={(o) => { if (!busy) setOpen(o) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flag className="h-4 w-4 text-rose-400" /> Report an Issue
            </DialogTitle>
            <DialogDescription>
              Describe what went wrong, what you were doing, and what you expected to happen.
              The operator sees your report in their admin dashboard within ~10 seconds and
              can call or text you back at the number below.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); void submit() }}
            className="space-y-3"
          >
            {/* Compulsory contact fields — the operator needs these to follow up. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                  Name <span className="text-rose-400">*</span>
                </span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 120))}
                  placeholder="e.g. Kwame Mensah"
                  required
                  disabled={busy}
                  autoComplete="name"
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                />
              </label>
              <label className="space-y-1">
                <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                  Phone <span className="text-rose-400">*</span>
                </span>
                <input
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.slice(0, 40))}
                  placeholder="e.g. 024 555 1234"
                  required
                  disabled={busy}
                  autoComplete="tel"
                  aria-invalid={trimmedPhone.length > 0 && !phoneLooksValid}
                  className={cn(
                    'w-full rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2',
                    trimmedPhone.length > 0 && !phoneLooksValid
                      ? 'border-rose-500/60 focus:ring-rose-500/40'
                      : 'border-border focus:ring-violet-500/40',
                  )}
                />
              </label>
            </div>
            <label className="space-y-1 block">
              <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                Location (city / town, country) <span className="text-rose-400">*</span>
              </span>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value.slice(0, 160))}
                placeholder="e.g. Accra, Ghana"
                required
                disabled={busy}
                autoComplete="address-level2"
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              />
            </label>
            <label className="space-y-1 block">
              <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                What went wrong? <span className="text-rose-400">*</span>
              </span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 1500))}
                placeholder="e.g. The NDI output froze when I switched between Bible Lookup and Sermon Notes during the 9 a.m. service. App version 0.7.43, Windows 11."
                rows={5}
                className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                disabled={busy}
              />
            </label>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>
                {trimmedMessage.length === 0
                  ? 'All fields marked * are required.'
                  : `${trimmedMessage.length} / 1500 characters`}
              </span>
              <span className="opacity-70">context: {context}</span>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!canSubmit}
                className="gap-1.5"
              >
                {busy ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" /> Send Report
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
