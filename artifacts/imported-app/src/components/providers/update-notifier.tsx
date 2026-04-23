'use client'

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

/**
 * UpdateNotifier — surfaces auto-updater events as small, non-intrusive
 * popups so the operator finds out about a new release without having
 * to open Settings.
 *
 * Mounts once at the app root (see app/page.tsx, next to
 * <OutputBroadcaster />). Listens for `updater:state` pushes from the
 * Electron main process via the preload bridge
 * (`window.scriptureLive.updater.onState`) and converts them to toasts:
 *
 *   • update-available   → "Update vX.Y.Z is available — downloading…"
 *   • update-downloaded  → "Update vX.Y.Z is ready" + Restart action
 *   • error              → silent (church PCs without internet should
 *                          NEVER see a scary banner — that's why
 *                          electron/updater.ts swallows errors too)
 *
 * Each version is announced at most once per app session (tracked in
 * shownVersionsRef). This way the 4-hour interval check doesn't spam
 * the operator with the same notice over and over.
 *
 * In browser mode (no Electron bridge) this provider is a no-op.
 */

type UpdaterState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version: string }
  | { status: 'not-available'; version: string }
  | { status: 'downloading'; percent: number }
  | { status: 'downloaded'; version: string }
  | { status: 'error'; message: string }

type ScriptureLiveBridge = {
  updater?: {
    getState?: () => Promise<UpdaterState>
    install?: () => Promise<{ ok: boolean; error?: string }>
    onState?: (cb: (s: UpdaterState) => void) => () => void
  }
}

export function UpdateNotifier() {
  // Track which versions we've already announced so the same release
  // doesn't toast twice (e.g. when the periodic re-check fires four
  // hours later and the user still hasn't restarted).
  const announcedAvailableRef = useRef<Set<string>>(new Set())
  const announcedDownloadedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!/Electron/i.test(navigator.userAgent)) return
    const bridge = (window as unknown as { scriptureLive?: ScriptureLiveBridge })
      .scriptureLive
    if (!bridge?.updater?.onState) return

    const handle = (s: UpdaterState) => {
      if (s.status === 'available') {
        if (announcedAvailableRef.current.has(s.version)) return
        announcedAvailableRef.current.add(s.version)
        toast.message(`Update available: v${s.version}`, {
          description: 'Downloading in the background — you\'ll be prompted to restart when it\'s ready.',
          duration: 8000,
        })
      } else if (s.status === 'downloaded') {
        if (announcedDownloadedRef.current.has(s.version)) return
        announcedDownloadedRef.current.add(s.version)
        toast.success(`Update v${s.version} is ready`, {
          description: 'Restart ScriptureLive to install.',
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
      }
      // Silent for: idle, checking, downloading, not-available, error.
      // The Settings card already surfaces those for operators who are
      // actively looking; we don't want random midweek toasts saying
      // "you're up to date" or chatting about download progress.
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
