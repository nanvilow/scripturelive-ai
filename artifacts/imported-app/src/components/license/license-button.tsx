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

import { useEffect, useRef, useState } from 'react'
import { Sparkles, ShieldCheck, Lock } from 'lucide-react'
import { useLicense } from './license-provider'
import { useAppStore } from '@/lib/store'
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

// v0.7.10 — Activity-gated DISPLAYED countdown (was wall-clock based).
//
// Pre-v0.7.10 bug: the badge's per-second counter advanced regardless
// of whether the mic was actually running. The server-side budget
// (`trialMsUsed`) only grows while listening, so the displayed
// countdown was disconnected from reality:
//
//   • User opens app idle  → badge shows 60:00, ticks to 59:30 over
//     30 s of just looking at it.
//   • User closes / reopens → badge shows 60:00 again (because the
//     real counter on disk is still 0 — they never listened).
//   • Operator concludes "the trial timer reset on app exit" — but
//     functionally nothing was ever consumed; only the lying display
//     made it look that way.
//
// Fix: we still want a smooth 1 Hz tick while the user is genuinely
// using the trial (so they see the badge counting down in real time
// instead of waiting 30 s for the next status poll), but the moment
// the mic stops the displayed value FREEZES on the last server
// snapshot and stays put until detection resumes. App exit/reopen
// thus restores the badge to the same value the user saw when they
// last stopped — which matches what the persisted `trialMsUsed`
// implies and matches operator expectation.
// v0.7.78 — Operator request: the "AI Active — Xd Yh Zm" pill looked
// frozen because the underlying status snapshot only re-polls every
// 30 s and the displayed string only changes once per minute, so an
// operator staring at the badge sees no movement and concludes the
// timer has stalled. Unlike the trial counter (which is mic-gated
// because the SERVER budget is mic-gated), an active subscription
// drains by wall-clock — every real second is gone whether the mic
// is on or not — so we tick the displayed value down at 1 Hz
// unconditionally and re-anchor on every server snapshot. Master
// licences are exempt because they have no countdown to show.
function useTickingSubMsLeft(serverMsLeft: number, isActive: boolean, isMaster: boolean): number {
  const baseRef = useRef<number>(serverMsLeft)
  const [displayed, setDisplayed] = useState<number>(serverMsLeft)

  useEffect(() => {
    baseRef.current = serverMsLeft
    setDisplayed(serverMsLeft)
  }, [serverMsLeft])

  useEffect(() => {
    if (!isActive || isMaster) return
    const start = Date.now()
    const id = setInterval(() => {
      const elapsed = Date.now() - start
      setDisplayed(Math.max(0, baseRef.current - elapsed))
    }, 1000)
    return () => clearInterval(id)
  }, [isActive, isMaster, serverMsLeft])

  return displayed
}

// v0.7.78 — Companion formatter for the active-subscription pill.
// Above one hour we keep the compact "Xd Yh Zm" form because
// second-precision is irrelevant at that scale. UNDER one hour we
// switch to "MM:SS" so the operator sees the badge tick down each
// second in the final stretch of their licence — which makes the
// "is it actually counting?" question self-evidently yes.
function formatSubCountdown(msLeft: number, isMaster: boolean): string {
  if (isMaster) return '∞'
  const safeMs = Math.max(0, msLeft)
  const totalSecs = Math.floor(safeMs / 1000)
  const days = Math.floor(totalSecs / 86400)
  const hours = Math.floor((totalSecs % 86400) / 3600)
  const mins = Math.floor((totalSecs % 3600) / 60)
  const secs = totalSecs % 60
  if (days >= 1 || hours >= 1) return `${days}d ${hours}h ${mins}m`
  // Under one hour — show MM:SS so the operator sees movement.
  const mm = String(mins).padStart(2, '0')
  const ss = String(secs).padStart(2, '0')
  return `${mm}:${ss}`
}

function useTickingTrialMsLeft(serverMsLeft: number, isTrial: boolean, isListening: boolean): number | null {
  const baseRef = useRef<number>(serverMsLeft)
  const [displayed, setDisplayed] = useState<number>(serverMsLeft)

  // Re-anchor on every server snapshot. Status polls land every 30 s
  // and trial-tick responses land every 5 s while listening, so the
  // displayed value never drifts more than a few seconds from disk.
  useEffect(() => {
    baseRef.current = serverMsLeft
    setDisplayed(serverMsLeft)
  }, [serverMsLeft])

  // Tick the displayed value down at 1 Hz, but only while the mic is
  // actually running. When stopped, the last setDisplayed() call
  // sticks and the badge freezes.
  useEffect(() => {
    if (!isTrial || !isListening) return
    const start = Date.now()
    const id = setInterval(() => {
      const elapsed = Date.now() - start
      setDisplayed(Math.max(0, baseRef.current - elapsed))
    }, 1000)
    return () => clearInterval(id)
  }, [isTrial, isListening, serverMsLeft])

  if (!isTrial) return null
  return displayed
}

interface Props {
  variant?: 'inline' | 'floating'
}

export function LicenseTopBarButton({ variant = 'inline' }: Props) {
  const { status, isActive, isTrial, openSubscribe } = useLicense()
  // v0.7.10 — Trial counter only ticks while mic is actively running.
  // Pulls isListening from the global store (set by SpeechProvider on
  // start/stop) so a stopped detection visibly freezes the badge.
  const isListening = useAppStore((s) => s.isListening)
  const tickingMsLeft = useTickingTrialMsLeft(status.trial?.msLeft ?? 0, isTrial, isListening)
  // v0.7.78 — Hook called unconditionally (Rules of Hooks). The
  // ticking value is only RENDERED in the active-subscription branch
  // below, but we must invoke the hook on every render or React
  // throws "Rendered more hooks than during the previous render"
  // when the licence transitions trial → active.
  const isMasterFlag = status.isMaster ?? false
  const tickingSubMs = useTickingSubMsLeft(status.msLeft ?? 0, isActive && !isTrial, isMasterFlag)

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
    // v0.7.78 — Tick the displayed value at 1 Hz between server
    // snapshots so the badge visibly counts down (operators were
    // reading the static minute-level string as "frozen"). Switches
    // to MM:SS in the final hour so the per-second motion is
    // unmistakable.
    const isMaster = isMasterFlag
    const compact = formatSubCountdown(tickingSubMs, isMaster)
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
        title={
          isListening
            ? "You're on the 1-hour free trial. Counter only runs while detecting. Click to activate a subscription."
            : "Trial paused — counter is frozen until you start detecting. Click to activate a subscription."
        }
      >
        <Sparkles className="h-3 w-3" />
        Trial — {formatTrial(tickingMsLeft ?? status.trial.msLeft)}
        {!isListening && ' (paused)'} · Activate
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
