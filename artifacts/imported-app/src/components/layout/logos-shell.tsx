'use client'

/**
 * Logos-AI–style live production console.
 *
 * Visual reference: a rounded-card grid with three columns on top
 * (Live Transcription · Preview + Live Display · Scripture Feed) and three
 * columns on the bottom (Chapter Navigator · Detected Verses · Paraphrase
 * Matches). Uses the existing Bible / detection / AI components inside
 * cards, plus the existing TopToolbar and TransportBar from the
 * EasyWorship shell so we don't duplicate the broadcast / transport logic.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SlideThumb } from '@/components/presenter/slide-renderer'
import { getFontStack } from '@/lib/fonts'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Mic,
  MicOff,
  Send,
  CircleSlash,
  Square,
  Image as LogoIcon,
  History,
  ListOrdered,
  BookOpen,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Plus,
  Upload,
  Film,
  ImageIcon,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Headphones,
  LayoutGrid,
  List as ListIcon,
  Rows3,
  Grid3x3,
  AlignJustify,
  Check,
  Zap,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { BibleLookupCompact } from '@/components/layout/library-compact'
import { TopToolbar, TransportBar } from '@/components/layout/easyworship-shell'
import {
  parseVerseReference,
  getNextChapter,
  getPrevChapter,
  fetchBibleChapter,
  normalizeTranscriptForDisplay,
} from '@/lib/bible-api'
import type { Slide } from '@/lib/store'

// ──────────────────────────────────────────────────────────────────────
// Card primitives
// ──────────────────────────────────────────────────────────────────────
function Card({
  title,
  badge,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title: string
  badge?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section
      className={cn(
        'flex flex-col min-h-0 rounded-xl border border-zinc-800/70 bg-zinc-950/60 shadow-sm overflow-hidden',
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2 px-3 h-9 border-b border-zinc-800/60 shrink-0 bg-zinc-900/30">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-[10px] uppercase tracking-[0.18em] font-semibold text-zinc-300 truncate">
            {title}
          </h3>
          {badge}
        </div>
        {actions && <div className="flex items-center gap-1 shrink-0">{actions}</div>}
      </header>
      <div className={cn('flex-1 min-h-0 flex flex-col', bodyClassName)}>{children}</div>
    </section>
  )
}

// ──────────────────────────────────────────────────────────────────────
// AUDIO METER — vertical level-bar shown beside Preview / Live frames
// ──────────────────────────────────────────────────────────────────────
// Visual indicator only (no real audio analysis hooked up). When the
// corresponding speaker / headphone toggle is active we animate a
// subtle bouncing level so it reads as "live audio passing through";
// when muted we render a dim ladder so it still looks like a meter.
// `active` controls the audio routing tint (lit vs dim ladder).
// `playing` is the REAL signal — we only animate the meter when the
// surface's <video> element is actually emitting frames AND audio is
// routed. With nothing playing, the bar sits idle (zero motion) so
// the operator never sees false activity.
function AudioMeter({
  active,
  playing,
  tone = 'green',
  surface,
}: {
  active: boolean
  playing: boolean
  tone?: 'green' | 'red' | 'amber'
  surface: 'live' | 'preview'
}) {
  // Read the real-signal level written by the slide-renderer's
  // Web Audio analyser. The meter tracks the actual sound coming
  // out of the surface — silent moments read 0, loud moments push
  // toward 100% — so it can never spike when the video is silent.
  const liveLevel = useAppStore((s) => s.audioLevelLive)
  const previewLevel = useAppStore((s) => s.audioLevelPreview)
  const raw = surface === 'live' ? liveLevel : previewLevel
  // Strict gating per operator request: the bar must ONLY move when
  // a) the audio routing toggle is on AND b) the video is actually
  // playing. No idle pulse, no breathing animation — silence reads
  // dead-flat zero so an operator can never mistake "armed" for
  // "live audio". If you want the toggle's state, look at the icon.
  const level = active && playing ? raw : 0
  const grad =
    tone === 'red'
      ? 'from-rose-500 via-rose-400 to-amber-400'
      : tone === 'amber'
        ? 'from-amber-500 via-amber-400 to-yellow-300'
        : 'from-emerald-500 via-emerald-400 to-yellow-300'
  return (
    <div className="relative h-full w-2 rounded-sm bg-zinc-900/80 border border-zinc-800 overflow-hidden">
      <div
        className={cn('absolute bottom-0 left-0 right-0 bg-gradient-to-t transition-[height] duration-100 ease-out', grad)}
        style={{ height: `${Math.round(level * 100)}%`, opacity: active ? 1 : 0.25 }}
      />
      {/* faint ladder ticks so it always reads as a meter, even idle */}
      <div className="absolute inset-0 pointer-events-none flex flex-col justify-between py-0.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <span key={i} className="block h-px w-full bg-black/40" />
        ))}
      </div>
    </div>
  )
}

// Smoothly eases a numeric value toward a moving target on every
// animation frame — the "actual vs target" loop that gives the
// scale control its broadcast-quality feel. Easing factor 0.22
// reaches ~99% of the target inside about 18 frames (~300 ms at
// 60 fps), which feels responsive but never jumpy. Stops calling
// setState once it has settled, so it costs nothing while idle.
function useEasedNumber(target: number, factor = 0.22): number {
  const [value, setValue] = useState(target)
  const valueRef = useRef(target)
  const targetRef = useRef(target)
  useEffect(() => {
    targetRef.current = target
  }, [target])
  useEffect(() => {
    let raf = 0
    let alive = true
    const tick = () => {
      if (!alive) return
      const cur = valueRef.current
      const tgt = targetRef.current
      const diff = tgt - cur
      if (Math.abs(diff) < 0.0008) {
        if (cur !== tgt) {
          valueRef.current = tgt
          setValue(tgt)
        }
      } else {
        const next = cur + diff * factor
        valueRef.current = next
        setValue(next)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      alive = false
      cancelAnimationFrame(raf)
    }
  }, [factor])
  return value
}

function Tab({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: typeof BookOpen
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-2 h-6 rounded text-[10px] uppercase tracking-wider font-semibold border transition-colors',
        active
          ? 'bg-sky-500/15 text-sky-300 border-sky-500/40'
          : 'bg-transparent text-zinc-500 border-transparent hover:text-zinc-300',
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  )
}

// ──────────────────────────────────────────────────────────────────────
// LIVE TRANSCRIPTION
// ──────────────────────────────────────────────────────────────────────
function LiveTranscriptionCard() {
  const {
    isListening,
    speechSupported,
    speechError,
    setSpeechCommand,
    liveTranscript,
    liveInterimTranscript,
    transcriptBreaks,
    isLive,
  } = useAppStore()
  const autoLive = useAppStore((s) => s.autoLive)
  const setAutoLive = useAppStore((s) => s.setAutoLive)

  const toggleMic = () => {
    if (!speechSupported) {
      toast.error('Speech recognition is not supported in this browser')
      return
    }
    setSpeechCommand(isListening ? 'stop' : 'start')
  }

  // Build paragraphs by slicing the running transcript at every
  // detection break point. The speech provider pushes a break index
  // (current transcript length) whenever it locks on a new scripture,
  // so each detection visually starts a fresh paragraph here. We
  // can't embed `\n\n` directly into the transcript string because
  // the speech hook re-emits the full transcript on every audio
  // chunk and would clobber any inline markers.
  // ── Auto-scroll the transcription card ──────────────────────────
  // Operators want the latest spoken line always visible without
  // having to grab the scrollbar. We follow the bottom by default,
  // but the moment the operator scrolls UP (to read an earlier
  // paragraph) we stop forcing the bottom — and resume the moment
  // they return there. `nearBottom` is the latched flag.
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null)
  const followBottomRef = useRef(true)
  const onTranscriptScroll = useCallback(() => {
    const el = transcriptScrollRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    // 32px tolerance — covers anti-aliased pixel rounding and the
    // small gap left by paragraph borders so re-docking feels snappy.
    followBottomRef.current = distanceFromBottom < 32
  }, [])
  // Re-pin to bottom whenever the transcript or the interim grows.
  // We schedule the scroll on the next frame so the layout has had
  // a chance to commit the new line height first.
  useEffect(() => {
    if (!followBottomRef.current) return
    const el = transcriptScrollRef.current
    if (!el) return
    const id = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
    })
    return () => cancelAnimationFrame(id)
  }, [liveTranscript, liveInterimTranscript])

  const paragraphs = (() => {
    const t = liveTranscript || ''
    if (!t) return [] as string[]
    const breaks = (transcriptBreaks || [])
      .filter((i) => i > 0 && i < t.length)
      .sort((a, b) => a - b)
    if (!breaks.length) return [t.trim()].filter(Boolean)
    const out: string[] = []
    let prev = 0
    for (const b of breaks) {
      const seg = t.slice(prev, b).trim()
      if (seg) out.push(seg)
      prev = b
    }
    const tail = t.slice(prev).trim()
    if (tail) out.push(tail)
    return out.slice(-12)
  })()

  return (
    <Card
      title="Live Transcription"
      badge={
        <Badge
          className={cn(
            'h-4 px-1.5 text-[9px] uppercase tracking-wider font-semibold border',
            isListening
              ? 'bg-rose-500/15 text-rose-300 border-rose-500/40 animate-pulse'
              : 'bg-zinc-800 text-zinc-400 border-zinc-700',
          )}
        >
          {isListening ? '● Listening' : 'Idle'}
        </Badge>
      }
      actions={
        <div className="flex items-center gap-1">
          {/* Clear Transcription — wipes the running transcript and
              the detection break markers without stopping the mic.
              Routes through the speech provider's `reset` command so
              recognition stays connected and the next utterance starts
              a fresh paragraph. */}
          <Button
            size="sm"
            onClick={() => setSpeechCommand('reset')}
            title="Clear transcription"
            className="h-7 px-2 text-[10px] uppercase tracking-wider gap-1 font-semibold bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700"
          >
            <Trash2 className="h-3 w-3" />
            Clear
          </Button>
          <Button
            size="sm"
            onClick={toggleMic}
            className={cn(
              'h-7 px-2.5 text-[10px] uppercase tracking-wider gap-1.5 font-semibold',
              isListening
                ? 'bg-rose-600 hover:bg-rose-700 text-white'
                : 'bg-sky-600 hover:bg-sky-700 text-white',
            )}
          >
            {isListening ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
            {isListening ? 'Stop' : isLive ? 'Listening' : 'Detect Verses Now'}
          </Button>
          {/* AUTO Display: when ON, every detected scripture is auto-staged
              and auto-sent to Live Display without an operator click. */}
          <Button
            size="sm"
            onClick={() => setAutoLive(!autoLive)}
            title={
              autoLive
                ? 'AUTO Display ON — detected verses go live automatically. Click to disable.'
                : 'AUTO Display OFF — verses preview only. Click to auto-send to Live Display.'
            }
            className={cn(
              'h-7 px-2 text-[10px] uppercase tracking-wider gap-1 font-semibold border',
              autoLive
                ? 'bg-amber-500 hover:bg-amber-400 text-black border-amber-300 shadow-md shadow-amber-500/30'
                : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-zinc-700',
            )}
          >
            <Zap className={cn('h-3 w-3', autoLive && 'fill-black')} />
            Auto
          </Button>
        </div>
      }
    >
      <div
        ref={transcriptScrollRef}
        onScroll={onTranscriptScroll}
        className="flex-1 min-h-0 overflow-y-auto relative"
      >
        <div className="p-3 space-y-1.5">
          {speechError && (
            <p className="text-[10px] text-rose-400">{speechError}</p>
          )}
          {!speechSupported && (
            <p className="text-[10px] text-amber-400">
              Speech recognition is not available — try Chrome or Edge.
            </p>
          )}
          {paragraphs.length === 0 && !liveInterimTranscript && (
            <div className="text-center py-6 text-[11px] text-zinc-600">
              <Mic className="h-7 w-7 mx-auto opacity-40 mb-2" />
              Tap <span className="text-sky-300 font-semibold">Detect Verses Now</span> to start
              transcribing the speaker. Detected scripture references will fill
              the right-hand panels.
            </div>
          )}
          {paragraphs.map((para, i) => (
            <p
              key={i}
              className={cn(
                'text-[12px] leading-relaxed text-zinc-200',
                // Add visible spacing between paragraphs
                i > 0 && 'mt-3 pt-3 border-t border-zinc-800/40',
              )}
            >
              {normalizeTranscriptForDisplay(para)}
            </p>
          ))}
          {liveInterimTranscript && (
            <p className="text-[12px] leading-relaxed text-zinc-500 italic">
              {normalizeTranscriptForDisplay(liveInterimTranscript)}…
            </p>
          )}
        </div>
      </div>
    </Card>
  )
}

// ──────────────────────────────────────────────────────────────────────
// DISPLAY STAGE — operator-side mirror of the secondary screen
// ──────────────────────────────────────────────────────────────────────
// Renders a single slide the way the congregation route would render
// it given the current Display Mode setting. Used by both the Preview
// and Live panes so any change to Settings → Display Mode (Full vs
// Lower Third / Lower Third on Black) reflects on the operator's
// staging frames in real time, matching what the projector / NDI feed
// shows. Typography (font family, font size bucket, text scale, text
// shadow, alignment) and lower-third geometry (position + height
// bucket) all flow from the same `settings` object the broadcaster
// transmits, so all three surfaces stay perfectly in sync.
function DisplayStage({
  slide,
  themeKey,
  settings,
  isLive,
}: {
  slide: Slide
  themeKey?: string
  settings: ReturnType<typeof useAppStore.getState>['settings']
  isLive?: boolean
}) {
  const dm = settings.displayMode || 'full'
  const isLT = dm === 'lower-third' || dm === 'lower-third-black'
  if (!isLT) {
    return (
      <SlideThumb
        slide={slide}
        themeKey={themeKey || settings.congregationScreenTheme}
        size="lg"
        settings={settings}
        isLive={isLive}
      />
    )
  }
  const isBlackBackdrop = dm === 'lower-third-black'
  const ltPos = settings.lowerThirdPosition === 'top' ? 'top' : 'bottom'
  const ltHeightMap = { sm: 22, md: 33, lg: 45 } as const
  const ltHeightPct =
    ltHeightMap[settings.lowerThirdHeight as keyof typeof ltHeightMap] ?? 33
  const refLine =
    settings.showReferenceOnOutput !== false && slide.title
      ? `${slide.title}${slide.subtitle ? ' — ' + slide.subtitle : ''}`
      : ''
  const bodyLines: string[] =
    slide.type === 'title'
      ? [slide.title || '', slide.subtitle || ''].filter(Boolean)
      : slide.content && slide.content.length
        ? [slide.content.join(' ').replace(/\s+/g, ' ').trim()]
        : slide.title
          ? [slide.title]
          : []
  const FS_MULT = { sm: 0.85, md: 1, lg: 1.25, xl: 1.5 } as const
  const rawScale = typeof settings.textScale === 'number' ? settings.textScale : 1
  const scale =
    Math.min(2, Math.max(0.5, rawScale)) *
    (FS_MULT[settings.fontSize as keyof typeof FS_MULT] || 1)
  const fontStack = getFontStack(settings.fontFamily)
  const wantsShadow = settings.textShadow !== false
  const shadowCss = wantsShadow ? '0 2px 12px rgba(0,0,0,0.4)' : 'none'
  const ta = settings.textAlign ?? 'center'
  const totalChars = bodyLines.join(' ').length
  const bandRaw =
    totalChars > 320 ? 5 : totalChars > 180 ? 7 : totalChars > 90 ? 9 : 11
  const band = bandRaw * scale
  const bodyMin = Math.max(7, 9 * scale)
  const bodyMax = Math.max(14, 30 * scale)
  const refMin = Math.max(6, 7 * scale)
  const refMax = Math.max(11, 20 * scale)
  return (
    <div className="relative w-full aspect-video bg-black overflow-hidden ring-1 ring-zinc-800">
      {!isBlackBackdrop && settings.customBackground && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={settings.customBackground}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-40"
        />
      )}
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
          className="w-full h-full max-w-[68rem] mx-auto rounded-md flex flex-col justify-center text-white"
          style={{
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.1)',
            padding: '3% 5%',
            gap: '1cqh',
            overflow: 'hidden',
            fontFamily: fontStack,
            textAlign: ta,
            alignItems:
              ta === 'left' ? 'flex-start' : ta === 'right' ? 'flex-end' : 'center',
          }}
        >
          {refLine && (
            <div
              className="opacity-70 font-medium leading-tight"
              style={{
                fontSize: `clamp(${refMin}px, min(${2 * scale}cqw, ${4 * scale}cqh), ${refMax}px)`,
                textShadow: shadowCss,
              }}
            >
              {refLine}
            </div>
          )}
          {bodyLines.map((line, i) => (
            <div
              key={i}
              className="font-semibold leading-snug w-full"
              style={{
                fontSize: `clamp(${bodyMin}px, min(${band * 0.55}cqw, ${band}cqh), ${bodyMax}px)`,
                textShadow: shadowCss,
              }}
            >
              {line}
            </div>
          ))}
        </div>
      </div>
      <div className="absolute top-1 left-1 z-10">
        <Badge className="text-[8px] px-1 py-0 font-bold uppercase tracking-wider border-0 bg-sky-600 text-white">
          {isBlackBackdrop ? 'L/3 · Black · ' : 'Lower Third · '}
          {ltPos}
        </Badge>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// PREVIEW
// ──────────────────────────────────────────────────────────────────────
function PreviewCard() {
  const {
    slides,
    previewSlideIndex,
    liveSlideIndex,
    selectedTranslation,
    settings,
    setSlides,
    setPreviewSlideIndex,
    setLiveSlideIndex,
    setIsLive,
    previewAudio,
    setPreviewAudio,
  } = useAppStore()
  const previewVideoPlaying = useAppStore((s) => s.previewVideoPlaying)
  const previewSlide = slides[previewSlideIndex] || null
  const [navigating, setNavigating] = useState(false)
  // Transport bar was removed from Preview — see comment near the
  // bottom of this card. Playback for the live video is now driven
  // exclusively from the Live Display column.

  // ── Chapter navigation: parse the live preview slide's reference
  // (e.g. "John 6:6", "John 6:6-9", "John 6"), step to the adjacent
  // chapter using the Bible book index, fetch it, replace the live deck,
  // and engage Live mode. Used by both the ◀ and ▶ buttons in the
  // preview pane header so the operator can step through the Bible
  // chapter-by-chapter from the secondary screen straight from here.
  const goChapter = useCallback(async (direction: 'prev' | 'next') => {
    if (navigating) return
    if (!previewSlide || !previewSlide.title) {
      toast.info('Look up a passage first, then use these arrows to step chapters')
      return
    }
    const parsed = parseVerseReference(previewSlide.title)
    if (!parsed) {
      toast.info('No Bible reference in the current slide')
      return
    }
    const target = direction === 'next'
      ? getNextChapter(parsed.book, parsed.chapter)
      : getPrevChapter(parsed.book, parsed.chapter)
    if (!target) {
      toast.info(direction === 'next' ? 'End of the Bible' : 'Beginning of the Bible')
      return
    }
    setNavigating(true)
    try {
      const ch = await fetchBibleChapter(target.book, target.chapter, selectedTranslation)
      if (!ch || !ch.verses?.length) {
        toast.error(`Could not load ${target.book} ${target.chapter}`)
        return
      }
      const newSlides: Slide[] = ch.verses.map((v) => ({
        id: `slide-${Date.now()}-${v.verse}`,
        type: 'verse',
        title: `${ch.book} ${ch.chapter}:${v.verse}`,
        subtitle: ch.translation,
        content: v.text.split('\n').filter(Boolean),
        background: settings.congregationScreenTheme,
      }))
      setSlides(newSlides)
      setPreviewSlideIndex(0)
      setLiveSlideIndex(0)
      setIsLive(true)
      // Toast suppressed per FRS — output actions stay silent.
    } finally {
      setNavigating(false)
    }
  }, [navigating, previewSlide, selectedTranslation, settings.congregationScreenTheme, setSlides, setPreviewSlideIndex, setLiveSlideIndex, setIsLive])

  return (
    <Card
      title="Preview"
      badge={
        previewSlide ? (
          <span className="text-[10px] text-zinc-500 font-mono">
            {previewSlideIndex + 1} / {slides.length}
          </span>
        ) : null
      }
      actions={
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-zinc-400 hover:text-white"
            onClick={() => void goChapter('prev')}
            disabled={navigating || !previewSlide}
            title="Previous chapter (live)"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-zinc-400 hover:text-white"
            onClick={() => void goChapter('next')}
            disabled={navigating || !previewSlide}
            title="Next chapter (live)"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      }
      bodyClassName="bg-black flex flex-col"
    >
      <div className="flex-1 min-h-0 flex items-stretch p-2 gap-2">
        {/* LEFT audio rail — sits OUTSIDE the preview frame on the
            left edge, exactly like the Wirecast reference. Stack:
            VU meter on top, speaker toggle on the bottom. */}
        <div className="w-7 shrink-0 flex flex-col items-center gap-1.5 py-1">
          <div className="flex-1 min-h-0 w-full flex justify-center">
            <AudioMeter active={previewAudio} playing={previewVideoPlaying} tone="green" surface="preview" />
          </div>
          <button
            type="button"
            onClick={() => setPreviewAudio(!previewAudio)}
            title={previewAudio ? 'Mute preview audio' : 'Monitor preview audio'}
            className={cn(
              'h-6 w-6 rounded-md border flex items-center justify-center transition-colors shrink-0',
              previewAudio
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                : 'bg-black/60 border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500',
            )}
          >
            {previewAudio ? (
              <Volume2 className="h-3 w-3" />
            ) : (
              <VolumeX className="h-3 w-3" />
            )}
          </button>
        </div>
        <div className="flex-1 min-w-0 flex items-center justify-center">
          {previewSlide ? (
            <div className="w-full max-w-full">
              {/* The Preview pane mirrors the Live pane's display-mode
                  composite so flipping Settings → Display Mode between
                  Full Screen and Lower Third reflects on Preview
                  immediately — not just after a slide is sent live.
                  Operators kept asking "did it apply?" when they could
                  see it on the secondary screen but not in the
                  staging pane next to it. */}
              <DisplayStage
                slide={previewSlide}
                themeKey={previewSlide.background || settings.congregationScreenTheme}
                settings={settings}
              />
            </div>
          ) : (
            <div className="text-center text-[11px] text-zinc-600">
              <BookOpen className="h-8 w-8 mx-auto opacity-30 mb-2" />
              Nothing in preview yet
            </div>
          )}
        </div>
      </div>
      {/* Preview transport — Play / Pause + scrubbable seek bar. Only
          rendered for media-video preview slides; controls the actual
          <video data-surface="preview"> element so scrubs apply
          immediately. Live Display has its own dedicated Pause row
          below its body. */}
      {previewSlide?.type === 'media' && previewSlide?.mediaKind === 'video' && (
        <VideoTransport surface="preview" />
      )}
    </Card>
  )
}

// ──────────────────────────────────────────────────────────────────────
// VIDEO TRANSPORT (shared — Preview + Live)
// ──────────────────────────────────────────────────────────────────────
// Renders Play/Pause + a scrubbable seek bar bound to the actual
// <video data-surface={surface}> element on the named surface. Polls
// playback state on a rAF loop so the seek bar stays in sync with the
// real element without round-tripping through React state on every
// `timeupdate`. Scrubs apply directly to the element via .currentTime
// — no store side-effects — so the operator can scrub the preview
// without disturbing what's already on air.
function VideoTransport({ surface }: { surface: 'preview' | 'live' }) {
  const [duration, setDuration] = useState(0)
  const [current, setCurrent] = useState(0)
  const [paused, setPaused] = useState(true)
  const [scrubbing, setScrubbing] = useState(false)
  const scrubValueRef = useRef(0)

  // Find the live <video> element for this surface and poll its
  // playback state. We re-query on every tick because slides can swap
  // (different mediaUrl → React mounts a new <video>), and we want
  // the controls to follow the freshest element.
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const el = document.querySelector<HTMLVideoElement>(
        `video[data-surface="${surface}"]`,
      )
      if (el) {
        if (Number.isFinite(el.duration)) setDuration(el.duration || 0)
        if (!scrubbing) setCurrent(el.currentTime || 0)
        setPaused(el.paused)
      } else {
        setDuration(0)
        setCurrent(0)
        setPaused(true)
      }
      raf = window.requestAnimationFrame(tick)
    }
    raf = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(raf)
  }, [surface, scrubbing])

  const findVideo = () =>
    document.querySelector<HTMLVideoElement>(`video[data-surface="${surface}"]`)

  const onPlay = () => {
    const el = findVideo()
    if (!el) return
    el.play().catch(() => {})
  }
  const onPause = () => {
    const el = findVideo()
    if (!el) return
    el.pause()
  }
  const onScrubInput = (v: number) => {
    scrubValueRef.current = v
    setCurrent(v)
  }
  const onScrubCommit = () => {
    const el = findVideo()
    if (el && Number.isFinite(scrubValueRef.current)) {
      el.currentTime = scrubValueRef.current
      // Push the scrubbed timestamp into the master clock so the
      // other surfaces (Live / congregation) seek to match — this is
      // what makes scrubbing while paused stay in sync everywhere.
      try { useAppStore.getState().setMediaCurrentTime(scrubValueRef.current) } catch { /* ignore */ }
    }
    setScrubbing(false)
  }

  const fmt = (s: number) => {
    if (!Number.isFinite(s) || s < 0) s = 0
    const m = Math.floor(s / 60)
    const ss = Math.floor(s % 60)
    return `${m}:${ss.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex items-center gap-2 border-t border-zinc-800/70 px-2 py-1.5 shrink-0">
      <Button
        size="sm"
        variant="secondary"
        className="h-7 w-7 p-0 shrink-0"
        onClick={paused ? onPlay : onPause}
        title={paused ? 'Play' : 'Pause'}
      >
        {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
      </Button>
      <span className="text-[10px] font-mono text-zinc-400 w-9 text-right tabular-nums">
        {fmt(current)}
      </span>
      <input
        type="range"
        min={0}
        max={Math.max(duration, 0.01)}
        step={0.05}
        value={current}
        onMouseDown={() => setScrubbing(true)}
        onTouchStart={() => setScrubbing(true)}
        onChange={(e) => onScrubInput(Number(e.target.value))}
        onMouseUp={onScrubCommit}
        onTouchEnd={onScrubCommit}
        onBlur={onScrubCommit}
        className="flex-1 h-1.5 accent-sky-500 cursor-pointer"
        title="Scrub"
        disabled={duration <= 0}
      />
      <span className="text-[10px] font-mono text-zinc-500 w-9 tabular-nums">
        {fmt(duration)}
      </span>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// LIVE DISPLAY — bottom-right audio controls
// ──────────────────────────────────────────────────────────────────────
// Compact mic toggle + master-volume popover that lives in the Live
// Display footer. Operators specifically asked for both controls to
// be reachable from the live pane (item #10) so they don't have to
// jump to the Live Transcription card to start/stop the mic or to
// the toolbar to change media volume mid-service.
function LiveBottomAudioControls() {
  const isListening = useAppStore((s) => s.isListening)
  const speechSupported = useAppStore((s) => s.speechSupported)
  const setSpeechCommand = useAppStore((s) => s.setSpeechCommand)
  const globalVolume = useAppStore((s) => s.globalVolume)
  const setGlobalVolume = useAppStore((s) => s.setGlobalVolume)
  const globalMuted = useAppStore((s) => s.globalMuted)
  const setGlobalMuted = useAppStore((s) => s.setGlobalMuted)
  const pct = Math.round(globalVolume * 100)
  const effectivelyMuted = globalMuted || globalVolume === 0

  const toggleMic = () => {
    if (!speechSupported) {
      toast.error('Speech recognition is not supported in this browser')
      return
    }
    setSpeechCommand(isListening ? 'stop' : 'start')
  }

  return (
    <div className="flex items-center gap-1 mr-1">
      <button
        type="button"
        onClick={toggleMic}
        title={isListening ? 'Stop listening for verses' : 'Start listening for verses'}
        className={cn(
          'h-7 px-2 rounded-md border text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1.5 transition-colors',
          isListening
            ? 'bg-rose-500/20 text-rose-300 border-rose-500/50'
            : 'bg-black/40 text-zinc-400 border-zinc-800 hover:text-white hover:border-zinc-600',
        )}
      >
        {isListening ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
        {isListening ? 'Stop' : 'Mic'}
      </button>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            title={`Master volume: ${effectivelyMuted ? 'muted' : pct + '%'}`}
            className={cn(
              'h-7 px-2 rounded-md border text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1.5 transition-colors',
              effectivelyMuted
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                : 'bg-black/40 text-zinc-300 border-zinc-800 hover:text-white hover:border-zinc-600',
            )}
          >
            {effectivelyMuted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
            <span className="tabular-nums">{effectivelyMuted ? 'Muted' : `${pct}%`}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          side="top"
          className="w-[220px] p-3 bg-zinc-950 border-zinc-800"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">
              Master Volume
            </span>
            <button
              onClick={() => setGlobalMuted(!globalMuted)}
              className={cn(
                'inline-flex items-center gap-1 px-1.5 h-5 rounded text-[10px] font-semibold border',
                globalMuted
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700',
              )}
            >
              {globalMuted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
              {globalMuted ? 'Unmute' : 'Mute'}
            </button>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={pct}
            onChange={(e) => {
              const v = Number(e.target.value) / 100
              setGlobalVolume(v)
              if (globalMuted && v > 0) setGlobalMuted(false)
            }}
            className="w-full accent-sky-500"
            aria-label="Master volume"
          />
          <div className="flex justify-between mt-1 text-[9px] text-zinc-500 tabular-nums">
            <span>0</span>
            <span>{pct}%</span>
            <span>100</span>
          </div>
          <p className="mt-2 text-[9px] text-zinc-500 leading-snug">
            Affects every video on Preview, Live and the second display.
          </p>
        </PopoverContent>
      </Popover>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// LIVE DISPLAY
// ──────────────────────────────────────────────────────────────────────
function LiveDisplayCard({
  size,
  setSize,
  hidden,
  setHidden,
  auto,
  setAuto,
  onPrev,
  onSendLive,
  onNext,
  isLive,
  onClearLive,
}: {
  size: number
  setSize: (n: number) => void
  hidden: boolean
  setHidden: (b: boolean) => void
  auto: boolean
  setAuto: (b: boolean) => void
  onPrev: () => void
  onSendLive: () => void
  onNext: () => void
  isLive: boolean
  onClearLive: () => void
}) {
  const {
    slides,
    liveSlideIndex,
    settings,
    hasShownContent,
    liveBroadcastAudio,
    setLiveBroadcastAudio,
    liveMonitorAudio,
    setLiveMonitorAudio,
  } = useAppStore()
  const liveVideoPlaying = useAppStore((s) => s.liveVideoPlaying)
  const mediaPaused = useAppStore((s) => s.mediaPaused)
  const setMediaPaused = useAppStore((s) => s.setMediaPaused)
  const liveSlide = liveSlideIndex >= 0 ? slides[liveSlideIndex] : null
  // Interactive Scale Control state. The slider / drag handle write
  // to `size` (the TARGET); the displayed transform uses `actualSize`,
  // which eases toward the target on every animation frame. That
  // separation is what gives the resize a smooth, broadcast feel
  // instead of the pixel-by-pixel jumpiness of binding the transform
  // directly to pointer movement.
  // Slider value still drives the eased actual scale so the
  // congregation preview animates smoothly when the operator drags
  // the SIZE slider — feels like a continuous broadcast control
  // even though the input is a discrete slider.
  const actualSize = useEasedNumber(size)
  // Show the inline transport row only when the live slide is a
  // video — for everything else there is nothing to play or pause.
  const liveIsMediaVideo =
    liveSlide?.type === 'media' && liveSlide?.mediaKind === 'video'
  // Show the centred WassMedia splash here too — exactly while the
  // operator is on a fresh session and hasn't sent anything yet. This
  // is the operator's mirror of the congregation route's startup
  // splash so both screens stay visually in sync.
  const showStartupLogo = !hasShownContent && !liveSlide

  return (
    <Card
      title="Live Display"
      badge={
        liveSlide ? (
          <Badge className="h-4 px-1.5 text-[9px] uppercase tracking-wider font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/40 animate-pulse">
            ● Live
          </Badge>
        ) : (
          <Badge className="h-4 px-1.5 text-[9px] uppercase tracking-wider font-semibold bg-zinc-800 text-zinc-400 border border-zinc-700">
            Dark
          </Badge>
        )
      }
      actions={
        <div className="flex items-center gap-1">
          <button
            onClick={() => setHidden(!hidden)}
            className={cn(
              'flex items-center gap-1 h-6 px-2 rounded text-[10px] uppercase tracking-wider font-semibold border transition-colors',
              hidden
                ? 'bg-zinc-800 text-zinc-300 border-zinc-700'
                : 'bg-transparent text-zinc-500 border-transparent hover:text-zinc-300',
            )}
            title="Hide live slide on the secondary screen"
          >
            {hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            Hidden
          </button>
          <button
            onClick={() => setAuto(!auto)}
            className={cn(
              'h-6 px-2 rounded text-[10px] uppercase tracking-wider font-semibold border transition-colors',
              auto
                ? 'bg-sky-500/15 text-sky-300 border-sky-500/40'
                : 'bg-transparent text-zinc-500 border-transparent hover:text-zinc-300',
            )}
            title="Auto-advance preview to live as new verses are detected"
          >
            Auto
          </button>
        </div>
      }
      bodyClassName="bg-black"
    >
      <div className="flex-1 min-h-0 flex items-stretch p-2 gap-2 relative">
        <div className="flex-1 min-w-0 flex items-center justify-center relative">
        {/* Startup splash. While the operator hasn't put anything on
            air yet (fresh session) we render a transparent branded
            text mark — pure white "Scripture AI" with the WassMedia
            attribution underneath — so both the operator's Live
            Display and the congregation TV match. Disappears on the
            first cue. Style is intentionally text-only with NO logo
            background, per the Live Display spec. */}
        {showStartupLogo && !hidden && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none bg-transparent text-white">
            <div
              className="font-semibold tracking-tight opacity-40"
              style={{ fontSize: 'clamp(1rem, 5cqi, 3rem)', lineHeight: 1.1 }}
            >
              Scripture AI
            </div>
            <div
              className="mt-2 opacity-30"
              style={{ fontSize: 'clamp(0.55rem, 1.6cqi, 0.95rem)' }}
            >
              Powered By WassMedia (+233246798526)
            </div>
          </div>
        )}
        {/* Always render the themed background, even when no scripture
            is on air. This gives the operator a constant "what the
            congregation will see" preview instead of a black void, and
            matches how Logos / Wirecast keep the background alive
            between slides. We render an empty placeholder slide so
            the SlideThumb still draws the theme (gradient + custom
            background image) underneath.

            When the operator picks a lower-third display mode we
            composite the slide as an overlay bar inside a 16:9 black
            frame so the preview matches what the congregation TV (and
            NDI feed) will actually show — same position, same size,
            same styling — and updates in real time as the operator
            tweaks lower-third position / height in Settings. */}
        {!hidden && (() => {
          const dm = settings.displayMode || 'full'
          const isLT = dm === 'lower-third' || dm === 'lower-third-black'
          const ltPos = settings.lowerThirdPosition === 'top' ? 'top' : 'bottom'
          // lowerThirdHeight is an enum ('sm' | 'md' | 'lg') in the
          // store — map it to the same percentage values the
          // congregation renderer uses so the preview, the secondary
          // screen and the NDI feed show identical bar heights.
          const ltHeightMap = { sm: 22, md: 33, lg: 45 } as const
          const ltHeightPct = ltHeightMap[settings.lowerThirdHeight] ?? 33
          const isBlackBackdrop = dm === 'lower-third-black'
          const slide =
            liveSlide ?? {
              id: 'lv-bg',
              type: 'blank' as const,
              title: '',
              subtitle: '',
              content: [],
              background: settings.congregationScreenTheme,
            }
          if (!isLT) {
            return (
              <div
                className="relative w-full max-w-full"
                style={{
                  transform: `scale(${actualSize})`,
                  transformOrigin: 'center',
                  willChange: 'transform',
                }}
              >
                <SlideThumb
                  slide={slide}
                  themeKey={liveSlide?.background || settings.congregationScreenTheme}
                  isLive={!!liveSlide}
                  size="lg"
                  settings={settings}
                />
              </div>
            )
          }
          // Build the verse reference + body the same way the
          // congregation renderer does so the preview matches the
          // secondary screen and NDI feed exactly.
          const refLine =
            settings.showReferenceOnOutput !== false && slide.title
              ? `${slide.title}${slide.subtitle ? ' — ' + slide.subtitle : ''}`
              : ''
          // Render verse / lyric content as a single paragraph so all
          // words sit on the same baseline. Title slides keep title +
          // subtitle as two distinct lines because they're a real
          // hierarchy, not a wrapped paragraph.
          const bodyLines: string[] =
            slide.type === 'title'
              ? [slide.title || '', slide.subtitle || ''].filter(Boolean)
              : slide.content && slide.content.length
                ? [slide.content.join(' ').replace(/\s+/g, ' ').trim()]
                : slide.title
                  ? [slide.title]
                  : []
          return (
            <div
              className="relative w-full max-w-full"
              style={{
                transform: `scale(${actualSize})`,
                transformOrigin: 'center',
                willChange: 'transform',
              }}
            >
              <div className="relative w-full aspect-video bg-black overflow-hidden ring-1 ring-zinc-800">
                {/* lower-third uses the themed/custom background as
                    backdrop; lower-third-black uses pure black so the
                    bar reads like a broadcast caption (matches the
                    congregation renderer). */}
                {!isBlackBackdrop && settings.customBackground && (
                  <img
                    src={settings.customBackground}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover opacity-40"
                  />
                )}
                {/* The bar itself. Using safe-area padding (≈6% horiz)
                    and a translucent dark panel exactly like the .lt-box
                    in the congregation route. Font sizes use container
                    query units (cqw) so text scales with the preview
                    width and never overflows on small operator panes
                    or huge external displays. */}
                {/* Bar wrapper. Lift the bar 6% off the chosen edge
                    so it doesn't hug the bezel (operators reported the
                    previous build sat too low on TVs). Container query
                    on the bar wrapper itself so cqw/cqh scale to the
                    bar — not the whole stage — keeping text inside the
                    panel on every output size. */}
                {(() => {
                  // Mirror the congregation route's typography pipeline so
                  // the operator's Lower-Third PREVIEW honours every
                  // Settings → Typography control (font family, font size
                  // bucket, text scale, text shadow, alignment) — not just
                  // alignment as it used to. Without this the preview
                  // looked completely different from the secondary screen
                  // / NDI feed even though the bar geometry matched.
                  const FS_MULT = { sm: 0.85, md: 1, lg: 1.25, xl: 1.5 } as const
                  const rawScale = typeof settings.textScale === 'number' ? settings.textScale : 1
                  const scale =
                    Math.min(2, Math.max(0.5, rawScale)) *
                    (FS_MULT[settings.fontSize as keyof typeof FS_MULT] || 1)
                  const fontStack = getFontStack(settings.fontFamily)
                  const wantsShadow = settings.textShadow !== false
                  const shadowCss = wantsShadow ? '0 2px 12px rgba(0,0,0,0.4)' : 'none'
                  const ta = settings.textAlign ?? 'center'
                  const totalChars = bodyLines.join(' ').length
                  const bandRaw =
                    totalChars > 320 ? 5 : totalChars > 180 ? 7 : totalChars > 90 ? 9 : 11
                  const band = bandRaw * scale
                  const bodyMin = Math.max(7, 9 * scale)
                  const bodyMax = Math.max(14, 30 * scale)
                  const refMin = Math.max(6, 7 * scale)
                  const refMax = Math.max(11, 20 * scale)
                  return (
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
                        className="w-full h-full max-w-[68rem] mx-auto rounded-md flex flex-col justify-center text-white"
                        style={{
                          background: 'rgba(0,0,0,0.85)',
                          backdropFilter: 'blur(8px)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          padding: '3% 5%',
                          gap: '1cqh',
                          overflow: 'hidden',
                          fontFamily: fontStack,
                          textAlign: ta,
                          alignItems:
                            ta === 'left' ? 'flex-start' : ta === 'right' ? 'flex-end' : 'center',
                        }}
                      >
                        {refLine && (
                          <div
                            className="opacity-70 font-medium leading-tight"
                            style={{
                              fontSize: `clamp(${refMin}px, min(${2 * scale}cqw, ${4 * scale}cqh), ${refMax}px)`,
                              textShadow: shadowCss,
                            }}
                          >
                            {refLine}
                          </div>
                        )}
                        {bodyLines.map((line, i) => (
                          <div
                            key={i}
                            className="font-semibold leading-snug w-full"
                            style={{
                              fontSize: `clamp(${bodyMin}px, min(${band * 0.55}cqw, ${band}cqh), ${bodyMax}px)`,
                              textShadow: shadowCss,
                            }}
                          >
                            {line}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}
                <div className="absolute top-1 left-1 z-10">
                  <Badge className="text-[8px] px-1 py-0 font-bold uppercase tracking-wider border-0 bg-sky-600 text-white">
                    {isBlackBackdrop ? 'L/3 · Black · ' : 'Lower Third · '}
                    {ltPos}
                  </Badge>
                </div>
              </div>
            </div>
          )
        })()}
        {hidden && (
          <div className="text-center text-[11px] text-zinc-600">
            <CircleSlash className="h-8 w-8 mx-auto opacity-30 mb-2" />
            Output is hidden
          </div>
        )}
        </div>
        {/* RIGHT audio rail — sits OUTSIDE the live frame on the
            right edge, exactly like the Wirecast reference. Stack:
            VU meter on top, then the broadcast speaker, then the
            operator headphone toggle. The meter tone follows whichever
            of the two toggles is currently driving audio. */}
        <div className="w-7 shrink-0 flex flex-col items-center gap-1.5 py-1">
          <div className="flex-1 min-h-0 w-full flex justify-center">
            <AudioMeter
              active={liveBroadcastAudio || liveMonitorAudio}
              playing={liveVideoPlaying}
              tone={liveBroadcastAudio ? 'red' : liveMonitorAudio ? 'amber' : 'green'}
              surface="live"
            />
          </div>
          <button
            type="button"
            onClick={() => setLiveBroadcastAudio(!liveBroadcastAudio)}
            title={
              liveBroadcastAudio
                ? 'Mute broadcast audio'
                : 'Send audio to broadcast'
            }
            className={cn(
              'h-6 w-6 rounded-md border flex items-center justify-center transition-colors shrink-0',
              liveBroadcastAudio
                ? 'bg-rose-500/20 border-rose-500/50 text-rose-300'
                : 'bg-black/60 border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500',
            )}
          >
            {liveBroadcastAudio ? (
              <Volume2 className="h-3 w-3" />
            ) : (
              <VolumeX className="h-3 w-3" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setLiveMonitorAudio(!liveMonitorAudio)}
            title={
              liveMonitorAudio
                ? 'Stop monitoring live audio'
                : 'Monitor live audio in your headphones'
            }
            className={cn(
              'h-6 w-6 rounded-md border flex items-center justify-center transition-colors relative shrink-0',
              liveMonitorAudio
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                : 'bg-black/60 border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500',
            )}
          >
            <Headphones className="h-3 w-3" />
            {!liveMonitorAudio && (
              <span className="absolute inset-x-1 h-px bg-current rotate-45" />
            )}
          </button>
        </div>
      </div>

      <div className="border-t border-zinc-800/60 px-3 py-2 flex items-center justify-end gap-3 bg-zinc-900/30 shrink-0">
        {/* Mic toggle + master-volume control. Operators asked for
            these to live at the right-bottom of the Live Display so
            they're reachable without leaving the live pane. The mic
            button drives the same `setSpeechCommand` action the Live
            Transcription card uses; the volume popover wraps the
            global master volume the slide renderer already honours. */}
        <LiveBottomAudioControls />
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onPrev} className="h-7 w-7 text-zinc-300 hover:text-white border border-zinc-800">
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          {/* GO LIVE / STOP LIVE — toggle. While LIVE the button
              flips to a muted "Stop Live" with a Square icon so the
              operator can kill the live feed from the same spot they
              started it. */}
          <Button
            onClick={isLive ? onClearLive : onSendLive}
            title={isLive ? 'Stop the live output' : 'Send this slide to the live output'}
            className={cn(
              'h-7 px-3 text-[10px] uppercase tracking-wider font-semibold text-white gap-1.5 transition-colors',
              isLive
                ? 'bg-zinc-700 hover:bg-zinc-600 border border-rose-500/60'
                : 'bg-rose-600 hover:bg-rose-700',
            )}
          >
            {isLive ? <Square className="h-3 w-3 fill-white" /> : <Send className="h-3 w-3" />}
            {isLive ? 'Stop Live' : 'Go Live'}
          </Button>
          <Button variant="ghost" size="icon" onClick={onNext} className="h-7 w-7 text-zinc-300 hover:text-white border border-zinc-800">
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {/* Live transport row — Pause/Play for the currently-on-air
          video. Lives BELOW the Live Display body so the operator
          interrupts the live feed from the same column they sent it
          from. Hidden for non-video slides. */}
      {liveIsMediaVideo && (
        <div className="flex items-center justify-center gap-2 border-t border-zinc-800/70 px-2 py-1.5 shrink-0">
          {mediaPaused ? (
            <Button
              size="sm"
              variant="secondary"
              className="h-7 px-3 gap-1.5"
              onClick={() => setMediaPaused(false)}
              title="Resume live video"
            >
              <Play className="h-3.5 w-3.5" />
              <span className="text-[10px] uppercase tracking-wider font-semibold">Play</span>
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              className="h-7 px-3 gap-1.5"
              onClick={() => setMediaPaused(true)}
              title="Pause live video"
            >
              <Pause className="h-3.5 w-3.5" />
              <span className="text-[10px] uppercase tracking-wider font-semibold">Pause</span>
            </Button>
          )}
        </div>
      )}
    </Card>
  )
}

// ──────────────────────────────────────────────────────────────────────
// SCRIPTURE FEED  (HISTORY  |  QUEUE)
// ──────────────────────────────────────────────────────────────────────
function ScriptureFeedCard() {
  const [tab, setTab] = useState<'history' | 'queue'>('history')
  const {
    verseHistory,
    schedule,
    selectedScheduleItemId,
    selectScheduleItem,
    removeScheduleItem,
    setSlides,
    setPreviewSlideIndex,
    setLiveSlideIndex,
    setIsLive,
    settings,
    addScheduleItem,
  } = useAppStore()

  // Build the slide for a history verse and load it into the deck.
  // `live=false` → only the preview cursor moves (operator stages).
  // `live=true`  → also flips the live cursor + Live mode (on air).
  // The verse is also recorded in the schedule for later recall, so
  // we don't lose history just because the operator clicked through
  // it from the History pane.
  const sendVerseFromHistory = (v: typeof verseHistory[number], live: boolean) => {
    const slide: Slide = {
      id: `slide-${Date.now()}`,
      type: 'verse',
      title: v.reference,
      subtitle: v.translation,
      content: (v.text || '').split('\n').filter(Boolean),
      background: settings.congregationScreenTheme,
    }
    addScheduleItem({
      type: 'verse',
      title: v.reference,
      subtitle: v.translation,
      slides: [slide],
    })
    setSlides([slide])
    setPreviewSlideIndex(0)
    if (live) {
      setLiveSlideIndex(0)
      setIsLive(true)
    }
  }

  return (
    <Card
      title="Scripture Feed"
      actions={
        <div className="flex items-center gap-1">
          <Tab active={tab === 'history'} onClick={() => setTab('history')} icon={History} label="History" />
          <Tab active={tab === 'queue'} onClick={() => setTab('queue')} icon={ListOrdered} label="Queue" />
        </div>
      }
    >
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-2 space-y-1.5">
          {tab === 'history' ? (
            verseHistory.length === 0 ? (
              <div className="text-center py-6 text-[11px] text-zinc-600">
                <History className="h-7 w-7 mx-auto opacity-40 mb-2" />
                Verses you look up or detect will show here.
              </div>
            ) : (
              verseHistory.map((v, i) => (
                <button
                  key={`${v.reference}-${i}`}
                  onClick={() => sendVerseFromHistory(v, false)}
                  onDoubleClick={() => sendVerseFromHistory(v, true)}
                  className="w-full text-left rounded border border-zinc-800/70 bg-zinc-900/40 hover:border-sky-500/40 hover:bg-zinc-900 px-2 py-1.5 transition-colors group select-none"
                  title="Click → Preview · Double-click → Go Live"
                >
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-[10px] font-semibold text-sky-300 truncate">{v.reference}</span>
                    <span className="text-[9px] text-zinc-500 uppercase">{v.translation}</span>
                  </div>
                  <p className="text-[11px] text-zinc-300 line-clamp-2 leading-snug">{v.text}</p>
                </button>
              ))
            )
          ) : schedule.length === 0 ? (
            <div className="text-center py-6 text-[11px] text-zinc-600">
              <ListOrdered className="h-7 w-7 mx-auto opacity-40 mb-2" />
              Your service schedule is empty.
            </div>
          ) : (
            schedule.map((item, i) => {
              const selected = item.id === selectedScheduleItemId
              return (
                <div
                  key={item.id}
                  className={cn(
                    'rounded border px-2 py-1.5 transition-colors flex items-center gap-2',
                    selected
                      ? 'border-amber-500/60 bg-amber-500/10'
                      : 'border-zinc-800/70 bg-zinc-900/40 hover:border-zinc-700',
                  )}
                >
                  <button
                    onClick={() => selectScheduleItem(item.id)}
                    onDoubleClick={() => {
                      selectScheduleItem(item.id)
                      if (item.slides.length) {
                        setSlides(item.slides)
                        setPreviewSlideIndex(0)
                        setLiveSlideIndex(0)
                        setIsLive(true)
                        /* Toast suppressed per FRS — output actions stay silent. */
                      }
                    }}
                    className="flex-1 min-w-0 text-left"
                    title="Click to select · Double-click to send live"
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span
                        className={cn(
                          'inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-bold',
                          selected ? 'bg-amber-500 text-black' : 'bg-zinc-800 text-zinc-400',
                        )}
                      >
                        {i + 1}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-zinc-500">{item.type}</span>
                    </div>
                    <p className={cn('text-[11px] truncate', selected ? 'text-white font-semibold' : 'text-zinc-200')}>
                      {item.title}
                    </p>
                  </button>
                  <button
                    onClick={() => removeScheduleItem(item.id)}
                    className="text-zinc-600 hover:text-rose-400 p-1"
                    title="Remove"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )
            })
          )}
        </div>
      </div>
    </Card>
  )
}

// ──────────────────────────────────────────────────────────────────────
// CHAPTER NAVIGATOR — wraps existing BibleLookupCompact
// ──────────────────────────────────────────────────────────────────────
function ChapterNavigatorCard() {
  return (
    <Card
      title="Chapter Navigator"
      actions={
        <div className="flex items-center gap-1">
          <span className="text-[9px] uppercase tracking-widest text-zinc-500">Reference</span>
        </div>
      }
      bodyClassName="overflow-hidden"
    >
      {/* The existing compact component already supplies chapter / verse browsing,
          search, translation picker, and click-to-schedule / dbl-click-to-live. */}
      <BibleLookupCompact />
    </Card>
  )
}

// ──────────────────────────────────────────────────────────────────────
// DETECTED VERSES
// ──────────────────────────────────────────────────────────────────────
function DetectedVersesCard() {
  const {
    detectedVerses,
    clearDetectedVerses,
    addScheduleItem,
    setSlides,
    setPreviewSlideIndex,
    setLiveSlideIndex,
    setIsLive,
    settings,
    requestNavigatorRef,
  } = useAppStore()

  // Long detected verses (whole passages, paraphrases, multi-verse
  // ranges) used to be rammed onto a single slide and shrank to
  // illegibility in the Preview / Live frames. Split anything past
  // ~180 chars at sentence boundaries, and never put more than two
  // sentences on a single slide. Each chunk becomes its own slide so
  // the operator can ◀ ▶ through the passage and every line is
  // readable on the secondary screen.
  const splitForSlides = (text: string): string[][] => {
    const cleaned = (text || '').replace(/\s+/g, ' ').trim()
    if (!cleaned) return [[]]
    if (cleaned.length <= 180) return [[cleaned]]
    const sentences = cleaned.match(/[^.!?]+[.!?]+["']?|\S[^.!?]*$/g) || [cleaned]
    const chunks: string[][] = []
    let buf = ''
    for (const s of sentences) {
      const candidate = buf ? buf + ' ' + s.trim() : s.trim()
      if (candidate.length > 220 && buf) {
        chunks.push([buf])
        buf = s.trim()
      } else {
        buf = candidate
      }
    }
    if (buf) chunks.push([buf])
    return chunks.length ? chunks : [[cleaned]]
  }

  const sendDetected = (v: typeof detectedVerses[number], live: boolean) => {
    const groups = splitForSlides(v.text || '')
    const slides = groups.map((content, idx) => ({
      id: `slide-${Date.now()}-${idx}`,
      type: 'verse' as const,
      title: v.reference + (groups.length > 1 ? ` (${idx + 1}/${groups.length})` : ''),
      subtitle: v.translation,
      content,
      background: settings.congregationScreenTheme,
    }))
    addScheduleItem({
      type: 'verse',
      title: v.reference,
      subtitle: v.translation,
      slides,
    })
    if (live) {
      setSlides(slides)
      setPreviewSlideIndex(0)
      setLiveSlideIndex(0)
      setIsLive(true)
      // Toast suppressed per FRS — output actions stay silent.
    }
  }

  return (
    <Card
      title="Detected Verses"
      badge={
        detectedVerses.length > 0 ? (
          <Badge className="h-4 px-1.5 text-[9px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/40">
            {detectedVerses.length}
          </Badge>
        ) : null
      }
      actions={
        detectedVerses.length > 0 ? (
          <button
            onClick={clearDetectedVerses}
            className="text-[10px] text-zinc-500 hover:text-zinc-300 uppercase tracking-wider"
          >
            Clear
          </button>
        ) : null
      }
    >
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-2 space-y-1.5">
          {detectedVerses.length === 0 ? (
            <div className="text-center py-8 text-[11px] text-zinc-600">
              <Mic className="h-7 w-7 mx-auto opacity-40 mb-2" />
              When the speaker quotes a passage we&apos;ll list it here. Start
              the live transcription on the left to begin.
            </div>
          ) : (
            detectedVerses.map((v, i) => {
              // Accuracy bar — width and color reflect detection
              // confidence. Green w/ glow ≥90% (auto-live eligible),
              // yellow 50–89%, red 20–49%, dim otherwise. Smooth
              // transitions on width and color so the bar visibly
              // "fills in" as the speech engine refines its parse.
              const pct = Math.round((v.confidence || 0) * 100)
              const tier =
                v.confidence >= 0.9
                  ? 'green'
                  : v.confidence >= 0.5
                    ? 'yellow'
                    : v.confidence >= 0.2
                      ? 'red'
                      : 'dim'
              const barColor =
                tier === 'green'
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.85)]'
                  : tier === 'yellow'
                    ? 'bg-yellow-400'
                    : tier === 'red'
                      ? 'bg-rose-500'
                      : 'bg-zinc-600'
              const labelColor =
                tier === 'green'
                  ? 'text-emerald-300'
                  : tier === 'yellow'
                    ? 'text-yellow-300'
                    : tier === 'red'
                      ? 'text-rose-300'
                      : 'text-zinc-500'
              return (
                <div
                  key={`${v.reference}-${i}`}
                  onClick={() => {
                    // v0.5.4 T005 — In addition to staging the slide in
                    // Preview, push the reference to the Chapter
                    // Navigator so the operator can read surrounding
                    // context without retyping the reference. Double-
                    // click still pushes the verse to Live.
                    sendDetected(v, false)
                    requestNavigatorRef(v.reference)
                  }}
                  onDoubleClick={() => sendDetected(v, true)}
                  className="rounded border border-zinc-800/70 bg-zinc-900/40 hover:border-emerald-500/40 hover:bg-zinc-900 px-2 py-1.5 cursor-pointer transition-colors select-none"
                  title={`Click → schedule + open in Chapter Navigator · Double-click → live · Detection accuracy: ${pct}%`}
                >
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-[10px] font-semibold text-emerald-300">
                      {v.reference}
                    </span>
                    <span className="text-[9px] text-zinc-500 uppercase">{v.translation}</span>
                  </div>
                  <p className="text-[11px] text-zinc-300 line-clamp-2 leading-snug">{v.text}</p>
                  {/* Accuracy bar */}
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <div className="flex-1 h-1 rounded-full bg-zinc-800/80 overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all duration-500 ease-out', barColor)}
                        style={{ width: `${Math.max(4, pct)}%` }}
                      />
                    </div>
                    <span className={cn('text-[9px] font-mono tabular-nums w-7 text-right transition-colors', labelColor)}>
                      {pct}%
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </Card>
  )
}

// ──────────────────────────────────────────────────────────────────────
// MEDIA — upload images / videos and push them straight to live
// ──────────────────────────────────────────────────────────────────────
interface MediaItem {
  id: string
  name: string
  url: string // data: URL so it travels through the SSE broadcast intact
  kind: 'image' | 'video'
  size?: number
}

type MediaFit = NonNullable<Slide['mediaFit']>

// Media library view-mode catalogue. Order + labels mirror the
// Windows Explorer "View" menu in the screenshot the user attached;
// each mode pairs with a render branch in <MediaItemsView/>.
type MediaViewModeId =
  | 'large'
  | 'medium'
  | 'small'
  | 'list'
  | 'details'
  | 'tiles'

const MEDIA_VIEW_MODES: ReadonlyArray<{
  id: MediaViewModeId
  label: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any
}> = [
  { id: 'large', label: 'Large Icons', icon: LayoutGrid },
  { id: 'medium', label: 'Medium Icons', icon: Grid3x3 },
  { id: 'small', label: 'Small Icons', icon: Grid3x3 },
  { id: 'list', label: 'List', icon: ListIcon },
  { id: 'details', label: 'Details', icon: AlignJustify },
  { id: 'tiles', label: 'Tiles', icon: Rows3 },
]

// Format a byte count for the Details / Tiles views. Best-effort —
// we don't track real file sizes per upload, so the renderer falls
// back to "—" if the value isn't known.
function formatSize(n?: number): string {
  if (!n || n <= 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function MediaItemsView({
  items,
  mode,
  selectedId,
  stagedItemId,
  onItemClick,
  onRemove,
}: {
  items: MediaItem[]
  mode: MediaViewModeId
  selectedId: string | null
  stagedItemId: string | null
  onItemClick: (m: MediaItem) => void
  onRemove: (id: string) => void
}) {
  // ── Thumb grid (Large / Medium / Small Icons) ────────────────────
  // The three icon modes share one render branch and just swap the
  // grid column count + thumbnail aspect / label visibility, exactly
  // like Windows Explorer.
  if (mode === 'large' || mode === 'medium' || mode === 'small') {
    const cols =
      mode === 'large' ? 'grid-cols-1' : mode === 'medium' ? 'grid-cols-2' : 'grid-cols-3'
    const labelSize = mode === 'small' ? 'text-[8px]' : 'text-[9px]'
    return (
      <div className={cn('grid gap-1.5', cols)}>
        {items.map((m) => {
          const active = m.id === selectedId
          const staged = m.id === stagedItemId
          return (
            <div
              key={m.id}
              onClick={() => onItemClick(m)}
              className={cn(
                'group relative rounded border bg-zinc-950 overflow-hidden cursor-pointer transition-colors',
                active
                  ? 'border-fuchsia-500/60 ring-1 ring-fuchsia-500/40'
                  : 'border-zinc-800 hover:border-zinc-700',
              )}
              title={
                staged
                  ? 'Click again to send to live'
                  : 'Click to replace preview with this media'
              }
            >
              <div className="aspect-video bg-black flex items-center justify-center">
                {m.kind === 'video' ? (
                  <video
                    src={m.url}
                    muted
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.url}
                    alt={m.name}
                    className="w-full h-full object-contain"
                  />
                )}
              </div>
              <div className="absolute inset-x-0 bottom-0 px-1.5 py-1 bg-gradient-to-t from-black/80 to-transparent flex items-center gap-1">
                {m.kind === 'video' ? (
                  <Film className="h-2.5 w-2.5 text-fuchsia-300 shrink-0" />
                ) : (
                  <ImageIcon className="h-2.5 w-2.5 text-fuchsia-300 shrink-0" />
                )}
                <span className={cn('text-zinc-200 truncate', labelSize)}>
                  {m.name}
                </span>
              </div>
              {staged && (
                <div className="absolute top-1 left-1 text-[8px] uppercase tracking-wider font-bold px-1 py-0.5 rounded bg-amber-500/80 text-black">
                  In Preview
                </div>
              )}
              <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-5 w-5 p-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemove(m.id)
                  }}
                  title="Remove"
                >
                  <Trash2 className="h-2.5 w-2.5" />
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ── Tiles ────────────────────────────────────────────────────────
  // Mid-density mode: a square thumb on the left and a two-line
  // label/kind block to the right. Useful when names are long.
  if (mode === 'tiles') {
    return (
      <div className="flex flex-col gap-1">
        {items.map((m) => {
          const active = m.id === selectedId
          const staged = m.id === stagedItemId
          return (
            <div
              key={m.id}
              onClick={() => onItemClick(m)}
              className={cn(
                'group relative flex items-center gap-2 rounded border bg-zinc-950 overflow-hidden cursor-pointer transition-colors p-1.5',
                active
                  ? 'border-fuchsia-500/60 ring-1 ring-fuchsia-500/40'
                  : 'border-zinc-800 hover:border-zinc-700',
              )}
            >
              <div className="w-12 h-12 shrink-0 bg-black flex items-center justify-center rounded overflow-hidden">
                {m.kind === 'video' ? (
                  <video
                    src={m.url}
                    muted
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.url}
                    alt={m.name}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-zinc-200 truncate font-medium">
                  {m.name}
                </div>
                <div className="text-[9px] text-zinc-500 flex items-center gap-1">
                  {m.kind === 'video' ? (
                    <Film className="h-2.5 w-2.5 text-fuchsia-300" />
                  ) : (
                    <ImageIcon className="h-2.5 w-2.5 text-fuchsia-300" />
                  )}
                  {m.kind === 'video' ? 'Video' : 'Image'}
                  {staged && (
                    <span className="ml-1 px-1 rounded bg-amber-500/80 text-black uppercase tracking-wider font-bold text-[8px]">
                      In Preview
                    </span>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant="destructive"
                className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation()
                  onRemove(m.id)
                }}
                title="Remove"
              >
                <Trash2 className="h-2.5 w-2.5" />
              </Button>
            </div>
          )
        })}
      </div>
    )
  }

  // ── List ─────────────────────────────────────────────────────────
  // Compact one-line-per-item layout, no thumbnails. Mirrors the
  // Explorer "List" mode.
  if (mode === 'list') {
    return (
      <div className="flex flex-col">
        {items.map((m) => {
          const active = m.id === selectedId
          const staged = m.id === stagedItemId
          return (
            <button
              type="button"
              key={m.id}
              onClick={() => onItemClick(m)}
              className={cn(
                'group flex items-center gap-2 px-1.5 py-1 rounded text-left transition-colors',
                active
                  ? 'bg-fuchsia-500/15 text-fuchsia-200'
                  : 'text-zinc-300 hover:bg-zinc-900',
              )}
            >
              {m.kind === 'video' ? (
                <Film className="h-3 w-3 text-fuchsia-300 shrink-0" />
              ) : (
                <ImageIcon className="h-3 w-3 text-fuchsia-300 shrink-0" />
              )}
              <span className="text-[10px] truncate flex-1">{m.name}</span>
              {staged && (
                <span className="text-[8px] uppercase tracking-wider font-bold px-1 rounded bg-amber-500/80 text-black">
                  Preview
                </span>
              )}
              <Trash2
                className="h-3 w-3 text-zinc-500 hover:text-rose-400 opacity-0 group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation()
                  onRemove(m.id)
                }}
              />
            </button>
          )
        })}
      </div>
    )
  }

  // ── Details ──────────────────────────────────────────────────────
  // Table-style layout with Name / Type / Size columns.
  return (
    <div className="text-[10px]">
      <div className="grid grid-cols-[1fr_5rem_4rem_1.25rem] gap-2 px-1.5 py-1 border-b border-zinc-800 text-zinc-500 uppercase tracking-wider text-[9px] font-semibold">
        <span>Name</span>
        <span>Type</span>
        <span>Size</span>
        <span></span>
      </div>
      {items.map((m) => {
        const active = m.id === selectedId
        const staged = m.id === stagedItemId
        return (
          <button
            type="button"
            key={m.id}
            onClick={() => onItemClick(m)}
            className={cn(
              'group w-full grid grid-cols-[1fr_5rem_4rem_1.25rem] gap-2 px-1.5 py-1 items-center text-left transition-colors',
              active
                ? 'bg-fuchsia-500/15 text-fuchsia-200'
                : 'text-zinc-300 hover:bg-zinc-900',
            )}
          >
            <span className="flex items-center gap-1.5 truncate">
              {m.kind === 'video' ? (
                <Film className="h-3 w-3 text-fuchsia-300 shrink-0" />
              ) : (
                <ImageIcon className="h-3 w-3 text-fuchsia-300 shrink-0" />
              )}
              <span className="truncate">{m.name}</span>
              {staged && (
                <span className="text-[8px] uppercase tracking-wider font-bold px-1 rounded bg-amber-500/80 text-black shrink-0">
                  Preview
                </span>
              )}
            </span>
            <span className="text-zinc-400 truncate">
              {m.kind === 'video' ? 'Video' : 'Image'}
            </span>
            <span className="text-zinc-500 truncate">{formatSize(m.size)}</span>
            <Trash2
              className="h-3 w-3 text-zinc-500 hover:text-rose-400 opacity-0 group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation()
                onRemove(m.id)
              }}
            />
          </button>
        )
      })}
    </div>
  )
}

function MediaCard() {
  const [items, setItems] = useState<MediaItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Tracks whether the current preview slide originated from this media
  // panel for the selected item — used to gate the "first click previews,
  // second click goes live" interaction.
  const [stagedItemId, setStagedItemId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadPct, setUploadPct] = useState(0)
  // Per-item display preferences. Lives only on the panel because each
  // upload may want a different fit; we copy the chosen value onto the
  // slide when staging or sending live.
  const [fitById, setFitById] = useState<Record<string, MediaFit>>({})
  const fileRef = useRef<HTMLInputElement>(null)

  const {
    setSlides,
    setLiveSlideIndex,
    setIsLive,
    setPreviewSlideIndex,
    setHasShownContent,
    mediaViewMode,
    setMediaViewMode,
  } = useAppStore()

  const selectedItem = items.find((m) => m.id === selectedId) || null

  const onPick = useCallback(() => fileRef.current?.click(), [])

  // Upload a file to /api/upload as a streamed raw body. Reports
  // progress with XHR so the operator sees a percentage for big videos.
  const uploadOne = useCallback(
    (f: File) =>
      new Promise<MediaItem>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', '/api/upload', true)
        xhr.setRequestHeader('Content-Type', f.type || 'application/octet-stream')
        xhr.setRequestHeader('X-Filename', f.name)
        xhr.setRequestHeader('X-File-Size', String(f.size))
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100))
        }
        xhr.onload = () => {
          try {
            const data = JSON.parse(xhr.responseText || '{}')
            if (xhr.status >= 200 && xhr.status < 300 && data.url) {
              resolve({
                id: `media-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                name: f.name,
                url: data.url,
                kind: data.kind || (f.type.startsWith('video/') ? 'video' : 'image'),
                size: f.size,
              })
            } else {
              reject(new Error(data.error || `Upload failed (${xhr.status})`))
            }
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)))
          }
        }
        xhr.onerror = () => reject(new Error('Network error'))
        xhr.send(f)
      }),
    []
  )

  const onFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || !files.length) return
      const valid = Array.from(files).filter(
        (f) => f.type.startsWith('image/') || f.type.startsWith('video/')
      )
      if (!valid.length) {
        toast.error('Only image and video files are supported')
        return
      }
      // 3 GB cap matches the server-side guard.
      const MAX = 3 * 1024 * 1024 * 1024
      const accepted: File[] = []
      for (const f of valid) {
        if (f.size > MAX) {
          toast.error(`${f.name} is larger than 3 GB`)
          continue
        }
        accepted.push(f)
      }
      if (!accepted.length) return

      setUploading(true)
      const added: MediaItem[] = []
      try {
        for (const f of accepted) {
          setUploadPct(0)
          try {
            const item = await uploadOne(f)
            added.push(item)
          } catch (err) {
            toast.error(
              `${f.name}: ${err instanceof Error ? err.message : 'Upload failed'}`
            )
          }
        }
      } finally {
        setUploading(false)
        setUploadPct(0)
      }
      if (added.length) {
        setItems((prev) => [...added, ...prev])
        setSelectedId(added[0].id)
        setStagedItemId(null)
        // Media-column notifications are intentionally suppressed —
        // the operator already sees the new tile appear in the grid,
        // a toast on top of that just adds noise during a live show.
      }
    },
    [uploadOne]
  )

  // Build a media slide from a library item. Reused by both the
  // "preview" and "send live" flows so they stay perfectly in sync.
  const makeSlide = useCallback(
    (item: MediaItem): Slide => ({
      id: `slide-media-${item.id}-${Date.now()}`,
      type: 'media' as const,
      title: item.name,
      subtitle: '',
      content: [],
      mediaUrl: item.url,
      mediaKind: item.kind,
      mediaFit: fitById[item.id] || 'fit',
    }),
    [fitById]
  )

  // 1st click on an item → wipe the preview and replace it with the
  // selected media (preview-only, not on air). 2nd click on the same
  // item → push that media to the live display + secondary screen.
  const onItemClick = useCallback(
    (item: MediaItem) => {
      setSelectedId(item.id)
      if (stagedItemId !== item.id) {
        // First click: stage it on the preview pane only.
        const slide = makeSlide(item)
        // Drop any prior preview and put just this slide in.
        setSlides([slide])
        setPreviewSlideIndex(0)
        setLiveSlideIndex(-1)
        setIsLive(false)
        setStagedItemId(item.id)
        // Suppress notifications for media-column actions; the
        // amber preview-frame ring already signals the change.
      } else {
        // Second click on the same item: send it live.
        setLiveSlideIndex(0)
        setIsLive(true)
        // Logo splash only shows until the operator first puts
        // something on air; trip the flag so the secondary screen and
        // the operator's Live Display drop the splash from now on.
        setHasShownContent(true)
        // Suppress notifications for media-column actions; the red
        // ON AIR ring on the live frame already signals the cue.
      }
    },
    [
      stagedItemId,
      makeSlide,
      setSlides,
      setPreviewSlideIndex,
      setLiveSlideIndex,
      setIsLive,
      setHasShownContent,
    ]
  )

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((m) => m.id !== id))
    setSelectedId((cur) => (cur === id ? null : cur))
    setStagedItemId((cur) => (cur === id ? null : cur))
    setFitById((prev) => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  // Push a fit/aspect-ratio change for the selected item back through
  // the preview/live state so the operator sees it instantly on every
  // surface (Preview, Live Display, secondary screen, NDI). Re-emits
  // the slide rather than mutating in place so the SSE broadcast
  // notices the change and downstream renderers re-resolve their
  // object-fit / aspect-ratio.
  const updateFit = useCallback(
    (item: MediaItem, fit: MediaFit) => {
      setFitById((prev) => ({ ...prev, [item.id]: fit }))
      const refreshed: Slide = {
        id: `slide-media-${item.id}-${Date.now()}`,
        type: 'media',
        title: item.name,
        subtitle: '',
        content: [],
        mediaUrl: item.url,
        mediaKind: item.kind,
        mediaFit: fit,
      }
      // Only nudge the preview/live state if this item is currently
      // staged or live — otherwise the operator is just pre-configuring
      // the asset and we shouldn't touch the active deck.
      if (stagedItemId === item.id) {
        // setSlides() unconditionally resets liveSlideIndex to -1 (see
        // store), which would yank the slide off-air the moment the
        // operator adjusts Fit on a LIVE asset. Capture the live state
        // first and re-engage it after replacing the deck so the
        // congregation/NDI feed never blinks to black.
        const wasLive = useAppStore.getState().liveSlideIndex >= 0
        setSlides([refreshed])
        setPreviewSlideIndex(0)
        if (wasLive) {
          setLiveSlideIndex(0)
          setIsLive(true)
        }
      }
    },
    [
      stagedItemId,
      setSlides,
      setPreviewSlideIndex,
      setLiveSlideIndex,
      setIsLive,
    ]
  )

  return (
    <Card
      title="Media"
      bodyClassName="overflow-hidden flex flex-col"
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          onFiles(e.target.files)
          if (fileRef.current) fileRef.current.value = ''
        }}
      />
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-zinc-800/70 shrink-0">
        <Button
          size="sm"
          variant="secondary"
          className="h-6 px-2 text-[10px] gap-1"
          onClick={onPick}
          disabled={uploading}
        >
          <Upload className="h-3 w-3" />{' '}
          {uploading ? `Uploading ${uploadPct}%` : 'Upload'}
        </Button>
        {/* Windows-Explorer-style View menu. Six modes mirror the
            screenshot the user provided. The selection is persisted
            so each operator's preferred density survives a reload. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="secondary"
              className="h-6 px-2 text-[10px] gap-1 ml-auto"
              title="Change view"
            >
              {(() => {
                const Icon = MEDIA_VIEW_MODES.find((v) => v.id === mediaViewMode)?.icon ||
                  LayoutGrid
                return <Icon className="h-3 w-3" />
              })()}
              View
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[10rem]">
            {MEDIA_VIEW_MODES.map((v) => {
              const Icon = v.icon
              return (
                <DropdownMenuItem
                  key={v.id}
                  onClick={() => setMediaViewMode(v.id)}
                  className="gap-2"
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="flex-1">{v.label}</span>
                  {mediaViewMode === v.id && (
                    <Check className="h-3.5 w-3.5 text-fuchsia-400" />
                  )}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Per-item display options. Visible only when an item is
          selected, so the panel stays compact when nothing is staged.
          Choices map 1:1 to slide.mediaFit values consumed by both the
          operator preview/live renderer and the secondary-screen
          renderer in the congregation route. */}
      {selectedItem && (
        <div className="grid grid-cols-2 gap-2 px-2 py-1.5 border-b border-zinc-800/70 shrink-0 text-[10px] text-zinc-300">
          <label className="flex flex-col gap-1">
            <span className="text-zinc-500 uppercase tracking-wider text-[9px] font-semibold">
              Fit
            </span>
            <select
              value={fitById[selectedItem.id] || 'fit'}
              onChange={(e) => updateFit(selectedItem, e.target.value as MediaFit)}
              className="h-6 rounded bg-zinc-900 border border-zinc-800 px-1.5 text-[10px] text-zinc-200 focus:outline-none focus:ring-1 focus:ring-fuchsia-500/50"
            >
              <option value="fit">Fit (original)</option>
              <option value="fill">Fill (cover)</option>
              <option value="stretch">Stretch</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-zinc-500 uppercase tracking-wider text-[9px] font-semibold">
              Aspect Ratio
            </span>
            <select
              value={
                fitById[selectedItem.id] === '16:9' ||
                fitById[selectedItem.id] === '4:3'
                  ? fitById[selectedItem.id]
                  : 'auto'
              }
              onChange={(e) => {
                const v = e.target.value
                updateFit(
                  selectedItem,
                  v === 'auto' ? 'fit' : (v as MediaFit)
                )
              }}
              className="h-6 rounded bg-zinc-900 border border-zinc-800 px-1.5 text-[10px] text-zinc-200 focus:outline-none focus:ring-1 focus:ring-fuchsia-500/50"
            >
              <option value="auto">Auto</option>
              <option value="16:9">16 : 9</option>
              <option value="4:3">4 : 3</option>
            </select>
          </label>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto p-2">
        {items.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center h-full text-center text-[10px] text-zinc-500 gap-2 border border-dashed border-zinc-800 rounded cursor-pointer hover:border-zinc-700 hover:text-zinc-400 transition-colors py-6"
            onClick={onPick}
          >
            <Upload className="h-5 w-5 opacity-60" />
            <div>
              <div className="font-medium">Click to upload</div>
              <div className="opacity-70 mt-0.5">Images or videos (up to 3 GB)</div>
            </div>
          </div>
        ) : (
          <MediaItemsView
            items={items}
            mode={mediaViewMode}
            selectedId={selectedId}
            stagedItemId={stagedItemId}
            onItemClick={onItemClick}
            onRemove={remove}
          />
        )}
      </div>

      {selectedItem && (
        <div className="border-t border-zinc-800/70 px-2 py-1.5 shrink-0">
          <Button
            size="sm"
            className="w-full h-7 text-[10px] gap-1 bg-fuchsia-600 hover:bg-fuchsia-500"
            onClick={() => onItemClick(selectedItem)}
          >
            <Send className="h-3 w-3" />{' '}
            {stagedItemId === selectedItem.id ? 'Send to Live' : 'Replace Preview'}
          </Button>
        </div>
      )}
    </Card>
  )
}

// ──────────────────────────────────────────────────────────────────────
// MAIN SHELL
// ──────────────────────────────────────────────────────────────────────
export function LogosShell() {
  const {
    slides,
    previewSlideIndex,
    setPreviewSlideIndex,
    liveSlideIndex,
    setLiveSlideIndex,
    isLive,
    setIsLive,
    setNdiConnected,
    settings,
    detectedVerses,
    addScheduleItem,
    setSlides,
    outputEnabled,
    setOutputEnabled,
  } = useAppStore()

  // The "output active" lamp on the toolbar mirrors the master output
  // enable flag in the store so the toggle and the global broadcaster
  // always agree.
  const outputActive = outputEnabled
  const [elapsedTime, setElapsedTime] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Live Display panel-local state (UX only — does not change broadcast logic)
  // Default to 1.0 so the Live Display frame fills its panel the same
  // way the Preview frame does. Operators previously saw a smaller
  // Live frame (0.85) by default and asked for it to match Preview;
  // the SIZE slider still lets them shrink down to inspect padding.
  const [displaySize, setDisplaySize] = useState(1)
  // displayHidden is mirrored into the store as `outputBlanked` so the
  // global broadcaster can push a black frame to the congregation
  // screen AND the NDI feed. Without the store wire-through the HIDDEN
  // toggle only dimmed the in-app Live Display thumbnail and the
  // projector stayed lit — the exact bug T003 was filed against.
  const outputBlanked = useAppStore((s) => s.outputBlanked)
  const setOutputBlanked = useAppStore((s) => s.setOutputBlanked)
  const displayHidden = outputBlanked
  const setDisplayHidden = setOutputBlanked
  // Auto-go-live mode is now a store flag so both the Live Display
  // "AUTO" toggle and the new AUTO pill in Live Transcription drive
  // the same state.
  const autoAdvance = useAppStore((s) => s.autoLive)
  const setAutoAdvance = useAppStore((s) => s.setAutoLive)

  // ── Auto-advance: when ON, every newly detected verse is sent straight
  // to the live output (and added to the schedule). Mirrors how Logos AI
  // and similar production tools handle "follow the speaker" mode.
  const lastAutoVerseId = useRef<string | null>(null)
  useEffect(() => {
    if (!autoAdvance) return
    if (!detectedVerses.length) return
    const newest = detectedVerses[0]
    if (!newest || newest.id === lastAutoVerseId.current) return
    lastAutoVerseId.current = newest.id
    const slide = {
      id: `auto-${newest.id}`,
      type: 'verse' as const,
      title: newest.reference,
      subtitle: newest.translation,
      content: (newest.text || '').split('\n').filter(Boolean),
      background: settings.congregationScreenTheme,
    }
    addScheduleItem({
      type: 'verse',
      title: newest.reference,
      subtitle: newest.translation,
      slides: [slide],
    })
    setSlides([slide])
    setPreviewSlideIndex(0)
    setLiveSlideIndex(0)
    setIsLive(true)
    // Toast suppressed per FRS — output actions stay silent.
  }, [autoAdvance, detectedVerses, addScheduleItem, setSlides, setPreviewSlideIndex, setLiveSlideIndex, setIsLive, settings.congregationScreenTheme])

  // Local no-op broadcaster — the real broadcaster lives globally in
  // <OutputBroadcaster /> (mounted in page.tsx) so settings tweaks
  // flow to the secondary screen even when the operator is on the
  // Settings overlay. We keep this stub so existing transport
  // callbacks (clearLive / goBlack / goLogo) compile unchanged.
  const sendToOutput = useCallback(
    async (_slide: typeof slides[number] | null, _live: boolean) => {
      /* no-op — handled by <OutputBroadcaster /> */
    },
    [],
  )

  // Auto-enable NDI / output if mode requires it
  useEffect(() => {
    if (
      (settings.outputDestination === 'ndi' || settings.outputDestination === 'both') &&
      !outputActive
    ) {
      setOutputEnabled(true)
      setNdiConnected(true)
    }
  }, [settings.outputDestination, outputActive, setOutputEnabled, setNdiConnected])

  // Live timer
  const prevIsLive = useRef(isLive)
  useEffect(() => {
    if (prevIsLive.current && !isLive) setElapsedTime(0) // eslint-disable-line react-hooks/set-state-in-effect
    prevIsLive.current = isLive
  }, [isLive])
  useEffect(() => {
    if (isLive) {
      timerRef.current = setInterval(() => setElapsedTime((p) => p + 1), 1000)
    } else if (timerRef.current) {
      clearInterval(timerRef.current)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isLive])

  // Transport actions
  const goLive = useCallback(() => {
    if (!slides.length) {
      toast.info('Add something to the schedule first')
      return
    }
    setLiveSlideIndex(previewSlideIndex)
    setIsLive(true)
    // Force-stop every Preview-surface video the instant we send to
    // air. Without this the preview <video> may keep playing for a
    // beat before React's render commits the new isLive state, and
    // the operator hears the same audio out of two surfaces. Pausing
    // the DOM directly closes that window.
    if (typeof document !== 'undefined') {
      document.querySelectorAll<HTMLVideoElement>('video[data-surface="preview"]').forEach((v) => {
        try {
          v.pause()
        } catch { /* ignore */ }
      })
    }
    if (previewSlideIndex < slides.length - 1) setPreviewSlideIndex(previewSlideIndex + 1)
  }, [slides.length, previewSlideIndex, setLiveSlideIndex, setIsLive, setPreviewSlideIndex])

  const clearLive = useCallback(() => {
    setLiveSlideIndex(-1)
    setIsLive(false)
    sendToOutput(null, false)
  }, [setLiveSlideIndex, setIsLive, sendToOutput])

  const goBlack = useCallback(() => {
    // Toggle the store-wide BLACK flag. The broadcaster stamps
    // `blanked:true` on every subsequent payload and the congregation
    // route paints a solid black frame, so the projector and the NDI
    // feed both go dark instantly. Flipping it back off snaps straight
    // back to whatever was staged, without re-cueing the slide.
    setOutputBlanked(!outputBlanked)
  }, [setOutputBlanked, outputBlanked])

  const goLogo = useCallback(() => {
    // Logo is a transient overlay that doesn't live in the slide deck,
    // so we POST it directly. The global broadcaster's deduper will
    // accept this because the payload differs from the last live one.
    void fetch('/api/output', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'slide',
        slide: { id: 'logo', type: 'title', title: 'ScriptureLive AI', subtitle: '', content: [], background: settings.congregationScreenTheme },
        isLive: true,
        displayMode: settings.displayMode,
        settings: {
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
        },
      }),
      keepalive: true,
    }).catch(() => {})
    setIsLive(true)
    /* Toast suppressed per FRS — output actions stay silent. */
  }, [settings, setIsLive])

  const toggleOutput = useCallback(() => {
    if (outputActive) {
      setOutputEnabled(false)
      setNdiConnected(false)
      /* Toast suppressed per FRS — output actions stay silent. */
    } else {
      setOutputEnabled(true)
      /* Toast suppressed per FRS — output actions stay silent. */
    }
  }, [outputActive, setOutputEnabled, setNdiConnected])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        // Toggle: Enter while on air STOPS live, mirroring the
        // "GO LIVE / STOP LIVE" button so the keyboard and mouse
        // paths agree.
        if (isLive) clearLive()
        else goLive()
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        if (previewSlideIndex < slides.length - 1) setPreviewSlideIndex(previewSlideIndex + 1)
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        if (previewSlideIndex > 0) setPreviewSlideIndex(previewSlideIndex - 1)
      } else if (e.key === 'Escape') {
        clearLive()
      } else if (e.key.toLowerCase() === 'b') {
        goBlack()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [previewSlideIndex, slides.length, goLive, clearLive, goBlack, setPreviewSlideIndex, isLive])

  // Live Display transport (the inline ◀ Display ▶ row).
  // The arrows here step the *live* slide forward / backward through
  // the current verse deck and immediately push it to the secondary
  // screen — operators expect Live Display arrows to drive what's on
  // air, not just the preview pane. Falls back to the preview index if
  // nothing is on air yet so the very first click goes live cleanly.
  const onPrev = useCallback(() => {
    if (!slides.length) return
    const cur = liveSlideIndex >= 0 ? liveSlideIndex : previewSlideIndex
    const next = Math.max(0, cur - 1)
    setLiveSlideIndex(next)
    setPreviewSlideIndex(next)
    setIsLive(true)
  }, [slides.length, liveSlideIndex, previewSlideIndex, setLiveSlideIndex, setPreviewSlideIndex, setIsLive])
  const onNext = useCallback(() => {
    if (!slides.length) return
    const cur = liveSlideIndex >= 0 ? liveSlideIndex : previewSlideIndex
    const next = Math.min(slides.length - 1, cur + 1)
    setLiveSlideIndex(next)
    setPreviewSlideIndex(next)
    setIsLive(true)
  }, [slides.length, liveSlideIndex, previewSlideIndex, setLiveSlideIndex, setPreviewSlideIndex, setIsLive])
  const onSendLive = () => goLive()

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0a0d14] text-zinc-100 dark">
      <TopToolbar outputActive={outputActive} toggleOutput={toggleOutput} />

      {/* Main grid — two rows × four/three columns of rounded card panels */}
      <div className="flex-1 min-h-0 grid grid-rows-[1.05fr_1fr] gap-2 p-2 overflow-hidden">
        {/* Top row */}
        <div className="grid gap-2 min-h-0 grid-cols-[minmax(260px,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(260px,1fr)]">
          <LiveTranscriptionCard />
          <PreviewCard />
          <LiveDisplayCard
            size={displaySize}
            setSize={setDisplaySize}
            hidden={displayHidden}
            setHidden={setDisplayHidden}
            auto={autoAdvance}
            setAuto={setAutoAdvance}
            onPrev={onPrev}
            onSendLive={onSendLive}
            onNext={onNext}
            isLive={isLive}
            onClearLive={clearLive}
          />
          <ScriptureFeedCard />
        </div>

        {/* Bottom row */}
        <div className="grid gap-2 min-h-0 grid-cols-3">
          <ChapterNavigatorCard />
          <DetectedVersesCard />
          <MediaCard />
        </div>
      </div>

      <TransportBar
        outputActive={outputActive}
        elapsedTime={elapsedTime}
        onGoLive={goLive}
        onClearLive={clearLive}
        onBlack={goBlack}
        onLogo={goLogo}
      />

      {/* App-wide branding strip — sits beneath the entire console so the
          attribution is always visible to the operator without crowding
          the workspace cards. */}
      <footer className="flex h-7 items-center justify-center gap-2 border-t border-zinc-800 bg-zinc-950/80 shrink-0 select-none">
        <div className="h-4 w-4 rounded-full bg-white flex items-center justify-center overflow-hidden shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" className="h-full w-full object-contain" />
        </div>
        <span className="text-[10px] tracking-wide text-zinc-400">
          Powered by WassMedia (+233246798526)
        </span>
      </footer>
    </div>
  )
}
