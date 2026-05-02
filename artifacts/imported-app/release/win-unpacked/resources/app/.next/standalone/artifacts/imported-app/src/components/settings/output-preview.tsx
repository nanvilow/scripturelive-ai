'use client'

import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import {
  getFontStack,
  FONT_SIZE_MULT,
  resolveReferenceTypography,
  lowerThirdClamp,
} from '@/lib/fonts'

/**
 * Compact WYSIWYG preview used inside the Settings cards. It mirrors
 * the rendering rules in /api/output/congregation so operators can see
 * typography / alignment / lower-third changes without having to open
 * the secondary screen.
 *
 * `mode` selects which output state the preview simulates:
 *   - 'auto'         → follows settings.displayMode
 *   - 'full'         → forces full-screen preview
 *   - 'lower-third'  → forces lower-third bar over the themed backdrop
 */
export function OutputPreview({
  mode = 'auto',
  label,
  sample,
}: {
  mode?: 'auto' | 'full' | 'lower-third'
  label?: string
  sample?: { reference: string; text: string }
}) {
  const settings = useAppStore((s) => s.settings)
  const dm =
    mode === 'auto'
      ? settings.displayMode || 'full'
      : mode === 'lower-third'
        ? 'lower-third'
        : 'full'
  const isLT = dm === 'lower-third' || dm === 'lower-third-black'
  const isBlack = dm === 'lower-third-black'
  const ltPos = settings.lowerThirdPosition === 'top' ? 'top' : 'bottom'
  const ltHeightMap = { sm: 22, md: 33, lg: 45 } as const
  const ltHeightPct = ltHeightMap[settings.lowerThirdHeight] ?? 33
  const ta = settings.textAlign ?? 'center'
  const itemsClass =
    ta === 'left' ? 'items-start' : ta === 'right' ? 'items-end' : 'items-center'
  const textClass =
    ta === 'left'
      ? 'text-left'
      : ta === 'right'
        ? 'text-right'
        : ta === 'justify'
          ? 'text-justify'
          : 'text-center'

  // v0.7.3 — When no `sample` is supplied, prefer the user's
  // currently-selected scripture (live verse, then the last
  // verse opened in the picker) so the Settings previews mirror
  // what the audience is about to see. Falls back to John 3:16
  // only when the user hasn't selected anything yet, which
  // matches the legacy behaviour for first-run installs.
  //
  // v0.7.5.1 — ALSO fall back to the currently-LIVE or PREVIEW
  // SLIDE when neither liveVerse nor currentVerse is set. The
  // operator can pick a verse via voice detection, the dashboard
  // chapter navigator, the recent-detections rail, or any other
  // surface that builds a Slide and pushes it through the live
  // pipeline without round-tripping through `setCurrentVerse`.
  // Pre-fix, all those flows left the OutputPreview stuck on the
  // "John 3:16" placeholder even though the audience was looking
  // at Genesis 2:5 on stage. Reading slides[liveSlideIndex] (then
  // slides[previewSlideIndex]) closes the gap so the Full Screen
  // / Lower Third / Typography preview cards in Settings always
  // mirror what the projector + NDI feed are rendering RIGHT NOW.
  const liveVerse = useAppStore((s) => s.liveVerse)
  const currentVerse = useAppStore((s) => s.currentVerse)
  const slides = useAppStore((s) => s.slides)
  const liveSlideIndex = useAppStore((s) => s.liveSlideIndex)
  const previewSlideIndex = useAppStore((s) => s.previewSlideIndex)
  const stageSlide =
    (liveSlideIndex >= 0 ? slides[liveSlideIndex] : null) ||
    slides[previewSlideIndex] ||
    null
  const slideRef = stageSlide?.title || ''
  const slideBody =
    stageSlide && Array.isArray(stageSlide.content) && stageSlide.content.length
      ? stageSlide.content.join(' ')
      : ''
  const fallback = liveVerse ?? currentVerse ?? null
  const ref =
    sample?.reference ||
    fallback?.reference ||
    (fallback
      ? `${fallback.book} ${fallback.chapter}:${fallback.verseStart}${fallback.verseEnd ? `-${fallback.verseEnd}` : ''}`
      : '') ||
    slideRef ||
    'John 3:16'
  const body =
    sample?.text ||
    fallback?.text ||
    slideBody ||
    'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.'

  // Theme-derived backdrop matching the slide-renderer themes.
  const themeMap: Record<string, string> = {
    worship: 'linear-gradient(135deg,#1e0a3c,#1e1b4b)',
    sermon: 'linear-gradient(135deg,#3c1a0a,#451a03)',
    easter: 'linear-gradient(135deg,#0a3c2a,#042f2e)',
    christmas: 'linear-gradient(135deg,#3c0a0a,#4c0519)',
    praise: 'linear-gradient(135deg,#3c3a0a,#451a03)',
    minimal: 'linear-gradient(135deg,#0a0a0a,#171717)',
  }
  const bg = themeMap[settings.congregationScreenTheme] || themeMap.minimal
  const shadow = settings.textShadow !== false ? '0 2px 12px rgba(0,0,0,.4)' : 'none'

  // Resolve the actual CSS font-family stack the operator picked, plus
  // the four-bucket size multiplier (sm/md/lg/xl). Multiplying the
  // clamp() bands keeps text readable at every preview width while
  // still visibly stepping between buckets.
  const fontStack = getFontStack(settings.fontFamily)
  const sizeMult =
    (FONT_SIZE_MULT[settings.fontSize] || 1) *
    Math.min(2, Math.max(0.5, settings.textScale ?? 1))
  // Reference typography (Bug #5) — independent controls that fall
  // back to the body equivalents when unset. The full-screen and
  // lower-third reference paragraphs both read these.
  const refTypo = resolveReferenceTypography(settings)
  const refSizeMult =
    (FONT_SIZE_MULT[refTypo.fontSize] || 1) *
    Math.min(2, Math.max(0.5, refTypo.textScale))
  const refShadowCss = refTypo.textShadow
    ? '0 2px 12px rgba(0,0,0,.4)'
    : 'none'
  const refFs = `clamp(${7 * refSizeMult}px, min(${2 * refSizeMult}cqw, ${4 * refSizeMult}cqh), ${18 * refSizeMult}px)`
  const bodyFs = `clamp(${10 * sizeMult}px, min(${4 * sizeMult}cqw, ${8 * sizeMult}cqh), ${28 * sizeMult}px)`
  // Lower-third clamps (Bug #4): use the SAME shared formula as the
  // congregation broadcast HTML so the Settings WYSIWYG preview
  // matches what the projector + NDI feed actually render.
  const ltClamp = lowerThirdClamp({
    totalChars: body.length,
    bodyScale: sizeMult,
    refScale: refSizeMult,
  })
  const ltBodyFs = ltClamp.body
  const ltRefFs = ltClamp.reference

  return (
    <div className="space-y-1.5">
      {label && (
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
          {label}
        </div>
      )}
      <div
        className="relative w-full aspect-video bg-black overflow-hidden rounded-md ring-1 ring-border"
        style={{
          // In lower-third mode the upper area must stay transparent
          // (rendered as solid black) — theme colour and any custom
          // background image are scoped to the rounded card below.
          background: isLT ? '#000' : bg,
          containerType: 'size',
        }}
      >
        {settings.customBackground && !isLT && (
          <img
            src={settings.customBackground}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-40"
          />
        )}

        {!isLT && (
          <div
            className={cn(
              'absolute inset-0 flex flex-col justify-center text-white',
              itemsClass,
              textClass,
            )}
            style={{
              padding: '6% 6%',
              fontFamily: fontStack,
              textShadow: shadow,
            }}
          >
            {settings.showReferenceOnOutput !== false && (
              <p
                className="m-0 p-0 opacity-60"
                style={{
                  fontSize: refFs,
                  lineHeight: 1.2,
                  marginBottom: '1cqh',
                  fontFamily: refTypo.fontStack,
                  textAlign: refTypo.textAlign,
                  textShadow: refShadowCss,
                }}
              >
                {ref}
              </p>
            )}
            <p
              className="m-0 p-0 font-medium"
              style={{
                fontSize: bodyFs,
                lineHeight: 1.4,
                wordWrap: 'break-word',
                overflowWrap: 'break-word',
              }}
            >
              {body}
            </p>
          </div>
        )}

        {isLT && (
          <div
            className="absolute left-0 right-0 flex items-center justify-center"
            style={{
              [ltPos]: '6%',
              height: `${ltHeightPct}%`,
              padding: '0 6%',
              containerType: 'size',
            }}
          >
            <div
              className={cn(
                'relative w-full h-full max-w-[68rem] mx-auto flex flex-col justify-center text-white rounded-2xl shadow-[0_8px_28px_rgba(0,0,0,0.45)] overflow-hidden',
                itemsClass,
                textClass,
              )}
              style={{
                // Rounded "card" that holds the verses. Theme colour
                // and (optionally) the custom background image render
                // inside this box only — the upper area outside stays
                // transparent per spec.
                background: isBlack ? '#000' : bg,
                padding: '3% 5%',
                gap: '0.6cqh',
                fontFamily: fontStack,
                textShadow: shadow,
              }}
            >
              {settings.customBackground && !isBlack && (
                <img
                  src={settings.customBackground}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover opacity-40 rounded-2xl pointer-events-none"
                />
              )}
              <div
                className={cn(
                  'relative z-10 w-full h-full flex flex-col justify-center',
                  itemsClass,
                  textClass,
                )}
              >
              {settings.showReferenceOnOutput !== false && (
                <p
                  className="m-0 p-0 opacity-70 font-medium"
                  style={{
                    fontSize: ltRefFs,
                    lineHeight: 1.2,
                    fontFamily: refTypo.fontStack,
                    textAlign: refTypo.textAlign,
                    textShadow: refShadowCss,
                  }}
                >
                  {ref}
                </p>
              )}
              <p
                className="m-0 p-0 font-semibold w-full"
                style={{
                  fontSize: ltBodyFs,
                  lineHeight: 1.4,
                  wordWrap: 'break-word',
                  overflowWrap: 'break-word',
                }}
              >
                {body}
              </p>
              </div>
            </div>
          </div>
        )}

        <div className="absolute top-1 right-1 z-10">
          <span className="text-[8px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded bg-black/60 text-white/80 border border-white/10">
            {isLT ? (isBlack ? 'L/3 · Black' : 'Lower Third') : 'Full Screen'}
          </span>
        </div>
      </div>
    </div>
  )
}
