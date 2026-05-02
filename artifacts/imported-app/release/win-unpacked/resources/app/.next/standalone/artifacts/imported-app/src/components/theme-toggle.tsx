'use client'

// v0.6.0 — Light/Dark theme toggle button for the top toolbar.
//
// Renders a Sun in dark mode (click to go light) and a Moon in light
// mode (click to go dark). We deliberately gate the icon on a
// hydration-safe `mounted` flag so the server-rendered HTML doesn't
// mismatch the client's resolved theme — next-themes recommends this
// pattern in their README to avoid the "flash of wrong icon".
//
// The button matches the height/spacing of LicenseTopBarButton so the
// toolbar stays a clean horizontal rule.

import { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Resolve the EFFECTIVE theme (resolvedTheme reflects system pref
  // when defaultTheme is 'system'; we use 'dark' as default, but the
  // resolvedTheme accessor still gives the truthful current value).
  const current = mounted ? (resolvedTheme || theme || 'dark') : 'dark'
  const isDark = current === 'dark'

  const handleToggle = () => {
    setTheme(isDark ? 'light' : 'dark')
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className={cn(
        'h-7 w-7 inline-flex items-center justify-center rounded-md',
        'border border-border bg-card hover:bg-muted/60',
        'text-muted-foreground hover:text-foreground',
        'transition-colors shrink-0',
      )}
    >
      {/* Render BOTH icons + use opacity so the swap is animated and
          we never get a layout shift when next-themes hydrates. */}
      <Sun
        className={cn(
          'h-3.5 w-3.5 transition-all',
          isDark ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-0 absolute',
        )}
      />
      <Moon
        className={cn(
          'h-3.5 w-3.5 transition-all',
          isDark ? 'opacity-0 rotate-90 scale-0 absolute' : 'opacity-100 rotate-0 scale-100',
        )}
      />
    </button>
  )
}
