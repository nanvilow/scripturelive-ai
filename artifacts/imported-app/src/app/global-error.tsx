'use client'

// v0.7.107 — Global error boundary that recovers from a renderer
// React exception by hard-reloading to '/'.
//
// PROBLEM (operator field report):
//   When a paid activation expires and the operator exits the app,
//   the next launch paints Chromium's "This page couldn't load /
//   Reload — Back" page instead of the locked-Live-Transcription
//   shell. Screenshot: https://ibb.co/0RTjcFfD.
//
// ROOT CAUSE:
//   The renderer hydrates with the previous session's React tree
//   (license-provider initial state still tagged 'unknown'), polls
//   /api/license/status, gets back state='expired' for the FIRST
//   time after a state transition, and one of the downstream
//   useEffects throws against stale context — same family of bug
//   as the v0.7.101 deactivate-from-PC crash, just triggered by
//   a different state transition.
//
// FIX (mirror of v0.7.101):
//   This Next.js app-router global-error boundary catches ANY
//   uncaught render-phase or effect-phase exception that reaches
//   the root. Instead of letting Chromium paint chrome-error,
//   we immediately hard-navigate to '/' — same `window.location.
//   assign('/')` pattern v0.7.101 used to fix the activation
//   crash. The fresh navigation flushes ALL stale React context,
//   including license-provider, so the next render starts from a
//   clean slate and the lock-overlay surfaces normally.
//
// We render a minimal "Reconnecting…" splash so if for any reason
// the navigation is vetoed (CSP, beforeunload, renderer mid-shut-
// down) the operator at least sees something other than the
// red-X chrome-error.

import { useEffect } from 'react'

interface GlobalErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function GlobalError({ error }: GlobalErrorProps) {
  useEffect(() => {
    // Best-effort breadcrumb so the next session's launch.log shows
    // why we hard-reloaded. Wrapped in try/catch because console may
    // already be gone by the time this fires during shutdown.
    try {
      // eslint-disable-next-line no-console
      console.error('[global-error] caught — hard-reloading to /', {
        message: error?.message,
        digest: error?.digest,
      })
    } catch { /* ignore */ }

    // Hard reload — mirrors v0.7.101 deactivate-from-PC fix. The
    // assignment may throw inside a stripped-down error tree, so
    // we belt-and-braces with .href as a fallback.
    try {
      window.location.assign('/')
    } catch {
      try {
        window.location.href = '/'
      } catch { /* nothing more we can do */ }
    }
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          height: '100vh',
          background: '#0a0a0a',
          color: '#9ca3af',
          font: '14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 14,
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
      </body>
    </html>
  )
}
