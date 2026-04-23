'use client'

import { useEffect, useState } from 'react'
import { useDesktop, type UpdateState } from '@/lib/use-electron'

function formatPercent(p: number): string {
  if (!Number.isFinite(p)) return '0%'
  return `${Math.max(0, Math.min(100, Math.round(p)))}%`
}

function getNotes(state: UpdateState): string {
  if (state.status === 'available' || state.status === 'downloaded') {
    return (state.releaseNotes ?? '').trim()
  }
  return ''
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
              className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-xs leading-relaxed text-foreground"
            >
              {notes}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
