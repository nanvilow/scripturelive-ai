'use client'

// v0.7.122 — Activation success notification (USER side).
//
// Operator request: "the app currently does not send any notification
// when a user successfully activates a code. Implement a real-time
// notification system that alerts both the user and admin whenever a
// code is activated successfully."
//
// USER side (this component):
//
//   The activation flow in subscription-modal hard-reloads the app
//   the moment the API returns success (v0.7.101 chrome-error fix).
//   That means we cannot show a transient toast immediately after the
//   POST resolves — the renderer is being torn down. Instead, on the
//   FRESH page load that follows, license-provider polls /status,
//   sees a brand-new activeSubscription whose `activatedAt` is within
//   the last 5 minutes, and pops THIS dialog.
//
//   We persist the last-celebrated activation code in localStorage
//   under `sl-celebrated-activation` so the dialog only fires ONCE
//   per activation, not on every refresh / focus / status poll.
//
// ADMIN side: handled separately in admin-modal.tsx via a new
//   /api/license/admin/recent-activations polling banner.

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CheckCircle2 } from 'lucide-react'
import { useLicense } from './license-provider'

const STORAGE_KEY = 'sl-celebrated-activation'
/** Window after activation during which we still consider this a
 *  fresh activation worth celebrating on first load. 5 minutes is
 *  plenty for the hard-reload + cold-Next-render delay (typically
 *  3–8 s). Anything older almost certainly means a returning user
 *  on a cold boot — they don't need a confetti popup. */
const FRESH_WINDOW_MS = 5 * 60 * 1000

function lastCelebrated(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function markCelebrated(activationCode: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, activationCode)
  } catch {
    /* silent */
  }
}

export function ActivationSuccessDialog() {
  const { status } = useLicense()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (status.state !== 'active') return
    const sub = status.activeSubscription
    if (!sub) return
    // Skip masters — admin-issued infinite codes shouldn't pop a
    // celebratory "Welcome!" panel every time the operator launches
    // their own admin device.
    if (sub.isMaster) return

    const activatedAtMs = Date.parse(sub.activatedAt)
    if (!Number.isFinite(activatedAtMs)) return
    const ageMs = Date.now() - activatedAtMs
    if (ageMs > FRESH_WINDOW_MS) return // not a fresh activation — don't pop

    if (lastCelebrated() === sub.activationCode) return

    markCelebrated(sub.activationCode)
    setOpen(true)
  }, [status.state, status.activeSubscription])

  const sub = status.activeSubscription
  if (!sub) return null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="border-2 border-emerald-500/50 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
            Activation successful
          </DialogTitle>
          <DialogDescription>
            Your AI Detection subscription is now active. You can close this dialog and start your service.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5 rounded-md border border-border bg-muted/30 p-3 text-xs">
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Plan</span>
            <span className="font-mono text-foreground">{sub.planCode}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Days</span>
            <span className="font-mono text-foreground">{sub.days}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Code</span>
            <span className="font-mono text-foreground">{sub.activationCode}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Activated</span>
            <span className="text-foreground">{new Date(sub.activatedAt).toLocaleString()}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Expires</span>
            <span className="text-foreground">{new Date(sub.expiresAt).toLocaleString()}</span>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
