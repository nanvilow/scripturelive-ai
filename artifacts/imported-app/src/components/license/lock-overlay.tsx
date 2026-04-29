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
// v0.7.7 — Operator request: there must be a discoverable way for
// users to cancel/stop their subscription right beside the activate
// button. We add a secondary "Cancel Subscription" button that posts
// to /api/license/deactivate after a confirm prompt. It's visible in
// every locked state — when no active sub exists it serves as the
// "exit" affordance (closes any in-flight activation attempt and
// confirms there is nothing to cancel).

import { Lock, Sparkles, XCircle, KeyRound, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useLicense } from './license-provider'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export function LiveTranscriptionLockOverlay() {
  const { status, openSubscribe, isLocked, refresh } = useLicense()
  const [cancelling, setCancelling] = useState(false)
  // v0.7.8 — "Have a reference code?" inline form. Operator can
  // mint a short-lived (≈30-min) reference code from the Admin
  // panel and read it to a customer over WhatsApp / phone. The
  // customer types it here and AI Detection unlocks immediately.
  // Posts to /api/license/activate-reference; refresh()es on
  // success so the lock overlay disappears.
  const [refOpen, setRefOpen] = useState(false)
  const [refValue, setRefValue] = useState('')
  const [refBusy, setRefBusy] = useState(false)
  if (!isLocked) return null

  const hasSub = !!status.activeSubscription
  const cancelLabel = hasSub ? 'Cancel Subscription' : 'Cancel'

  const handleCancel = async () => {
    const ok = window.confirm(
      hasSub
        ? 'Cancel your active subscription? Live Transcription will stop on this PC.\n\nYour activation code is released — you can re-enter it later on this or any other PC and the SAME remaining time will be restored (provided it has not expired).'
        : 'You have no active subscription to cancel. This will clear any pending activation state on this PC. Continue?'
    )
    if (!ok) return
    setCancelling(true)
    try {
      const r = await fetch('/api/license/deactivate', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
      })
      if (r.ok) {
        toast.success(hasSub ? 'Subscription cancelled.' : 'Cleared.')
        await refresh()
      } else {
        const j = (await r.json().catch(() => ({}))) as { error?: string }
        toast.error(j.error || 'Could not cancel — try again or contact support.')
      }
    } catch {
      toast.error('Network error — could not reach the licensing service.')
    } finally {
      setCancelling(false)
    }
  }

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

  const title = expired
    ? 'Subscription Expired'
    : 'Free Trial Ended'
  // v0.6.0 — operator reverted the v0.5.57 paywall copy: NO direct
  // MoMo recipient/number text on the lock screen. Generic call to
  // action only; the recipient details live exclusively inside the
  // Activate modal (which the customer reaches via the button below).
  const subtitle = expired
    ? 'Your activation has expired. Tap Activate to enter your code.'
    : 'Your 1-hour free trial has ended. Tap Activate to enter your code.'

  return (
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
        <button
          type="button"
          onClick={handleCancel}
          disabled={cancelling}
          className={cn(
            'inline-flex items-center gap-2 h-9 px-4 rounded-md text-[11px] font-semibold uppercase tracking-wider',
            'border shadow-lg transition-colors',
            'border-rose-500/40 bg-rose-950/30 text-rose-200 hover:bg-rose-900/40 hover:text-rose-100',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          <XCircle className="h-3.5 w-3.5" />
          {cancelling ? 'Cancelling…' : cancelLabel}
        </button>
      </div>

      <div className="mt-3 w-full max-w-sm">
        {!refOpen ? (
          <button
            type="button"
            onClick={() => setRefOpen(true)}
            className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground underline-offset-2 hover:underline inline-flex items-center gap-1.5"
          >
            <KeyRound className="h-3 w-3" />
            Have a reference code?
          </button>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              const code = refValue.trim()
              if (!code || refBusy) return
              setRefBusy(true)
              try {
                const r = await fetch('/api/license/activate-reference', {
                  method: 'POST',
                  cache: 'no-store',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ code }),
                })
                const j = (await r.json().catch(() => ({}))) as { error?: string; ok?: boolean }
                if (r.ok && j.ok) {
                  toast.success('Reference code accepted — AI Detection unlocked.')
                  setRefValue('')
                  setRefOpen(false)
                  await refresh()
                } else {
                  toast.error(j.error || 'Could not validate the reference code.')
                }
              } catch {
                toast.error('Network error — could not reach the licensing service.')
              } finally {
                setRefBusy(false)
              }
            }}
            className="flex items-center gap-1.5"
          >
            <input
              type="text"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              value={refValue}
              onChange={(e) => setRefValue(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX"
              maxLength={9}
              className="flex-1 h-8 px-2.5 rounded-md text-[12px] font-mono uppercase tracking-widest bg-background/80 border border-border focus:outline-none focus:ring-1 focus:ring-emerald-400 text-foreground placeholder:text-muted-foreground/50"
            />
            <button
              type="submit"
              disabled={refBusy || !refValue.trim()}
              className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-[10px] font-semibold uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400/40 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {refBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Unlock'}
            </button>
            <button
              type="button"
              onClick={() => { setRefOpen(false); setRefValue('') }}
              className="text-[10px] text-muted-foreground hover:text-foreground px-1.5"
            >
              ×
            </button>
          </form>
        )}
      </div>

      <p className="mt-4 text-[10px] text-muted-foreground">
        ScriptureLive AI helps churches display scripture instantly without typing.<br />
        Activate today and transform your worship experience.
      </p>
    </div>
  )
}
