'use client'

import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import { useDesktop, type UpdateState } from '@/lib/use-electron'
import { cleanReleaseNotes } from '@/lib/release-notes'

// Mirrors the publish.owner/publish.repo block in electron-builder.yml.
// Used to build a "View on GitHub" link to the canonical release page.
const GITHUB_RELEASES_BASE = 'https://github.com/nanvilow/scripturelive-ai/releases'

function formatPercent(p: number): string {
  if (!Number.isFinite(p)) return '0%'
  return `${Math.max(0, Math.min(100, Math.round(p)))}%`
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
  const v = state.version?.trim()
  if (!v) return `${GITHUB_RELEASES_BASE}/latest`
  // electron-updater hands us bare semvers (e.g. "1.4.2"). GitHub release
  // tags are conventionally prefixed with "v", but tolerate either form.
  const tag = v.startsWith('v') ? v : `v${v}`
  return `${GITHUB_RELEASES_BASE}/tag/${encodeURIComponent(tag)}`
}

export function UpdateBanner() {
  const desktop = useDesktop()
  const [state, setState] = useState<UpdateState>({ status: 'idle' })
  const [dismissed, setDismissed] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [showNotes, setShowNotes] = useState(false)

  useEffect(() => {
    if (!desktop) return
    let cancelled = false
    desktop.updater.getState().then((s) => { if (!cancelled) setState(s) })
    const unsub = desktop.updater.onState((s) => {
      setState(s)
      setDismissed(false)
      setShowNotes(false)
    })
    return () => { cancelled = true; unsub() }
  }, [desktop])

  if (!desktop) return null
  if (dismissed) return null

  let body: React.ReactNode = null
  if (state.status === 'available') {
    body = (
      <span>
        Update available — version <strong>{state.version}</strong> is downloading in the background.
      </span>
    )
  } else if (state.status === 'downloading') {
    body = (
      <span>
        Downloading update… <strong>{formatPercent(state.percent)}</strong>
      </span>
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
