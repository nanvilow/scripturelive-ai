'use client'

import { useEffect, useState } from 'react'
import { useDesktop, type UpdateState } from '@/lib/use-electron'

function formatPercent(p: number): string {
  if (!Number.isFinite(p)) return '0%'
  return `${Math.max(0, Math.min(100, Math.round(p)))}%`
}

export function UpdateBanner() {
  const desktop = useDesktop()
  const [state, setState] = useState<UpdateState>({ status: 'idle' })
  const [dismissed, setDismissed] = useState(false)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    if (!desktop) return
    let cancelled = false
    desktop.updater.getState().then((s) => { if (!cancelled) setState(s) })
    const unsub = desktop.updater.onState((s) => {
      setState(s)
      setDismissed(false)
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

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 flex items-center gap-3 rounded-full border border-border bg-background/95 px-4 py-2 text-sm shadow-lg backdrop-blur"
    >
      {body}
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
  )
}
