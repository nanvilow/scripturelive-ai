import { useAppStore } from './store'

type StoreState = ReturnType<typeof useAppStore.getState>

/**
 * Single source of truth for the payload consumed by
 * /api/output/congregation. Both the SSE broadcaster (which fans
 * out to the secondary screen + NDI capture) AND the in-app Output
 * Settings preview (an iframe of the same renderer) call this
 * helper, so a setting tweak produces the IDENTICAL payload on both
 * surfaces — guaranteeing pixel parity by construction. Any new
 * render-affecting field added here is automatically honoured
 * everywhere.
 *
 * v0.7.127 — extracted from output-broadcaster.tsx so the Settings
 * Preview iframe can hand the route an identical payload via
 * postMessage instead of inventing its own React mockup.
 */
export function buildOutputPayload(s: StoreState) {
  // v0.7.203 — liveSlide direct ref (set by auto-fire via setLiveAuto)
  // takes precedence over slides[liveSlideIndex]. This lets the AI
  // push detections to LIVE without mutating slides[], which was
  // clobbering the operator's pinnedPreviewSlide via the setIsLive(true)
  // cascade and causing the "single-click preview snaps back to live"
  // bug. When the operator manually drives live (setSlides /
  // setLiveSlideIndex), liveSlide is cleared and we fall through to
  // the slides[] path.
  const baseCur = s.liveSlide
    ? s.liveSlide
    : (s.liveSlideIndex >= 0 ? s.slides[s.liveSlideIndex] : null)
  const isMediaVideo = !!(
    baseCur && baseCur.type === 'media' && baseCur.mediaKind === 'video'
  )
  const cur = baseCur
    ? {
        ...baseCur,
        mediaPaused: isMediaVideo ? !!s.liveMediaPaused : undefined,
        mediaCurrentTime: isMediaVideo ? s.liveMediaCurrentTime : undefined,
      }
    : null
  const next =
    s.liveSlideIndex >= 0 && s.liveSlideIndex + 1 < s.slides.length
      ? s.slides[s.liveSlideIndex + 1]
      : null
  const settings = s.settings
  const sExt = settings as unknown as Record<string, unknown>
  const settingsBlock = {
    fontSize: settings.fontSize,
    fontFamily: settings.fontFamily,
    textShadow: settings.textShadow,
    showReferenceOnOutput: settings.showReferenceOnOutput,
    lowerThirdHeight: settings.lowerThirdHeight,
    lowerThirdPosition: settings.lowerThirdPosition,
    customBackground: settings.customBackground,
    // v0.7.227 — Operator-controlled background brightness (0-100). The
    // congregation renderer derives bg opacity + scrim alpha from this
    // value so both members of the v0.7.226 pair-invariant move in
    // lockstep across all three surfaces (.bg-image, #bgLayer, .lt-bg).
    bgBrightness: settings.bgBrightness,
    congregationScreenTheme: settings.congregationScreenTheme,
    displayRatio: settings.displayRatio,
    textScale: settings.textScale,
    textAlign: settings.textAlign,
    ndiDisplayMode: settings.ndiDisplayMode,
    ndiFontFamily: sExt.ndiFontFamily,
    ndiFontSize: sExt.ndiFontSize,
    ndiTextShadow: sExt.ndiTextShadow,
    ndiTextAlign: sExt.ndiTextAlign,
    ndiTextScale: sExt.ndiTextScale,
    // v0.7.167 — Lower-third-only typography. Carved off from the
    // ndi* block so the in-app lower-third (preview, live display,
    // secondary screen, OBS Browser Source URL) can be styled
    // independently of the NDI broadcast feed. Read by route.ts
    // when dm==='lower-third' AND IS_NDI is false. Always emit;
    // undefined values fall through to body settings server-side.
    lowerThirdFontFamily: sExt.lowerThirdFontFamily,
    lowerThirdFontSize: sExt.lowerThirdFontSize,
    lowerThirdTextShadow: sExt.lowerThirdTextShadow,
    lowerThirdTextScale: sExt.lowerThirdTextScale,
    lowerThirdTextAlign: sExt.lowerThirdTextAlign,
    lowerThirdBibleColor: sExt.lowerThirdBibleColor,
    lowerThirdBibleLineHeight: sExt.lowerThirdBibleLineHeight,
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
    ndiLowerThirdTransparent: sExt.ndiLowerThirdTransparent,
    ndiLowerThirdScale: sExt.ndiLowerThirdScale,
    ndiShowReferenceOnOutput: sExt.ndiShowReferenceOnOutput,
    ndiReferenceTextShadow: sExt.ndiReferenceTextShadow,
    referenceFontSize: settings.referenceFontSize,
    referenceFontFamily: settings.referenceFontFamily,
    referenceTextShadow: settings.referenceTextShadow,
    referenceTextScale: settings.referenceTextScale,
    referenceTextAlign: settings.referenceTextAlign,
    bibleLineHeight: sExt.bibleLineHeight,
    slideTransitionStyle: settings.slideTransitionStyle || 'fade',
    slideTransitionDuration: settings.slideTransitionDuration ?? 500,
  }
  const blanked = !!s.outputBlanked
  const audio = {
    broadcastEnabled: s.liveBroadcastAudio !== false,
    volume: typeof s.globalVolume === 'number' ? s.globalVolume : 1,
    muted: !!s.globalMuted,
  }
  // v0.7.228 — Output / NDI startup-delay fix (the deferred half of the
  // v0.7.227 operator escalation). Surface the pinned-preview video URL
  // to the output renderer (congregation/route.ts) so it can mount a
  // hidden <video preload="auto"> using the v0.7.225 freezeBg pattern
  // and have HTTP bytes + container demux + first-frame decode all done
  // BEFORE the operator clicks Go Live. Without this the secondary
  // screen + NDI offscreen capture each take 1-3s to paint the first
  // frame because the <video> mount on the live URL change does cold
  // network fetch + decoder allocation AFTER the click. We only emit
  // it when the pinned preview is (a) a media-video, (b) different
  // from whatever's already live (no point preheating the live URL —
  // it's already decoded), and (c) not equal to whatever was preheated
  // last tick (renderer dedups by URL too, but cheaper to filter here).
  // Bandwidth cost: ~1 MOOV-atom + ~1 GOP per preview pin, not per
  // single-click — capped at one preheat in flight at a time.
  const pinned = s.pinnedPreviewSlide
  const preheatMediaUrl =
    pinned &&
    pinned.type === 'media' &&
    pinned.mediaKind === 'video' &&
    !!pinned.mediaUrl &&
    pinned.mediaUrl !== (cur && cur.type === 'media' ? cur.mediaUrl : null)
      ? pinned.mediaUrl
      : null
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
        preheatMediaUrl,
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
        preheatMediaUrl,
      }
}

export type OutputPayload = ReturnType<typeof buildOutputPayload>
