'use client'

import { useEffect } from 'react'

// v0.7.120 — Dead-input watchdog (belt + suspenders to v0.7.119 CSS).
//
// v0.7.119 added `body { pointer-events: auto !important }` to globals.css
// to neutralise the Radix UI Dialog/Popover/Select/DropdownMenu/AlertDialog
// portals' scroll-lock side effect (radix-ui/primitives#1241, #2122).
// The CSS rule wins the cascade in modern browsers, but operator escalation
// (post-v0.7.119): "anytime i tried to click to write something on the app
// it doesn't work" → some users still report dead inputs.
//
// Two known reasons the CSS-only fix can fail:
//   1. INLINE style.pointerEvents = 'none' set via JS by Radix beats the
//      stylesheet rule even with `!important`, because inline style
//      specificity > stylesheet specificity unless the inline value also
//      carries `!important`. Radix sets it as a plain inline value, so
//      our `body { pointer-events: auto !important }` does NOT defeat it.
//   2. Some Electron / Chromium builds intermittently apply the style
//      attribute mutation a tick AFTER the close-handler tries to remove
//      it — race condition.
//
// This watchdog observes <body>'s style attribute via MutationObserver
// and any time `pointer-events: none` (or `pointerEvents = 'none'`) is
// applied inline, removes it on the next microtask. Cost: one observer
// for the lifetime of the app, fires only on Radix open/close transitions
// (a handful per session) and runs in O(1) — no measurable overhead.
//
// Scroll-lock still functions because Radix ALSO applies `overflow: hidden`
// on the same body element via a separate inline value — we only strip
// the click-blocking portion. Both v0.7.119 (CSS floor) and v0.7.120
// (JS watchdog) work together; either alone catches most cases, both
// together catch the race-condition edge cases.
export function PointerEventsWatchdog(): null {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return
    }
    const body = document.body
    if (!body) return

    // Initial sweep — if the body inline style already has pointer-events:none
    // at mount (e.g. a prior Radix portal didn't clean up before SSR/hydrate),
    // strip it immediately so the very first click works.
    const stripIfBlocking = () => {
      // Read the inline style; ignore stylesheet computed value (we don't
      // want to fight our own globals.css rule, just the JS-set inline one).
      const inline = body.style.pointerEvents
      if (inline === 'none') {
        body.style.pointerEvents = ''
      }
    }

    stripIfBlocking()

    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'style') {
          stripIfBlocking()
          break
        }
      }
    })
    obs.observe(body, { attributes: true, attributeFilter: ['style'] })

    return () => {
      obs.disconnect()
    }
  }, [])

  return null
}
