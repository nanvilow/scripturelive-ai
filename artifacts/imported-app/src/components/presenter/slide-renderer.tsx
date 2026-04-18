'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Slide, AppSettings } from '@/lib/store'

export const slideThemes: Record<string, { bg: string; accent: string; label: string }> = {
  worship: { bg: 'from-violet-950 to-indigo-950', accent: 'text-violet-300', label: 'Worship' },
  sermon: { bg: 'from-amber-950 to-orange-950', accent: 'text-amber-300', label: 'Sermon' },
  easter: { bg: 'from-emerald-950 to-teal-950', accent: 'text-emerald-300', label: 'Easter' },
  christmas: { bg: 'from-red-950 to-rose-950', accent: 'text-rose-300', label: 'Christmas' },
  praise: { bg: 'from-yellow-950 to-amber-950', accent: 'text-yellow-300', label: 'Praise' },
  minimal: { bg: 'from-zinc-950 to-neutral-950', accent: 'text-zinc-300', label: 'Minimal' },
}
export const defaultTheme = { bg: 'from-zinc-950 to-neutral-950', accent: 'text-zinc-300', label: 'Minimal' }

const fontSizeMap = {
  sm: 'text-base md:text-lg',
  md: 'text-lg md:text-xl lg:text-2xl',
  lg: 'text-xl md:text-2xl lg:text-3xl',
  xl: 'text-2xl md:text-3xl lg:text-4xl',
}
const fontFamilyMap = { sans: 'font-sans', serif: 'font-serif', mono: 'font-mono' }

function SlideContent({
  slide, theme, large, settings,
}: {
  slide: Slide
  theme: { accent: string }
  large: boolean
  settings: Pick<AppSettings, 'fontSize' | 'fontFamily' | 'textShadow' | 'showReferenceOnOutput'>
}) {
  const sizeClass = large
    ? fontSizeMap[settings.fontSize] || fontSizeMap.lg
    : 'text-[10px] md:text-xs'
  const fontClass = fontFamilyMap[settings.fontFamily as keyof typeof fontFamilyMap] || 'font-sans'
  const shadow = settings.textShadow ? { textShadow: '0 2px 12px rgba(0,0,0,0.4)' } : {}

  if (slide.type === 'title') {
    return (
      <div className={cn(fontClass, 'flex flex-col items-center justify-center text-center')}>
        <h2
          className={cn(
            'font-bold',
            theme.accent,
            large ? 'text-3xl md:text-4xl lg:text-5xl' : 'text-xs md:text-sm',
          )}
          style={shadow}
        >
          {slide.title}
        </h2>
        {slide.subtitle && settings.showReferenceOnOutput && (
          <p
            className={cn('mt-2 opacity-70', theme.accent, large ? 'text-lg md:text-xl' : 'text-[8px]')}
            style={shadow}
          >
            {slide.subtitle}
          </p>
        )}
      </div>
    )
  }

  if (slide.type === 'verse' || slide.type === 'lyrics') {
    return (
      <div className={cn('text-center max-w-3xl', fontClass)}>
        {settings.showReferenceOnOutput && (
          <p
            className={cn('opacity-60 mb-2', theme.accent, large ? 'text-base' : 'text-[8px]')}
            style={shadow}
          >
            {slide.title}
          </p>
        )}
        {slide.content.map((line, i) => (
          <p
            key={i}
            className={cn('font-medium leading-relaxed', theme.accent, sizeClass)}
            style={shadow}
          >
            {line}
          </p>
        ))}
      </div>
    )
  }

  return (
    <div className={cn('opacity-30', theme.accent, large ? 'text-2xl' : 'text-xs')} style={shadow}>
      {slide.title || 'Blank'}
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
        'group relative w-full overflow-hidden aspect-video transition-all',
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
