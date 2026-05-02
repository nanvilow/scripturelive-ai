'use client'

// v1 licensing — React provider.
//
// Owns:
//   • the polled status from /api/license/status
//   • a derived `isActive` flag (state==='active' OR state==='trial')
//   • global Ctrl+Shift+P listener that toggles the Admin modal
//   • imperative open() helpers for the Subscribe / Admin / Receipt
//     modals so the topbar button + lock overlay can both trigger them
//
// We intentionally poll instead of subscribing (no SSE) — status
// changes are rare (1/day at most for daysLeft, otherwise event-driven)
// and a 30s interval is more than enough.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/lib/store'

export type LicenseState = 'active' | 'trial' | 'trial_expired' | 'expired' | 'never_activated' | 'unknown'

export interface ActiveSubscription {
  activationCode: string
  planCode: string
  days: number
  activatedAt: string
  expiresAt: string
  isMaster: boolean
}

/** v0.5.48 — Customer-facing subscription summary returned by
 *  /api/license/status. Lets the Settings → License row render
 *  without a second roundtrip and without exposing internal storage
 *  fields. `daysLeft` is clamped to 36500 for master codes so we
 *  don't print a year-3000 expiry to the operator. */
export interface SubscriptionSummary {
  planCode: string
  planLabel: string
  days: number
  activatedAt: string
  expiresAt: string
  daysLeft: number
  isMaster: boolean
  activationCode: string
  paymentRef?: string
}

export interface LicenseStatus {
  state: LicenseState
  daysLeft: number
  msLeft: number
  isMaster: boolean
  activeSubscription: ActiveSubscription | null
  trial: { startedAt: string; expiresAt: string; expired: boolean; msLeft: number }
  installId: string
  /** v0.5.48 — populated when there's an active subscription. */
  subscription?: SubscriptionSummary | null
}

interface LicenseContextValue {
  status: LicenseStatus
  isActive: boolean      // true when Live Transcription should be unlocked
  isTrial: boolean
  isLocked: boolean      // true when the column overlay should appear
  refresh: () => Promise<void>
  openSubscribe: () => void
  openAdmin: () => void
  closeAll: () => void
  ui: {
    subscribeOpen: boolean
    adminOpen: boolean
    setSubscribeOpen: (b: boolean) => void
    setAdminOpen: (b: boolean) => void
  }
}

const initialStatus: LicenseStatus = {
  state: 'unknown',
  daysLeft: 0,
  msLeft: 0,
  isMaster: false,
  activeSubscription: null,
  trial: { startedAt: '', expiresAt: '', expired: false, msLeft: 0 },
  installId: '',
  subscription: null,
}

const Ctx = createContext<LicenseContextValue | null>(null)

export function useLicense(): LicenseContextValue {
  const c = useContext(Ctx)
  if (!c) throw new Error('useLicense must be inside <LicenseProvider>')
  return c
}

export function LicenseProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<LicenseStatus>(initialStatus)
  const [subscribeOpen, setSubscribeOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const lastFetchRef = useRef(0)

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/license/status', { cache: 'no-store' })
      if (!r.ok) return
      const j = (await r.json()) as LicenseStatus
      setStatus(j)
      lastFetchRef.current = Date.now()
    } catch {
      /* offline-tolerant: keep last known status */
    }
  }, [])

  // Initial + polling
  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 30_000)
    const onFocus = () => {
      if (Date.now() - lastFetchRef.current > 5_000) refresh()
    }
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [refresh])

  // Ctrl+Shift+P — toggle admin panel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
        e.preventDefault()
        setAdminOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // v0.7.5-dev — Mobile / no-keyboard entry point for the admin panel.
  //
  // The Ctrl+Shift+P shortcut above is impossible to fire on a phone
  // touch keyboard. Operators on the road need to mint activation
  // codes / renew / cancel from a phone browser without opening the
  // desktop .exe. So we additionally pop the admin modal whenever
  // the page is loaded with `?admin=1` (or `#admin`) in the URL.
  //
  // Usage: bookmark `https://your-deployed-domain.com/?admin=1` on
  // the phone home screen, tap → admin password gate → full panel.
  // The same admin password protects /api/license/admin/* on the
  // server, so opening the modal does not bypass any auth.
  //
  // We also strip the marker from the URL after opening so a refresh
  // doesn't keep re-popping the modal once you've closed it. Runs
  // once on mount; harmless on Electron (the URL doesn't have the
  // marker there).
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const url = new URL(window.location.href)
      const wantsAdmin =
        url.searchParams.get('admin') === '1' ||
        window.location.hash === '#admin'
      if (!wantsAdmin) return
      setAdminOpen(true)
      // Clean the URL so a manual refresh inside the panel doesn't
      // re-trigger after the user has closed it.
      url.searchParams.delete('admin')
      const cleaned = url.pathname + (url.search ? url.search : '') +
        (window.location.hash === '#admin' ? '' : window.location.hash)
      window.history.replaceState(null, '', cleaned)
    } catch { /* malformed URL — ignore */ }
  }, [])

  const isActive = status.state === 'active' || status.state === 'trial'
  const isTrial = status.state === 'trial'
  const isLocked = !isActive && status.state !== 'unknown'

  // v0.5.57 — Mirror isLocked into the Zustand store so providers
  // mounted ABOVE this one (notably <SpeechProvider>) can react to
  // a lockdown by tearing down their audio graph + recognizers.
  // We can't useLicense() inside SpeechProvider because it would
  // be a context-not-found error at render time.
  const setLicenseLocked = useAppStore((s) => s.setLicenseLocked)
  useEffect(() => {
    setLicenseLocked(isLocked)
  }, [isLocked, setLicenseLocked])

  // ─── v0.7.5 — Activity-gated trial timer (T502) ───────────────────
  //
  // Pre-v0.7.5 the trial was calendar-based: 30 minutes of WALL-CLOCK
  // time from firstLaunchAt, regardless of whether the user ever
  // started the mic. So an operator who installed at 5pm to evaluate
  // the app, ran it for 2 minutes, then waited until Sunday's service
  // arrived to a 0-minute trial they hadn't used.
  //
  // v0.7.5 makes the trial USAGE-based: it only counts seconds the
  // mic is actually running. We watch the Zustand `isListening` flag
  // (set by speech-provider when recognition starts/stops) and:
  //   • on START   → record the wall-clock timestamp + start a 5s tick
  //   • each tick  → POST /api/license/trial-tick { deltaMs } to add
  //                  the elapsed slice into trialMsUsed; update local
  //                  status from the response so the countdown widget
  //                  reflects the new msLeft within seconds
  //   • on STOP    → fire one final tick with the remaining partial
  //                  delta + clear the interval
  //
  // We skip the tick entirely once the user is on a real subscription
  // (state==='active') — trial is dormant in that case, and the
  // server-side addTrialUsage is also a no-op for safety.
  const isListening = useAppStore((s) => s.isListening)
  const tickStartRef = useRef<number | null>(null)
  const tickLastSentRef = useRef<number>(0)
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const trialActive = status.state === 'trial'

  useEffect(() => {
    // Only run the trial-tick machinery while the user is genuinely
    // on a free trial. Active subscriptions, expired trials, and
    // unknown state all skip — no point burning HTTP calls.
    if (!trialActive) {
      // Cleanup if we were ticking and just transitioned out of trial
      // (e.g. operator just activated a paid code).
      if (tickTimerRef.current) {
        clearInterval(tickTimerRef.current)
        tickTimerRef.current = null
      }
      tickStartRef.current = null
      tickLastSentRef.current = 0
      return
    }

    const sendTick = async (deltaMs: number) => {
      if (deltaMs <= 0) return
      try {
        const r = await fetch('/api/license/trial-tick', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deltaMs: Math.floor(deltaMs) }),
        })
        if (!r.ok) return
        const j = (await r.json()) as { ok: boolean; status: LicenseStatus }
        if (j?.status) setStatus(j.status)
      } catch {
        // Offline / rate-limited / server restart — silently skip;
        // the next tick will catch up the missed delta.
      }
    }

    if (isListening) {
      // Mic just started (or this effect is mounting while the mic was
      // already running) — anchor the start time and begin pinging
      // every 5 seconds. Each tick sends the delta since the last
      // successful send, NOT since the start, so a missed tick (offline
      // blip) doesn't double-count when the next one lands.
      const now = Date.now()
      tickStartRef.current = now
      tickLastSentRef.current = now
      tickTimerRef.current = setInterval(() => {
        const t = Date.now()
        const delta = t - tickLastSentRef.current
        tickLastSentRef.current = t
        void sendTick(delta)
      }, 5_000)

      return () => {
        // Mic stopped (or component unmounted) — flush the partial
        // delta accumulated since the last 5s tick so the user gets
        // credit for the final 0-5s of listening. Clear the interval
        // so we don't keep ticking after the mic is off.
        if (tickTimerRef.current) {
          clearInterval(tickTimerRef.current)
          tickTimerRef.current = null
        }
        const final = Date.now() - tickLastSentRef.current
        tickStartRef.current = null
        tickLastSentRef.current = 0
        if (final > 0) void sendTick(final)
      }
    }
    // isListening = false branch: nothing to do — the cleanup above
    // fired when the previous (true) effect tore down.
  }, [isListening, trialActive])

  const value: LicenseContextValue = {
    status,
    isActive,
    isTrial,
    isLocked,
    refresh,
    openSubscribe: () => setSubscribeOpen(true),
    openAdmin: () => setAdminOpen(true),
    closeAll: () => { setSubscribeOpen(false); setAdminOpen(false) },
    ui: { subscribeOpen, adminOpen, setSubscribeOpen, setAdminOpen },
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
