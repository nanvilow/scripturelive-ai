'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

import { previewReleaseNotes } from '@/lib/release-notes'

/**
 * UpdateNotifier — surfaces auto-updater events as one-click in-app
 * popups so the operator never has to leave the app to update.
 *
 * Mounts once at the app root (see app/page.tsx, next to
 * <OutputBroadcaster />). Listens for `updater:state` pushes from the
 * Electron main process via the preload bridge
 * (`window.scriptureLive.updater.onState`) and converts them to toasts:
 *
 *   • update-available   → "Update Available v{X} — Click To Download"
 *                          with a Download action that calls the main
 *                          process to download the signed installer.
 *                          Release notes preview shown in description.
 *   • update-downloading → progress toast updated with percent.
 *                          Single sticky toast id so we don't spam.
 *   • update-downloaded  → "Update v{X} ready — Click To Install"
 *                          with a Restart & Install action.
 *   • error              → silent (church PCs without internet should
 *                          NEVER see a scary banner — that's why
 *                          electron/updater.ts swallows errors too).
 *
 * Each version is announced at most once per app session. The download
 * progress toast updates in place via toast.id so the operator sees a
 * smooth percent counter instead of a stack of duplicate toasts.
 *
 * In browser mode (no Electron bridge) this provider is a no-op.
 */

type UpdaterState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version: string; releaseNotes?: string; releaseName?: string }
  | { status: 'not-available'; version: string }
  | {
      status: 'downloading'
      percent: number
      transferred?: number
      total?: number
      bytesPerSecond?: number
      // v0.7.17 — populated by the multi-threaded downloader so the
      // toast can show "X.X MB/s · ETA 12s · 4 chunks". Both optional
      // because older builds and the single-stream fallback don't
      // include them.
      parallelism?: number
      etaSeconds?: number
    }
  | { status: 'downloaded'; version: string; releaseNotes?: string; releaseName?: string }
  | { status: 'error'; message: string }

type NdiStatusSlim = { running: boolean }

type ScriptureLiveBridge = {
  updater?: {
    getState?: () => Promise<UpdaterState>
    download?: () => Promise<{ ok: boolean; error?: string; alreadyInProgress?: boolean }>
    install?: () => Promise<{ ok: boolean; error?: string }>
    // v0.5.31 — operator-cancellable download. Optional because older
    // desktop builds shipped before the Cancel button won't expose it,
    // and the renderer falls back to omitting the toast/banner action.
    cancel?: () => Promise<{ ok: boolean; error?: string }>
    onState?: (cb: (s: UpdaterState) => void) => () => void
  }
  // Read NDI sender status to know whether we're mid-broadcast and
  // should hold every operator-actionable update toast. Defined as
  // optional to keep the no-op browser path safe and to not couple
  // this provider to the full bridge type in `lib/use-electron.ts`.
  ndi?: {
    getStatus?: () => Promise<NdiStatusSlim>
    onStatus?: (cb: (s: NdiStatusSlim) => void) => () => void
  }
}

export function UpdateNotifier() {
  const announcedAvailableRef = useRef<Set<string>>(new Set())
  const announcedDownloadedRef = useRef<Set<string>>(new Set())
  // Stable toast ids so we can replace the same notification as state
  // moves available → downloading → downloaded instead of stacking
  // three separate popups.
  const downloadingToastIdRef = useRef<string | number | null>(null)
  // Architect feedback (round 3) — track the sticky "Update Available"
  // toast so we can dismiss it as soon as the download starts or
  // completes. Without this the popup with the Download action stays
  // on screen indefinitely (we set duration:Infinity), and clicking
  // the stale Download button after the download already finished
  // would create a phantom "Downloading…" toast that never resolves.
  const availableToastIdRef = useRef<string | number | null>(null)
  // Track the "Update ready — Click To Install" success toast id too,
  // so the broadcast-safe gate can dismiss it the instant the operator
  // starts an NDI service. Without this, an already-visible Restart &
  // Install action button would still be clickable mid-broadcast — the
  // exact foot-gun this whole feature is preventing.
  const downloadedToastIdRef = useRef<string | number | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!/Electron/i.test(navigator.userAgent)) return
    const bridge = (window as unknown as { scriptureLive?: ScriptureLiveBridge })
      .scriptureLive
    if (!bridge?.updater?.onState) return

    // Broadcast-safe gate (matches the main-process tray gate). While
    // NDI is on the air, every prompt is held — `handle()` short-
    // circuits and stashes the latest update state. As soon as the
    // operator stops the sender we replay the stashed state through
    // `handle()` again so the appropriate toast surfaces. Update
    // checks + downloads continue in the background regardless.
    //
    // Default to ON-AIR until the first NDI status read resolves. The
    // Electron desktop ALWAYS auto-starts the NDI sender at boot
    // (see `electron/main.ts` whenReady → `ndi.start(...)`), so
    // assuming the operator is mid-service is the safe bootstrap
    // posture: any updater push that lands before NDI status resolves
    // gets stashed and replayed once we know for sure. A permissive
    // default would briefly leak a Restart button during the most
    // common launch case, which is exactly what this feature exists
    // to prevent.
    let onAir = true
    let pendingState: UpdaterState | null = null

    const dismissActiveActionToasts = () => {
      if (availableToastIdRef.current != null) {
        toast.dismiss(availableToastIdRef.current)
        availableToastIdRef.current = null
      }
      if (downloadingToastIdRef.current != null) {
        toast.dismiss(downloadingToastIdRef.current)
        downloadingToastIdRef.current = null
      }
      if (downloadedToastIdRef.current != null) {
        toast.dismiss(downloadedToastIdRef.current)
        downloadedToastIdRef.current = null
      }
    }

    const startDownload = (version: string) => {
      // Architect feedback — make startDownload idempotent. If we
      // already have a progress toast on screen, the operator's
      // second click is a no-op (the main-process IPC also guards
      // with downloadInFlight, but failing fast here saves an IPC
      // round-trip and avoids stacking duplicate sticky toasts).
      if (downloadingToastIdRef.current != null) return

      // Dismiss the "Update Available" popup now that the operator
      // has acted on it — keeping it around alongside a Downloading…
      // spinner is confusing and could let them click Download a
      // second time after the download completes (creating a phantom
      // toast that never resolves).
      if (availableToastIdRef.current != null) {
        toast.dismiss(availableToastIdRef.current)
        availableToastIdRef.current = null
      }

      // Show a sticky in-place toast for the download progress, so the
      // 0% → 100% transition feels like one event instead of a
      // popup storm. The downloading state push will replace this
      // toast's description in place via toast.loading + same id.
      downloadingToastIdRef.current = toast.loading(
        `Downloading update v${version}…`,
        {
          description: 'Starting download…',
          duration: Infinity,
        },
      )
      bridge.updater?.download?.().then((r) => {
        if (!r?.ok) {
          if (downloadingToastIdRef.current != null) {
            toast.dismiss(downloadingToastIdRef.current)
            downloadingToastIdRef.current = null
          }
          toast.error(`Could not start download: ${r?.error || 'unknown error'}`)
          return
        }
        if (r.alreadyInProgress) {
          // The main process says a download is already running OR
          // is already finished. Re-fetch the authoritative state so
          // we can either let the in-flight progress events replace
          // our toast (downloading) or jump straight to the install
          // prompt (downloaded). Without this, an "alreadyInProgress"
          // result in the downloaded state would leave our spinner
          // stuck forever — no further state push is guaranteed.
          bridge.updater?.getState?.().then((s) => {
            if (!s) return
            if (s.status === 'downloaded' || s.status === 'not-available' ||
                s.status === 'idle' || s.status === 'error') {
              // Nothing more to download — clear our spinner. The
              // downloaded handler below will surface the install
              // toast on its own; for the other terminal states we
              // just dismiss silently.
              if (downloadingToastIdRef.current != null) {
                toast.dismiss(downloadingToastIdRef.current)
                downloadingToastIdRef.current = null
              }
              if (s.status === 'downloaded') handle(s)
            }
            // For 'downloading'/'available' we leave the toast in
            // place; the next state push will update it.
          }).catch(() => {
            // Defensive — if the get-state IPC fails for some reason
            // (very rare), fall back to dismissing the provisional
            // loading toast so the operator isn't stuck staring at a
            // spinner. They can re-open the popup or use Settings →
            // Check Now to retry.
            if (downloadingToastIdRef.current != null) {
              toast.dismiss(downloadingToastIdRef.current)
              downloadingToastIdRef.current = null
            }
          })
        }
      }).catch((err: unknown) => {
        if (downloadingToastIdRef.current != null) {
          toast.dismiss(downloadingToastIdRef.current)
          downloadingToastIdRef.current = null
        }
        toast.error(err instanceof Error ? err.message : 'Download failed')
      })
    }

    const handle = (s: UpdaterState) => {
      // Broadcast-safe gate. Stash the latest update state and bail
      // before any toast surface fires. The NDI off-air subscription
      // below replays via `handle(pendingState)` once the operator
      // stops sending. Note we do NOT add to `announcedAvailableRef`
      // / `announcedDownloadedRef` here — those would prevent the
      // post-broadcast replay from firing.
      if (onAir) {
        pendingState = s
        return
      }
      if (s.status === 'available') {
        if (announcedAvailableRef.current.has(s.version)) return
        announcedAvailableRef.current.add(s.version)
        const notes = previewReleaseNotes(s.releaseNotes)
        // The user-facing copy is intentionally explicit: "Click To
        // Download" tells the operator the popup IS the action — they
        // don't need to find a Settings page. duration: Infinity keeps
        // it on screen until they decide. Track the toast id so we
        // can dismiss it the moment the download starts (or finishes
        // out-of-band, e.g. via Settings → Download Update).
        availableToastIdRef.current = toast.message(
          `Update Available v${s.version} — Click To Download`,
          {
            description: notes
              ? `What's new: ${notes}`
              : 'A new version of ScriptureLive is ready to download.',
            duration: Infinity,
            action: {
              label: 'Download',
              onClick: () => startDownload(s.version),
            },
          },
        )
      } else if (s.status === 'downloading') {
        // Operator may have started the download from a different
        // surface (Settings → Download Update). Dismiss the available
        // popup here too so it doesn't linger with a stale Download
        // button while the spinner is on screen.
        if (availableToastIdRef.current != null) {
          toast.dismiss(availableToastIdRef.current)
          availableToastIdRef.current = null
        }
        const pct = Math.max(0, Math.min(100, Math.round(s.percent || 0)))
        const mbTransferred =
          s.transferred != null ? (s.transferred / 1024 / 1024).toFixed(1) : null
        const mbTotal =
          s.total != null ? (s.total / 1024 / 1024).toFixed(1) : null
        const sizeLine =
          mbTransferred && mbTotal ? `${mbTransferred} / ${mbTotal} MB` : null
        // v0.7.17 — Show throughput + ETA so the operator can see the
        // download is actually moving (and roughly how long it has left).
        // Auto-scale unit: B/s → KB/s → MB/s. Hide entirely when speed
        // is 0 (pre-first-byte / paused) so the toast doesn't flicker
        // a confusing "0 KB/s" between samples.
        const bps = s.bytesPerSecond ?? 0
        let speedLine: string | null = null
        if (bps >= 1024 * 1024) speedLine = `${(bps / 1024 / 1024).toFixed(1)} MB/s`
        else if (bps >= 1024) speedLine = `${(bps / 1024).toFixed(0)} KB/s`
        else if (bps > 0) speedLine = `${Math.round(bps)} B/s`
        // ETA: only show when speed is high enough for a stable estimate.
        // Format as "ETA 1m 23s" when > 60s, "ETA 12s" otherwise.
        let etaLine: string | null = null
        const eta = s.etaSeconds
        if (eta != null && Number.isFinite(eta) && eta >= 1) {
          if (eta >= 60) {
            const m = Math.floor(eta / 60)
            const sec = Math.round(eta % 60)
            etaLine = `ETA ${m}m ${sec}s`
          } else {
            etaLine = `ETA ${Math.round(eta)}s`
          }
        }
        // Parallelism badge — small "(4 chunks)" suffix so the operator
        // can tell the multi-threaded path is active. Single-stream
        // fallback path leaves this undefined.
        const chunksLine =
          s.parallelism && s.parallelism > 1 ? `${s.parallelism} chunks` : null
        const description = [
          `${pct}%`,
          sizeLine,
          speedLine,
          etaLine,
          chunksLine,
        ]
          .filter(Boolean)
          .join(' · ')
        // v0.5.31 — Cancel action attached to every progress toast
        // so the operator can abort the download from the same UI
        // surface that's tracking it. Calls the new `updater.cancel`
        // bridge; older desktop builds without `cancel` simply won't
        // see the action.
        const cancelAction = bridge.updater?.cancel
          ? {
              label: 'Cancel',
              onClick: () => {
                bridge.updater
                  ?.cancel?.()
                  .then((r) => {
                    if (!r?.ok && r?.error) {
                      toast.error(`Could not cancel: ${r.error}`)
                    }
                  })
                  .catch((err: unknown) => {
                    toast.error(err instanceof Error ? err.message : 'Cancel failed')
                  })
              },
            }
          : undefined
        if (downloadingToastIdRef.current == null) {
          // Auto-update kicked off without us going through the
          // available-toast click handler (e.g. Settings → Check Now
          // followed by a quick auto-restart). Create the progress
          // toast on the fly so the operator still sees activity.
          downloadingToastIdRef.current = toast.loading(
            'Downloading update…',
            { description, duration: Infinity, action: cancelAction },
          )
        } else {
          toast.loading('Downloading update…', {
            id: downloadingToastIdRef.current,
            description,
            duration: Infinity,
            action: cancelAction,
          })
        }
      } else if (s.status === 'downloaded') {
        if (downloadingToastIdRef.current != null) {
          toast.dismiss(downloadingToastIdRef.current)
          downloadingToastIdRef.current = null
        }
        // Same cleanup for the available popup — clicking Download
        // on it after the download already completed would create a
        // phantom spinner that never resolves.
        if (availableToastIdRef.current != null) {
          toast.dismiss(availableToastIdRef.current)
          availableToastIdRef.current = null
        }
        if (announcedDownloadedRef.current.has(s.version)) return
        announcedDownloadedRef.current.add(s.version)
        downloadedToastIdRef.current = toast.success(
          `Update v${s.version} ready — Click To Install`,
          {
            description: 'ScriptureLive will restart and apply the update.',
            duration: Infinity,
            action: {
              label: 'Restart & Install',
              onClick: () => {
                bridge.updater?.install?.().then((r) => {
                  if (!r?.ok) {
                    toast.error(`Could not install: ${r?.error || 'unknown error'}`)
                  }
                }).catch((err: unknown) => {
                  toast.error(err instanceof Error ? err.message : 'Install failed')
                })
              },
            },
          },
        )
      } else if (s.status === 'error') {
        // Clear any in-flight download toast so the operator isn't
        // staring at a stuck "Downloading…" spinner after a network
        // failure. Error itself stays silent for offline church PCs.
        if (downloadingToastIdRef.current != null) {
          toast.dismiss(downloadingToastIdRef.current)
          downloadingToastIdRef.current = null
        }
      }
      // Silent for: idle, checking, not-available — those are normal
      // background states and the Settings card surfaces them for
      // operators who are actively looking.
    }

    /**
     * Apply an NDI on-air transition. Three cases worth distinguishing:
     *
     *   • off-air → on-air: a service is starting. Dismiss any sticky
     *     actionable toasts (Update Available with Download button,
     *     Update Ready with Restart & Install button, Downloading
     *     spinner) so an operator click during the broadcast can't
     *     fire them. ALSO clear the announce dedupe sets so the
     *     post-broadcast replay path is allowed to re-fire the same
     *     toast for the same version. Stash the latest known updater
     *     state for the replay.
     *   • on-air → off-air: replay the stashed state through handle()
     *     so the held available / downloaded toast surfaces now that
     *     the operator has stopped sending.
     *   • on-air → on-air or off-air → off-air: no-op (broadcastNdi-
     *     Status fires on every frame batch, so this handler is hit
     *     constantly during a broadcast — keep it idempotent).
     */
    const applyAirChange = (newRunning: boolean) => {
      const wasOnAir = onAir
      onAir = newRunning
      if (!wasOnAir && onAir) {
        // Stash whatever state we last knew so the off-air replay has
        // something to fire. Without this, a state push that arrived
        // *before* on-air engaged would be lost — its toast would be
        // dismissed below and never re-fire (we only resurface things
        // that pendingState tracks).
        if (pendingState == null) pendingState = lastKnownState
        dismissActiveActionToasts()
        // Clear dedupe so the SAME version's toast is allowed to
        // re-fire after the broadcast ends. Otherwise the announced
        // sets would block the off-air replay path.
        announcedAvailableRef.current.clear()
        announcedDownloadedRef.current.clear()
      } else if (wasOnAir && !onAir && pendingState) {
        const replay = pendingState
        pendingState = null
        handle(replay)
      }
    }

    // Track the most recent updater state INDEPENDENT of the on-air
    // gate. handle() also writes to it via the closure-scoped
    // `lastKnownState` so the on-air transition can resurface it.
    let lastKnownState: UpdaterState | null = null
    const trackingHandle = (s: UpdaterState) => {
      lastKnownState = s
      // Also stash it as pending while on-air, so the off-air
      // transition replays the most recent value (handle() already
      // does this internally, but mirroring here keeps the two paths
      // explicit and easy to reason about).
      if (onAir) pendingState = s
      handle(s)
    }

    // ── Bootstrap sequencing ────────────────────────────────────────
    // Resolve NDI status FIRST, then seed updater state. This removes
    // the race where a fast initial updater push handles before NDI
    // status resolves and we use the conservative on-air default —
    // that path is correct (gates the toast), but resolving NDI first
    // lets us surface the toast immediately when NDI is actually idle
    // instead of waiting for the off-air replay.
    const seedPromise = bridge.ndi?.getStatus
      ? bridge.ndi.getStatus().then(
          (s) => applyAirChange(!!s?.running),
          // Permissive fallback if the NDI bridge is missing entirely
          // (browser-mode-in-Electron edge case): drop into off-air so
          // the user actually sees update prompts. The desktop-only
          // path always has a working NDI bridge, so this only fires
          // in development / mocked builds.
          () => applyAirChange(false),
        )
      : Promise.resolve(applyAirChange(false))

    seedPromise.then(() => {
      // Seed with current state in case an update was already
      // detected during the boot-time check (10s after launch) before
      // this component mounted. Without this, fast-mounting renderers
      // might miss the very first push.
      bridge.updater?.getState?.().then((s) => { if (s) trackingHandle(s) }).catch(() => {})
    })

    const offUpdate = bridge.updater.onState(trackingHandle)
    const offNdi = bridge.ndi?.onStatus?.((s) => applyAirChange(!!s?.running)) ?? (() => {})

    return () => { offUpdate(); offNdi() }
  }, [])

  return null
}
