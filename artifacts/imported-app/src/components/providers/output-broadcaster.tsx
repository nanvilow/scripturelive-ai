'use client'

import { useEffect, useRef } from 'react'
import { useAppStore } from '@/lib/store'

/**
 * Global Output Broadcaster.
 *
 * Mounted once at the root of the app (above all views). Watches the
 * Zustand store for slide / live / settings / outputEnabled changes
 * and POSTs the latest state to /api/output, which then fans out to
 * the secondary screen (and any other SSE subscribers like the NDI
 * proxy or remote display).
 *
 * Why this lives here instead of inside the live-console shell:
 *   The Settings page is a full-screen overlay that REPLACES the
 *   live-console shell in the React tree. While the operator is on
 *   Settings the shell is unmounted, so any broadcaster that lives
 *   inside it stops firing — which is why settings tweaks used to
 *   only show up after closing Settings or refreshing.
 *
 * What gets transmitted:
 *   - Active slide (or null if nothing is on air or output is off).
 *   - isLive flag.
 *   - displayMode + every secondary-screen setting the renderer
 *     reads (display ratio, text scale, theme, fonts, lower-third
 *     layout, custom background, etc).
 *
 * Stability — single stable send loop:
 *   The previous implementation re-created its async closure every
 *   time the effect re-ran, which let an in-flight retry capture
 *   stale state and clobber a newer payload (out-of-order broadcast).
 *   Here we keep ONE long-lived send loop and a single `latestRef`
 *   snapshot that the loop always reads from. The store subscription
 *   only ever updates the ref and pings the loop — there is no
 *   per-render closure that can go stale, and the in-flight retry
 *   always picks up the freshest snapshot.
 */
export function OutputBroadcaster() {
  // We mirror the latest store snapshot into a ref so the long-lived
  // send loop always reads the freshest value, never a stale one.
  const latestRef = useRef<string>('')
  const lastSentRef = useRef<string>('')
  const inFlightRef = useRef<boolean>(false)
  const dirtyRef = useRef<boolean>(false)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false

    const buildPayload = () => {
      const s = useAppStore.getState()
      const cur = s.liveSlideIndex >= 0 ? s.slides[s.liveSlideIndex] : null
      const next = s.liveSlideIndex >= 0 && s.liveSlideIndex + 1 < s.slides.length
        ? s.slides[s.liveSlideIndex + 1]
        : null
      const settings = s.settings
      const settingsBlock = {
        fontSize: settings.fontSize,
        fontFamily: settings.fontFamily,
        textShadow: settings.textShadow,
        showReferenceOnOutput: settings.showReferenceOnOutput,
        lowerThirdHeight: settings.lowerThirdHeight,
        lowerThirdPosition: settings.lowerThirdPosition,
        customBackground: settings.customBackground,
        congregationScreenTheme: settings.congregationScreenTheme,
        displayRatio: settings.displayRatio,
        textScale: settings.textScale,
        textAlign: settings.textAlign,
      }
      return s.outputEnabled
        ? {
            type: 'slide' as const,
            slide: cur,
            nextSlide: next,
            slideIndex: s.liveSlideIndex >= 0 ? s.liveSlideIndex : undefined,
            slideTotal: s.slides.length,
            sermonNotes: s.sermonNotes || undefined,
            countdownEndAt: s.countdownEndAt || null,
            isLive: s.isLive,
            displayMode: settings.displayMode,
            settings: settingsBlock,
          }
        : {
            type: 'clear' as const,
            slide: null,
            nextSlide: null,
            sermonNotes: s.sermonNotes || undefined,
            countdownEndAt: s.countdownEndAt || null,
            isLive: false,
            displayMode: settings.displayMode,
            settings: settingsBlock,
          }
    }

    const flush = async () => {
      if (cancelled) return
      if (inFlightRef.current) return
      // Always read the most recent snapshot from the ref, never from
      // a captured closure — this is what prevents the stale-payload
      // race the old implementation had.
      const key = latestRef.current
      if (!key || key === lastSentRef.current) {
        dirtyRef.current = false
        return
      }
      const sending = key
      inFlightRef.current = true
      dirtyRef.current = false
      try {
        await fetch('/api/output', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: sending,
          keepalive: true,
        })
        lastSentRef.current = sending
      } catch {
        // Mark dirty so the next tick retries with whatever the
        // freshest snapshot is by then.
        dirtyRef.current = true
      } finally {
        inFlightRef.current = false
        if (!cancelled && (dirtyRef.current || latestRef.current !== lastSentRef.current)) {
          schedule()
        }
      }
    }

    const schedule = () => {
      if (cancelled) return
      if (rafRef.current !== null) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        void flush()
      })
    }

    const onChange = () => {
      try {
        latestRef.current = JSON.stringify(buildPayload())
      } catch {
        return
      }
      dirtyRef.current = true
      schedule()
    }

    // Prime with the initial state so the secondary screen gets a
    // snapshot immediately on first mount.
    onChange()

    // Subscribe to the entire store so any relevant slice change
    // (slides, live index, isLive, outputEnabled, any settings field)
    // triggers exactly one rebuild + one debounced flush.
    const unsubscribe = useAppStore.subscribe(onChange)

    return () => {
      cancelled = true
      unsubscribe()
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [])

  return null
}
