'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/lib/store'
import { buildOutputPayload, type OutputPayload } from '@/lib/output-payload'
import type { Slide } from '@/lib/store'

/**
 * Settings WYSIWYG preview of the secondary-screen / NDI output.
 *
 * v0.7.127 — Single-renderer architecture. The previous React
 * implementation maintained its own copy of the slide layout (font
 * clamps, padding, lower-third box, opacity defaults) and inevitably
 * drifted from /api/output/congregation. Operators reported the
 * preview painting the verse as a small centred banner while the
 * projector painted it edge-to-edge — same settings, two surfaces,
 * completely different layouts. v0.7.124 unified just the font-size
 * formula, but every other axis (reference opacity 60% vs 100%,
 * lower-third 56% width cap vs 95%, missing bg-overlay, fixed 16:9
 * vs settings.displayRatio, line-clamp:6, letter-spacing, …) still
 * diverged.
 *
 * Fix: the preview IS the live page running off-screen in an
 * iframe. /api/output/congregation?preview=1 is a special branch of
 * the same renderer that bypasses SSE/poll and listens for
 * postMessage instead. The Zustand store is funnelled through the
 * SAME buildOutputPayload() helper the SSE broadcaster uses, then
 * posted into the iframe on every store change. What the operator
 * sees here is therefore byte-identical to what the projector + NDI
 * feed will paint when the broadcaster ships the same payload. New
 * render-affecting fields are honoured automatically — there is no
 * second renderer to maintain.
 *
 * `mode` chooses which displayMode the iframe forces:
 *   - 'auto'         → no override, follows settings.displayMode
 *   - 'full'         → ?fullScreen=1
 *   - 'lower-third'  → ?lowerThird=1
 */
export function OutputPreview({
  mode = 'auto',
  label,
  sample,
  slideOverride,
  derivePreview = false,
  mirrorLive = false,
  hideModeBadge = false,
  className,
  aspectOverride,
  noMedia = false,
}: {
  mode?: 'auto' | 'full' | 'lower-third'
  label?: string
  sample?: { reference: string; text: string }
  /**
   * v0.7.200-hotfix.2 — When true, the iframe always renders
   * `slides[previewSlideIndex]` read DIRECTLY from store state at
   * subscriber-fire time (via useAppStore.getState()). This is the
   * snap-back fix: the previous slideOverride prop path captured
   * the slide via React closure, which went stale during the
   * synchronous Zustand notification window before React could
   * re-render. Reading from getState() inside the subscriber
   * always returns the freshest slide, eliminating the stale-prop
   * race that caused operator-visible "preview snaps back to live
   * on single-click". The media-paused tweak (preview audio muted
   * when same media is on Live) is applied inline.
   */
  derivePreview?: boolean
  /**
   * v0.7.198 — When true, append ?noMedia=1 to the iframe URL so the
   * renderer skips the <video>/<img> branch and shows ONLY the
   * background. Used by the SETTINGS preview surfaces (Display &
   * Output Live Preview, Typography preview) where the operator
   * wants to audition theme/font/ratio without 5 simultaneous video
   * decoders running. Default false so all other surfaces (Main
   * Preview, Live Display, OBS Browser Source) keep playing video.
   */
  noMedia?: boolean
  /**
   * v0.7.158 — When set, the iframe renders THIS slide instead of
   * what's currently live. Used by the Main Preview pane in
   * `logos-shell.tsx` so the operator's queued slide flows through
   * the same renderer as the projector. Honours every settings axis
   * (font, lower-third position/height, background, etc.) because
   * the rest of the payload is built from the same `buildOutputPayload`
   * helper the broadcaster uses.
   */
  slideOverride?: Slide | null
  /**
   * v0.7.158 — When true, the iframe is treated as a faithful mirror
   * of the projector / NDI feed. The payload flows through unmodified
   * (so `blanked` and `showStartupLogo` come from real state instead
   * of being forced off). Used by the Live Display pane so what the
   * operator sees is byte-identical to what the congregation sees.
   */
  mirrorLive?: boolean
  /** Hide the small "Lower Third / Full Screen / Auto" corner badge. */
  hideModeBadge?: boolean
  /** Custom wrapper className (used by Live Display to fill the column). */
  className?: string
  /** Force a specific aspect ratio instead of reading from displayRatio. */
  aspectOverride?: string
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const readyRef = useRef(false)
  const pendingRef = useRef<OutputPayload | null>(null)
  // v0.7.200-hotfix.3 — Monotonic rev counter stamped on every payload
  // sent to the iframe. The iframe drops messages with rev <= last
  // seen, killing any out-of-order delivery race. Combined with the
  // rAF coalescer below, this guarantees the iframe always ends on
  // the LATEST state regardless of how many synchronous store
  // mutations occurred in a single tick.
  const revRef = useRef(0)
  const rafPendingRef = useRef<number | null>(null)
  // v0.7.212 — Operator $1600-customer escalation: single-clicking a
  // media tile in the Library was killing the LIVE video element in
  // the mirrorLive=true Live Display pane. Root cause: Zustand
  // subscribe fires on EVERY store change (incl. pinnedPreviewSlide),
  // so the mirrorLive iframe was getting re-posted with a byte-
  // identical payload on every click. The iframe handler
  // (route.ts L2202 IS_PREVIEW) does `lastRenderKey=''` BEFORE
  // applyRender — which forces a full DOM rebuild even when the
  // slide identity is unchanged. Rebuilding the live <video> element
  // restarts playback (or stops it if the element is detached
  // mid-frame). Fix: dedup at the parent. Compute a CHEAP fingerprint
  // of the meaningful identity fields and skip the postMessage if it
  // matches the last one we sent to THIS iframe. mediaUrl is excluded
  // (multi-MB dataURL → expensive stringify) — slide.id is the
  // identity proxy: when operator picks a different media, id
  // changes; when the same media stays on air, id stays. Settings,
  // displayMode, blanked, etc. are still in the FP so a typography
  // tweak still flows through.
  const lastSentFpRef = useRef<string>('')
  // v0.7.200-hotfix.2 — Refs that ALWAYS hold the latest props.
  //
  // The subscriber registered with useAppStore.subscribe() below
  // captures props via closure. Zustand notifies subscribers
  // SYNCHRONOUSLY when the store changes — before React has
  // re-rendered the parent that owns this OutputPreview. That
  // means when the operator single-clicks a verse in Chapter
  // Navigator → stageVersePreviewOnly mutates the store → the
  // SUBSCRIBER fires immediately with the OLD slideOverride from
  // the previous render's closure → buildPreviewPayload posts the
  // STALE slide (the live one) into the Preview iframe → operator
  // sees the preview "snap back" to live within milliseconds. The
  // subsequent re-render eventually swaps in the correct slide,
  // but any further store mutation in the gap re-poisons the
  // iframe. Mirroring props into refs (synchronously, every render)
  // gives buildPreviewPayload a stable read of the LATEST prop
  // values regardless of when the subscriber fires.
  const slideOverrideRef = useRef<Slide | null | undefined>(slideOverride)
  const mirrorLiveRef = useRef<boolean>(mirrorLive)
  const sampleRefRef = useRef<string | undefined>(sample?.reference)
  const sampleTextRef = useRef<string | undefined>(sample?.text)
  const derivePreviewRef = useRef<boolean>(derivePreview)
  slideOverrideRef.current = slideOverride
  mirrorLiveRef.current = mirrorLive
  sampleRefRef.current = sample?.reference
  sampleTextRef.current = sample?.text
  derivePreviewRef.current = derivePreview

  // Mirror the renderer's applyRatio() so the iframe wrapper is the
  // right shape — the iframe itself fills 100 % of the wrapper, and
  // the route's #output further letterboxes inside that. Keeping the
  // wrapper aspect equal to displayRatio means the wrapper is the
  // smallest box that contains the rendered surface with no extra
  // margin in the preview card.
  const displayRatio = useAppStore((s) => s.settings.displayRatio)
  const aspect =
    aspectOverride ??
    (displayRatio === '4:3' ? '4 / 3' : displayRatio === '21:9' ? '21 / 9' : '16 / 9')

  // ?preview=1 + ?fullScreen=1 / ?lowerThird=1 honoured by the route
  // at parse time (URLSearchParams block near the top of the inline
  // script). Stable across re-renders — the iframe must not reload
  // when the store mutates, only when `mode` changes.
  const src = useMemo(() => {
    const params = new URLSearchParams({ preview: '1' })
    if (mode === 'full') params.set('fullScreen', '1')
    else if (mode === 'lower-third') params.set('lowerThird', '1')
    // v0.7.198 — noMedia=1 tells the renderer to skip video/<img>
    // rendering. See route.ts L320-330 for the gate. Baked into the
    // memoized src so iframe never reloads from a noMedia toggle.
    if (noMedia) params.set('noMedia', '1')
    // v0.7.221 — Operator $1600 escalation: "the background video keeps
    // playing anywhere". Every OutputPreview instance that is NOT a
    // faithful mirror of the real broadcast (mirrorLive=false) is a
    // preview/settings/typography surface, and the operator wants the
    // background video frozen on its first frame there. Only the
    // mirrorLive=true Live Display pane animates the bg. Real
    // broadcast paths (secondary screen popup, offscreen NDI
    // FrameCapture) construct their own URLs without OutputPreview
    // and do not pass freezeBg, so they keep playing.
    if (!mirrorLive) params.set('freezeBg', '1')
    return `/api/output/congregation?${params.toString()}`
  }, [mode, noMedia, mirrorLive])

  // Read these at build time so the synthetic-slide branch below
  // can resolve a sample verse when nothing is on air. Not subscribed
  // — the store subscribe call below picks up changes to these too.
  const sampleRef = sample?.reference
  const sampleText = sample?.text

  // Build the payload that will be postMessage'd into the iframe.
  // 95 % of the time this is just the broadcaster's payload.
  // When nothing is on air (no live slide, no preview slide) we
  // synthesize a slide from the operator's selected verse so the
  // preview always renders real-looking content instead of the
  // splash watermark.
  const buildPreviewPayload = (): OutputPayload => {
    const s = useAppStore.getState()
    const payload = buildOutputPayload(s)
    // v0.7.200-hotfix.2 — Read every prop from a ref so the
    // subscriber callback (which captures this function via closure)
    // ALWAYS gets the latest value, even when Zustand fires it
    // synchronously before React has re-rendered the parent.
    const slideOverrideLatest = slideOverrideRef.current
    const mirrorLiveLatest = mirrorLiveRef.current
    const sampleRefLatest = sampleRefRef.current
    const sampleTextLatest = sampleTextRef.current
    const derivePreviewLatest = derivePreviewRef.current
    // v0.7.200-hotfix.2 — derivePreview=true: read the preview slide
    // DIRECTLY from store state at this very moment. Bypasses any
    // prop closure (which goes stale during synchronous Zustand
    // notifications) — guarantees the iframe sees the operator's
    // most-recent click outcome. This is THE snap-back fix.
    if (derivePreviewLatest) {
      const prevIdx = s.previewSlideIndex
      const liveIdx = s.liveSlideIndex
      // v0.7.201 — Read pinnedPreviewSlide FIRST. Single-click in any
      // of the 5 columns plants a direct Slide reference; rendering
      // from it is immune to any subsequent slides[] /
      // previewSlideIndex mutation. Falls back to the index-based
      // lookup when no pin (after going-live / schedule change /
      // wipe). This is THE bulletproof v0.7.201 snap-back fix.
      const pinned = s.pinnedPreviewSlide
      const previewSlide = pinned ?? (prevIdx >= 0 ? (s.slides[prevIdx] ?? null) : null)
      if (previewSlide) {
        // Match the legacy effectivePreviewSlide (logos-shell L977)
        // mediaPaused tweak: when the same media slide is on both
        // Preview and Live, mute the preview's audio to avoid the
        // doubled-audio operator complaint that v0.7.186 fixed.
        const liveSlide = liveIdx >= 0 ? (s.slides[liveIdx] ?? null) : null
        const sameMediaOnLive = !!(
          previewSlide.type === 'media' &&
          liveSlide && liveSlide.type === 'media' &&
          liveSlide.mediaUrl &&
          previewSlide.mediaUrl === liveSlide.mediaUrl
        )
        const stagedSlide = sameMediaOnLive
          ? { ...previewSlide, mediaPaused: true }
          : previewSlide
        const settingsBlock = (payload as { settings: OutputPayload['settings'] }).settings
        const audio = (payload as { audio: OutputPayload['audio'] }).audio
        return {
          type: 'slide' as const,
          slide: stagedSlide,
          nextSlide: null,
          slideIndex: 0,
          slideTotal: 1,
          sermonNotes: undefined,
          countdownEndAt: null,
          isLive: false,
          showStartupLogo: false,
          displayMode: payload.displayMode,
          settings: settingsBlock,
          blanked: false,
          audio,
        } as OutputPayload
      }
      // Fall through to synth/sample path when nothing is queued.
    }
    // v0.7.158 — slideOverride lets the caller (Main Preview pane)
    // splice their own slide (e.g. the queued previewSlide) into the
    // payload while still inheriting every other field (settings,
    // displayMode, audio, etc.) from the live store.
    if (slideOverrideLatest) {
      const settingsBlock = (payload as { settings: OutputPayload['settings'] }).settings
      const audio = (payload as { audio: OutputPayload['audio'] }).audio
      return {
        type: 'slide' as const,
        slide: slideOverrideLatest,
        nextSlide: null,
        slideIndex: 0,
        slideTotal: 1,
        sermonNotes: undefined,
        countdownEndAt: null,
        isLive: false,
        showStartupLogo: false,
        displayMode: payload.displayMode,
        settings: settingsBlock,
        blanked: false,
        audio,
      } as OutputPayload
    }
    // v0.7.158 — mirrorLive=true: pass through unchanged so the Live
    // Display pane is byte-identical to the projector (respects
    // blanked transport button + startup-logo from real state).
    if (mirrorLiveLatest) {
      return payload
    }
    if (payload.type === 'slide' && payload.slide) {
      // Live content — render exactly what the projector renders.
      // Force blanked off so the preview never goes dark even if the
      // operator has hit the Black transport button (the preview is
      // for design, not a program-out monitor).
      return { ...payload, blanked: false, showStartupLogo: false }
    }
    // No live slide → synthesize. Mirrors the legacy preview's
    // fallback chain: sample → liveVerse → currentVerse → preview /
    // live slide title/content → John 3:16 placeholder.
    const liveVerse = s.liveVerse
    const currentVerse = s.currentVerse
    const stageSlide =
      (s.liveSlideIndex >= 0 ? s.slides[s.liveSlideIndex] : null) ||
      s.slides[s.previewSlideIndex] ||
      null
    const fallback = liveVerse ?? currentVerse ?? null
    const ref =
      sampleRefLatest ||
      fallback?.reference ||
      (fallback
        ? `${fallback.book} ${fallback.chapter}:${fallback.verseStart}${fallback.verseEnd ? `-${fallback.verseEnd}` : ''}`
        : '') ||
      stageSlide?.title ||
      'John 3:16'
    const body =
      sampleTextLatest ||
      fallback?.text ||
      (stageSlide && Array.isArray(stageSlide.content) && stageSlide.content.length
        ? stageSlide.content.join(' ')
        : '') ||
      'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.'
    const synth: Slide = {
      id: '__preview__',
      type: 'verse',
      title: ref,
      subtitle: '',
      content: [body],
    }
    // Splice the synthetic slide into the broadcaster shape. Reuse
    // its settings block + audio block verbatim so every typography
    // / theme / ratio / lower-third knob still flows through.
    const settingsBlock = (payload as { settings: OutputPayload['settings'] }).settings
    const audio = (payload as { audio: OutputPayload['audio'] }).audio
    return {
      type: 'slide' as const,
      slide: synth,
      nextSlide: null,
      slideIndex: 0,
      slideTotal: 1,
      sermonNotes: undefined,
      countdownEndAt: null,
      isLive: false,
      showStartupLogo: false,
      displayMode: payload.displayMode,
      settings: settingsBlock,
      blanked: false,
      audio,
    } as OutputPayload
  }

  // v0.7.200-hotfix.3 — Low-level send. Stamps every outgoing payload
  // with a fresh monotonic __rev so the iframe can drop any stale /
  // out-of-order delivery (see route.ts L2098 message handler).
  const sendNow = (payload: OutputPayload) => {
    const w = iframeRef.current?.contentWindow
    if (!w || !readyRef.current) {
      pendingRef.current = payload
      return
    }
    // v0.7.212 — Parent-side dedup. See lastSentFpRef comment above
    // for the operator-visible bug this fixes. Mirrors the cheap
    // identity fields the renderer's L1260 cache key would
    // distinguish, MINUS mediaUrl (excluded for cost — slide.id is
    // the identity proxy and changes whenever operator picks a
    // different media). If the fingerprint matches the last one we
    // sent, the iframe would render identical output anyway, so
    // skipping the postMessage avoids the iframe's
    // `lastRenderKey=''` force-reset (route.ts L2212) tearing down
    // the live <video> element and restarting playback.
    const s = payload.slide as (OutputPayload['slide'] & { mediaUrl?: string; mediaKind?: string }) | null
    const fp = JSON.stringify({
      t: payload.type,
      b: payload.blanked,
      l: payload.isLive,
      dm: payload.displayMode,
      sl: s
        ? {
            id: s.id,
            ty: s.type,
            ti: s.title,
            su: s.subtitle,
            co: s.content,
            mk: s.mediaKind,
            mu: s.mediaUrl ? s.mediaUrl.length : 0,
            mp: (s as { mediaPaused?: boolean }).mediaPaused === true ? 1 : 0,
          }
        : null,
      st: payload.settings,
      au: payload.audio,
    })
    if (fp === lastSentFpRef.current) return
    lastSentFpRef.current = fp
    revRef.current += 1
    try {
      // __rev is still stamped for log-correlation / future diagnostics
      // but the iframe handler (v0.7.204) no longer gates on it.
      w.postMessage({ __sl_preview: 1, __rev: revRef.current, payload }, '*')
    } catch {
      pendingRef.current = payload
    }
  }
  // v0.7.200-hotfix.3 — Coalesce posts via rAF. Zustand may fire the
  // subscriber multiple times per click (sibling mutations + the
  // stage call), and posting on every fire wastes work AND opens a
  // window where an out-of-order message could win. The rAF coalesce
  // ensures only ONE post per frame, with the LATEST state read from
  // the store at flush time. No 100ms guard re-post: any subsequent
  // store mutation will trigger another subscriber fire → another
  // rAF schedule → another post, so a follow-up mutation is already
  // covered by the existing subscribe path.
  const post = (payload: OutputPayload) => {
    pendingRef.current = payload
    if (rafPendingRef.current !== null) return
    rafPendingRef.current = requestAnimationFrame(() => {
      rafPendingRef.current = null
      const latest = buildPreviewPayload()
      pendingRef.current = null
      sendNow(latest)
    })
  }

  // Handshake: the route's preview branch posts {__sl_preview_ready:1}
  // back to the parent the moment its message listener is attached.
  // We only mark ready when the source is OUR iframe — there can be
  // multiple OutputPreview instances on the same page (Display &
  // Output renders both Full Screen + Lower Third side-by-side).
  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      const d = ev.data as { __sl_preview_ready?: number } | null
      if (!d || typeof d !== 'object') return
      if (d.__sl_preview_ready !== 1) return
      if (ev.source !== iframeRef.current?.contentWindow) return
      readyRef.current = true
      const flush = pendingRef.current ?? buildPreviewPayload()
      pendingRef.current = null
      // Route the handshake flush through sendNow so it carries a
      // monotonic __rev (the iframe drops anything <= last seen).
      sendNow(flush)
    }
    window.addEventListener('message', onMsg)
    return () => {
      window.removeEventListener('message', onMsg)
      if (rafPendingRef.current !== null) cancelAnimationFrame(rafPendingRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // v0.7.200-hotfix.2 — Subscribe to the store ONCE on mount (not on
  // every prop change). Because buildPreviewPayload now reads every
  // prop from a ref (slideOverrideRef etc.), the subscriber callback
  // ALWAYS posts the latest values regardless of when Zustand fires
  // it — eliminating the stale-closure race where a sync store
  // mutation would post the OLD slideOverride to the iframe between
  // React renders, causing the operator-visible "preview snaps back
  // to live on single-click" bug.
  //
  // We still need a separate post when props (slideOverride etc.)
  // change WITHOUT a corresponding store mutation — handled by the
  // second effect below.
  useEffect(() => {
    pendingRef.current = buildPreviewPayload()
    post(pendingRef.current)
    const unsubscribe = useAppStore.subscribe(() => {
      const p = buildPreviewPayload()
      post(p)
    })
    return () => unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // v0.7.200-hotfix.2 — Re-post when props change. slideOverride
  // arriving as a NEW slide doesn't trigger a store mutation (it's
  // derived from store but flows in as a prop), so without this
  // effect the iframe would only see the new slide on the NEXT
  // store mutation. Refs have already been synchronously updated
  // above (slideOverrideRef.current = slideOverride) at the top of
  // render, so by the time this effect runs the ref already holds
  // the latest value — buildPreviewPayload will see it.
  useEffect(() => {
    const p = buildPreviewPayload()
    post(p)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sampleRef, sampleText, slideOverride ? JSON.stringify(slideOverride) : null, mirrorLive, derivePreview])

  const onIframeLoad = () => {
    // Defensive: if the handshake message was already sent before
    // the parent listener attached, re-flush from this side.
    // v0.7.200-hotfix.3 — Route through sendNow so this load-time
    // flush carries a monotonic __rev. A raw postMessage here would
    // arrive at the iframe handler with no rev, which (per route.ts
    // L2114) defaults to Number.MAX_SAFE_INTEGER and would pin
    // lastPreviewRev at the ceiling — silently dropping every
    // subsequent real message. Architect caught this in pre-ship
    // review.
    if (!iframeRef.current?.contentWindow) return
    readyRef.current = true
    sendNow(buildPreviewPayload())
  }

  // v0.7.177 — Render the iframe at NATIVE 1920×1080 (or matching
  // 4:3 / 21:9 native height-pinned size) and CSS transform-scale into
  // the preview card. Same WYSIWYG technique that NdiPreviewSurface
  // uses (see ndi-output-panel.tsx ~line 1100, v0.7.9 fix). Without
  // this, the iframe inner viewport equals the card's physical pixel
  // size (~360 px wide in a settings card). At that size the LT box
  // at hPct=22% is only ~45 px tall — `cqw`/`cqh` font math floors at
  // 0.5 rem and 4-line verses crash into the rounded edges (operator
  // screenshot: Romans 8:23 ASV in the Lower Third Settings preview
  // showed text reaching the box edges with no breathing room, even
  // with Bible line-height 0.90 + Bible text scale 0.50 maxed out).
  // Native 1920×1080 → 22% × 1080 = 237 px LT box → ltBand 9vw at
  // 1920 vw = 173 px font (auto-clamped to ltCap 3.2 rem) → text fits
  // with the same neat geometry the actual NDI broadcast paints. The
  // rendered card looks identical to before; only the internal pixel
  // coordinates change.
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const NATIVE_H = 1080
  const NATIVE_W =
    aspect === '4 / 3' ? 1440 : aspect === '21 / 9' ? 2520 : 1920
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const measure = () => {
      const w = el.clientWidth
      if (w > 0) setScale(w / NATIVE_W)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [NATIVE_W])

  return (
    <div className="space-y-1.5">
      {label && (
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
          {label}
        </div>
      )}
      <div
        ref={wrapperRef}
        className={
          className ??
          'relative w-full bg-black overflow-hidden rounded-md ring-1 ring-border'
        }
        style={{ aspectRatio: aspect }}
      >
        <div
          style={{
            width: NATIVE_W,
            height: NATIVE_H,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            position: 'absolute',
            top: 0,
            left: 0,
          }}
        >
          <iframe
            ref={iframeRef}
            src={src}
            title={label || 'Output Preview'}
            onLoad={onIframeLoad}
            allow="autoplay; encrypted-media"
            style={{
              border: 0,
              display: 'block',
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
            }}
          />
        </div>
        {!hideModeBadge && (
          <div className="absolute top-1 right-1 z-10 pointer-events-none">
            <span className="text-[8px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded bg-black/60 text-white/80 border border-white/10">
              {mode === 'lower-third'
                ? 'Lower Third'
                : mode === 'full'
                  ? 'Full Screen'
                  : 'Auto'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
