'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card, CardContent } from '@/components/ui/card'
import {
  MonitorPlay,
  ChevronLeft,
  ChevronRight,
  Square,
  Eye,
  Clock,
  Presentation,
  Wifi,
  WifiOff,
  Send,
  Radio,
  ExternalLink,
  Settings,
  Copy,
  Check,
  MonitorSpeaker,
  Users,
  Play,
  Pause,
  Footprints,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'

const slideThemes: Record<string, { bg: string; accent: string; label: string }> = {
  worship: { bg: 'from-violet-950 to-indigo-950', accent: 'text-violet-300', label: 'Worship' },
  sermon: { bg: 'from-amber-950 to-orange-950', accent: 'text-amber-300', label: 'Sermon' },
  easter: { bg: 'from-emerald-950 to-teal-950', accent: 'text-emerald-300', label: 'Easter' },
  christmas: { bg: 'from-red-950 to-rose-950', accent: 'text-rose-300', label: 'Christmas' },
  praise: { bg: 'from-yellow-950 to-amber-950', accent: 'text-yellow-300', label: 'Praise' },
  minimal: { bg: 'from-zinc-950 to-neutral-950', accent: 'text-zinc-300', label: 'Minimal' },
}
const defaultTheme = { bg: 'from-zinc-950 to-neutral-950', accent: 'text-zinc-300', label: 'Minimal' }
const fontSizeMap = { sm: 'text-lg md:text-xl', md: 'text-xl md:text-2xl lg:text-3xl', lg: 'text-2xl md:text-3xl lg:text-4xl', xl: 'text-3xl md:text-4xl lg:text-5xl' }
const fontFamilyMap = { sans: 'font-sans', serif: 'font-serif', mono: 'font-mono' }

const getCongregationOutputUrl = () => {
  if (typeof window === 'undefined') return '/api/output/congregation'
  return new URL('/api/output/congregation', window.location.origin).toString()
}

// v0.5.52 — operator-pickable highlight tints for the active verse in
// multi-verse passages (T006). Keys map to the values exposed by the
// Theme Designer (Settings → Theme Designer) and persisted on the
// Zustand store at `state.highlightColor`.
const HIGHLIGHT_TINTS: Record<string, string> = {
  amber: 'bg-amber-500/30 ring-2 ring-amber-400',
  red: 'bg-red-500/30 ring-2 ring-red-400',
  emerald: 'bg-emerald-500/30 ring-2 ring-emerald-400',
  sky: 'bg-sky-500/30 ring-2 ring-sky-400',
  violet: 'bg-violet-500/30 ring-2 ring-violet-400',
  rose: 'bg-rose-500/30 ring-2 ring-rose-400',
}

function SlideContent({ slide, theme, large = false, settings, activeVerseIndex, highlightColor, verseRefs }: {
  slide: { type: string; title: string; subtitle: string; content: string[] };
  theme: { accent: string };
  large?: boolean;
  settings: { fontSize: string; fontFamily: string; textShadow: boolean; showReferenceOnOutput: boolean };
  activeVerseIndex?: number;
  highlightColor?: string;
  verseRefs?: React.MutableRefObject<Array<HTMLParagraphElement | null>>;
}) {
  const sizeClass = large ? fontSizeMap[settings.fontSize as keyof typeof fontSizeMap] || 'text-2xl md:text-3xl lg:text-4xl' : 'text-lg md:text-2xl'
  const fontClass = fontFamilyMap[settings.fontFamily as keyof typeof fontFamilyMap] || 'font-sans'
  const shadow = settings.textShadow ? { textShadow: '0 2px 12px rgba(0,0,0,0.3)' } : {}
  const tintClass = HIGHLIGHT_TINTS[highlightColor ?? 'amber'] ?? HIGHLIGHT_TINTS.amber

  if (slide.type === 'title') {
    return (
      <div className={cn(fontClass, 'flex flex-col items-center justify-center text-center')}>
        <h2 className={cn('font-bold', theme.accent, large ? 'text-4xl md:text-5xl lg:text-6xl' : 'text-2xl md:text-3xl lg:text-4xl')} style={shadow}>{slide.title}</h2>
        {slide.subtitle && settings.showReferenceOnOutput && (
          <p className={cn('mt-4 opacity-70', theme.accent, large ? 'text-xl md:text-2xl' : 'text-sm md:text-lg')} style={shadow}>{slide.subtitle}</p>
        )}
      </div>
    )
  }

  if (slide.type === 'verse' || slide.type === 'lyrics') {
    const isMulti = (slide.content?.length ?? 0) > 1
    const hasActive = isMulti && typeof activeVerseIndex === 'number'
    return (
      <div className={cn('text-center max-w-3xl', fontClass)}>
        {settings.showReferenceOnOutput && <p className={cn('opacity-50 mb-4', theme.accent, large ? 'text-lg' : 'text-xs')} style={shadow}>{slide.title}</p>}
        {slide.content.map((line, i) => {
          const isActive = hasActive && i === activeVerseIndex
          const isDimmed = hasActive && i !== activeVerseIndex
          return (
            <p
              key={i}
              ref={(el) => {
                if (verseRefs) verseRefs.current[i] = el
              }}
              className={cn(
                'font-medium leading-relaxed transition-all duration-300',
                theme.accent,
                sizeClass,
                hasActive && 'rounded-md px-3 py-2 my-1',
                isActive && tintClass,
                isDimmed && 'opacity-50',
              )}
              style={shadow}
            >
              {line}
            </p>
          )
        })}
      </div>
    )
  }

  return (
    <div className={cn('opacity-30', theme.accent, large ? 'text-3xl' : 'text-xl')} style={shadow}>
      {slide.title || ''}
    </div>
  )
}

function LowerThirdContent({ slide, theme, settings }: { slide: { type: string; title: string; subtitle: string; content: string[] } | null; theme: { accent: string }; settings: { fontSize: string; fontFamily: string; textShadow: boolean; showReferenceOnOutput: boolean; lowerThirdHeight: string; lowerThirdPosition: string } }) {
  if (!slide) return null
  const sizeClass = fontSizeMap[settings.fontSize as keyof typeof fontSizeMap] || 'text-2xl md:text-3xl'
  const fontClass = fontFamilyMap[settings.fontFamily as keyof typeof fontFamilyMap] || 'font-sans'
  const shadow = settings.textShadow ? { textShadow: '0 2px 12px rgba(0,0,0,0.3)' } : {}
  const heightClass = settings.lowerThirdHeight === 'sm' ? 'h-24' : settings.lowerThirdHeight === 'lg' ? 'h-48' : 'h-36'
  const textSizeClass = settings.lowerThirdHeight === 'sm' ? 'text-sm md:text-base lg:text-lg' : settings.lowerThirdHeight === 'lg' ? 'text-2xl md:text-3xl lg:text-4xl' : 'text-lg md:text-2xl lg:text-3xl'
  const posClass = settings.lowerThirdPosition === 'top' ? 'top-0' : 'bottom-0'

  return (
    <div className={cn('absolute left-0 right-0 flex flex-col items-center justify-center px-12', heightClass, posClass)}>
      <div className="w-full max-w-4xl bg-black/80 backdrop-blur-sm rounded-lg px-8 py-4 border border-white/10">
        {settings.showReferenceOnOutput && slide.title && <p className={cn('text-xs md:text-sm opacity-50 mb-1', theme.accent)} style={shadow}>{slide.title}</p>}
        <div className={cn(fontClass, 'text-center space-y-0.5')}>
          {slide.content.map((line, i) => (
            <p key={i} className={cn('font-medium leading-tight', theme.accent, textSizeClass)} style={shadow}>{line}</p>
          ))}
        </div>
      </div>
    </div>
  )
}

function SlidePreviewCard({ slide, themeKey, label, isActive, onClick, size = 'md', settings, activeVerseIndex, highlightColor, verseRefs, scrollable }: {
  slide: { id: string; type: string; title: string; subtitle: string; content: string[] }
  themeKey: string; label: string; isActive: boolean; onClick?: () => void; size?: 'sm' | 'md' | 'lg'
  settings: { fontSize: string; fontFamily: string; textShadow: boolean; showReferenceOnOutput: boolean; lowerThirdHeight: string; lowerThirdPosition: string; displayMode: string; customBackground: string | null }
  activeVerseIndex?: number
  highlightColor?: string
  verseRefs?: React.MutableRefObject<Array<HTMLParagraphElement | null>>
  scrollable?: boolean
}) {
  const theme = slideThemes[themeKey] || defaultTheme
  const isLarge = size === 'lg'
  const isLowerThird = settings.displayMode.startsWith('lower-third')

  // v0.5.52 — when the live card hosts a multi-verse passage we wrap
  // the content in a ScrollArea so scrollIntoView in the auto-scroll
  // / speaker-follow path can keep the active verse in view.
  const inner = (
    <SlideContent
      slide={slide}
      theme={theme}
      large={isLarge}
      settings={settings as any}
      activeVerseIndex={activeVerseIndex}
      highlightColor={highlightColor}
      verseRefs={verseRefs}
    />
  )

  return (
    <div className={cn('relative w-full overflow-hidden transition-all aspect-video', isActive ? 'ring-2 ring-primary' : '', onClick && 'cursor-pointer')} onClick={onClick}>
      <div className={cn('absolute inset-0 bg-gradient-to-br', theme.bg)}>
        {settings.customBackground && (<><img src={settings.customBackground} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" /><div className="absolute inset-0 bg-black/40" /></>)}
      </div>
      {isLowerThird
        ? <LowerThirdContent slide={slide} theme={theme} settings={settings as any} />
        : (
          <div className={cn('absolute inset-0 flex flex-col items-center justify-center', isLarge ? 'p-8 md:p-12' : 'p-3 md:p-6')}>
            {scrollable
              ? <ScrollArea className="w-full h-full"><div className="flex flex-col items-center justify-center min-h-full py-2">{inner}</div></ScrollArea>
              : inner}
          </div>
        )
      }
      <div className="absolute top-2 left-2 z-10">
        <Badge variant={isActive ? 'default' : 'secondary'} className={cn('text-[10px] px-1.5 py-0.5', isActive && 'bg-primary text-primary-foreground', !isActive && 'bg-black/60 text-white border-0')}>{label}</Badge>
      </div>
    </div>
  )
}

export function LivePresenterView() {
  const {
    slides, previewSlideIndex, setPreviewSlideIndex,
    liveSlideIndex, setLiveSlideIndex,
    isLive, setIsLive,
    ndiConnected, setNdiConnected,
    settings, setCurrentView,
  } = useAppStore()

  // v0.5.52 — auto-scroll + speaker-follow + highlight color wiring
  const liveActiveVerseIndex = useAppStore((s) => s.liveActiveVerseIndex)
  const setLiveActiveVerseIndex = useAppStore((s) => s.setLiveActiveVerseIndex)
  const autoScrollEnabled = useAppStore((s) => s.autoScrollEnabled)
  const setAutoScrollEnabled = useAppStore((s) => s.setAutoScrollEnabled)
  const autoScrollSpeedMs = useAppStore((s) => s.autoScrollSpeedMs)
  const setAutoScrollSpeedMs = useAppStore((s) => s.setAutoScrollSpeedMs)
  const speakerFollowEnabled = useAppStore((s) => s.speakerFollowEnabled)
  const setSpeakerFollowEnabled = useAppStore((s) => s.setSpeakerFollowEnabled)
  const highlightColor = useAppStore((s) => s.highlightColor)
  const verseRefs = useRef<Array<HTMLParagraphElement | null>>([])
  const autoScrollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [elapsedTime, setElapsedTime] = useState(0)
  const [outputUrl, setOutputUrl] = useState('')
  const [outputActive, setOutputActive] = useState(false)
  const [subscriberCount, setSubscriberCount] = useState(0)
  const [copiedUrl, setCopiedUrl] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const previewSlide = slides[previewSlideIndex] || null
  const liveSlide = liveSlideIndex >= 0 ? slides[liveSlideIndex] : null
  const previewTheme = previewSlide ? (slideThemes[previewSlide.background || settings.congregationScreenTheme] || defaultTheme) : defaultTheme
  const liveTheme = liveSlide ? (slideThemes[liveSlide.background || settings.congregationScreenTheme] || defaultTheme) : defaultTheme
  const isLowerThird = settings.displayMode.startsWith('lower-third')

  // Timer
  const prevIsLiveRef = useRef(isLive)
  useEffect(() => {
    if (prevIsLiveRef.current && !isLive) setElapsedTime(0) // eslint-disable-line react-hooks/set-state-in-effect
    prevIsLiveRef.current = isLive
  }, [isLive])
  useEffect(() => {
    if (isLive) { timerRef.current = setInterval(() => setElapsedTime((p) => p + 1), 1000) }
    else { if (timerRef.current) clearInterval(timerRef.current) }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [isLive])
  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`

  // ── v0.5.52 — Auto-scroll: reset to verse 0 on new live cue ─────────
  // Whenever the live slide identity changes (new detection sent live)
  // we reset the active verse cursor so the operator never inherits an
  // out-of-range index from the previous passage.
  const liveSlideId = liveSlide?.id ?? null
  const liveSlideContentLen = liveSlide?.content?.length ?? 0
  useEffect(() => {
    setLiveActiveVerseIndex(0)
    verseRefs.current = []
  }, [liveSlideId, setLiveActiveVerseIndex])

  // ── v0.5.52 — Auto-scroll TIMER (independent of speaker-follow) ────
  // When `autoScrollEnabled` is true AND a multi-verse passage is on
  // air, advance the active verse on a fixed interval. Cleans up on
  // toggle / passage change. Auto-stops at the last verse.
  useEffect(() => {
    if (autoScrollTimerRef.current) {
      clearInterval(autoScrollTimerRef.current)
      autoScrollTimerRef.current = null
    }
    if (!autoScrollEnabled) return
    if (liveSlideContentLen < 2) return
    autoScrollTimerRef.current = setInterval(() => {
      const s = useAppStore.getState()
      const slide = s.liveSlideIndex >= 0 ? s.slides[s.liveSlideIndex] : null
      const max = slide?.content?.length ? slide.content.length - 1 : 0
      const next = s.liveActiveVerseIndex + 1
      if (next > max) {
        s.setAutoScrollEnabled(false)
        return
      }
      s.setLiveActiveVerseIndex(next)
    }, autoScrollSpeedMs)
    return () => {
      if (autoScrollTimerRef.current) {
        clearInterval(autoScrollTimerRef.current)
        autoScrollTimerRef.current = null
      }
    }
  }, [autoScrollEnabled, autoScrollSpeedMs, liveSlideId, liveSlideContentLen])

  // ── v0.5.52 — Scroll the active verse into view inside the LIVE
  // card's ScrollArea whenever the index changes.
  useEffect(() => {
    const el = verseRefs.current[liveActiveVerseIndex]
    if (el && typeof el.scrollIntoView === 'function') {
      try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }) } catch { /* ignore */ }
    }
  }, [liveActiveVerseIndex, liveSlideId])

  // ── Send slide to output via HTTP POST to SSE relay ──────────────────
  const sendToOutput = useCallback(async (slide: typeof liveSlide, live: boolean) => {
    try {
      await fetch('/api/output', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'slide', slide, isLive: live,
          displayMode: settings.displayMode,
          settings: {
            fontSize: settings.fontSize, fontFamily: settings.fontFamily,
            textShadow: settings.textShadow, showReferenceOnOutput: settings.showReferenceOnOutput,
            lowerThirdHeight: settings.lowerThirdHeight, lowerThirdPosition: settings.lowerThirdPosition,
            customBackground: settings.customBackground, congregationScreenTheme: settings.congregationScreenTheme,
          },
        }),
      })
    } catch { /* congregation display reconnects via SSE */ }
  }, [settings])

  useEffect(() => {
    setOutputUrl(getCongregationOutputUrl())
  }, [])

  // Poll output status
  useEffect(() => {
    if (!outputActive) return
    const check = async () => {
      try {
        const res = await fetch('/api/output?format=json')
        const data = await res.json()
        setSubscriberCount(data.subscribers || 0)
      } catch { setSubscriberCount(0) }
    }
    check()
    const iv = setInterval(check, 5000)
    return () => clearInterval(iv)
  }, [outputActive])

  // Send updates when live changes
  useEffect(() => { if (outputActive) sendToOutput(liveSlide, isLive) }, [liveSlideIndex, outputActive, liveSlide, isLive, sendToOutput])

  const goToLive = useCallback(() => {
    if (!previewSlide) return
    setLiveSlideIndex(previewSlideIndex)
    setIsLive(true)
    sendToOutput(previewSlide, true)
    if (previewSlideIndex < slides.length - 1) setPreviewSlideIndex(previewSlideIndex + 1)
  }, [previewSlide, previewSlideIndex, slides.length, setLiveSlideIndex, setIsLive, setPreviewSlideIndex, sendToOutput])

  // Output toggle
  const toggleOutput = useCallback(() => {
    if (outputActive) {
      setOutputActive(false); setNdiConnected(false)
      /* v0.5.4 T006 — silenced. The output button's own state +
         the on-screen badge already tell the operator what changed;
         the toast was the same "Connected"-style spam they asked to
         remove. */
    } else {
      setOutputActive(true); setNdiConnected(true)
      const url = getCongregationOutputUrl()
      setOutputUrl(url)
      const st = useAppStore.getState()
      const cur = st.liveSlideIndex >= 0 ? st.slides[st.liveSlideIndex] : null
      sendToOutput(cur, st.isLive)
    }
  }, [outputActive, setNdiConnected, sendToOutput])

  // Auto-activate output when NDI mode selected
  useEffect(() => {
    if ((settings.outputDestination === 'ndi' || settings.outputDestination === 'both') && !outputActive) {
      setOutputActive(true); setNdiConnected(true) // eslint-disable-line react-hooks/set-state-in-effect
      setOutputUrl(getCongregationOutputUrl())
    }
  }, [settings.outputDestination, outputActive, setNdiConnected])

  const openOutputScreen = () => {
    const congUrl = getCongregationOutputUrl()
    setOutputActive(true)
    setNdiConnected(true)
    setOutputUrl(congUrl)
    const st = useAppStore.getState()
    const cur = st.liveSlideIndex >= 0 ? st.slides[st.liveSlideIndex] : null
    sendToOutput(cur, st.isLive)
    if (settings.outputDestination === 'window' || settings.outputDestination === 'both') {
      window.open(congUrl, '_blank', 'width=1920,height=1080')
    }
  }

  const goToLiveAndOpen = () => { goToLive(); openOutputScreen() }

  const copyCongregationUrl = async () => {
    const url = outputUrl || getCongregationOutputUrl()
    try {
      await navigator.clipboard.writeText(url)
      setCopiedUrl(true); toast.success('URL copied!')
      setTimeout(() => setCopiedUrl(false), 2000)
    } catch { toast.error('Failed to copy') }
  }

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); goToLive() }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); if (previewSlideIndex < slides.length - 1) setPreviewSlideIndex(previewSlideIndex + 1) }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); if (previewSlideIndex > 0) setPreviewSlideIndex(previewSlideIndex - 1) }
      if (e.key === 'Escape') { setIsLive(false); setLiveSlideIndex(-1); sendToOutput(null, false) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [previewSlideIndex, slides.length, goToLive, setIsLive, setLiveSlideIndex, sendToOutput])

  // Congregation screen (same browser window mode). Computed in an effect so
  // the SSR pass and the first client render agree (hydration-safe), then
  // re-rendered with the real value once the component is mounted.
  const [isCongregationScreen, setIsCongregationScreen] = useState(false)
  useEffect(() => {
    setIsCongregationScreen(
      new URLSearchParams(window.location.search).get('screen') === 'congregation'
    )
  }, [])

  if (isCongregationScreen) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden">
        {settings.customBackground && (<><img src={settings.customBackground} alt="" className="absolute inset-0 w-full h-full object-cover opacity-50" /><div className="absolute inset-0 bg-black/30" /></>)}
        <AnimatePresence mode="wait">
          {liveSlide ? (
            <motion.div key={liveSlide.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: settings.slideTransitionDuration / 1000 }}
              className={cn('w-full h-full flex flex-col items-center justify-center p-16 relative', isLowerThird ? '' : 'bg-gradient-to-br', isLowerThird ? '' : liveTheme.bg)}>
              {isLowerThird ? <LowerThirdContent slide={liveSlide} theme={liveTheme} settings={settings as any} /> : <SlideContent slide={liveSlide} theme={liveTheme} large settings={settings as any} />}
            </motion.div>
          ) : (
            <motion.div key="blank" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full h-full bg-black" />
          )}
        </AnimatePresence>
        {isLive && (
          <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
            <Badge variant="destructive" className="gap-1.5"><span className="live-indicator inline-block h-2 w-2 rounded-full bg-white" /> LIVE</Badge>
          </div>
        )}
      </div>
    )
  }

  // Operator View
  return (
    <div className="flex h-full flex-col">
      {/* Top Controls */}
      <div className="flex items-center justify-between px-4 md:px-6 py-2.5 border-b border-border bg-card/50 shrink-0">
        <div className="flex items-center gap-3">
          {isLive && <Badge variant="destructive" className="gap-1.5 animate-pulse"><Radio className="h-3 w-3" /> LIVE</Badge>}
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground"><Clock className="h-4 w-4" /><span className="font-mono">{formatTime(elapsedTime)}</span></div>
          <Badge variant="outline" className="text-xs">{slides.length > 0 ? `Live: ${liveSlideIndex >= 0 ? liveSlideIndex + 1 : '—'} / ${slides.length}` : 'No slides'}</Badge>
          <Badge variant="secondary" className="text-xs gap-1 hidden sm:flex">{isLowerThird ? 'Lower Third' : 'Full Screen'}</Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5" onClick={() => setCurrentView('settings')}>
            <Settings className="h-3.5 w-3.5" /><span className="hidden md:inline">Settings</span>
          </Button>

          <Button variant={outputActive ? 'default' : 'outline'} size="sm"
            className={cn('h-8 text-xs gap-1.5', outputActive && 'bg-emerald-600 hover:bg-emerald-700')}
            onClick={toggleOutput}>
            {outputActive ? <><Wifi className="h-3.5 w-3.5" /> Output On</> : <><WifiOff className="h-3.5 w-3.5" /> Output</>}
          </Button>

          {outputActive && subscriberCount > 0 && (
            <Badge variant="secondary" className="text-[10px] gap-1"><Users className="h-3 w-3" /> {subscriberCount}</Badge>
          )}

          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={openOutputScreen} disabled={slides.length === 0}>
            <ExternalLink className="h-3.5 w-3.5" /><span className="hidden sm:inline">Window</span>
          </Button>

          {liveSlideIndex >= 0 && (
            <Button variant="destructive" size="sm" className="h-8 text-xs gap-1" onClick={() => { setLiveSlideIndex(-1); setIsLive(false); sendToOutput(null, false) }}>
              <Square className="h-3 w-3" /> Clear
            </Button>
          )}
        </div>
      </div>

      {slides.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted mx-auto"><Presentation className="h-8 w-8 text-muted-foreground" /></div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">Live Presenter Mode</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Generate slides using the Slide Generator or look up Bible verses, then present them here.
                Use <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">Enter</kbd> to go live.
              </p>
            </div>

            <Card className="max-w-lg mx-auto border-border/50 bg-card/50">
              <CardContent className="p-4 text-left">
                <div className="flex items-center gap-2 mb-3">
                  <MonitorSpeaker className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">Output Setup for vMix / Wirecast</span>
                </div>
                <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
                  <p><strong className="text-foreground">Step 1:</strong> Click <strong>Output</strong> above to enable the output service.</p>
                  <p><strong className="text-foreground">Step 2:</strong> Open this wireless display URL in a browser:</p>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="flex-1 px-2 py-1.5 rounded bg-muted text-[10px] font-mono truncate">{outputUrl || '/api/output/congregation'}</code>
                    <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 shrink-0" onClick={copyCongregationUrl}>
                      {copiedUrl ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}{copiedUrl ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                  <p><strong className="text-foreground">Step 3:</strong> Make the browser window fullscreen (F11).</p>
                  <p><strong className="text-foreground">Step 4:</strong> Use <strong>NDI Screen Capture</strong> to capture that fullscreen browser window as NDI.</p>
                  <p><strong className="text-foreground">Step 5:</strong> In vMix/Wirecast, add the NDI source. Done!</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Slide List */}
          <div className="w-48 md:w-56 border-r border-border flex flex-col shrink-0">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
              <Presentation className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium">Slides ({slides.length})</span>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-1.5 flex flex-col gap-0.5">
                {slides.map((slide, i) => (
                  <button key={slide.id} onClick={() => setPreviewSlideIndex(i)}
                    className={cn('flex items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors',
                      previewSlideIndex === i ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/50 border border-transparent',
                      liveSlideIndex === i && 'border-l-2 border-l-red-500')}>
                    <div className={cn('h-5 w-5 shrink-0 flex items-center justify-center rounded text-[10px] font-bold',
                      liveSlideIndex === i ? 'bg-red-500 text-white' : previewSlideIndex === i ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                      {liveSlideIndex === i ? <Radio className="h-3 w-3" /> : i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-xs font-medium truncate', liveSlideIndex === i && 'text-red-400')}>
                        {slide.type === 'title' ? slide.title : slide.content?.[0] || slide.title}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{slide.type}{slide.subtitle ? ` · ${slide.subtitle}` : ''}</p>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Preview & Live Dual Column */}
          <div className="flex-1 flex flex-col min-w-0 p-3 md:p-4 gap-3">
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-primary" /><span className="text-sm font-semibold text-foreground">Preview</span>
                  {previewSlide && <Badge variant="outline" className="text-[10px]">{previewSlideIndex + 1} / {slides.length}</Badge>}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPreviewSlideIndex(Math.max(0, previewSlideIndex - 1))} disabled={previewSlideIndex === 0}><ChevronLeft className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPreviewSlideIndex(Math.min(slides.length - 1, previewSlideIndex + 1))} disabled={previewSlideIndex === slides.length - 1}><ChevronRight className="h-4 w-4" /></Button>
                </div>
              </div>
              <div className="flex-1 min-h-0">
                {previewSlide
                  ? <SlidePreviewCard slide={previewSlide} themeKey={previewSlide.background || settings.congregationScreenTheme} label="PREVIEW" isActive={false} size="lg" settings={settings as any} />
                  : <div className="w-full h-full bg-muted/20 rounded-xl flex items-center justify-center border border-dashed border-border"><p className="text-sm text-muted-foreground">No slide selected</p></div>
                }
              </div>
            </div>

            <div className="shrink-0 flex gap-2">
              <Button onClick={goToLive} disabled={!previewSlide}
                className={cn('flex-1 h-11 text-sm font-bold gap-2 transition-all', isLive ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-primary hover:bg-primary/90')}>
                <Send className="h-4 w-4" />{isLive ? 'Send to Live' : 'Go Live'}
                <kbd className="hidden md:inline-flex ml-2 px-1.5 py-0.5 rounded bg-black/20 text-[10px] font-mono">Enter</kbd>
              </Button>
              <Button onClick={goToLiveAndOpen} disabled={!previewSlide} variant="outline" className="h-11 text-sm gap-2 px-4">
                <MonitorPlay className="h-4 w-4" /><span className="hidden sm:inline">Window</span>
              </Button>
            </div>

            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center gap-2 mb-2">
                <Radio className={cn('h-4 w-4', isLive ? 'text-red-500' : 'text-muted-foreground')} />
                <span className="text-sm font-semibold text-foreground">Live Output</span>
                {liveSlide && <Badge variant="destructive" className="text-[10px] gap-1"><span className="live-indicator inline-block h-1.5 w-1.5 rounded-full bg-white" /> ON AIR</Badge>}
                {!liveSlide && isLive && <Badge variant="secondary" className="text-[10px]">Black</Badge>}
                <button
                  type="button"
                  onClick={() => setSpeakerFollowEnabled(!speakerFollowEnabled)}
                  className={cn(
                    'ml-auto inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors',
                    speakerFollowEnabled
                      ? 'bg-primary/15 border-primary/30 text-primary'
                      : 'bg-muted border-border text-muted-foreground hover:bg-muted/80',
                  )}
                  title="Speaker-Follow: highlight the verse the preacher is currently reading"
                >
                  <Footprints className="h-3 w-3" />
                  Follow {speakerFollowEnabled ? 'ON' : 'OFF'}
                </button>
                {outputUrl && (
                  <a href={outputUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline flex items-center gap-1">
                    <ExternalLink className="h-3 w-3" /> Congregation
                  </a>
                )}
              </div>
              <div className="flex-1 min-h-0">
                <AnimatePresence mode="wait">
                  {liveSlide
                    ? (
                      <motion.div key={liveSlide.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="w-full h-full">
                        <SlidePreviewCard slide={liveSlide} themeKey={liveSlide.background || settings.congregationScreenTheme} label="LIVE" isActive={true} size="lg" settings={settings as any} activeVerseIndex={liveActiveVerseIndex} highlightColor={highlightColor} verseRefs={verseRefs} scrollable={liveSlide.type === 'verse' && (liveSlide.content?.length ?? 0) > 1} />
                      </motion.div>
                    )
                    : (
                      <div className="w-full h-full bg-black rounded-xl flex items-center justify-center">
                        <div className="text-center space-y-2"><MonitorPlay className="h-8 w-8 text-zinc-600 mx-auto" /><p className="text-sm text-zinc-500">{isLive ? 'Output is black' : 'Nothing live yet'}</p></div>
                      </div>
                    )
                  }
                </AnimatePresence>
              </div>
              {/* v0.5.52 — Auto-Scroll controls (visible only for multi-verse passages on air) */}
              {liveSlide && liveSlide.type === 'verse' && (liveSlide.content?.length ?? 0) > 1 && (
                <div className="mt-2 flex items-center justify-between gap-2 px-2 py-1.5 rounded-md bg-card/50 border border-border">
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setAutoScrollEnabled(!autoScrollEnabled)} title={autoScrollEnabled ? 'Pause auto-scroll' : 'Play auto-scroll'}>
                      {autoScrollEnabled ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setAutoScrollEnabled(false); setLiveActiveVerseIndex(0) }} title="Stop & reset to verse 1">
                      <Square className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-[10px] text-muted-foreground ml-1">
                      Verse {Math.min(liveActiveVerseIndex + 1, liveSlide.content?.length ?? 1)} / {liveSlide.content?.length ?? 1}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground mr-1">Speed</span>
                    {[
                      { label: 'Slow', ms: 6000 },
                      { label: 'Med', ms: 4000 },
                      { label: 'Fast', ms: 2000 },
                    ].map((opt) => (
                      <button
                        key={opt.ms}
                        type="button"
                        onClick={() => setAutoScrollSpeedMs(opt.ms)}
                        className={cn(
                          'px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors',
                          autoScrollSpeedMs === opt.ms
                            ? 'bg-primary/15 border-primary/30 text-primary'
                            : 'bg-muted border-border text-muted-foreground hover:bg-muted/80',
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Status Bar */}
      {slides.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-card/30 text-xs text-muted-foreground shrink-0">
          <div className="flex items-center gap-4">
            <span><kbd className="px-1 py-0.5 rounded bg-muted font-mono">Enter</kbd> Live</span>
            <span><kbd className="px-1 py-0.5 rounded bg-muted font-mono">←→</kbd> Navigate</span>
            <span><kbd className="px-1 py-0.5 rounded bg-muted font-mono">Esc</kbd> Clear</span>
          </div>
          <div className="flex items-center gap-3">
            {outputActive && <span className="flex items-center gap-1 text-emerald-400"><Wifi className="h-3 w-3" /> Output{subscriberCount > 0 ? ` (${subscriberCount})` : ''}</span>}
            <span>{settings.displayMode === 'full' ? 'Full' : 'Lower Third'}</span>
            <span>{slides.length} slides</span>
          </div>
        </div>
      )}
    </div>
  )
}
