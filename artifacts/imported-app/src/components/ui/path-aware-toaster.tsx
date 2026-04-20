'use client'

import { usePathname } from 'next/navigation'
import { Toaster } from '@/components/ui/sonner'

/**
 * Renders the global toast container only on operator-facing pages.
 *
 * The congregation, presenter, and NDI fan-out routes share the same
 * root layout as the operator console, so the bare <Toaster /> used
 * to leak "sent live" / "added to schedule" pop-ups onto the live
 * secondary screen — exactly what the screenshot in the bug report
 * showed. Suppressing toasts on those output paths keeps the
 * congregation TV clean while still letting the operator see them on
 * the main console (if they re-enable them in settings later).
 */
export function PathAwareToaster() {
  const pathname = usePathname() || ''
  // Any path that ends up on a screen the audience can see should NOT
  // render toasts. Includes the embedded congregation page, the
  // standalone presenter view, and the NDI raw frame route.
  const isOutputSurface =
    pathname.startsWith('/congregation') ||
    pathname.startsWith('/presenter') ||
    pathname.startsWith('/api/output')
  if (isOutputSurface) return null
  return <Toaster richColors position="bottom-right" />
}
