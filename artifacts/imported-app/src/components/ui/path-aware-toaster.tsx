'use client'

import { usePathname } from 'next/navigation'
import { Toaster } from '@/components/ui/sonner'

/**
 * v0.7.74 — Restore operator-console toasts.
 *
 * Previous version returned `null` unconditionally, which suppressed
 * EVERY toast across the app — including success/error confirmations
 * for background uploads, license activation, settings changes, etc.
 * The operator's complaint "I click upload and nothing happens" was
 * caused by the silent toast: the upload actually succeeded, but
 * there was no visible confirmation, so it looked broken.
 *
 * The original intent (per the layout.tsx comment "Toasts are
 * suppressed on /congregation, /presenter, and the NDI fan-out so
 * display/output actions never appear on the audience screen") is
 * preserved here: we mount Sonner on every path EXCEPT the output
 * surfaces. In practice the output surfaces are served by API routes
 * that return raw HTML and don't use the Next root layout at all
 * (so this guard is belt-and-braces) — but we keep the path check in
 * case a future refactor moves them under the layout.
 */
const SILENT_PATH_PREFIXES = [
  '/congregation',
  '/presenter',
  '/output',
  '/stage',
  '/ndi',
]

export function PathAwareToaster() {
  const pathname = usePathname() || '/'
  if (SILENT_PATH_PREFIXES.some((p) => pathname.startsWith(p))) {
    return null
  }
  return <Toaster position="bottom-right" richColors closeButton />
}
