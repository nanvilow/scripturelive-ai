'use client'

// v0.7.129 — Startup "Update Available" modal popup.
//
// Operator request: "I need you to make a popup available whenever
// there's an update. Anytime users open the app and there's a fresh
// update that should be the first popup that shows up with a little
// message about the new update and they should update to the new
// version now."
//
// We already had `<UpdateBanner>` (toast at bottom-right of the
// screen) since v0.5.x but operators were missing it during the
// busy 5-minutes-before-service window. The banner is passive
// (small, tucked at the bottom, dismisses on its own) — this is the
// opposite: a prominent centered Radix AlertDialog that hijacks the
// foreground the moment the operator launches the app and a fresh
// update is sitting on disk (or available on GitHub Releases).
//
// Behaviour:
//   • Mounts at the root via `<UpdateAvailableDialog />` in
//     `src/app/layout.tsx`. SSR-inert (returns null on the server).
//   • Subscribes to `desktop.updater.onState()` and reads the
//     current state on mount via `getState()`. The dialog opens IFF
//     state.status is 'available' or 'downloaded' AND the operator
//     has not already dismissed THIS specific version.
//   • Per-version dismissal is persisted in `localStorage` under
//     `sl.update-popup-dismissed.<version>`. A new release (v0.7.130
//     after this) gets a fresh prompt — we never nag for the same
//     version twice in a row, but we DO re-prompt for every new
//     version because each release is a fresh ask.
//   • "Update now" — if the binary is already downloaded, calls
//     `desktop.updater.install()` (electron-updater quitAndInstall);
//     if only metadata is known (status 'available'), kicks off the
//     download via `desktop.updater.download()` and closes the
//     dialog so the existing `<UpdateBanner>` can take over the
//     progress UI. Operators get one consistent place for download
//     progress + cancel; the dialog is a one-shot "are you in?"
//     prompt.
//   • "Later" — closes the dialog and writes the per-version
//     dismissal flag. The `<UpdateBanner>` will still surface so the
//     update is never invisible.
//   • While NDI is on the air, the dialog suppresses itself
//     (mirrors `<UpdateBanner>`'s `onAir` guard from v0.6.x).
//     Accidentally clicking "Update now" mid-service would tear the
//     NDI source off the air in vMix/OBS — not a risk we'll let a
//     modal create. Operators get the full prompt the moment NDI
//     stops.
//
// Why AlertDialog and not Dialog: AlertDialog enforces focus trap +
// role=alertdialog semantics + a deliberate intent gesture before
// dismissal — this is exactly the trust contract for "should we
// quit and install a new build?". Mirrors the v0.7.125 confirm-
// dialog choice and keeps a single design language for high-stakes
// prompts.

import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
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
import { useDesktop, useNdi, type UpdateState } from '@/lib/use-electron'
import { cleanReleaseNotes } from '@/lib/release-notes'
import { releaseTagUrl } from '@/lib/github-repo'

const DISMISS_KEY_PREFIX = 'sl.update-popup-dismissed.'

function dismissKey(version: string): string {
  return `${DISMISS_KEY_PREFIX}${version}`
}

function readDismissed(version: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(dismissKey(version)) === '1'
  } catch {
    // localStorage can throw in private mode / file:// — treat as
    // "not dismissed" so the operator is never silently denied the
    // prompt because of a storage edge case.
    return false
  }
}

function writeDismissed(version: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(dismissKey(version), '1')
  } catch {
    // Same swallow as above. Worst case the dialog re-pops on next
    // launch — annoying but never destructive.
  }
}

// Pull a usable version + release-notes snippet out of the
// underlying UpdateState union. Returns null when the state is not
// in a "we have something to install" shape.
function deriveOffer(
  state: UpdateState,
): { version: string; ready: boolean; rawNotes: string | undefined } | null {
  if (state.status === 'downloaded') {
    return { version: state.version, ready: true, rawNotes: state.releaseNotes }
  }
  if (state.status === 'available') {
    return { version: state.version, ready: false, rawNotes: state.releaseNotes }
  }
  return null
}

function truncateNotes(notes: string, max = 480): string {
  if (notes.length <= max) return notes
  // Cut on a sentence/paragraph boundary if possible so the preview
  // doesn't end mid-word. The "View full release notes" link below
  // takes the operator to the GitHub release for the complete diff.
  const slice = notes.slice(0, max)
  const lastBreak = Math.max(
    slice.lastIndexOf('\n\n'),
    slice.lastIndexOf('. '),
    slice.lastIndexOf('! '),
    slice.lastIndexOf('? '),
  )
  return (lastBreak > max * 0.5 ? slice.slice(0, lastBreak + 1) : slice).trimEnd() + '…'
}

export function UpdateAvailableDialog() {
  const desktop = useDesktop()
  const { status: ndiStatus } = useNdi()
  const onAir = ndiStatus?.running === true

  const [state, setState] = useState<UpdateState>({ status: 'idle' })
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<'install' | 'download' | null>(null)

  // Subscribe to the auto-updater state machine. Same pattern as
  // <UpdateBanner> — pull the current snapshot once on mount, then
  // listen for pushes. The push callback also clears the local
  // "busy" spinner so a failed install/download doesn't permanently
  // disable the action button.
  useEffect(() => {
    if (!desktop) return
    let cancelled = false
    desktop.updater.getState().then((s) => {
      if (!cancelled) setState(s)
    })
    const unsub = desktop.updater.onState((s) => {
      setState(s)
      // Once the updater has moved past 'downloading' (downloaded /
      // error / idle / available) any in-flight install action is
      // either complete or moot — clear the spinner so the operator
      // can re-engage if they want.
      if (s.status !== 'downloading') setBusy(null)
    })
    return () => {
      cancelled = true
      unsub()
    }
  }, [desktop])

  const offer = useMemo(() => deriveOffer(state), [state])

  // Open the dialog the first time we see an offer the operator
  // hasn't dismissed yet for THIS specific version. We only auto-
  // open ONCE per mount + per (version, dismissed?) pair so a
  // re-render of the layout doesn't keep re-popping the modal after
  // a manual close.
  useEffect(() => {
    if (!desktop) return
    if (!offer) return
    if (onAir) return
    if (readDismissed(offer.version)) return
    setOpen(true)
    // Intentionally NOT depending on `open` — we want this effect
    // to re-fire ONLY when the underlying offer (version) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desktop, offer?.version, onAir])

  if (!desktop) return null
  if (!offer) return null

  const cleaned = offer.rawNotes ? cleanReleaseNotes(offer.rawNotes) : ''
  const previewNotes = cleaned ? truncateNotes(cleaned) : ''
  const releaseUrl = releaseTagUrl(offer.version)

  // The headline message changes with readiness — "downloaded" means
  // the binary is on disk and one click installs it; "available"
  // means we know about the release but still need to fetch the
  // installer (~120 MB on a typical release).
  const title = offer.ready
    ? `Update ready to install — v${offer.version}`
    : `New update available — v${offer.version}`
  const description = offer.ready
    ? 'A newer version of ScriptureLive AI has been downloaded and is ready to install. Updating only takes a few seconds — the app will restart automatically.'
    : 'A newer version of ScriptureLive AI is available. We can download it in the background right now so you can install it whenever you have a moment.'
  const actionLabel = offer.ready
    ? busy === 'install'
      ? 'Restarting…'
      : 'Update now'
    : busy === 'download'
      ? 'Starting…'
      : 'Download now'

  const handleAction = async () => {
    if (offer.ready) {
      setBusy('install')
      const res = await desktop.updater.install()
      if (!res.ok) setBusy(null)
      // On success the app quits + relaunches into the new version,
      // so we never get a chance to clear `busy` ourselves.
    } else {
      setBusy('download')
      // `download()` was added in v0.7.26's preload; older bundled
      // preloads may not expose it. If it isn't there, just close
      // the modal and let electron-updater's own auto-download
      // (which starts on every app boot in the main process) do the
      // work — the <UpdateBanner> will surface progress as soon as
      // the state moves to 'downloading'.
      if (desktop.updater.download) {
        const res = await desktop.updater.download()
        if (!res.ok && !res.alreadyInProgress) setBusy(null)
      } else {
        setBusy(null)
      }
      // Either way, close the modal — the banner takes over from
      // here. The operator clearly opted in; they don't need a
      // second prompt.
      setOpen(false)
    }
  }

  const handleDismiss = () => {
    writeDismissed(offer.version)
    setOpen(false)
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // Treat any close gesture as "Later" — Esc / overlay click /
        // explicit Cancel all flow through here. Persists the
        // per-version dismissal so we don't re-pop on re-render.
        if (!next) handleDismiss()
        else setOpen(true)
      }}
    >
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {previewNotes && (
          <div className="mt-2 max-h-56 overflow-y-auto rounded-md border border-border bg-muted/40 p-3 text-sm leading-relaxed">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              What&apos;s new
            </div>
            <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:mt-2 prose-headings:mb-1 prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-headings:text-foreground prose-strong:text-foreground prose-a:text-primary">
              <ReactMarkdown
                remarkPlugins={[remarkBreaks]}
                components={{
                  a: ({ node: _node, ...props }) => (
                    <a {...props} target="_blank" rel="noopener noreferrer" />
                  ),
                }}
              >
                {previewNotes}
              </ReactMarkdown>
            </div>
            {releaseUrl && (
              <div className="mt-2 text-right">
                <a
                  href={releaseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  View full release notes on GitHub →
                </a>
              </div>
            )}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy !== null} onClick={handleDismiss}>
            Later
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={busy !== null}
            onClick={(e) => {
              // Prevent Radix's default close-on-action so we control
              // the close ourselves (we want the dialog to stay open
              // while the install spinner is running so the operator
              // sees feedback that the click registered).
              e.preventDefault()
              void handleAction()
            }}
          >
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
