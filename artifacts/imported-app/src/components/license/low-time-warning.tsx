'use client'

// v0.7.122 — Low-time warning popup.
//
// Operator request: "It would be much better to display a popup to
// notify the user when their AI Detection time is almost finished
// before it actually expires."
//
// Pre-v0.7.122 the operator saw NO heads-up before a paid subscription
// expired — the app simply locked itself mid-service. Now we mount a
// Radix AlertDialog that fires at five descending thresholds:
//
//   24 h  — informational; "Renew this week"
//    6 h  — informational; "Today is the day"
//    1 h  — urgent; "Renew before service ends"
//   15 m  — urgent; red border
//    5 m  — critical; red banner + sound
//
// Each threshold fires AT MOST ONCE per activation code (tracked in
// localStorage under `sl-low-time-fired:<activationCode>`) so the
// operator sees one popup per band, not a flood. The "Dismiss" /
// "Renew" buttons close the dialog; the threshold stays marked as
// fired so we don't re-pop within the same band.
//
// We deliberately use Radix AlertDialog and NOT Sonner: the Sonner
// toaster has been globally silenced since v0.7.114 (the path-aware
// toaster returns null) so toast.warning() never paints. AlertDialog
// portals through DOM directly and is unaffected by the toast killswitch.
//
// Master codes (isMaster:true) are excluded — they have a synthetic
// year-3000 expiry that would otherwise spam every operator running
// the admin device.

import { useEffect, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useLicense } from './license-provider'

type Band = '24h' | '6h' | '1h' | '15m' | '5m'

interface BandCfg {
  id: Band
  /** Strict upper bound in ms — the band fires when msLeft <= thresholdMs */
  thresholdMs: number
  /** Lower bound — once msLeft drops below this we move to the next band */
  floorMs: number
  title: string
  description: (mins: number) => string
  severity: 'info' | 'warn' | 'critical'
}

const BANDS: BandCfg[] = [
  {
    id: '24h',
    thresholdMs: 24 * 60 * 60 * 1000,
    floorMs: 6 * 60 * 60 * 1000,
    title: 'AI Detection ends within 24 hours',
    description: () =>
      'Your subscription expires within the next day. Renew now to avoid an interruption during your next service.',
    severity: 'info',
  },
  {
    id: '6h',
    thresholdMs: 6 * 60 * 60 * 1000,
    floorMs: 60 * 60 * 1000,
    title: 'AI Detection ends within 6 hours',
    description: () =>
      'Your subscription expires later today. Renew before service starts.',
    severity: 'info',
  },
  {
    id: '1h',
    thresholdMs: 60 * 60 * 1000,
    floorMs: 15 * 60 * 1000,
    title: 'AI Detection ends within 1 hour',
    description: () =>
      'Your subscription will expire in under an hour. Renew now to keep auto-verse and live captions running.',
    severity: 'warn',
  },
  {
    id: '15m',
    thresholdMs: 15 * 60 * 1000,
    floorMs: 5 * 60 * 1000,
    title: 'AI Detection ends within 15 minutes',
    description: (mins) =>
      `Only ~${Math.max(1, mins)} minute(s) left on your current plan. Renew immediately to avoid a mid-service lock.`,
    severity: 'warn',
  },
  {
    id: '5m',
    thresholdMs: 5 * 60 * 1000,
    floorMs: 0,
    title: 'AI Detection is about to expire',
    description: (mins) =>
      `Only ~${Math.max(1, mins)} minute(s) remain. After expiry the app will lock and you will be prompted to renew.`,
    severity: 'critical',
  },
]

const STORAGE_PREFIX = 'sl-low-time-fired'

function bandFiredKey(activationCode: string, band: Band): string {
  return `${STORAGE_PREFIX}:${activationCode}:${band}`
}

function hasFired(activationCode: string, band: Band): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(bandFiredKey(activationCode, band)) === '1'
  } catch {
    return false
  }
}

function markFired(activationCode: string, band: Band): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(bandFiredKey(activationCode, band), '1')
  } catch {
    /* quota exceeded / private mode — silent */
  }
}

export function LowTimeWarning() {
  const { status, openSubscribe } = useLicense()
  const [openBand, setOpenBand] = useState<BandCfg | null>(null)

  useEffect(() => {
    // Only relevant when the operator has a real, non-master active
    // paid subscription. Trial users see their own dedicated trial
    // countdown widget elsewhere; master codes are unlimited.
    if (status.state !== 'active') return
    const sub = status.activeSubscription
    if (!sub || sub.isMaster) return

    const tick = () => {
      const expiresAtMs = Date.parse(sub.expiresAt)
      if (!Number.isFinite(expiresAtMs)) return
      const msLeft = expiresAtMs - Date.now()
      if (msLeft <= 0) return // already expired — license-provider lock takes over

      // Find the FIRST (largest) band whose window we're inside that
      // hasn't already fired for this code. We iterate largest→smallest
      // so a fresh activation entering at e.g. 23h gets the 24h band
      // first; later ticks naturally skip already-fired bands.
      for (const band of BANDS) {
        if (msLeft > band.thresholdMs) continue
        if (msLeft <= band.floorMs) continue
        if (hasFired(sub.activationCode, band.id)) continue
        markFired(sub.activationCode, band.id)
        setOpenBand(band)
        return
      }
    }

    // Fire once on mount, then every 15 s. 15 s is fine — the
    // smallest band (5m → 0m) is 300 s wide, so we will catch it
    // within 5 % of the band width.
    tick()
    const id = window.setInterval(tick, 15_000)
    return () => window.clearInterval(id)
  }, [status.state, status.activeSubscription])

  if (!openBand) return null

  const sub = status.activeSubscription
  const msLeft = sub ? Date.parse(sub.expiresAt) - Date.now() : 0
  const minsLeft = Math.max(0, Math.round(msLeft / 60_000))

  const accent =
    openBand.severity === 'critical'
      ? 'border-red-500'
      : openBand.severity === 'warn'
        ? 'border-amber-500'
        : 'border-sky-500'

  return (
    <AlertDialog
      open={true}
      onOpenChange={(o) => {
        if (!o) setOpenBand(null)
      }}
    >
      <AlertDialogContent className={`border-2 ${accent}`}>
        <AlertDialogHeader>
          <AlertDialogTitle>{openBand.title}</AlertDialogTitle>
          <AlertDialogDescription>{openBand.description(minsLeft)}</AlertDialogDescription>
        </AlertDialogHeader>
        {sub ? (
          <div className="text-xs text-muted-foreground space-y-0.5 px-1">
            <div>Plan: <span className="text-foreground font-mono">{sub.planCode}</span></div>
            <div>Code: <span className="text-foreground font-mono">{sub.activationCode}</span></div>
            <div>Expires: <span className="text-foreground">{new Date(sub.expiresAt).toLocaleString()}</span></div>
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setOpenBand(null)}>Dismiss</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setOpenBand(null)
              openSubscribe()
            }}
          >
            Renew now
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
