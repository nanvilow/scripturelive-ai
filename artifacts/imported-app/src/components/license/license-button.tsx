'use client'

// v1 licensing — Activate / countdown pill.
//
// v0.5.44 — moved from fixed top-right to INLINE inside TopToolbar
// (left side, right after the logo, with breathing room) per
// operator request. The component now accepts a single `variant`
// prop:
//   variant="inline"   (default in v0.5.44) — no fixed positioning,
//                      compact, designed to live inside the existing
//                      h-12 TopToolbar header.
//   variant="floating" — legacy fixed top-right behaviour, kept in
//                      case the operator wants the corner pill back.

import { Sparkles, ShieldCheck, Lock } from 'lucide-react'
import { useLicense } from './license-provider'
import { cn } from '@/lib/utils'

function formatTrial(msLeft: number): string {
  const mins = Math.floor(msLeft / 60_000)
  if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`
  if (mins >= 1) return `${mins} min`
  return `${Math.max(0, Math.floor(msLeft / 1000))}s`
}

interface Props {
  variant?: 'inline' | 'floating'
}

export function LicenseTopBarButton({ variant = 'inline' }: Props) {
  const { status, isActive, isTrial, openSubscribe } = useLicense()

  if (status.state === 'unknown') return null

  // Position class set ONCE; colour/icon/label vary per state below.
  const position =
    variant === 'floating'
      ? 'fixed top-2 right-2 z-40'
      : 'relative ml-2'

  // Inline variant uses the toolbar's compact 7px-tall affordances.
  // Floating variant keeps the older 32px pill so it stands out
  // against the underlying canvas when used as a corner badge.
  const sizing =
    variant === 'floating'
      ? 'h-8 px-3 text-[11px]'
      : 'h-7 px-2.5 text-[10.5px]'

  // ── Active subscription ────────────────────────────────────────────
  if (isActive && !isTrial) {
    const days = status.daysLeft
    const label = status.isMaster
      ? 'AI Active — Master'
      : `AI Active — ${days}d Left`
    return (
      <button
        type="button"
        onClick={openSubscribe}
        className={cn(
          position,
          'inline-flex items-center gap-1.5 rounded-md font-semibold uppercase tracking-wider',
          sizing,
          'bg-emerald-600 hover:bg-emerald-500 text-white shadow shadow-emerald-900/40',
          'border border-emerald-400/40',
          'transition-colors shrink-0',
        )}
        title={
          status.activeSubscription?.expiresAt
            ? `Subscription expires ${new Date(status.activeSubscription.expiresAt).toLocaleString()}`
            : 'Subscription active'
        }
      >
        <ShieldCheck className="h-3 w-3" />
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
          position,
          'inline-flex items-center gap-1.5 rounded-md font-semibold uppercase tracking-wider',
          sizing,
          'bg-amber-500 hover:bg-amber-400 text-amber-950 shadow shadow-amber-900/40',
          'border border-amber-300/60',
          'transition-colors shrink-0',
        )}
        title="You're on the 1-hour free trial. Click to activate a subscription."
      >
        <Sparkles className="h-3 w-3" />
        Trial — {formatTrial(status.trial.msLeft)} · Activate
      </button>
    )
  }

  // ── Expired / never activated ─────────────────────────────────────
  return (
    <button
      type="button"
      onClick={openSubscribe}
      className={cn(
        position,
        'inline-flex items-center gap-1.5 rounded-md font-semibold uppercase tracking-wider',
        sizing,
        'bg-rose-600 hover:bg-rose-500 text-white shadow shadow-rose-900/40',
        'border border-rose-400/40',
        'transition-colors shrink-0',
      )}
      title="Live Transcription is locked. Click to activate."
    >
      <Lock className="h-3 w-3" />
      Activate AI Detection Now
    </button>
  )
}
