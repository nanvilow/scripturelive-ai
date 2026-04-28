'use client'

import { useEffect, useRef, useState } from 'react'

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
import { cleanReleaseNotes } from '@/lib/release-notes'

/**
 * UpdateAvailableDialog — prominent modal popup that announces a new
 * version when the auto-updater detects one. Complements the corner
 * toast surfaced by `UpdateNotifier` (which is suppressed mid-broadcast
 * by the on-air gate, and at app launch NDI auto-starts so the toast
 * effectively never fires unless the operator manually stops the
 * sender).
 *
 * Behaviour:
 *   • Mounts at the app root (next to <UpdateNotifier />).
 *   • Listens for `updater:state` pushes and opens an AlertDialog when
 *     a new `available` version arrives.
 *   • Each version is announced at most once per app session so an
 *     operator who chooses "Later" isn't pestered every time the
 *     periodic check re-fires.
 *   • Two actions:
 *       - "Download now"  → triggers the signed download via
 *                            `window.scriptureLive.updater.download()`,
 *                            then closes. Progress + completion are
 *                            handled by the existing UpdateNotifier
 *                            toast and Settings card.
 *       - "Later"         → just dismisses. The download will not
 *                            start; the operator can still trigger
 *                            it from Settings → Help & Updates →
 *                            Download Update.
 *   • Intentionally NOT gated by NDI on-air status, unlike the toast.
 *     The dialog is purely informational — it doesn't restart, install,
 *     or quit anything by itself. Even if NDI is on the air, a
 *     "Download now" click only starts a background download (the
 *     signed installer), and the existing on-air gate still protects
 *     the *install* step from interrupting a service.
 *   • In browser mode (no Electron bridge) this provider is a no-op.
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
    }
  | { status: 'downloaded'; version: string; releaseNotes?: string; releaseName?: string }
  | { status: 'error'; message: string }

type ScriptureLiveBridge = {
  updater?: {
    getState?: () => Promise<UpdaterState>
    download?: () => Promise<{ ok: boolean; error?: string; alreadyInProgress?: boolean }>
    onState?: (cb: (s: UpdaterState) => void) => () => void
  }
  // v0.6.6 — exposed by preload.ts; opens Windows "Apps & features".
  app?: {
    openUninstall?: () => Promise<{ ok: boolean; error?: string }>
  }
}

// Render release notes inline as a few short paragraphs. We deliberately
// don't pull in a markdown renderer — the dialog stays light, and most
// release notes fit in a paragraph or three of stripped text. We keep
// the first ~600 characters so the operator gets the gist without the
// dialog growing into a wall of text.
//
// v0.6.6 — Strip ADMIN-only items so customers don't see internal
// changelog lines. Any line whose first word is "ADMIN:" (or that
// starts with "[admin]") is dropped. Lines beginning with our task
// codes (T6xx-) are kept; the operator wants those visible so they
// can cross-reference what changed.
function summariseReleaseNotes(raw: string | undefined): string | null {
  if (!raw) return null
  const stripped = cleanReleaseNotes(raw)
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_`>~\[\]()]/g, '')
  // v0.6.6 — line-level admin filter applied AFTER markdown strip so
  // bullets like "* ADMIN: rotated key" become "ADMIN: rotated key"
  // first and the prefix match catches them.
  const filtered = stripped
    .split('\n')
    .filter((line) => {
      const t = line.trim()
      if (!t) return true
      if (/^admin:\s/i.test(t)) return false
      if (/^\[admin\]/i.test(t)) return false
      if (/^internal:\s/i.test(t)) return false
      return true
    })
    .join('\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!filtered) return null
  return filtered.length > 600 ? filtered.slice(0, 597) + '…' : filtered
}

export function UpdateAvailableDialog() {
  const [open, setOpen] = useState(false)
  const [version, setVersion] = useState<string | null>(null)
  const [notes, setNotes] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  // Versions we've already announced this session. Prevents the
  // periodic 4-hour check from re-popping the same dialog after the
  // operator chose "Later".
  const announcedRef = useRef<Set<string>>(new Set())
  // Hold a ref to the bridge so the "Download now" handler doesn't
  // need to re-resolve `window.scriptureLive` every click.
  const bridgeRef = useRef<ScriptureLiveBridge | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!/Electron/i.test(navigator.userAgent)) return
    const bridge = (window as unknown as { scriptureLive?: ScriptureLiveBridge })
      .scriptureLive
    if (!bridge?.updater?.onState) return
    bridgeRef.current = bridge

    const handle = (s: UpdaterState) => {
      if (s.status !== 'available') return
      if (announcedRef.current.has(s.version)) return
      announcedRef.current.add(s.version)
      setVersion(s.version)
      setNotes(summariseReleaseNotes(s.releaseNotes))
      setOpen(true)
    }

    // Subscribe FIRST so we don't miss the very first state push if it
    // races the initial getState() resolve.
    const unsubscribe = bridge.updater.onState(handle)

    // Then read the current state — covers the case where the updater
    // already detected an available update before this component
    // mounted (e.g. the periodic check fired during a navigation).
    bridge.updater.getState?.().then((s) => {
      handle(s)
    }).catch(() => {
      // Non-fatal: getState is optional and the subscription above
      // will catch any subsequent state push.
    })

    return () => {
      try { unsubscribe() } catch { /* no-op */ }
    }
  }, [])

  const onDownloadNow = async () => {
    const bridge = bridgeRef.current
    if (!bridge?.updater?.download) {
      setOpen(false)
      return
    }
    setDownloading(true)
    try {
      await bridge.updater.download()
    } catch {
      // Errors are surfaced by the existing UpdateNotifier toast
      // through the same updater:state channel — no need to show a
      // second error UI here.
    } finally {
      setDownloading(false)
      setOpen(false)
    }
  }

  // Don't even render the dialog tree until we have a version to
  // announce. Keeps the DOM clean for browser previews and pre-update
  // sessions.
  if (!version) return null

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Update available — v{version}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm leading-relaxed">
              <p>
                A new version of ScriptureLive AI is ready to download.
                The download runs in the background — your current
                session won&apos;t be interrupted.
              </p>
              {notes ? (
                <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs whitespace-pre-wrap text-muted-foreground max-h-48 overflow-y-auto">
                  {notes}
                </div>
              ) : null}
              {/* v0.6.6 — Uninstall-first prompt. The operator confirmed
                  installing on top of the existing copy can fail (NSIS
                  refuses when the running .exe holds locks on
                  resources/app.asar). The safest flow is: stop the app
                  → uninstall the old version from Windows Settings →
                  install v{x.y.z}. The button below opens the Settings
                  Apps page directly via ms-settings:appsfeatures so the
                  operator doesn't have to hunt through the Start menu. */}
              <div className="rounded-md border border-red-500/50 bg-red-950/40 px-3 py-2 text-xs text-red-100 space-y-2">
                <p className="font-semibold text-red-50">
                  Important — uninstall first
                </p>
                <p>
                  Please uninstall the current ScriptureLive AI version
                  from Windows Settings → Apps before installing this
                  update. Installing on top of the existing version may
                  fail. Your activation, library and admin settings are
                  preserved across reinstalls.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const bridge = bridgeRef.current
                    void bridge?.app?.openUninstall?.()
                  }}
                  className="inline-flex items-center justify-center rounded border border-red-400/70 bg-red-900/60 px-2.5 py-1 text-[11px] font-semibold text-red-50 hover:bg-red-900/80 hover:border-red-300 transition-colors"
                >
                  Open Windows Apps page (uninstall first)
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                After the download finishes, the installer is also
                copied to your Desktop so you have a backup copy you
                can use later or on another PC.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={downloading}>Later</AlertDialogCancel>
          <AlertDialogAction onClick={onDownloadNow} disabled={downloading}>
            {downloading ? 'Starting download…' : 'Download now'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
