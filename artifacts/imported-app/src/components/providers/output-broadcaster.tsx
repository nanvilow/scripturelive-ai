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
      const baseCur = s.liveSlideIndex >= 0 ? s.slides[s.liveSlideIndex] : null
      // Stamp the current operator transport flag onto the live slide
      // so the congregation route can call .play()/.pause() on the
      // existing <video> element without rebuilding it (which would
      // reset playback to t=0). Only video media slides care.
      const isMediaVideo = !!(baseCur && baseCur.type === 'media' && baseCur.mediaKind === 'video')
      const cur = baseCur
        ? {
            ...baseCur,
            mediaPaused: isMediaVideo ? !!s.mediaPaused : undefined,
            // Broadcast the master clock so the secondary screen seeks
            // to the same frame as Live whenever drift exceeds ~0.4s.
            mediaCurrentTime: isMediaVideo ? s.mediaCurrentTime : undefined,
          }
        : null
      const next = s.liveSlideIndex >= 0 && s.liveSlideIndex + 1 < s.slides.length
        ? s.slides[s.liveSlideIndex + 1]
        : null
      const settings = s.settings
      // v0.6.2 — index-signature view onto settings so we can read
      // every NDI override (some are loosely typed in the store).
      // TypeScript otherwise blocks `settings.ndiFontFamily` etc. on
      // the strict AppSettings shape.
      const sExt = settings as unknown as Record<string, unknown>
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
        // Independent NDI display mode — the congregation renderer
        // respects this when it sees `?ndi=1` on the URL (the NDI
        // sender's hidden window), so vMix/OBS can receive a Lower
        // Third even while the projector stays at Full Screen.
        ndiDisplayMode: settings.ndiDisplayMode,
        // v0.6.2 — every NDI-only override now propagates through the
        // SSE channel. v0.6.1 only forwarded ndiDisplayMode, which
        // meant every other NDI-tab control (font, text size, shadow,
        // alignment, scale, aspect ratio, bible color/lineheight,
        // reference style/position/scale, translation) was effectively
        // dead — the operator could click anything and the in-app
        // NDI Live Preview iframe + downstream NDI receivers would
        // both keep rendering against the Mirror-Live defaults.
        ndiFontFamily: sExt.ndiFontFamily,
        ndiFontSize: sExt.ndiFontSize,
        ndiTextShadow: sExt.ndiTextShadow,
        ndiTextAlign: sExt.ndiTextAlign,
        ndiTextScale: sExt.ndiTextScale,
        ndiAspectRatio: sExt.ndiAspectRatio,
        ndiBibleColor: sExt.ndiBibleColor,
        ndiBibleLineHeight: sExt.ndiBibleLineHeight,
        ndiRefSize: sExt.ndiRefSize,
        ndiRefStyle: sExt.ndiRefStyle,
        ndiRefPosition: sExt.ndiRefPosition,
        ndiRefScale: sExt.ndiRefScale,
        ndiTranslation: sExt.ndiTranslation,
        ndiCustomBackground: sExt.ndiCustomBackground,
        ndiTheme: sExt.ndiTheme,
        ndiLowerThirdHeight: sExt.ndiLowerThirdHeight,
        ndiLowerThirdPosition: sExt.ndiLowerThirdPosition,
        // v0.6.3 — propagate the new "transparent matte" toggle so the
        // congregation renderer can drop the lt-box gradient when the
        // operator flips it on the NDI tab.
        ndiLowerThirdTransparent: sExt.ndiLowerThirdTransparent,
        ndiShowReferenceOnOutput: sExt.ndiShowReferenceOnOutput,
        ndiReferenceTextShadow: sExt.ndiReferenceTextShadow,
        // Slide transition: style picks Cut (instant swap) vs Fade
        // (crossfade), duration drives the fade length in ms. The
        // congregation route honours both on every slide change.
        slideTransitionStyle: settings.slideTransitionStyle || 'fade',
        slideTransitionDuration: settings.slideTransitionDuration ?? 500,
      }
      // BLACK / HIDDEN — operator hit the "Black" transport button or
      // toggled the HIDDEN control. The current slide stays staged in
      // the store so un-blanking instantly restores it; meanwhile
      // every downstream output renders solid black (the congregation
      // route watches for `blanked:true` and blacks its overlay, so
      // NDI keeps running rather than losing its source).
      const blanked = !!s.outputBlanked
      // Audio routing for downstream surfaces (secondary screen / NDI).
      // Operator's local pane handles its own muting via the existing
      // liveMonitorAudio gate in slide-renderer.tsx — this block tells
      // the OUTSIDE world (congregation TV, NDI feed) what to do:
      //   - broadcastEnabled: master on/off for downstream audio. Maps
      //     to the speaker icon on the Live Display audio rail.
      //   - volume / muted: same master controls the operator drives
      //     from the toolbar / new bottom-right popover.
      // Audio settings live OUTSIDE the `settings` block so the
      // congregation route can apply them WITHOUT bumping its render
      // key (audio-only changes must not rebuild the <video>, or the
      // playhead would seek back to t=0 every time the operator
      // nudged the slider).
      const audio = {
        broadcastEnabled: s.liveBroadcastAudio !== false,
        volume: typeof s.globalVolume === 'number' ? s.globalVolume : 1,
        muted: !!s.globalMuted,
      }
      // Operator hasn't put anything on air yet → secondary screen
      // shows the centred WassMedia splash. Flag flips false the
      // moment any slide goes live (and stays false for the rest of
      // the session) so the splash never bounces back.
      const showStartupLogo = !s.hasShownContent
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
            showStartupLogo,
            displayMode: settings.displayMode,
            settings: settingsBlock,
            blanked,
            audio,
          }
        : {
            type: 'clear' as const,
            slide: null,
            nextSlide: null,
            sermonNotes: s.sermonNotes || undefined,
            countdownEndAt: s.countdownEndAt || null,
            isLive: false,
            showStartupLogo,
            displayMode: settings.displayMode,
            settings: settingsBlock,
            blanked,
            audio,
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
