'use client'

// v0.7.16 — In-app "Report an Issue" button.
//
// Lives in the TopToolbar (always visible, in every view). Opens an
// inline Dialog with a textarea + Send button. Posts to
// /api/license/report-issue, which forwards to the central telemetry
// /api/telemetry/error endpoint as errorType='user_report'.
//
// The lock-overlay version (in license/lock-overlay.tsx) was already
// shipped in v0.7.14 — this is the second surface, accessible to
// users whose subscription is active and who want to report a
// problem without having to find SMTP / WhatsApp.
//
// Behaviour:
//   • 1500-char cap (matches the API's clamp). Live counter.
//   • 'context' is set to "topbar:<view>" so the admin can tell at
//     a glance whether the user reported from the lock overlay or
//     from the live app.
//   • Success toast + auto-close after 1.5s.
//   • Failure toast — message stays in the textarea so the user
//     can copy/retry.

import { useState } from 'react'
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
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const m = message.trim()
    if (!m) return
    if (m.length > 1500) {
      toast.error('Message is too long — please keep it under 1500 characters.')
      return
    }
    setBusy(true)
    try {
      const r = await fetch('/api/license/report-issue', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: m, context }),
      })
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (r.ok && j.ok) {
        toast.success('Report sent — thank you. The operator has been notified.')
        setMessage('')
        // Auto-close so the user gets out of the way of their work
        // but with enough delay that they read the success toast.
        setTimeout(() => setOpen(false), 1200)
      } else {
        toast.error(j.error || 'Could not send report — try again or contact support.')
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
              The operator sees your report in their admin dashboard within ~10 seconds.
              Your install ID and app version are attached automatically — no need to retype them.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 1500))}
              placeholder="e.g. The NDI output froze when I switched between Bible Lookup and Sermon Notes during the 9 a.m. service. App version 0.7.16, Windows 11."
              rows={6}
              className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              disabled={busy}
              autoFocus
            />
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>
                {message.length === 0
                  ? 'Required — at least one character.'
                  : `${message.length} / 1500 characters`}
              </span>
              <span className="opacity-70">context: {context}</span>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
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
              type="button"
              size="sm"
              disabled={busy || message.trim().length === 0}
              onClick={submit}
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
        </DialogContent>
      </Dialog>
    </>
  )
}
