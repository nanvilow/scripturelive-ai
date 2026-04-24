'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

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
  | { status: 'downloading'; percent: number; transferred?: number; total?: number; bytesPerSecond?: number }
  | { status: 'downloaded'; version: string; releaseNotes?: string; releaseName?: string }
  | { status: 'error'; message: string }

type ScriptureLiveBridge = {
  updater?: {
    getState?: () => Promise<UpdaterState>
    download?: () => Promise<{ ok: boolean; error?: string; alreadyInProgress?: boolean }>
    install?: () => Promise<{ ok: boolean; error?: string }>
    onState?: (cb: (s: UpdaterState) => void) => () => void
  }
}

// Strip markdown / HTML noise from GitHub release notes so the toast
// description stays readable. We don't try to render markdown — just
// show enough of the first meaningful paragraph for the operator to
// know what's in the release.
function previewReleaseNotes(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const cleaned = raw
    .replace(/<[^>]+>/g, ' ')             // strip HTML tags
    .replace(/[#*_`>~\[\]()]/g, '')       // strip markdown punctuation
    .replace(/\s+/g, ' ')                 // collapse whitespace
    .trim()
  if (!cleaned) return undefined
  return cleaned.length > 180 ? cleaned.slice(0, 177) + '…' : cleaned
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

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!/Electron/i.test(navigator.userAgent)) return
    const bridge = (window as unknown as { scriptureLive?: ScriptureLiveBridge })
      .scriptureLive
    if (!bridge?.updater?.onState) return

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
        const description = sizeLine ? `${pct}% · ${sizeLine}` : `${pct}%`
        if (downloadingToastIdRef.current == null) {
          // Auto-update kicked off without us going through the
          // available-toast click handler (e.g. Settings → Check Now
          // followed by a quick auto-restart). Create the progress
          // toast on the fly so the operator still sees activity.
          downloadingToastIdRef.current = toast.loading(
            'Downloading update…',
            { description, duration: Infinity },
          )
        } else {
          toast.loading('Downloading update…', {
            id: downloadingToastIdRef.current,
            description,
            duration: Infinity,
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
        toast.success(`Update v${s.version} ready — Click To Install`, {
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
        })
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

    // Seed with current state in case an update was already detected
    // during the boot-time check (10s after launch) before this
    // component mounted. Without this, fast-mounting renderers might
    // miss the very first push.
    bridge.updater.getState?.().then((s) => { if (s) handle(s) }).catch(() => {})

    const off = bridge.updater.onState(handle)
    return off
  }, [])

  return null
}
