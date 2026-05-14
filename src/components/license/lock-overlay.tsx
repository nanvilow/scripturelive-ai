'use client'

// v1 licensing — Live Transcription column lock overlay.
//
// Renders an absolute-positioned curtain over its parent Card when the
// subscription is not active. The parent (the Live Transcription card)
// is `relative`-positioned by default in the LogosShell layout (the
// `<section>` in the Card primitive uses overflow-hidden). We add
// `relative` defensively in case the Card primitive ever changes.
//
// Two visual states:
//   • trial_expired / never_activated — soft amber, "Free trial ended,
//     activate to continue"
//   • expired — red, "Subscription expired"
// Both surfaces a single CTA that opens the Subscribe modal.
//
// v0.7.17 — Activation UI cleanup:
//   • Removed the "Cancel" / "Cancel Subscription" button. Operators
//     can still cancel from Settings → Subscription → Deactivate; the
//     lock screen is the wrong place to advertise it (every cancel
//     click here was an accidental "I just wanted out of this dialog"
//     that nuked their subscription).
//   • Removed the "Have a reference code?" inline form. Reference
//     codes are now entered exclusively from the Subscribe modal,
//     which already has a dedicated input for them — keeping two
//     surfaces in sync was confusing operators reading the customer
//     a code over the phone.
//   • The "Report an issue" entry button is always visible (no toggle
//     switch needed) and opening it now pops a real Dialog modal with
//     a textarea — easier to read what you're typing on a small
//     church-PC screen than the cramped inline form. Submit posts to
//     /api/license/report-issue (telemetry → admin Records dashboard,
//     same backend as v0.7.14).

import { Lock, Sparkles, Flag, Loader2, Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLicense } from './license-provider'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export function LiveTranscriptionLockOverlay() {
  const { status, openSubscribe, isLocked } = useLicense()
  // v0.7.17 — Report Issue dialog state. Self-contained: open/value/
  // busy/sent flags are all local because nothing else in the app
  // needs to drive this surface.
  // v0.7.43 — Name/phone/location are now compulsory. Fields persist
  // in localStorage between submissions (key shared with the topbar
  // ReportIssueButton via the 'sl.reportContact.v1' key) so a
  // returning user only types their contact details once.
  const [reportOpen, setReportOpen] = useState(false)
  const [reportValue, setReportValue] = useState('')
  const [reportName, setReportName] = useState('')
  const [reportPhone, setReportPhone] = useState('')
  const [reportLocation, setReportLocation] = useState('')
  const [reportBusy, setReportBusy] = useState(false)
  const [reportSent, setReportSent] = useState(false)
  if (!isLocked) return null

  const expired = status.state === 'expired'
  const palette = expired
    ? {
        ring: 'ring-rose-500/40 bg-rose-950/40',
        badge: 'bg-rose-500/20 text-rose-200 border-rose-500/40',
        button: 'bg-rose-600 hover:bg-rose-500 text-white border-rose-400',
        icon: <Lock className="h-7 w-7" />,
      }
    : {
        ring: 'ring-amber-500/40 bg-amber-950/40',
        badge: 'bg-amber-500/20 text-amber-200 border-amber-500/40',
        button: 'bg-amber-500 hover:bg-amber-400 text-amber-950 border-amber-300',
        icon: <Sparkles className="h-7 w-7" />,
      }

  const title = expired ? 'Subscription Expired' : 'Free Trial Ended'
  // v0.6.0 — operator reverted the v0.5.57 paywall copy: NO direct
  // MoMo recipient/number text on the lock screen. Generic call to
  // action only; the recipient details live exclusively inside the
  // Activate modal (which the customer reaches via the button below).
  const subtitle = expired
    ? 'Your activation has expired. Tap Activate to enter your code.'
    : 'Your 1-hour free trial has ended. Tap Activate to enter your code.'

  // v0.7.43 — Restore saved contact details whenever the dialog opens
  // (and only if the fields are blank — don't overwrite mid-edit
  // values). Shares the 'sl.reportContact.v1' localStorage key with
  // the topbar ReportIssueButton so users only type contact info once
  // for the whole app.
  useEffect(() => {
    if (!reportOpen) return
    if (reportName || reportPhone || reportLocation) return
    try {
      if (typeof window === 'undefined') return
      const raw = window.localStorage.getItem('sl.reportContact.v1')
      if (!raw) return
      const s = JSON.parse(raw) as { name?: string; phone?: string; location?: string }
      if (typeof s.name === 'string' && s.name) setReportName(s.name)
      if (typeof s.phone === 'string' && s.phone) setReportPhone(s.phone)
      if (typeof s.location === 'string' && s.location) setReportLocation(s.location)
    } catch {
      /* ignore — storage may be disabled */
    }
  }, [reportOpen, reportName, reportPhone, reportLocation])

  const trimmedReport = reportValue.trim()
  const trimmedReportName = reportName.trim()
  const trimmedReportPhone = reportPhone.trim()
  const trimmedReportLocation = reportLocation.trim()
  const reportPhoneDigits = trimmedReportPhone.replace(/\D/g, '')
  const reportPhoneLooksValid =
    trimmedReportPhone.length === 0 ||
    (reportPhoneDigits.length >= 7 && reportPhoneDigits.length <= 20)
  const canSubmitReport =
    !reportBusy &&
    trimmedReport.length > 0 &&
    trimmedReportName.length > 0 &&
    trimmedReportPhone.length > 0 &&
    trimmedReportLocation.length > 0 &&
    reportPhoneLooksValid

  const submitReport = async () => {
    if (!canSubmitReport) return
    setReportBusy(true)
    try {
      const r = await fetch('/api/license/report-issue', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmedReport,
          context: `lock-overlay:${status.state}`,
          reporterName: trimmedReportName,
          reporterPhone: trimmedReportPhone,
          reporterLocation: trimmedReportLocation,
        }),
      })
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (r.ok && j.ok) {
        // Persist contact details so next submission is one-click.
        try {
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(
              'sl.reportContact.v1',
              JSON.stringify({
                name: trimmedReportName,
                phone: trimmedReportPhone,
                location: trimmedReportLocation,
              }),
            )
          }
        } catch { /* ignore */ }
        // Close the modal first so the success badge below the
        // Activate button can surface (which auto-clears after 6s).
        setReportSent(true)
        setReportValue('')
        setReportOpen(false)
        setTimeout(() => setReportSent(false), 6000)
      } else {
        const map: Record<string, string> = {
          name_required: 'Please enter your name.',
          phone_required: 'Please enter a phone number we can reach you on.',
          phone_invalid: 'That phone number does not look right — please re-enter it.',
          location_required: 'Please enter your location (city / town).',
          message_required: 'Please describe the issue.',
        }
        toast.error(map[j.error ?? ''] || 'Could not send report — try again or contact support.')
      }
    } catch {
      toast.error('Network error — could not reach the licensing service.')
    } finally {
      setReportBusy(false)
    }
  }

  return (
    <>
      <div
        className={cn(
          'absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center',
          'backdrop-blur-md bg-background/70 ring-1 ring-inset',
          palette.ring,
        )}
        role="dialog"
        aria-label="Live Transcription locked"
      >
        <span className={cn('inline-flex items-center justify-center h-14 w-14 rounded-full border', palette.badge)}>
          {palette.icon}
        </span>
        <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
        <p className="mt-1.5 max-w-sm text-[12px] text-foreground leading-relaxed">{subtitle}</p>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={openSubscribe}
            className={cn(
              'inline-flex items-center gap-2 h-9 px-4 rounded-md text-[11px] font-semibold uppercase tracking-wider',
              'border shadow-lg transition-colors',
              palette.button,
            )}
          >
            <Lock className="h-3.5 w-3.5" />
            Activate AI Detection Now
          </button>
        </div>

        {/* v0.7.17 — Report an Issue is the ONLY secondary affordance
            on the lock screen now. Always visible (no toggle), and
            opens a proper Dialog modal instead of an inline form so
            users have room to actually describe the problem. The
            "sent" badge replaces the button briefly after a successful
            submit and self-clears after 6s so the overlay returns to
            its calm default state. */}
        <div className="mt-4 w-full max-w-sm">
          {reportSent ? (
            <div className="text-[10px] font-medium uppercase tracking-wider text-emerald-300 inline-flex items-center gap-1.5">
              <Check className="h-3 w-3" />
              Sent — thank you. The operator has been notified.
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            >
              <Flag className="h-3.5 w-3.5" />
              Report an Issue
            </button>
          )}
        </div>

        <p className="mt-4 text-[10px] text-muted-foreground">
          ScriptureLive AI helps churches display scripture instantly without typing.<br />
          Activate today and transform your worship experience.
        </p>
      </div>

      {/* v0.7.17 — Report Issue dialog. Submits to the same
          /api/license/report-issue endpoint the v0.7.14 inline form
          used; only the surface changed. Tagged with
          context="lock-overlay:<state>" so the admin Records dashboard
          can tell where the report came from (vs. the topbar Report
          button shipped in v0.7.16). */}
      <Dialog
        open={reportOpen}
        onOpenChange={(open) => {
          if (!reportBusy) {
            setReportOpen(open)
            if (!open) setReportValue('')
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flag className="h-4 w-4 text-violet-500" />
              Report an Issue
            </DialogTitle>
            <DialogDescription>
              Describe what you&rsquo;re seeing and the operator will be notified
              right away. Include any error message, what you were doing, and
              your activation code or phone number if relevant.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void submitReport()
            }}
            className="flex flex-col gap-3"
          >
            {/* v0.7.43 — Compulsory contact fields, so the operator can
                follow up by phone. Restored from localStorage on
                re-open so returning users only type these once. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                  Name <span className="text-rose-400">*</span>
                </span>
                <input
                  type="text"
                  value={reportName}
                  onChange={(e) => setReportName(e.target.value.slice(0, 120))}
                  placeholder="e.g. Kwame Mensah"
                  required
                  disabled={reportBusy}
                  autoComplete="name"
                  className="w-full px-3 py-1.5 rounded-md text-sm bg-background border border-input focus:outline-none focus:ring-2 focus:ring-ring text-foreground placeholder:text-muted-foreground/60 disabled:opacity-60"
                />
              </label>
              <label className="space-y-1">
                <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                  Phone <span className="text-rose-400">*</span>
                </span>
                <input
                  type="tel"
                  inputMode="tel"
                  value={reportPhone}
                  onChange={(e) => setReportPhone(e.target.value.slice(0, 40))}
                  placeholder="e.g. 024 555 1234"
                  required
                  disabled={reportBusy}
                  autoComplete="tel"
                  aria-invalid={trimmedReportPhone.length > 0 && !reportPhoneLooksValid}
                  className={cn(
                    'w-full px-3 py-1.5 rounded-md text-sm bg-background border focus:outline-none focus:ring-2 text-foreground placeholder:text-muted-foreground/60 disabled:opacity-60',
                    trimmedReportPhone.length > 0 && !reportPhoneLooksValid
                      ? 'border-rose-500/60 focus:ring-rose-500/40'
                      : 'border-input focus:ring-ring',
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
                value={reportLocation}
                onChange={(e) => setReportLocation(e.target.value.slice(0, 160))}
                placeholder="e.g. Accra, Ghana"
                required
                disabled={reportBusy}
                autoComplete="address-level2"
                className="w-full px-3 py-1.5 rounded-md text-sm bg-background border border-input focus:outline-none focus:ring-2 focus:ring-ring text-foreground placeholder:text-muted-foreground/60 disabled:opacity-60"
              />
            </label>
            <label className="space-y-1 block">
              <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                What went wrong? <span className="text-rose-400">*</span>
              </span>
              <textarea
                value={reportValue}
                onChange={(e) => setReportValue(e.target.value.slice(0, 1500))}
                placeholder="e.g. Paid via MoMo 2 hours ago, no activation SMS yet."
                rows={5}
                disabled={reportBusy}
                className="w-full px-3 py-2 rounded-md text-sm bg-background border border-input focus:outline-none focus:ring-2 focus:ring-ring text-foreground placeholder:text-muted-foreground/60 resize-none disabled:opacity-60"
              />
            </label>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground font-mono">
                {reportValue.length} / 1500
              </span>
              <span className="text-[10px] text-muted-foreground">
                All fields marked * are required.
              </span>
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <button
                type="button"
                onClick={() => {
                  setReportOpen(false)
                  setReportValue('')
                }}
                disabled={reportBusy}
                className="inline-flex items-center justify-center h-9 px-4 rounded-md text-xs font-semibold uppercase tracking-wider border border-border bg-background hover:bg-muted text-foreground disabled:opacity-50"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={!canSubmitReport}
                className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-md text-xs font-semibold uppercase tracking-wider bg-violet-600 hover:bg-violet-500 text-white border border-violet-400/40 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {reportBusy ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Sending…
                  </>
                ) : (
                  'Send Report'
                )}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
