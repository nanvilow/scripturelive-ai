'use client'

// v0.6.0 — Light/Dark theme provider.
//
// Wraps next-themes with class-based switching against the existing
// `.dark` Tailwind variant declared in globals.css. Defaults to dark
// because that's the look operators have shipped against since v0.1
// and we don't want a sudden white flash to startle long-time users
// on first install — but the toggle in the top toolbar lets them
// switch instantly, and the choice persists via next-themes' built-in
// localStorage key (`theme`).
//
// `disableTransitionOnChange` is on so panels don't animate their
// background through grey on every toggle — the swap should be
// instantaneous, mirror-of-glass style.

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import type { ThemeProviderProps } from 'next-themes'

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
      storageKey="scripturelive-theme"
      {...props}
    >
      {children}
    </NextThemesProvider>
  )
}
