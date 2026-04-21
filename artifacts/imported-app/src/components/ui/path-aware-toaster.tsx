'use client'

/**
 * Notifications are intentionally disabled across the entire app per
 * operator request — silent operation. The existing toast.* call
 * sites still execute (sonner just buffers events with no UI), and
 * by not mounting any <Toaster /> they never render. This keeps the
 * console quiet on every surface (operator console, congregation TV,
 * NDI feed, presenter view) without having to touch every call site.
 */
export function PathAwareToaster() {
  return null
}
