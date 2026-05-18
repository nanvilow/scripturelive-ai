// v0.7.199 — React Error Boundary.
//
// Pre-v0.7.199 the only error handling was Next.js's route-level
// error.tsx / global-error.tsx, which catch errors during initial
// render only. A crash thrown from a deep child of LogosShell mid-
// service (e.g. a Bible-lookup card hitting a malformed JSON cache, a
// Scripture-Feed row with a corrupt slide shape, a media surface
// failing on a since-deleted asset) bubbled all the way up and
// triggered Next.js's full-page error overlay — operator sees a white
// screen with a stack trace, loses the entire console state, and has
// to restart the app mid-broadcast.
//
// This boundary catches the error one level above LogosShell /
// SettingsView and shows a recoverable fallback: a small inline
// "Something went wrong in this view" card with a Reload button that
// resets the boundary's state (re-mounts the subtree). The rest of
// the page (SpeechProvider, OutputBroadcaster, LicenseProvider, the
// SSE broadcaster, the NDI sender) stays alive — so the secondary
// screen + NDI feed keep broadcasting whatever was last on-air even
// when the operator console itself recovers from a render error.
//
// We deliberately do NOT wrap individual cards inside LogosShell here
// — that file is 4200+ lines and the v0.7.197 GR-B guards depend on
// its specific call ordering; adding nested boundaries would require
// re-validating every preview-lock site. Single boundary at the
// LogosShell mount point is the right tradeoff between blast-radius
// (operator console only) and risk (no logos-shell changes).

'use client'

import React from 'react'

interface ErrorBoundaryProps {
  children: React.ReactNode
  // Human label shown in the fallback to disambiguate which subtree
  // crashed (e.g. "Live Console" vs "Settings"). Optional.
  label?: string
  // Caller-supplied reset hook. Fires after the internal state is
  // cleared so parents can re-fetch data / re-init providers if they
  // need to (most callers won't).
  onReset?: () => void
}

interface ErrorBoundaryState {
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to the browser console so operators / support can see it in
    // DevTools. Electron's launch.log also captures this via the
    // renderer console-message bridge in electron/main.ts.
    console.error('[ErrorBoundary]', this.props.label || 'unknown', error, errorInfo)
    this.setState({ errorInfo })
  }

  handleReset = () => {
    this.setState({ error: null, errorInfo: null })
    if (this.props.onReset) {
      try {
        this.props.onReset()
      } catch (err) {
        console.error('[ErrorBoundary] onReset threw', err)
      }
    }
  }

  render() {
    if (this.state.error) {
      const label = this.props.label || 'this view'
      return (
        <div
          role="alert"
          className="flex flex-col items-center justify-center min-h-[40vh] p-8 text-center"
        >
          <div className="max-w-md w-full rounded-lg border border-destructive/30 bg-destructive/5 p-6 shadow-sm">
            <h2 className="text-base font-semibold text-foreground mb-2">
              Something went wrong in {label}
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              The secondary screen and NDI output are still broadcasting whatever was last on-air. You can recover this view without restarting the app.
            </p>
            {this.state.error.message && (
              <details className="text-left mb-4">
                <summary className="text-xs text-muted-foreground cursor-pointer">Error details</summary>
                <pre className="mt-2 text-[10px] font-mono text-muted-foreground whitespace-pre-wrap break-words bg-background/50 rounded p-2 max-h-40 overflow-auto">
                  {this.state.error.message}
                  {this.state.errorInfo?.componentStack ? `\n\n${this.state.errorInfo.componentStack}` : ''}
                </pre>
              </details>
            )}
            <button
              type="button"
              onClick={this.handleReset}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-foreground text-background hover:opacity-90 transition-opacity"
            >
              Reload {label}
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
