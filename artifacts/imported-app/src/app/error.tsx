'use client'

// v0.7.107 — Per-route error boundary. Catches React exceptions that
// don't reach the root global-error boundary (i.e. ones thrown by
// children inside the RootLayout's ThemeProvider tree). Same
// recovery strategy: hard-reload to '/' to flush stale context.
// See ./global-error.tsx for the rationale.

import { useEffect } from 'react'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function Error({ error }: ErrorProps) {
  useEffect(() => {
    try {
      // eslint-disable-next-line no-console
      console.error('[route-error] caught — hard-reloading to /', {
        message: error?.message,
        digest: error?.digest,
      })
    } catch { /* ignore */ }
    try { window.location.assign('/') } catch {
      try { window.location.href = '/' } catch { /* ignore */ }
    }
  }, [error])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#0a0a0a',
        color: '#9ca3af',
        font: '14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 14,
        zIndex: 2147483647,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          border: '2px solid #27272a',
          borderTopColor: '#f59e0b',
          animation: 'sl-spin 0.9s linear infinite',
        }}
      />
      <div>Reconnecting…</div>
      <style>{`@keyframes sl-spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
