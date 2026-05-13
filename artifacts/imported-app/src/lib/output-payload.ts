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
  const baseCur = s.liveSlideIndex >= 0 ? s.slides[s.liveSlideIndex] : null
  const isMediaVideo = !!(
    baseCur && baseCur.type === 'media' && baseCur.mediaKind === 'video'
  )
  const cur = baseCur
    ? {
        ...baseCur,
        mediaPaused: isMediaVideo ? !!s.mediaPaused : undefined,
        mediaCurrentTime: isMediaVideo ? s.mediaCurrentTime : undefined,
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

export type OutputPayload = ReturnType<typeof buildOutputPayload>
