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

import { useEffect, useState } from 'react'
import { Sparkles, ShieldCheck, Lock } from 'lucide-react'
import { useLicense } from './license-provider'
import { cn } from '@/lib/utils'
import {
  formatDaysHoursMinutes,
  formatDaysHoursMinutesShort,
} from '@/lib/format-duration'

// v0.5.50 — formatter now shows mm:ss when under one hour so the
// operator can SEE the trial countdown decrementing every second
// (previously rendered as static "31 min" until the next 30 s status
// poll). Above one hour we still use the compact "Xh Ym" form because
// second-precision is irrelevant at that scale.
function formatTrial(msLeft: number): string {
  const safeMs = Math.max(0, msLeft)
  const totalSecs = Math.floor(safeMs / 1000)
  const hours = Math.floor(totalSecs / 3600)
  const mins = Math.floor((totalSecs % 3600) / 60)
  const secs = totalSecs % 60
  if (hours >= 1) return `${hours}h ${mins}m`
  // Always pad to MM:SS so the badge width never jitters as the
  // counter ticks down through 9:59 → 9:58 → … → 0:00.
  const mm = String(mins).padStart(2, '0')
  const ss = String(secs).padStart(2, '0')
  return `${mm}:${ss}`
}

// v0.5.50 — second-resolution clock that re-renders this component
// every 1 s while a trial is in flight. Without this, the badge only
// updated on each 30 s status-poll tick, so operators thought the
// countdown was frozen. We compute msLeft locally as
// (expiresAt - now) so the displayed value is always current,
// regardless of how stale the server-snapshot msLeft is.
function useTickingTrialMsLeft(expiresAt: string | undefined, isTrial: boolean): number | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!isTrial || !expiresAt) return
    // Anchor the first tick on the next 1 s boundary so all running
    // license badges in the toolbar update in lockstep — looks
    // intentional rather than a stutter.
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [isTrial, expiresAt])
  if (!isTrial || !expiresAt) return null
  const ms = new Date(expiresAt).getTime() - now
  return Number.isFinite(ms) ? Math.max(0, ms) : 0
}

interface Props {
  variant?: 'inline' | 'floating'
}

export function LicenseTopBarButton({ variant = 'inline' }: Props) {
  const { status, isActive, isTrial, openSubscribe } = useLicense()
  // v0.5.50 — local 1 s clock so the trial countdown ticks visibly
  // instead of waiting for the next 30 s status poll.
  const tickingMsLeft = useTickingTrialMsLeft(status.trial?.expiresAt, isTrial)

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
    // v0.6.0 — show "Xd Yh Zm" countdown in the pill so operators
    // see the subscription draining in real time, not just integer
    // days. Long-form (e.g. "30 Days 12 Hours 45 Minutes Remaining")
    // is in the title tooltip on hover.
    const isMaster = status.isMaster ?? false
    const compact = formatDaysHoursMinutesShort(status.msLeft ?? 0, { master: isMaster })
    const longForm = formatDaysHoursMinutes(status.msLeft ?? 0, { master: isMaster })
    const label = isMaster ? 'AI Active — Master' : `AI Active — ${compact}`
    return (
      <button
        type="button"
        onClick={openSubscribe}
        className={cn(
          position,
          'inline-flex items-center gap-1.5 rounded-md font-semibold uppercase tracking-wider',
          sizing,
          'bg-sky-600 hover:bg-sky-500 text-white shadow shadow-sky-900/40',
          'border border-sky-300/50',
          'transition-colors shrink-0',
        )}
        title={
          status.activeSubscription?.expiresAt
            ? `${longForm} — expires ${new Date(status.activeSubscription.expiresAt).toLocaleString()}`
            : longForm
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
        Trial — {formatTrial(tickingMsLeft ?? status.trial.msLeft)} · Activate
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
