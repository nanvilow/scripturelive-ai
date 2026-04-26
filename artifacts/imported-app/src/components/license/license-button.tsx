'use client'

// v1 licensing — top-bar floating Activate / countdown button.
//
// Shape:  fixed top-right, above the LogosShell. We intentionally use
// fixed positioning instead of editing the Card-row layout in
// logos-shell.tsx so the licensing UI is fully decoupled from the
// console layout and trivially removable. z-30 sits above the cards
// but below modals (z-50).

import { Sparkles, ShieldCheck, Lock } from 'lucide-react'
import { useLicense } from './license-provider'
import { cn } from '@/lib/utils'

function formatTrial(msLeft: number): string {
  const mins = Math.floor(msLeft / 60_000)
  if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`
  if (mins >= 1) return `${mins} min`
  return `${Math.max(0, Math.floor(msLeft / 1000))}s`
}

export function LicenseTopBarButton() {
  const { status, isActive, isTrial, openSubscribe } = useLicense()

  if (status.state === 'unknown') return null

  // ── Active subscription ────────────────────────────────────────────
  if (isActive && !isTrial) {
    const days = status.daysLeft
    const label = status.isMaster
      ? 'AI Detection Active — Master'
      : `AI Detection Active — ${days} Day${days === 1 ? '' : 's'} Left`
    return (
      <button
        type="button"
        onClick={openSubscribe}
        className={cn(
          'fixed top-2 right-2 z-40',
          'inline-flex items-center gap-2 h-8 px-3 rounded-md text-[11px] font-semibold uppercase tracking-wider',
          'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/40',
          'border border-emerald-400/40',
          'transition-colors',
        )}
        title={status.activeSubscription?.expiresAt
          ? `Subscription expires ${new Date(status.activeSubscription.expiresAt).toLocaleString()}`
          : 'Subscription active'}
      >
        <ShieldCheck className="h-3.5 w-3.5" />
        {label}
      </button>
    )
  }

  // ── Trial (1 hour countdown) ───────────────────────────────────────
  if (isTrial) {
    return (
      <button
        type="button"
        onClick={openSubscribe}
        className={cn(
          'fixed top-2 right-2 z-40',
          'inline-flex items-center gap-2 h-8 px-3 rounded-md text-[11px] font-semibold uppercase tracking-wider',
          'bg-amber-500 hover:bg-amber-400 text-amber-950 shadow-lg shadow-amber-900/40',
          'border border-amber-300/60',
          'transition-colors',
        )}
        title="You're on the 1-hour free trial. Click to activate a subscription."
      >
        <Sparkles className="h-3.5 w-3.5" />
        Free trial — {formatTrial(status.trial.msLeft)} left · Activate now
      </button>
    )
  }

  // ── Expired / never activated ─────────────────────────────────────
  return (
    <button
      type="button"
      onClick={openSubscribe}
      className={cn(
        'fixed top-2 right-2 z-40',
        'inline-flex items-center gap-2 h-8 px-3 rounded-md text-[11px] font-semibold uppercase tracking-wider',
        'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/40',
        'border border-rose-400/40',
        'transition-colors',
      )}
      title="Live Transcription is locked. Click to activate."
    >
      <Lock className="h-3.5 w-3.5" />
      Activate AI Detection Now
    </button>
  )
}
