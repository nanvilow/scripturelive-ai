'use client'

import { useEffect, useRef } from 'react'
import { useAppStore } from '@/lib/store'
import { buildOutputPayload } from '@/lib/output-payload'
import { isBroadcastSuppressed, onSuppressionChange, setBroadcastSuppressed } from '@/lib/broadcast-gate'

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
  // v0.7.57 — Minimised-window NDI freeze fix.
  //
  // Originally we coalesced flushes with requestAnimationFrame so the
  // outbound POST cost was naturally limited to ~60Hz. The problem:
  // when the operator MINIMISES the main ScriptureLive window (the
  // canonical pre-vMix workflow), Chromium suspends rAF callbacks
  // entirely on the hidden BrowserWindow. The renderer keeps detecting
  // verses (Whisper + Web Audio aren't gated by rAF), the Zustand
  // store keeps updating, and onChange/schedule keep being called —
  // but the queued rAF never fires, so /api/output is never POSTed,
  // SSE never broadcasts, and the offscreen NDI capture window keeps
  // painting the LAST state it received before minimise. Operators
  // saw the verse change on screen but vMix's NDI receiver stayed
  // frozen until they restored the window (which fired the deferred
  // rAF) and then minimised again.
  //
  // setTimeout is NOT throttled to a stop on hidden Electron windows
  // the way rAF is — it stays at full rate when backgroundThrottling
  // is left on its default (and the renderer here doesn't disable it,
  // because the operator console doesn't need 60fps when minimised,
  // only the NDI capture window does, which already sets it false).
  // 16ms gives the same one-frame coalescing rAF gave us, so the POST
  // rate is unchanged while the window is visible and the NDI feed
  // updates in real time while minimised.
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false

    // v0.7.127 — payload construction lives in src/lib/output-payload.ts
    // so the Settings Preview iframe can build an IDENTICAL payload
    // and hand it to the same /api/output/congregation renderer via
    // postMessage. Single source of truth → preview ↔ live ↔ NDI all
    // consume the same shape. The rest of this loop (debounce, retry,
    // stale-snapshot guard) is untouched.
    const buildPayload = () => buildOutputPayload(useAppStore.getState())
    void buildPayload
    if (false as boolean) {
    const _legacy = () => {
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
            mediaPaused: isMediaVideo ? !!s.liveMediaPaused : undefined,
            // Broadcast the master clock so the secondary screen seeks
            // to the same frame as Live whenever drift exceeds ~0.4s.
            mediaCurrentTime: isMediaVideo ? s.liveMediaCurrentTime : undefined,
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
        // v0.6.4 — operator's NDI lower-third size multiplier so the
        // congregation renderer + every downstream NDI receiver picks
        // up the new scale on the next broadcast tick.
        ndiLowerThirdScale: sExt.ndiLowerThirdScale,
        ndiShowReferenceOnOutput: sExt.ndiShowReferenceOnOutput,
        ndiReferenceTextShadow: sExt.ndiReferenceTextShadow,
        // v0.6.9 — Reference-typography fields. CRITICAL fix: these
        // were missing from the broadcasted state, so the secondary
        // screen + NDI feed always saw `referenceFontSize ===
        // undefined` etc. and silently fell back to body settings,
        // even though the operator's Typography panel had moved them
        // to a different value. The renderer in route.ts (line 629)
        // explicitly reads `st.referenceFontSize` etc. for the live
        // (non-NDI) surface — without these in the SSE payload that
        // read returns undefined every tick. That is the root cause
        // of operator reports that "Reference Font Size + Reference
        // Text Scale + Reference Text Alignment + Reference Font
        // Family + Reference Text Shadow do nothing on the second
        // screen". Forwarding them here closes the gap.
        referenceFontSize: settings.referenceFontSize,
        referenceFontFamily: settings.referenceFontFamily,
        referenceTextShadow: settings.referenceTextShadow,
        referenceTextScale: settings.referenceTextScale,
        referenceTextAlign: settings.referenceTextAlign,
        // v0.6.9 — Operator-controlled Bible body line-height. New
        // setting added in v0.6.9; default 1.4. Mirrors the existing
        // ndiBibleLineHeight override but applies to BOTH surfaces
        // (live screen + NDI) when no NDI-only value is set.
        bibleLineHeight: sExt.bibleLineHeight,
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
    void _legacy
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
      // v0.7.234 — Defer the POST while a slider is actively being
      // dragged. The gate is module-local (broadcast-gate.ts) so this
      // check is one boolean read, no React subscription. dirtyRef
      // stays true; the suppression-change listener below drains it
      // with a single immediate flush on pointer release.
      if (isBroadcastSuppressed()) return
      if (flushTimerRef.current !== null) return
      // 16ms ≈ one frame at 60Hz. Coalesces bursty store updates into
      // a single POST while keeping the NDI feed responsive even when
      // the main window is minimised (see ref-declaration comment for
      // the full v0.7.57 rationale).
      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = null
        void flush()
      }, 16)
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

    // v0.7.234 — Global pointerdown sentinel for ALL slider widgets.
    //
    // Why this is necessary IN ADDITION to the per-Slider gate flip in
    // `ui/slider.tsx`: the high-traffic operator sliders in Settings
    // (text scale, line height, bg brightness, font size, etc.) and
    // the operator console (volume, mic gain) are native
    // `<input type="range">` elements, NOT the Radix Slider component.
    // The per-Slider handler covers the Radix path; this document-
    // level capture-phase listener covers the native-range path AND
    // anything else that semantically behaves like a slider (Radix
    // SliderPrimitive descendants exposed via `data-slot="slider-*"`).
    //
    // Capture phase: ensures we flip the gate BEFORE any onPointerDown
    // / onChange handler the slider attaches further down the tree
    // can run and call `updateSettings({...})` → store update →
    // schedule(). The schedule() short-circuit on the very first
    // store update of the drag depends on the gate being true by
    // then.
    //
    // Release: window-level pointerup/pointercancel one-shot — same
    // pattern as the per-Slider handler. Self-removing on first fire.
    //
    // Idempotent: setBroadcastSuppressed(true) is a no-op when already
    // true, so the per-Slider + global paths layered together cause
    // no extra listener fan-out.
    const isSliderTarget = (t: EventTarget | null): boolean => {
      if (!(t instanceof Element)) return false
      // Native range input — every Settings slider in this codebase.
      if (t.matches('input[type="range"]')) return true
      // Radix Slider primitives — covers thumb, track, range, and the
      // Root itself. The per-Slider handler is the primary, this is
      // belt-and-brace for any callsite that uses Radix without going
      // through our wrapper.
      if (t.matches('[data-slot^="slider"]')) return true
      if (t.closest('[data-slot^="slider"]')) return true
      return false
    }
    const onGlobalPointerDown = (e: PointerEvent) => {
      if (!isSliderTarget(e.target)) return
      // setBroadcastSuppressed is idempotent so layered triggers
      // (this listener + the per-Slider handler firing on the same
      // event) collapse to a single true flip + a single listener
      // fan-out.
      setBroadcastSuppressed(true)
      const release = () => {
        setBroadcastSuppressed(false)
        window.removeEventListener('pointerup', release)
        window.removeEventListener('pointercancel', release)
      }
      window.addEventListener('pointerup', release)
      window.addEventListener('pointercancel', release)
    }
    document.addEventListener('pointerdown', onGlobalPointerDown, true)

    // v0.7.234 — When the slider-drag gate flips back to false, drain
    // any accumulated dirty snapshot in a single immediate flush so
    // receivers snap to the operator's final value with sub-frame
    // latency. Without this listener the dirty bit would only get
    // flushed on the NEXT store mutation — which can be many seconds
    // later if the operator just released a slider and walked away.
    const unsubGate = onSuppressionChange(() => {
      if (cancelled) return
      if (isBroadcastSuppressed()) return
      if (!dirtyRef.current) return
      // Skip the 16ms debounce on release — operator finished an
      // explicit drag, they want the result NOW.
      if (flushTimerRef.current !== null) {
        clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }
      void flush()
    })

    return () => {
      cancelled = true
      unsubscribe()
      unsubGate()
      document.removeEventListener('pointerdown', onGlobalPointerDown, true)
      // v0.7.234 — Release the gate on unmount. If the broadcaster
      // ever unmounts mid-drag (HMR, root teardown), a stuck-true
      // gate would silently freeze every SSE broadcast on the next
      // mount until something else flipped it back.
      setBroadcastSuppressed(false)
      if (flushTimerRef.current !== null) {
        clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }
    }
  }, [])

  return null
}
