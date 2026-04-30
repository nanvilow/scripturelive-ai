'use client'

import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import { useDesktop, useNdi, type UpdateState } from '@/lib/use-electron'
import { cleanReleaseNotes } from '@/lib/release-notes'
import { releaseTagUrl } from '@/lib/github-repo'

function formatPercent(p: number): string {
  if (!Number.isFinite(p)) return '0%'
  return `${Math.max(0, Math.min(100, Math.round(p)))}%`
}

// v0.7.17 — Mirrors the unit/format conventions of the toast in
// update-notifier.tsx so the progress badge in the banner reads
// identically across surfaces. Returns null when speed is 0 so the
// caller can hide the line entirely (avoids "0 KB/s" flicker between
// the rolling-window samples).
function formatSpeed(bps: number | undefined): string | null {
  const b = bps ?? 0
  if (!Number.isFinite(b) || b <= 0) return null
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB/s`
  if (b >= 1024) return `${(b / 1024).toFixed(0)} KB/s`
  return `${Math.round(b)} B/s`
}

function formatEta(eta: number | undefined): string | null {
  if (eta == null || !Number.isFinite(eta) || eta < 1) return null
  if (eta >= 60) {
    const m = Math.floor(eta / 60)
    const sec = Math.round(eta % 60)
    return `ETA ${m}m ${sec}s`
  }
  return `ETA ${Math.round(eta)}s`
}

function formatMb(bytes: number | undefined): string | null {
  if (bytes == null || !Number.isFinite(bytes)) return null
  return `${(bytes / 1024 / 1024).toFixed(1)}`
}

function getNotes(state: UpdateState): string {
  if (state.status === 'available' || state.status === 'downloaded') {
    // Run the raw notes through cleanReleaseNotes so the GitHub
    // "Full Changelog" footer and "New Contributors" boilerplate
    // don't dominate the markdown render in the banner.
    return cleanReleaseNotes(state.releaseNotes)
  }
  return ''
}

function getReleaseUrl(state: UpdateState): string | null {
  if (state.status !== 'available' && state.status !== 'downloaded') return null
  // electron-updater hands us bare semvers (e.g. "1.4.2"). releaseTagUrl
  // tolerates either "1.4.2" or "v1.4.2" and falls back to the "latest"
  // release page when the version is missing.
  return releaseTagUrl(state.version)
}

export function UpdateBanner() {
  const desktop = useDesktop()
  // While NDI is on the air, hold the banner — an accidental click on
  // "Restart now" mid-service tears the source off the air in vMix /
  // OBS. The tray icon's colored badge keeps the operator aware that
  // an update is pending; the banner re-appears on its own as soon as
  // they stop the sender (the `useNdi` subscription pushes a new
  // status, this component re-renders, and `onAir` flips back to
  // false). Update checks + downloads continue in the background
  // either way, so the only thing being suppressed is the prompt.
  const { status: ndiStatus } = useNdi()
  const onAir = ndiStatus?.running === true
  const [state, setState] = useState<UpdateState>({ status: 'idle' })
  const [dismissed, setDismissed] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  // v0.5.31 — local "cancelling…" flag so the operator gets immediate
  // visual feedback when they click Cancel; cleared by the next
  // `updater:state` push (idle/error/available).
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    if (!desktop) return
    let cancelled = false
    desktop.updater.getState().then((s) => { if (!cancelled) setState(s) })
    const unsub = desktop.updater.onState((s) => {
      setState(s)
      setDismissed(false)
      setShowNotes(false)
      // v0.5.31 — any state push past 'downloading' (idle/error/
      // available/downloaded) means the cancel either succeeded or
      // is irrelevant; clear the local spinner.
      if (s.status !== 'downloading') setCancelling(false)
    })
    return () => { cancelled = true; unsub() }
  }, [desktop])

  if (!desktop) return null
  if (dismissed) return null
  if (onAir) return null

  let body: React.ReactNode = null
  if (state.status === 'available') {
    body = (
      <span>
        Update available — version <strong>{state.version}</strong> is downloading in the background.
      </span>
    )
  } else if (state.status === 'downloading') {
    // v0.7.17 — Surface the multi-threaded downloader's throughput so
    // operators can see the bar is actually moving (and roughly how
    // long it has left). Mirrors the toast layout in update-notifier
    // so both surfaces read identically.
    const pct = Math.max(0, Math.min(100, Math.round(state.percent || 0)))
    const mbDone = formatMb(state.transferred)
    const mbTotal = formatMb(state.total)
    const sizeLine = mbDone && mbTotal ? `${mbDone} / ${mbTotal} MB` : null
    const speedLine = formatSpeed(state.bytesPerSecond)
    const etaLine = formatEta(state.etaSeconds)
    const chunksLine =
      state.parallelism && state.parallelism > 1
        ? `${state.parallelism} chunks`
        : null
    const detail = [sizeLine, speedLine, etaLine, chunksLine]
      .filter(Boolean)
      .join(' · ')
    body = (
      <div className="flex flex-col gap-1.5">
        <span>
          Downloading update… <strong>{pct}%</strong>
        </span>
        {/* Native <progress> respects OS theming and is GPU-cheap;
            dropped to 6px height so the banner stays compact. */}
        <progress
          value={pct}
          max={100}
          className="h-1.5 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary"
        />
        {detail && (
          <span className="text-xs text-muted-foreground">{detail}</span>
        )}
      </div>
    )
  } else if (state.status === 'downloaded') {
    body = (
      <span>
        Update available — restart to install <strong>v{state.version}</strong>.
      </span>
    )
  } else {
    return null
  }

  const showInstall = state.status === 'downloaded'
  const notes = getNotes(state)
  const hasNotes = notes.length > 0
  const releaseUrl = getReleaseUrl(state)

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 flex max-w-[min(92vw,32rem)] flex-col gap-2 rounded-2xl border border-border bg-background/95 px-4 py-2 text-sm shadow-lg backdrop-blur"
    >
      <div className="flex items-center gap-3">
        <div className="flex-1">{body}</div>
        {/* v0.5.31 — Cancel download. Visible only while a download
            is in flight, and only if the preload bridge actually
            exposes the cancel handler (older desktop builds may
            not). Operator-friendly: a single click aborts the
            download, the state drops back to 'idle', and the
            available-update popup will re-appear on the next
            background check so they can retry later. */}
        {state.status === 'downloading' && desktop.updater.cancel && (
          <button
            type="button"
            disabled={cancelling}
            onClick={async () => {
              if (!desktop.updater.cancel) return
              setCancelling(true)
              const res = await desktop.updater.cancel()
              if (!res.ok) setCancelling(false)
            }}
            className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
            title="Stop downloading the update"
          >
            {cancelling ? 'Cancelling…' : 'Cancel'}
          </button>
        )}
        {showInstall && (
          <button
            type="button"
            disabled={installing}
            onClick={async () => {
              setInstalling(true)
              const res = await desktop.updater.install()
              if (!res.ok) setInstalling(false)
            }}
            className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {installing ? 'Restarting…' : 'Restart now'}
          </button>
        )}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="text-muted-foreground hover:text-foreground"
        >
          ×
        </button>
      </div>
      {hasNotes && (
        <div className="border-t border-border/60 pt-2">
          <button
            type="button"
            onClick={() => setShowNotes((v) => !v)}
            aria-expanded={showNotes}
            aria-controls="update-banner-release-notes"
            className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <span>What's new</span>
            <span aria-hidden="true">{showNotes ? '▾' : '▸'}</span>
          </button>
          {showNotes && (
            <div
              id="update-banner-release-notes"
              className="prose prose-sm dark:prose-invert mt-2 max-h-48 max-w-none overflow-y-auto rounded-md bg-muted/50 p-2 text-xs leading-relaxed text-foreground prose-headings:mt-2 prose-headings:mb-1 prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-pre:my-1 prose-headings:text-foreground prose-strong:text-foreground prose-a:text-primary"
            >
              <ReactMarkdown
                remarkPlugins={[remarkBreaks]}
                components={{
                  a: ({ node: _node, ...props }) => (
                    <a {...props} target="_blank" rel="noopener noreferrer" />
                  ),
                }}
              >
                {notes}
              </ReactMarkdown>
            </div>
          )}
          {releaseUrl && showNotes && (
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
      {releaseUrl && (!hasNotes || !showNotes) && (
        <div className="border-t border-border/60 pt-2 text-right">
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
  )
}
