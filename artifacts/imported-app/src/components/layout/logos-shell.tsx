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
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { BibleLookupCompact } from '@/components/layout/library-compact'
import { TopToolbar, TransportBar } from '@/components/layout/easyworship-shell'
import {
  parseVerseReference,
  getNextChapter,
  getPrevChapter,
  fetchBibleChapter,
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
          {isListening ? 'Stop' : isLive ? 'Listening' : 'Go Live'}
        </Button>
      }
    >
      <div className="flex-1 min-h-0 overflow-y-auto">
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
              Tap <span className="text-sky-300 font-semibold">Go Live</span> to start
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
              {para}
            </p>
          ))}
          {liveInterimTranscript && (
            <p className="text-[12px] leading-relaxed text-zinc-500 italic">
              {liveInterimTranscript}…
            </p>
          )}
        </div>
      </div>
    </Card>
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
    mediaPaused,
    setMediaPaused,
    previewAudio,
    setPreviewAudio,
  } = useAppStore()
  const previewSlide = slides[previewSlideIndex] || null
  const [navigating, setNavigating] = useState(false)
  // Transport visibility: the bar only makes sense for video media on
  // the currently-selected preview slide. Operators step OTHER slide
  // types with the main Live Display ◀ / ▶, so we hide the bar there
  // to avoid double controls.
  const isMediaVideo =
    previewSlide?.type === 'media' && previewSlide?.mediaKind === 'video'

  // Transport actions. Play/Pause flip the global `mediaPaused` flag —
  // the slide-renderer effect calls .play()/.pause() on every mounted
  // <video> in response, so the operator preview, the Live Display
  // and the secondary screen all stay in lock-step. Back/Forward step
  // the live cursor (mirroring the preview cursor) so the operator
  // can walk through the schedule from the preview pane.
  const onPlay = useCallback(() => setMediaPaused(false), [setMediaPaused])
  const onPause = useCallback(() => setMediaPaused(true), [setMediaPaused])
  const onSendBack = useCallback(() => {
    if (!slides.length) return
    const cur = liveSlideIndex >= 0 ? liveSlideIndex : previewSlideIndex
    const next = Math.max(0, cur - 1)
    setLiveSlideIndex(next)
    setPreviewSlideIndex(next)
    setIsLive(true)
  }, [
    slides.length,
    liveSlideIndex,
    previewSlideIndex,
    setLiveSlideIndex,
    setPreviewSlideIndex,
    setIsLive,
  ])
  const onSendForward = useCallback(() => {
    if (!slides.length) return
    const cur = liveSlideIndex >= 0 ? liveSlideIndex : previewSlideIndex
    const next = Math.min(slides.length - 1, cur + 1)
    setLiveSlideIndex(next)
    setPreviewSlideIndex(next)
    setIsLive(true)
  }, [
    slides.length,
    liveSlideIndex,
    previewSlideIndex,
    setLiveSlideIndex,
    setPreviewSlideIndex,
    setIsLive,
  ])

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
      <div className="flex-1 min-h-0 flex items-center justify-center p-3 relative">
        {/* Speaker toggle pinned to the LEFT edge of the preview
            surface (mirrors the Wirecast preview-monitor button). On
            = operator hears preview audio; off = preview is silent.
            Audio is still processed regardless — this only affects
            local audibility on the preview surface. */}
        <button
          type="button"
          onClick={() => setPreviewAudio(!previewAudio)}
          title={previewAudio ? 'Mute preview audio' : 'Monitor preview audio'}
          className={cn(
            'absolute left-1.5 top-1/2 -translate-y-1/2 z-20 h-7 w-7 rounded-md border flex items-center justify-center transition-colors',
            previewAudio
              ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
              : 'bg-black/60 border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500',
          )}
        >
          {previewAudio ? (
            <Volume2 className="h-3.5 w-3.5" />
          ) : (
            <VolumeX className="h-3.5 w-3.5" />
          )}
        </button>
        {previewSlide ? (
          <div className="w-full max-w-full">
            <SlideThumb
              slide={previewSlide}
              themeKey={previewSlide.background || settings.congregationScreenTheme}
              size="lg"
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
      {/* Transport bar — rendered BELOW the preview surface so it
          mirrors a broadcast transport row (Back · Play · Pause ·
          Forward). Only visible for media-video previews; other slide
          types are stepped from the Live Display column. */}
      {isMediaVideo && (
        <div className="flex items-center justify-center gap-1 border-t border-zinc-800/70 px-2 py-1.5 shrink-0">
          <Button
            size="sm"
            variant="secondary"
            className="h-7 w-7 p-0"
            onClick={onSendBack}
            title="Send back (previous slide)"
          >
            <SkipBack className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-7 w-7 p-0"
            onClick={onPlay}
            disabled={!mediaPaused}
            title="Play"
          >
            <Play className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-7 w-7 p-0"
            onClick={onPause}
            disabled={mediaPaused}
            title="Pause"
          >
            <Pause className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-7 w-7 p-0"
            onClick={onSendForward}
            title="Send forward (next slide)"
          >
            <SkipForward className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </Card>
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
  const liveSlide = liveSlideIndex >= 0 ? slides[liveSlideIndex] : null
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
      <div className="flex-1 min-h-0 flex items-center justify-center p-3 relative">
        {/* Audio toggles pinned to the RIGHT edge of the live surface
            (mirrors the Wirecast live-monitor cluster the user
            referenced). Speaker = broadcast audio is hot (on/off);
            Headphones = operator monitors live audio locally. They are
            independent — broadcast can be hot while the operator is
            silent (typical live-mix posture), or both on (operator
            monitoring), or both off (everything muted). */}
        <div className="absolute right-1.5 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => setLiveBroadcastAudio(!liveBroadcastAudio)}
            title={
              liveBroadcastAudio
                ? 'Mute broadcast audio'
                : 'Send audio to broadcast'
            }
            className={cn(
              'h-7 w-7 rounded-md border flex items-center justify-center transition-colors',
              liveBroadcastAudio
                ? 'bg-rose-500/20 border-rose-500/50 text-rose-300'
                : 'bg-black/60 border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500',
            )}
          >
            {liveBroadcastAudio ? (
              <Volume2 className="h-3.5 w-3.5" />
            ) : (
              <VolumeX className="h-3.5 w-3.5" />
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
              'h-7 w-7 rounded-md border flex items-center justify-center transition-colors relative',
              liveMonitorAudio
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                : 'bg-black/60 border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500',
            )}
          >
            <Headphones className="h-3.5 w-3.5" />
            {!liveMonitorAudio && (
              <span className="absolute inset-x-1 h-px bg-current rotate-45" />
            )}
          </button>
        </div>
        {/* Startup splash. While the operator hasn't put anything on
            air yet (fresh session) we float the WassMedia logo over
            the empty stage so both the operator's Live Display and the
            congregation TV match. Disappears on the first cue. */}
        {showStartupLogo && !hidden && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="WassMedia"
              className="max-w-[42%] max-h-[42%] w-auto h-auto object-contain"
            />
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
                className="w-full max-w-full"
                style={{ transform: `scale(${size})`, transformOrigin: 'center' }}
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
              className="w-full max-w-full"
              style={{ transform: `scale(${size})`, transformOrigin: 'center' }}
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
                      textAlign: settings.textAlign ?? 'center',
                      alignItems:
                        (settings.textAlign ?? 'center') === 'left'
                          ? 'flex-start'
                          : (settings.textAlign ?? 'center') === 'right'
                            ? 'flex-end'
                            : 'center',
                    }}
                  >
                    {refLine && (
                      <div
                        className="opacity-70 font-medium leading-tight"
                        style={{ fontSize: 'clamp(7px, min(2cqw, 4cqh), 20px)' }}
                      >
                        {refLine}
                      </div>
                    )}
                    {bodyLines.map((line, i) => {
                      const totalChars = bodyLines.join(' ').length
                      const band =
                        totalChars > 320 ? 5 : totalChars > 180 ? 7 : totalChars > 90 ? 9 : 11
                      return (
                        <div
                          key={i}
                          className="font-semibold leading-snug w-full"
                          style={{
                            fontSize: `clamp(9px, min(${band * 0.55}cqw, ${band}cqh), 30px)`,
                          }}
                        >
                          {line}
                        </div>
                      )
                    })}
                  </div>
                </div>
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

      <div className="border-t border-zinc-800/60 px-3 py-2 flex items-center gap-3 bg-zinc-900/30 shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-semibold">Size</span>
          <input
            type="range"
            min={0.6}
            max={1.0}
            step={0.05}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="flex-1 h-1 accent-sky-500"
          />
          <span className="text-[10px] font-mono text-zinc-400 tabular-nums w-8 text-right">
            {Math.round(size * 100)}%
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onPrev} className="h-7 w-7 text-zinc-300 hover:text-white border border-zinc-800">
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            onClick={onSendLive}
            className="h-7 px-3 text-[10px] uppercase tracking-wider font-semibold bg-sky-600 hover:bg-sky-700 text-white gap-1.5"
          >
            <Send className="h-3 w-3" />
            Display
          </Button>
          <Button variant="ghost" size="icon" onClick={onNext} className="h-7 w-7 text-zinc-300 hover:text-white border border-zinc-800">
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
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

  const sendVerseToSchedule = (v: typeof verseHistory[number]) => {
    addScheduleItem({
      type: 'verse',
      title: v.reference,
      subtitle: v.translation,
      slides: [
        {
          id: `slide-${Date.now()}`,
          type: 'verse',
          title: v.reference,
          subtitle: v.translation,
          content: (v.text || '').split('\n').filter(Boolean),
          background: settings.congregationScreenTheme,
        },
      ],
    })
    // Toast suppressed per FRS — output/schedule actions stay silent.
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
                  onClick={() => sendVerseToSchedule(v)}
                  className="w-full text-left rounded border border-zinc-800/70 bg-zinc-900/40 hover:border-sky-500/40 hover:bg-zinc-900 px-2 py-1.5 transition-colors group"
                  title="Click to add to schedule"
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
            detectedVerses.map((v, i) => (
              <div
                key={`${v.reference}-${i}`}
                onClick={() => sendDetected(v, false)}
                onDoubleClick={() => sendDetected(v, true)}
                className="rounded border border-zinc-800/70 bg-zinc-900/40 hover:border-emerald-500/40 hover:bg-zinc-900 px-2 py-1.5 cursor-pointer transition-colors select-none"
                title="Click → schedule · Double-click → live"
              >
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="text-[10px] font-semibold text-emerald-300">
                    {v.reference}
                  </span>
                  <span className="text-[9px] text-zinc-500 uppercase">{v.translation}</span>
                </div>
                <p className="text-[11px] text-zinc-300 line-clamp-2 leading-snug">{v.text}</p>
              </div>
            ))
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
        toast.success(`${added.length} item${added.length === 1 ? '' : 's'} uploaded`)
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
        toast.success('Replaced preview with selected media')
      } else {
        // Second click on the same item: send it live.
        setLiveSlideIndex(0)
        setIsLive(true)
        // Logo splash only shows until the operator first puts
        // something on air; trip the flag so the secondary screen and
        // the operator's Live Display drop the splash from now on.
        setHasShownContent(true)
        toast.success('Sent to live output')
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
      badge={
        <Badge className="h-4 px-1.5 text-[9px] font-semibold bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/40 uppercase tracking-wider">
          <ImageIcon className="h-2.5 w-2.5 mr-1" /> {items.length}
        </Badge>
      }
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
  const [displaySize, setDisplaySize] = useState(0.85)
  const [displayHidden, setDisplayHidden] = useState(false)
  const [autoAdvance, setAutoAdvance] = useState(false)

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
    if (previewSlideIndex < slides.length - 1) setPreviewSlideIndex(previewSlideIndex + 1)
  }, [slides.length, previewSlideIndex, setLiveSlideIndex, setIsLive, setPreviewSlideIndex])

  const clearLive = useCallback(() => {
    setLiveSlideIndex(-1)
    setIsLive(false)
    sendToOutput(null, false)
  }, [setLiveSlideIndex, setIsLive, sendToOutput])

  const goBlack = useCallback(() => {
    setLiveSlideIndex(-1)
    setIsLive(true)
    sendToOutput(null, true)
  }, [setLiveSlideIndex, setIsLive, sendToOutput])

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
        goLive()
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
  }, [previewSlideIndex, slides.length, goLive, clearLive, goBlack, setPreviewSlideIndex])

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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" className="h-3.5 w-3.5 object-contain bg-transparent opacity-90" />
        <span className="text-[10px] tracking-wide text-zinc-400">
          Powered by WassMedia (+233246798526)
        </span>
      </footer>
    </div>
  )
}
