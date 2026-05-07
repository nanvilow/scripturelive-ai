'use client'

/**
 * v0.7.114 — Operator request: "Disable all the notifications showing
 * in the app; I don't like them showing." Returning null unconditionally
 * suppresses every Sonner toast in the app — success, error, loading,
 * and message — without having to touch the ~80 individual `toast.*()`
 * call sites. Toasts are still emitted into the Sonner store (no code
 * is removed), they simply have no visual surface.
 *
 * If we ever need to re-enable toasts on a specific surface (e.g.
 * operator console only), restore the path-aware mount that lived here
 * in v0.7.74-v0.7.113 — see git history for the previous implementation.
 */
export function PathAwareToaster() {
  return null
}
