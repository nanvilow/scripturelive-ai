'use client'

// v0.7.19 — One-time welcome dialog for first-time users.
//
// Operator request: "Can you make quick one-time pop-up [that] shows
// welcoming new users for the first time using the app and thanking
// them for choosing it?"
//
// Behavior
//   - On mount, look up `localStorage[WELCOME_SEEN_KEY]`.
//   - If absent → show the dialog. When the user clicks "Get started"
//     (or closes the dialog any other way), persist the flag so we
//     never show it again on this machine.
//   - If present → render nothing.
//
// Why localStorage and not the licensing/storage.ts firstLaunchAt:
//   - This is a UI-only "have you seen the welcome screen" gate; it
//     should be PER-BROWSER-PROFILE / PER-MACHINE rather than tied to
//     the operator's license.json (which lives at ~/.scripturelive
//     and persists across uninstalls). If the operator wipes their
//     browser profile / Electron userData and reinstalls, they've
//     effectively asked for a fresh welcome and should see it again.
//   - localStorage is also synchronous and SSR-safe (we guard with a
//     `typeof window` check), so we avoid any flash-of-dialog while a
//     server-side fetch resolves.
//
// Versioned key (`...-v1`) so we can re-show the welcome to existing
// users in the future when the welcome copy itself materially changes
// (e.g. bumping to ...-v2 will re-trigger for everyone).

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
import { Sparkles } from 'lucide-react'
import { WEBSITE_URL } from '@/lib/website-url'

const WELCOME_SEEN_KEY = 'scripturelive-welcome-seen-v1'

export function WelcomeDialog() {
  // Default-closed so server render and the first client render agree
  // (no hydration mismatch). The effect below opens it on the next
  // tick if the storage flag is absent.
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const seen = window.localStorage.getItem(WELCOME_SEEN_KEY)
      if (!seen) setOpen(true)
    } catch {
      // localStorage can throw in private-browsing / disabled-storage
      // modes. In that case we just don't show the welcome — better
      // than crashing the providers tree on an obscure config.
    }
  }, [])

  // Persist the "seen" flag any time the dialog transitions to closed.
  // Routing it through the open-change handler covers every dismiss
  // path (button click, Esc key, click-outside, swipe close).
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      try {
        window.localStorage.setItem(WELCOME_SEEN_KEY, new Date().toISOString())
      } catch {
        // Same rationale as above — silent ignore, we just won't have
        // persisted the dismissal. Worst case the user sees the
        // welcome once more on next launch.
      }
    }
    setOpen(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <DialogTitle className="text-center text-lg">
            Welcome to ScriptureLive AI
          </DialogTitle>
          <DialogDescription className="text-center">
            Thank you for choosing ScriptureLive AI for your church or ministry.
            We&rsquo;re honoured to serve alongside you.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 px-1 py-2 text-sm text-muted-foreground">
          <p>You&rsquo;re all set up. From here you can:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Start <span className="text-foreground">Live Detection</span> to
              auto-display Bible verses as your preacher speaks.
            </li>
            <li>
              Look up scripture, build slides, and manage worship lyrics from the
              left sidebar.
            </li>
            <li>
              Open <span className="text-foreground">Settings</span> any time to
              tune your translation, output screen, and engine preferences.
            </li>
          </ul>
          <p className="pt-2 text-xs">
            You&rsquo;re on a free trial &mdash; enjoy full access while you
            evaluate. You can subscribe anytime from the Activate button.
          </p>
          <p className="text-xs">
            Need pricing, contact, or system requirements to share with your
            pastor or IT lead? Visit{' '}
            <a
              href={WEBSITE_URL}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline-offset-2 hover:underline"
            >
              our website
            </a>
            .
          </p>
        </div>
        <DialogFooter className="sm:justify-center">
          <Button onClick={() => handleOpenChange(false)} className="min-w-[10rem]">
            Get started
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
