'use client'

import { useEffect, useRef } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Slide, AppSettings } from '@/lib/store'
import { useAppStore } from '@/lib/store'
import { getFontStack } from '@/lib/fonts'

// ──────────────────────────────────────────────────────────────────
// Media slide rendering helpers
// ──────────────────────────────────────────────────────────────────
// Translate the operator's chosen mediaFit value into the right CSS
// object-fit + container-aspect combination. Centralised so the
// secondary screen renderer (in the congregation route) and the
// in-app preview renderers stay perfectly in sync.
function resolveMediaPresentation(fit: Slide['mediaFit']): {
  objectFit: 'contain' | 'cover' | 'fill'
  aspect: string | null
} {
  switch (fit) {
    case 'fill':
      return { objectFit: 'cover', aspect: null }
    case 'stretch':
      return { objectFit: 'fill', aspect: null }
    case '16:9':
      return { objectFit: 'contain', aspect: '16 / 9' }
    case '4:3':
      return { objectFit: 'contain', aspect: '4 / 3' }
    case 'fit':
    default:
      return { objectFit: 'contain', aspect: null }
  }
}

function MediaSlideContent({ slide }: { slide: Slide }) {
  const mediaPaused = useAppStore((s) => s.mediaPaused)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const { objectFit, aspect } = resolveMediaPresentation(slide.mediaFit)

  // Honour the operator's play/pause flag in real time. We don't
  // remount the video — that would jump back to t=0 — so this just
  // calls play()/pause() on the live element.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (mediaPaused) {
      v.pause()
    } else {
      v.play().catch(() => {})
    }
  }, [mediaPaused])

  const inner =
    slide.mediaKind === 'video' ? (
      <video
        ref={videoRef}
        src={slide.mediaUrl}
        autoPlay={!mediaPaused}
        loop
        muted
        playsInline
        className="w-full h-full bg-black"
        style={{ objectFit }}
      />
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={slide.mediaUrl}
        alt={slide.title || 'media'}
        className="w-full h-full bg-black"
        style={{ objectFit }}
      />
    )

  if (aspect) {
    // Pillarbox / letterbox to the chosen ratio inside a black frame.
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        <div className="max-w-full max-h-full" style={{ aspectRatio: aspect, width: '100%' }}>
          {inner}
        </div>
      </div>
    )
  }
  return <div className="absolute inset-0">{inner}</div>
}

export const slideThemes: Record<string, { bg: string; accent: string; label: string }> = {
  worship: { bg: 'from-violet-950 to-indigo-950', accent: 'text-violet-300', label: 'Worship' },
  sermon: { bg: 'from-amber-950 to-orange-950', accent: 'text-amber-300', label: 'Sermon' },
  easter: { bg: 'from-emerald-950 to-teal-950', accent: 'text-emerald-300', label: 'Easter' },
  christmas: { bg: 'from-red-950 to-rose-950', accent: 'text-rose-300', label: 'Christmas' },
  praise: { bg: 'from-yellow-950 to-amber-950', accent: 'text-yellow-300', label: 'Praise' },
  minimal: { bg: 'from-zinc-950 to-neutral-950', accent: 'text-zinc-300', label: 'Minimal' },
}
export const defaultTheme = { bg: 'from-zinc-950 to-neutral-950', accent: 'text-zinc-300', label: 'Minimal' }

// Container-query base sizes (cqi = 1% of container inline size). These let
// the slide text auto-fit the actual frame size — the same renderer is used
// for the small thumbs in the slide grid, the medium preview/live frames on
// the right column, and the full-screen congregation output.
const fontSizeBaseCqi: Record<string, number> = {
  sm: 4.0,
  md: 4.6,
  lg: 5.2,
  xl: 6.0,
}

// Pick a comfortable text size for the verse content given the line count and
// total character count, so long passages still fit their frame and short ones
// stay legible.
function pickContentCqi(base: number, totalChars: number, lineCount: number): number {
  // More aggressive shrinking so long detected-verse passages always
  // fit inside the Preview / Live Display frames without overflowing.
  let s = base
  if (totalChars > 140) s -= 0.5
  if (totalChars > 220) s -= 0.6
  if (totalChars > 320) s -= 0.6
  if (totalChars > 440) s -= 0.5
  if (totalChars > 600) s -= 0.5
  if (totalChars > 800) s -= 0.5
  if (lineCount > 3) s -= 0.3
  if (lineCount > 6) s -= 0.3
  if (lineCount > 10) s -= 0.4
  return Math.max(1.8, s)
}

function SlideContent({
  slide, theme, large, settings,
}: {
  slide: Slide
  theme: { accent: string }
  large: boolean
  settings: Pick<AppSettings, 'fontSize' | 'fontFamily' | 'textShadow' | 'showReferenceOnOutput' | 'textScale'>
}) {
  // Resolve the actual CSS font-family stack from the central registry
  // — every renderer (this component, OutputPreview, and the
  // congregation HTML) reads from the same source of truth so font
  // changes look identical across the operator preview, the secondary
  // screen, and the NDI feed.
  const fontStack = getFontStack(settings.fontFamily)
  const fontStyle = { fontFamily: fontStack }
  const shadow = settings.textShadow ? { textShadow: '0 2px 12px rgba(0,0,0,0.4)' } : {}
  // Apply the operator's manual text-scale multiplier on top of the
  // base font size so they can dial readability live without rebuilding
  // the slide. Clamped to a sane band so the screen never blows up.
  const scale = Math.min(2, Math.max(0.5, settings.textScale ?? 1))
  const baseCqi = (fontSizeBaseCqi[settings.fontSize] || fontSizeBaseCqi.lg) * scale

  if (slide.type === 'title') {
    return (
      <div className={cn('flex flex-col items-center justify-center text-center w-full h-full overflow-hidden')} style={fontStyle}>
        <h2
          className={cn('font-bold leading-tight', theme.accent)}
          style={{ fontSize: large ? `${baseCqi * 1.6}cqi` : '1.6cqi', ...shadow }}
        >
          {slide.title}
        </h2>
        {slide.subtitle && settings.showReferenceOnOutput && (
          <p
            className={cn('mt-2 opacity-70', theme.accent)}
            style={{ fontSize: large ? `${baseCqi * 0.7}cqi` : '1.1cqi', ...shadow }}
          >
            {slide.subtitle}
          </p>
        )}
      </div>
    )
  }

  if (slide.type === 'media' && slide.mediaUrl) {
    return (
      <MediaSlideContent slide={slide} />
    )
  }

  if (slide.type === 'verse' || slide.type === 'lyrics') {
    const totalChars = slide.content.reduce((n, l) => n + l.length, 0)
    const contentCqi = pickContentCqi(baseCqi, totalChars, slide.content.length)
    // Flow the verse / lyric chunks into one paragraph so all words
    // share the same baseline. Otherwise short opening words like
    // "Who" hang on a separate line above the rest of the verse.
    const joined = slide.content.join(' ').replace(/\s+/g, ' ').trim()
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
    return (
      <div className={cn('w-full h-full flex flex-col justify-center overflow-hidden', itemsClass, textClass)} style={fontStyle}>
        {settings.showReferenceOnOutput && (
          <p
            className={cn('opacity-60 mb-2 shrink-0 m-0 p-0', theme.accent, textClass)}
            style={{ fontSize: large ? `${baseCqi * 0.55}cqi` : '1.0cqi', ...shadow, lineHeight: 1.2 }}
          >
            {slide.title}
          </p>
        )}
        <div className={cn('w-full max-w-[90%] mx-auto', textClass)}>
          <p
            className={cn('font-medium m-0 p-0', theme.accent, textClass)}
            style={{
              fontSize: large ? `${contentCqi}cqi` : '1.4cqi',
              ...shadow,
              lineHeight: 1.4,
              wordWrap: 'break-word',
              overflowWrap: 'break-word',
            }}
          >
            {joined}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn('opacity-30', theme.accent)}
      style={{ fontSize: large ? `${baseCqi}cqi` : '1.4cqi', ...shadow }}
    >
      {slide.title || ''}
    </div>
  )
}

export function SlideThumb({
  slide,
  themeKey,
  label,
  isActive,
  isLive,
  onClick,
  size = 'md',
  settings,
}: {
  slide: Slide | null
  themeKey?: string
  label?: string
  isActive?: boolean
  isLive?: boolean
  onClick?: () => void
  size?: 'xs' | 'sm' | 'md' | 'lg'
  settings: AppSettings
}) {
  const theme = slideThemes[themeKey || settings.congregationScreenTheme] || defaultTheme
  const large = size === 'lg'

  if (!slide) {
    return (
      <div
        className={cn(
          'relative w-full overflow-hidden aspect-video bg-black',
          isLive ? 'ring-2 ring-red-500' : isActive ? 'ring-2 ring-amber-400' : '',
          onClick && 'cursor-pointer',
        )}
        onClick={onClick}
      />
    )
  }

  return (
    <div
      className={cn(
        'group relative w-full overflow-hidden aspect-video transition-all @container',
        isLive ? 'ring-2 ring-red-500' : isActive ? 'ring-2 ring-amber-400' : 'ring-1 ring-zinc-800',
        onClick && 'cursor-pointer hover:ring-zinc-600',
      )}
      onClick={onClick}
    >
      <div className={cn('absolute inset-0 bg-gradient-to-br', theme.bg)}>
        {settings.customBackground && (
          <>
            <img
              src={settings.customBackground}
              alt=""
              className="absolute inset-0 w-full h-full object-cover opacity-40"
            />
            <div className="absolute inset-0 bg-black/40" />
          </>
        )}
      </div>
      <div
        className={cn(
          'absolute inset-0 flex flex-col items-center justify-center',
          large ? 'p-4 md:p-8' : 'p-1.5',
        )}
      >
        <SlideContent slide={slide} theme={theme} large={large} settings={settings} />
      </div>
      {label && (
        <div className="absolute top-1 left-1 z-10">
          <Badge
            className={cn(
              'text-[9px] px-1 py-0 font-bold uppercase tracking-wider border-0',
              isLive
                ? 'bg-red-600 text-white'
                : isActive
                  ? 'bg-amber-500 text-black'
                  : 'bg-black/60 text-white',
            )}
          >
            {label}
          </Badge>
        </div>
      )}
    </div>
  )
}
