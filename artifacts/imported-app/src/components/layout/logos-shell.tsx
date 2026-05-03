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
import { StableStage } from '@/components/presenter/stable-stage'
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
  ImageOff,
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
  Cpu,
  Lock,
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
// v1 LICENSING — overlay rendered inside the Live Transcription Card
// when the subscription is not active.
import { LiveTranscriptionLockOverlay } from '@/components/license/lock-overlay'
// v0.5.49 — Read isLocked here so the action buttons (Bible / Clear /
// Mic / Auto) can render disabled instead of letting clicks slip past
// the backdrop-blur overlay onto the underlying mic.
import { useLicense } from '@/components/license/license-provider'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'
import {
  parseVerseReference,
  getNextChapter,
  getPrevChapter,
  fetchBibleChapter,
  normalizeTranscriptForDisplay,
  detectVersesInText,
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
        // h-full is critical — without it each Card sizes to its content
        // height. Live Display's 16:9 stage frame forces it taller than
        // Preview / Detect Verses / Scripture Feed, so the row of cards
        // ends up at four different bottom edges. With h-full every Card
        // fills its parent ResizablePanel and the row aligns perfectly
        // top and bottom (same applies to the bottom row: Chapter
        // Navigator, Detected Verses, Media all line up).
        'flex flex-col h-full min-h-0 rounded-xl border border-border/70 bg-background/60 shadow-sm overflow-hidden',
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2 px-3 h-9 border-b border-border/60 shrink-0 bg-card/30">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-[10px] uppercase tracking-[0.18em] font-semibold text-foreground truncate">
            {title}
          </h3>
          {badge}
        </div>
        {actions && <div className="flex items-center gap-1 shrink-0">{actions}</div>}
      </header>
      {/* Default: vertical scroll on, horizontal off. When the operator
          drags a divider and the panel content gets taller than the
          panel, the wheel/trackpad must always be able to reach it.
          Cards that own a fixed-aspect surface (Preview / Live Display)
          or manage their own internal scroll override this via
          `bodyClassName="overflow-hidden …"` — twMerge swaps the
          overflow keyword cleanly. */}
      <div className={cn('flex-1 min-h-0 flex flex-col overflow-y-auto overflow-x-hidden', bodyClassName)}>{children}</div>
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
  // Show the meter whenever the video is actually playing — even if
  // the operator is not monitoring locally (item #11). The icon
  // colour / opacity still communicates whether audio is being
  // monitored or broadcast; the bar's job is to show that signal is
  // flowing to the downstream output. Silent / paused / ended still
  // reads dead-flat zero because the underlying audio level is 0.
  const level = playing ? raw : 0
  const grad =
    tone === 'red'
      ? 'from-rose-500 via-rose-400 to-amber-400'
      : tone === 'amber'
        ? 'from-amber-500 via-amber-400 to-yellow-300'
        : 'from-emerald-500 via-emerald-400 to-yellow-300'
  return (
    <div className="relative h-full w-2 rounded-sm bg-card/80 border border-border overflow-hidden">
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
          : 'bg-transparent text-muted-foreground border-transparent hover:text-foreground',
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
  // v0.5.30 — Bible-only filter. When ON (default), the panel only
  // shows paragraphs that contain a Bible reference, so an hour of
  // sermon doesn't leave 2 000 lines of unrelated chatter on screen.
  const bibleOnlyTranscription = useAppStore((s) => s.bibleOnlyTranscription)
  const setBibleOnlyTranscription = useAppStore((s) => s.setBibleOnlyTranscription)
  // v0.5.49 — Engine picker (Auto / Deepgram / Whisper / Browser).
  // Operators occasionally need to pin one engine when, e.g., their
  // venue's network blocks Deepgram WSS but Whisper HTTP works fine,
  // or their bundled Electron build can't reach the browser-engine
  // upstream. We also surface the currently-active engine so they
  // know which one actually picked up after a fallback.
  const preferredEngine = useAppStore((s) => s.preferredEngine)
  const setPreferredEngine = useAppStore((s) => s.setPreferredEngine)
  const activeEngineName = useAppStore((s) => s.activeEngineName)
  // v0.5.49 — Subscription gate. The lock overlay covers the body
  // visually (backdrop-blur), but earlier the action buttons in the
  // Card header sat OUTSIDE that overlay's z-stack and remained
  // clickable. Reading isLocked here lets us short-circuit each
  // handler AND render the buttons visually inert (disabled +
  // opacity drop) so the locked state is unambiguous.
  const { isLocked } = useLicense()

  const toggleMic = () => {
    if (isLocked) return // v0.5.49 — locked subscription, no-op
    // v0.5.42 — `speechSupported` is forced TRUE by SpeechProvider in
    // any browser-like environment because the Deepgram engine works
    // wherever there is mic + WebSocket + AudioContext. The legacy
    // guard short-circuited every click in the Replit preview iframe
    // and produced the silent-mic bug operators kept hitting. We
    // still log the support flag so any genuine regression is visible
    // in the browser DevTools.
    // eslint-disable-next-line no-console
    console.log('[mic-button] click. supported =', speechSupported, ' isListening =', isListening)
    setSpeechCommand(isListening ? 'stop' : 'start')
  }

  // v0.5.49 — Engine label for the picker trigger. We keep the visible
  // text to a single short token so the badge never wraps inside a
  // narrow ResizablePanel. The COLOUR of the dot before the label
  // tells the operator which engine is currently doing the work
  // (emerald = Deepgram, amber = Whisper, sky = Browser). When the
  // mic is hot the dot also pulses to preserve the live cue. The full
  // "Auto · Deepgram" / pinned-name explanation lives in the tooltip
  // and the dropdown items themselves.
  // v0.5.52 — Browser engine retired; only Deepgram + Whisper remain.
  const engineShort: Record<typeof activeEngineName, string> = {
    deepgram: 'DG',
    whisper: 'WH',
  }
  const engineLabel =
    preferredEngine === 'auto' ? 'AUTO' : engineShort[preferredEngine]
  const engineDotColor =
    activeEngineName === 'deepgram' ? 'bg-emerald-400' : 'bg-amber-400'
  const engineTitle =
    preferredEngine === 'auto'
      ? `Engine: Auto (active: ${activeEngineName}). Click to pin.`
      : `Engine pinned to ${preferredEngine}. Click to change.`

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
    let segs: string[]
    if (!breaks.length) {
      segs = [t.trim()].filter(Boolean)
    } else {
      segs = []
      let prev = 0
      for (const b of breaks) {
        const seg = t.slice(prev, b).trim()
        if (seg) segs.push(seg)
        prev = b
      }
      const tail = t.slice(prev).trim()
      if (tail) segs.push(tail)
    }
    // v0.5.30 — Bible-only mode keeps just the paragraphs that
    // detectVersesInText() returns at least one match for. We use the
    // canonical detector (same logic that fires the slide auto-stage)
    // so a paragraph appearing here is guaranteed to have triggered a
    // verse panel update — no false positives from word-soup names.
    if (bibleOnlyTranscription) {
      segs = segs.filter((p) => detectVersesInText(p).length > 0)
    }
    return segs.slice(-12)
  })()

  return (
    <Card
      title="Live Transcription"
      badge={
        // v0.5.49 — The engine picker lives in the BADGE slot now. The
        // mic Button below already conveys listening state (rose color
        // + MicOff icon + "Stop" label when active), so the legacy
        // Listening/Idle pill was redundant. Putting the picker here
        // frees the actions row for the four control buttons (Bible /
        // Clear / Mic / Auto) and gives the engine badge full breathing
        // room. The dot before the label pulses when the mic is hot,
        // preserving the "live" cue.
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title={engineTitle}
              className={cn(
                'inline-flex items-center gap-1 h-5 px-1.5 rounded-md text-[9px] uppercase tracking-wider font-semibold border whitespace-nowrap',
                'bg-card hover:bg-muted text-foreground border-border',
              )}
            >
              <span
                className={cn(
                  'inline-block h-1.5 w-1.5 rounded-full',
                  engineDotColor,
                  isListening && 'animate-pulse',
                )}
              />
              {engineLabel}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[14rem]">
            {/* v0.7.19 — OpenAI Whisper option removed. The OpenAI
                project key was rotated and never propagated cleanly to
                the deployed proxy, so Whisper-routed chunks 401-ed for
                every customer in the field. We've consolidated on
                Deepgram for both the streaming and batched HTTP paths
                — the picker now reflects that. 'Auto' is kept so old
                presets keep working; with only Deepgram in the chain
                it behaves identically to picking 'Deepgram' directly. */}
            {([
              { v: 'auto',     label: 'Auto (recommended)',    sub: 'Deepgram-only (single engine)' },
              { v: 'deepgram', label: 'Deepgram (streaming)',  sub: 'Lowest latency, requires WSS' },
            ] as const).map((opt) => (
              <DropdownMenuItem
                key={opt.v}
                onClick={() => setPreferredEngine(opt.v)}
                className="flex flex-col items-start gap-0.5"
              >
                <span className="flex items-center gap-2 text-[12px] font-medium">
                  {preferredEngine === opt.v && <Check className="h-3 w-3 text-emerald-400" />}
                  {opt.label}
                </span>
                <span className="text-[10px] text-muted-foreground pl-5">{opt.sub}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      }
      actions={
        <div className="flex items-center gap-1">
          {/* Bible / Clear / Mic / Auto — all gated on isLocked so a
              locked subscription can't slip a click through the
              backdrop-blur overlay onto the mic. */}
          {/* v0.5.30 — Bible-only filter toggle. ON by default. When
              ON we show only paragraphs containing a Bible reference;
              when OFF the operator sees the full raw transcript (the
              old behaviour). The amber "Bible" pill is meant to mirror
              the AUTO-display pill below it: amber = "active filter,
              you're looking at a curated view". */}
          {/* v0.5.50 — All four buttons shrunk one notch: h-7 → h-6,
              px-2 → px-1.5, gap-1 → gap-0.5, icons h-3 → h-2.5. The
              row was visually clumsy at h-7 on a 1280-wide stage; the
              tighter sizing keeps every action in view without
              wrapping or eating engine-picker space. */}
          <Button
            size="sm"
            disabled={isLocked}
            aria-disabled={isLocked}
            onClick={() => { if (isLocked) return; setBibleOnlyTranscription(!bibleOnlyTranscription) }}
            title={
              isLocked
                ? 'Activate a subscription to use Live Transcription controls.'
                : bibleOnlyTranscription
                ? 'Bible-only filter ON — only verses appear. Click to show full transcript.'
                : 'Showing full transcript. Click to filter to Bible references only.'
            }
            className={cn(
              'h-6 px-1.5 text-[10px] uppercase tracking-wider gap-0.5 font-semibold border',
              bibleOnlyTranscription
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                : 'bg-card hover:bg-muted text-foreground border-border',
              isLocked && 'opacity-50 cursor-not-allowed pointer-events-none',
            )}
          >
            {isLocked ? <Lock className="h-2.5 w-2.5" /> : <BookOpen className="h-2.5 w-2.5" />}
            {bibleOnlyTranscription ? 'Bible' : 'All'}
          </Button>
          <Button
            size="sm"
            disabled={isLocked}
            aria-disabled={isLocked}
            onClick={() => { if (isLocked) return; setSpeechCommand('reset') }}
            title={isLocked ? 'Activate a subscription to use Live Transcription controls.' : 'Clear transcription'}
            className={cn(
              'h-6 px-1.5 text-[10px] uppercase tracking-wider gap-0.5 font-semibold bg-card hover:bg-muted text-foreground border border-border',
              isLocked && 'opacity-50 cursor-not-allowed pointer-events-none',
            )}
          >
            {isLocked ? <Lock className="h-2.5 w-2.5" /> : <Trash2 className="h-2.5 w-2.5" />}
            Clear
          </Button>
          <Button
            size="sm"
            disabled={isLocked}
            aria-disabled={isLocked}
            onClick={toggleMic}
            title={
              isLocked
                ? 'Activate a subscription to enable Live Transcription.'
                : isListening
                ? 'Click to stop listening'
                : 'Click to start detecting verses from speech'
            }
            className={cn(
              'h-6 px-1.5 text-[10px] uppercase tracking-wider gap-0.5 font-semibold',
              isLocked
                ? 'bg-muted text-foreground'
                : isListening
                ? 'bg-rose-600 hover:bg-rose-700 text-white'
                : 'bg-sky-600 hover:bg-sky-700 text-white',
              isLocked && 'opacity-60 cursor-not-allowed pointer-events-none',
            )}
          >
            {isLocked
              ? <Lock className="h-2.5 w-2.5" />
              : isListening ? <MicOff className="h-2.5 w-2.5" /> : <Mic className="h-2.5 w-2.5" />
            }
            {/* v0.5.50 — shorter labels. "Detect Verses Now" became
                just "Detect", and the label is hidden below sm screens
                so the icon carries the meaning when the toolbar is
                cramped. */}
            <span className="hidden sm:inline">
              {isLocked
                ? 'Locked'
                : isListening ? 'Stop' : isLive ? 'Live' : 'Detect'}
            </span>
          </Button>
          {/* AUTO Display: when ON, every detected scripture is auto-staged
              and auto-sent to Live Display without an operator click. */}
          <Button
            size="sm"
            disabled={isLocked}
            aria-disabled={isLocked}
            onClick={() => { if (isLocked) return; setAutoLive(!autoLive) }}
            title={
              isLocked
                ? 'Activate a subscription to use AUTO Display.'
                : autoLive
                ? 'AUTO Display ON — detected verses go live automatically. Click to disable.'
                : 'AUTO Display OFF — verses preview only. Click to auto-send to Live Display.'
            }
            className={cn(
              'h-6 px-1.5 text-[10px] uppercase tracking-wider gap-0.5 font-semibold border',
              autoLive
                ? 'bg-amber-500 hover:bg-amber-400 text-black border-amber-300 shadow-md shadow-amber-500/30'
                : 'bg-card hover:bg-muted text-foreground border-border',
              isLocked && 'opacity-50 cursor-not-allowed pointer-events-none',
            )}
          >
            {isLocked ? <Lock className="h-2.5 w-2.5" /> : <Zap className={cn('h-2.5 w-2.5', autoLive && 'fill-black')} />}
            Auto
          </Button>
        </div>
      }
      // v1 LICENSING — make the Card body a positioning context so the
      // lock overlay below can `absolute inset-0` the entire visible
      // pane (not the scroll content). `flex flex-col` is preserved
      // from the Card primitive default.
      bodyClassName="relative"
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
            <div className="text-center py-6 text-[11px] text-muted-foreground">
              <Mic className="h-7 w-7 mx-auto opacity-40 mb-2" />
              Tap <span className="text-sky-300 font-semibold">Detect</span> to start
              transcribing the speaker. Detected scripture references will fill
              the right-hand panels.
              {/* v0.5.50 — Surface the active engine + most recent
                  error inline so an operator looking at a "dead"
                  transcription column can immediately tell which
                  engine is live and what (if anything) went wrong.
                  Previously this only showed in the rose error line
                  above; engine identity was buried in the Card BADGE
                  picker dot which operators didn't notice. */}
              <div className="mt-3 text-[10px] text-muted-foreground space-y-0.5">
                <div>
                  Engine:{' '}
                  <span className="text-foreground font-mono uppercase">
                    {activeEngineName ?? 'idle'}
                  </span>
                  {preferredEngine !== 'auto' && (
                    <span className="text-muted-foreground"> (pinned: {preferredEngine})</span>
                  )}
                </div>
                {isListening && (
                  <div className="text-emerald-400">Listening — speak normally…</div>
                )}
                {speechError && (
                  <div className="text-rose-400 break-words">Last error: {speechError}</div>
                )}
              </div>
            </div>
          )}
          {paragraphs.map((para, i) => (
            <p
              key={i}
              className={cn(
                'text-[12px] leading-relaxed text-foreground',
                // Add visible spacing between paragraphs
                i > 0 && 'mt-3 pt-3 border-t border-border/40',
              )}
            >
              {normalizeTranscriptForDisplay(para)}
            </p>
          ))}
          {liveInterimTranscript && (
            <p className="text-[12px] leading-relaxed text-muted-foreground italic">
              {normalizeTranscriptForDisplay(liveInterimTranscript)}…
            </p>
          )}
        </div>
      </div>
      {/* v1 LICENSING — Live Transcription is the gated feature. When
          the subscription is not active (trial expired / never
          activated / expired) this overlay covers the entire body and
          presents the "Activate AI Detection Now" CTA. While trial or
          active, useLicense().isLocked is false and the overlay
          renders nothing — the transcript is fully usable. */}
      <LiveTranscriptionLockOverlay />
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
    <div className="relative w-full aspect-video bg-black overflow-hidden ring-1 ring-border">
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
          <span className="text-[10px] text-muted-foreground font-mono">
            {previewSlideIndex + 1} / {slides.length}
          </span>
        ) : null
      }
      actions={
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => void goChapter('prev')}
            disabled={navigating || !previewSlide}
            title="Previous chapter (live)"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => void goChapter('next')}
            disabled={navigating || !previewSlide}
            title="Next chapter (live)"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      }
      bodyClassName="bg-black flex flex-col overflow-hidden"
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
                : 'bg-black/60 border-border text-muted-foreground hover:text-foreground hover:border-border',
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
            // v0.5.51 — wrap the rendered slide in a StableStage so
            // the bible text stays still (and keeps every alignment)
            // while the operator drags the column splitter between
            // Preview and the panels next to it. Inside StableStage
            // the stage is always 1920×1080 and only a GPU transform
            // is animated on resize — text never reflows mid-drag.
            <StableStage>
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
            </StableStage>
          ) : (
            <div className="text-center text-[11px] text-muted-foreground">
              <BookOpen className="h-8 w-8 mx-auto opacity-30 mb-2" />
              Nothing in preview yet
            </div>
          )}
        </div>
      </div>
      {/* Symmetry strip — mirrors Live Display's always-visible
          bottom transport row (Mic / Vol / Prev / Go Live / Next) so
          both cards reserve the same vertical real estate. Without
          this, the Preview body has more room than Live Display and
          the 16:9 stages render at different sizes side-by-side.
          Operators specifically asked for the two stages to be
          visual twins so they can A/B compare what's queued vs
          what's live without optical illusions. Kept content-light
          (just chapter prev/next mirrors plus a spacer) since the
          authoritative chapter nav already lives in the header — we
          just need the height. */}
      <div
        className="border-t border-border/60 px-3 py-2 flex items-center justify-end gap-3 bg-card/30 shrink-0"
        aria-hidden="true"
        role="presentation"
      >
        <div className="h-7" />
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
    <div className="flex items-center gap-2 border-t border-border/70 px-2 py-1.5 shrink-0">
      <Button
        size="sm"
        variant="secondary"
        className="h-7 w-7 p-0 shrink-0"
        onClick={paused ? onPlay : onPause}
        title={paused ? 'Play' : 'Pause'}
      >
        {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
      </Button>
      <span className="text-[10px] font-mono text-muted-foreground w-9 text-right tabular-nums">
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
      <span className="text-[10px] font-mono text-muted-foreground w-9 tabular-nums">
        {fmt(duration)}
      </span>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// LIVE DISPLAY — bottom-right audio controls
// ──────────────────────────────────────────────────────────────────────
// Compact mic popover (Start/Stop + Pause + Mic-Gain) and master-
// volume popover that live in the Live Display footer. Operators
// specifically asked for full mic transport reachable from the live
// pane (v0.5.30 update to item #10) so they don't have to jump to
// the Live Transcription card mid-service.
function LiveBottomAudioControls() {
  const isListening = useAppStore((s) => s.isListening)
  const speechSupported = useAppStore((s) => s.speechSupported)
  const setSpeechCommand = useAppStore((s) => s.setSpeechCommand)
  const globalVolume = useAppStore((s) => s.globalVolume)
  const setGlobalVolume = useAppStore((s) => s.setGlobalVolume)
  const globalMuted = useAppStore((s) => s.globalMuted)
  const setGlobalMuted = useAppStore((s) => s.setGlobalMuted)
  // v0.5.30 — mic gain / pause controls.
  const micGain = useAppStore((s) => s.micGain)
  const setMicGain = useAppStore((s) => s.setMicGain)
  const micPaused = useAppStore((s) => s.micPaused)
  const setMicPaused = useAppStore((s) => s.setMicPaused)
  const pct = Math.round(globalVolume * 100)
  const micPct = Math.round(micGain * 100)
  const effectivelyMuted = globalMuted || globalVolume === 0

  // v0.5.57 — operator wants the mic popover to auto-collapse when
  // they pick a transport action (Start / Pause / Stop) so it doesn't
  // sit open over the Live Display covering the next verse. Made the
  // Popover controlled and close it from each handler.
  const [micPopoverOpen, setMicPopoverOpen] = useState(false)

  const startMic = () => {
    if (!speechSupported) {
      toast.error('Speech recognition is not supported in this browser')
      return
    }
    setMicPaused(false)
    setSpeechCommand('start')
    setMicPopoverOpen(false)
  }
  const stopMic = () => {
    setMicPaused(false)
    setSpeechCommand('stop')
    setMicPopoverOpen(false)
  }
  const togglePause = () => {
    setMicPaused(!micPaused)
    setMicPopoverOpen(false)
  }

  // Status copy + colour for the trigger button so an operator can
  // tell at a glance: green/dot = listening, amber = paused, grey =
  // off.  We keep the same compact button footprint as before; the
  // popover holds the Start / Stop / Pause / Gain controls.
  const micState: 'off' | 'paused' | 'listening' = !isListening
    ? 'off'
    : micPaused
      ? 'paused'
      : 'listening'
  const micLabel = micState === 'off' ? 'Mic' : micState === 'paused' ? 'Paused' : 'Live'
  const MicIcon = micState === 'listening' ? Mic : MicOff

  return (
    <div className="flex items-center gap-1 mr-1">
      <Popover open={micPopoverOpen} onOpenChange={setMicPopoverOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            title={
              micState === 'off'
                ? 'Open mic controls — start, pause and adjust loudness'
                : micState === 'paused'
                  ? 'Mic is paused — open controls to resume'
                  : `Mic is live (gain ${micPct}%) — open controls to pause/stop`
            }
            className={cn(
              'h-7 px-2 rounded-md border text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1.5 transition-colors',
              micState === 'listening'
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/50'
                : micState === 'paused'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                  : 'bg-black/40 text-muted-foreground border-border hover:text-foreground hover:border-border',
            )}
          >
            <MicIcon className="h-3 w-3" />
            {micLabel}
            {micState === 'listening' && (
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse" />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          side="top"
          className="w-[260px] p-3 bg-background border-border"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
              Mic Control
            </span>
            <Badge
              className={cn(
                'h-4 px-1.5 text-[9px] uppercase tracking-wider font-semibold border',
                micState === 'listening'
                  ? 'bg-rose-500/15 text-rose-300 border-rose-500/40 animate-pulse'
                  : micState === 'paused'
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                    : 'bg-muted text-muted-foreground border-border',
              )}
            >
              {micState === 'listening' ? '● Live' : micState === 'paused' ? 'Paused' : 'Off'}
            </Badge>
          </div>
          {/* Transport: Start / Pause-Resume / Stop */}
          <div className="grid grid-cols-3 gap-1.5 mb-3">
            <button
              onClick={startMic}
              disabled={isListening && !micPaused}
              className={cn(
                'h-7 rounded text-[10px] uppercase tracking-wider font-semibold border inline-flex items-center justify-center gap-1',
                isListening && !micPaused
                  ? 'bg-card text-muted-foreground border-border cursor-not-allowed'
                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30',
              )}
              title="Start microphone"
            >
              <Mic className="h-3 w-3" />
              Start
            </button>
            <button
              onClick={togglePause}
              disabled={!isListening}
              className={cn(
                'h-7 rounded text-[10px] uppercase tracking-wider font-semibold border inline-flex items-center justify-center gap-1',
                !isListening
                  ? 'bg-card text-muted-foreground border-border cursor-not-allowed'
                  : micPaused
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30',
              )}
              title={micPaused ? 'Resume microphone' : 'Pause microphone (recorder stays open)'}
            >
              {micPaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
              {micPaused ? 'Resume' : 'Pause'}
            </button>
            <button
              onClick={stopMic}
              disabled={!isListening}
              className={cn(
                'h-7 rounded text-[10px] uppercase tracking-wider font-semibold border inline-flex items-center justify-center gap-1',
                !isListening
                  ? 'bg-card text-muted-foreground border-border cursor-not-allowed'
                  : 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30',
              )}
              title="Stop microphone (release the input device)"
            >
              <Square className="h-3 w-3" />
              Stop
            </button>
          </div>
          {/* Mic gain slider — boosts a quiet lapel mic or attenuates
              a hot pulpit mic without leaving the app. 0..200%, 100%
              is unity. Mirrored into a Web Audio GainNode so the
              recording stream changes loudness in real time without
              restarting the recorder. */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
              Mic Gain
            </span>
            <span className="text-[10px] tabular-nums text-foreground font-semibold">{micPct}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={200}
            value={micPct}
            onChange={(e) => setMicGain(Number(e.target.value) / 100)}
            className="w-full accent-rose-500 mt-1"
            aria-label="Microphone gain"
          />
          <div className="flex justify-between mt-1 text-[9px] text-muted-foreground tabular-nums">
            <span>0</span>
            <button
              type="button"
              onClick={() => setMicGain(1)}
              className="hover:text-foreground underline-offset-2 hover:underline"
              title="Reset mic gain to 100%"
            >
              100%
            </button>
            <span>200</span>
          </div>
          <p className="mt-2 text-[9px] text-muted-foreground leading-snug">
            Pause keeps the mic open but stops sending audio for transcription.
            Stop releases the input entirely.
          </p>
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            title={`Master volume: ${effectivelyMuted ? 'muted' : pct + '%'}`}
            className={cn(
              'h-7 px-2 rounded-md border text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1.5 transition-colors',
              effectivelyMuted
                ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                : 'bg-black/40 text-foreground border-border hover:text-foreground hover:border-border',
            )}
          >
            {effectivelyMuted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
            <span className="tabular-nums">{effectivelyMuted ? 'Muted' : `${pct}%`}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          side="top"
          className="w-[220px] p-3 bg-background border-border"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
              Master Volume
            </span>
            <button
              onClick={() => setGlobalMuted(!globalMuted)}
              className={cn(
                'inline-flex items-center gap-1 px-1.5 h-5 rounded text-[10px] font-semibold border',
                globalMuted
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  : 'bg-muted text-foreground border-border hover:bg-muted',
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
          <div className="flex justify-between mt-1 text-[9px] text-muted-foreground tabular-nums">
            <span>0</span>
            <span>{pct}%</span>
            <span>100</span>
          </div>
          <p className="mt-2 text-[9px] text-muted-foreground leading-snug">
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
          <Badge className="h-4 px-1.5 text-[9px] uppercase tracking-wider font-semibold bg-muted text-muted-foreground border border-border">
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
                ? 'bg-muted text-foreground border-border'
                : 'bg-transparent text-muted-foreground border-transparent hover:text-foreground',
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
                : 'bg-transparent text-muted-foreground border-transparent hover:text-foreground',
            )}
            title="Auto-advance preview to live as new verses are detected"
          >
            Auto
          </button>
        </div>
      }
      bodyClassName="bg-black overflow-hidden"
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
              // v0.5.51 — StableStage replaces the previous bare
              // transform-scale wrapper. The user-supplied SIZE
              // slider value (`actualSize`) is now multiplied on top
              // of the auto-fit-to-column scale, so the slider still
              // works exactly as before AND the bible text stays
              // perfectly still while the operator drags the column
              // splitter (no font-size jitter, no word-wrap shifts,
              // no alignment drift mid-drag). The on-air red ring is
              // moved to StableStage's outer (device-pixel sized) so
              // it stays a crisp 2px border on narrow columns rather
              // than getting scaled to sub-pixel thickness with the
              // slide.
              <StableStage scale={actualSize} isLive={!!liveSlide}>
                <SlideThumb
                  slide={slide}
                  themeKey={liveSlide?.background || settings.congregationScreenTheme}
                  isLive={!!liveSlide}
                  size="lg"
                  settings={settings}
                />
              </StableStage>
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
            // v0.5.51 — same StableStage wrap as the full-screen
            // branch above, applied to the lower-third composite
            // path. Without this, dragging the column splitter
            // re-evaluated `cqw`/`cqh` inside the LT bar every
            // frame and the bible text inside the bar would jiggle
            // and re-wrap as the column width changed. Now the LT
            // bar lives inside a 1920×1080 reference stage that is
            // simply scaled by transform — text is frozen. The
            // small "Lower Third · bottom" reference badge is
            // hoisted out via the `overlay` prop so it stays
            // readable at the column's real pixel size instead of
            // shrinking with the rest of the stage.
            <StableStage
              scale={actualSize}
              isLive={!!liveSlide}
              overlay={
                <div className="absolute top-1 left-1 z-10">
                  <Badge className="text-[8px] px-1 py-0 font-bold uppercase tracking-wider border-0 bg-sky-600 text-white">
                    {isBlackBackdrop ? 'L/3 · Black · ' : 'Lower Third · '}
                    {ltPos}
                  </Badge>
                </div>
              }
            >
              <div className="relative w-full aspect-video bg-black overflow-hidden ring-1 ring-border">
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
                {/* v0.5.51 — the Lower-Third reference badge that
                    used to live here was hoisted into StableStage's
                    `overlay` slot above so it renders OUTSIDE the
                    GPU-scaled inner stage and stays readable at any
                    column width. */}
              </div>
            </StableStage>
          )
        })()}
        {hidden && (
          <div className="text-center text-[11px] text-muted-foreground">
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
                : 'bg-black/60 border-border text-muted-foreground hover:text-foreground hover:border-border',
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
                : 'bg-black/60 border-border text-muted-foreground hover:text-foreground hover:border-border',
            )}
          >
            <Headphones className="h-3 w-3" />
            {!liveMonitorAudio && (
              <span className="absolute inset-x-1 h-px bg-current rotate-45" />
            )}
          </button>
        </div>
      </div>

      <div className="border-t border-border/60 px-3 py-2 flex items-center justify-end gap-3 bg-card/30 shrink-0">
        {/* Mic toggle + master-volume control. Operators asked for
            these to live at the right-bottom of the Live Display so
            they're reachable without leaving the live pane. The mic
            button drives the same `setSpeechCommand` action the Live
            Transcription card uses; the volume popover wraps the
            global master volume the slide renderer already honours. */}
        <LiveBottomAudioControls />
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onPrev} className="h-7 w-7 text-foreground hover:text-foreground border border-border">
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
                ? 'bg-muted hover:bg-muted-foreground/40 border border-rose-500/60'
                : 'bg-rose-600 hover:bg-rose-700',
            )}
          >
            {isLive ? <Square className="h-3 w-3 fill-white" /> : <Send className="h-3 w-3" />}
            {isLive ? 'Stop Live' : 'Go Live'}
          </Button>
          <Button variant="ghost" size="icon" onClick={onNext} className="h-7 w-7 text-foreground hover:text-foreground border border-border">
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {/* Live transport row — Pause/Play for the currently-on-air
          video. Lives BELOW the Live Display body so the operator
          interrupts the live feed from the same column they sent it
          from. Hidden for non-video slides. */}
      {liveIsMediaVideo && (
        <div className="flex items-center justify-center gap-2 border-t border-border/70 px-2 py-1.5 shrink-0">
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
              <div className="text-center py-6 text-[11px] text-muted-foreground">
                <History className="h-7 w-7 mx-auto opacity-40 mb-2" />
                Verses you look up or detect will show here.
              </div>
            ) : (
              verseHistory.map((v, i) => (
                <button
                  key={`${v.reference}-${i}`}
                  onClick={() => sendVerseFromHistory(v, false)}
                  onDoubleClick={() => sendVerseFromHistory(v, true)}
                  className="w-full text-left rounded border border-border/70 bg-card/40 hover:border-sky-500/40 hover:bg-card px-2 py-1.5 transition-colors group select-none"
                  title="Click → Preview · Double-click → Go Live"
                >
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-[10px] font-semibold text-sky-300 truncate">{v.reference}</span>
                    <span className="text-[9px] text-muted-foreground uppercase">{v.translation}</span>
                  </div>
                  <p className="text-[11px] text-foreground line-clamp-2 leading-snug">{v.text}</p>
                </button>
              ))
            )
          ) : schedule.length === 0 ? (
            <div className="text-center py-6 text-[11px] text-muted-foreground">
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
                      : 'border-border/70 bg-card/40 hover:border-border',
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
                          selected ? 'bg-amber-500 text-black' : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {i + 1}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{item.type}</span>
                    </div>
                    <p className={cn('text-[11px] truncate', selected ? 'text-white font-semibold' : 'text-foreground')}>
                      {item.title}
                    </p>
                  </button>
                  <button
                    onClick={() => removeScheduleItem(item.id)}
                    className="text-muted-foreground hover:text-rose-400 p-1"
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
          <span className="text-[9px] uppercase tracking-widest text-muted-foreground">Reference</span>
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
    detectedVerseCandidates,
    clearDetectedVerseCandidates,
    promoteDetectedVerseCandidate,
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

  // v0.7.60 — Shared row renderer for both the LIVE column and the
  // CANDIDATES column. The only behavioural difference between the
  // two is the click target: in CANDIDATES, click PROMOTES (moves
  // the row over to the live column with a forced 0.50 confidence)
  // — it does NOT push to the projector. Operator must then
  // single-click the promoted row to schedule, or double-click to
  // go live. This guarantees no <50% suggestion ever reaches the
  // congregation screen automatically.
  const renderRow = (v: typeof detectedVerses[number], i: number, kind: 'live' | 'candidate') => {
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
            : 'bg-muted-foreground/40'
    const labelColor =
      tier === 'green'
        ? 'text-emerald-300'
        : tier === 'yellow'
          ? 'text-yellow-300'
          : tier === 'red'
            ? 'text-rose-300'
            : 'text-muted-foreground'
    const isCandidate = kind === 'candidate'
    return (
      <div
        key={`${kind}-${v.reference}-${i}`}
        onClick={() => {
          if (isCandidate) {
            // Promote candidate → live-eligible bucket. Does NOT
            // touch the projector — operator still needs to click
            // it again in the LIVE column to schedule, or double-
            // click to go live. This is the explicit confirmation
            // step the spec demands.
            promoteDetectedVerseCandidate(v.id)
            requestNavigatorRef(v.reference)
          } else {
            sendDetected(v, false)
            requestNavigatorRef(v.reference)
          }
        }}
        onDoubleClick={() => {
          if (isCandidate) {
            // Two-step promote+schedule on double-click of a
            // candidate. Still does NOT auto-live (per spec).
            promoteDetectedVerseCandidate(v.id)
            sendDetected({ ...v, confidence: Math.max(0.5, v.confidence) }, false)
            requestNavigatorRef(v.reference)
          } else {
            sendDetected(v, true)
          }
        }}
        className={cn(
          'rounded border px-2 py-1.5 cursor-pointer transition-colors select-none',
          isCandidate
            ? 'border-rose-500/30 bg-rose-500/5 hover:border-rose-400/60 hover:bg-rose-500/10'
            : 'border-border/70 bg-card/40 hover:border-emerald-500/40 hover:bg-card',
        )}
        title={
          isCandidate
            ? `Low-confidence suggestion (${pct}%). Click → promote to LIVE column · Double-click → promote + schedule. Never auto-live.`
            : `Click → schedule + open in Chapter Navigator · Double-click → live · Detection accuracy: ${pct}%`
        }
      >
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className={cn(
            'text-[10px] font-semibold',
            isCandidate ? 'text-rose-300' : 'text-emerald-300',
          )}>
            {v.reference}
          </span>
          <span className="text-[9px] text-muted-foreground uppercase">{v.translation}</span>
        </div>
        <p className="text-[11px] text-foreground line-clamp-2 leading-snug">{v.text}</p>
        <div className="mt-1.5 flex items-center gap-1.5">
          <div className="flex-1 h-1 rounded-full bg-muted/80 overflow-hidden">
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
  }

  const totalCount = detectedVerses.length + detectedVerseCandidates.length

  return (
    <Card
      title="Detected Verses"
      badge={
        totalCount > 0 ? (
          <Badge className="h-4 px-1.5 text-[9px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/40">
            {totalCount}
          </Badge>
        ) : null
      }
      actions={
        totalCount > 0 ? (
          <button
            onClick={() => {
              clearDetectedVerses()
              clearDetectedVerseCandidates()
            }}
            className="text-[10px] text-muted-foreground hover:text-foreground uppercase tracking-wider"
          >
            Clear
          </button>
        ) : null
      }
    >
      {/* v0.7.60 — Two-column split: LIVE (≥50%, auto-live eligible)
          on the left, CANDIDATES (20–49%, operator-promote-only) on
          the right. Each column scrolls independently so a busy
          candidates list can't push live detections off-screen. */}
      <div className="flex-1 min-h-0 grid grid-cols-2 gap-1 overflow-hidden">
        {/* LIVE column — ≥50% confidence */}
        <div className="flex flex-col min-h-0 border-r border-border/50">
          <div className="px-2 py-1 flex items-center justify-between bg-emerald-500/5 border-b border-emerald-500/20 sticky top-0 z-10">
            <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-300">
              Live (≥50%)
            </span>
            <span className="text-[9px] font-mono tabular-nums text-muted-foreground">
              {detectedVerses.length}
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="p-1.5 space-y-1.5">
              {detectedVerses.length === 0 ? (
                <div className="text-center py-6 text-[10px] text-muted-foreground">
                  <Mic className="h-5 w-5 mx-auto opacity-40 mb-1.5" />
                  Live-eligible detections appear here.
                </div>
              ) : (
                detectedVerses.map((v, i) => renderRow(v, i, 'live'))
              )}
            </div>
          </div>
        </div>

        {/* CANDIDATES column — 20–49% confidence, operator promotes manually */}
        <div className="flex flex-col min-h-0">
          <div className="px-2 py-1 flex items-center justify-between bg-rose-500/5 border-b border-rose-500/20 sticky top-0 z-10">
            <span className="text-[9px] font-bold uppercase tracking-wider text-rose-300">
              Candidates (20–49%)
            </span>
            <span className="text-[9px] font-mono tabular-nums text-muted-foreground">
              {detectedVerseCandidates.length}
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="p-1.5 space-y-1.5">
              {detectedVerseCandidates.length === 0 ? (
                <div className="text-center py-6 text-[10px] text-muted-foreground">
                  Low-confidence guesses land here. Click to promote.
                </div>
              ) : (
                detectedVerseCandidates.map((v, i) => renderRow(v, i, 'candidate'))
              )}
            </div>
          </div>
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
  brokenIds,
  onItemClick,
  onRemove,
  onBroken,
}: {
  items: MediaItem[]
  mode: MediaViewModeId
  selectedId: string | null
  stagedItemId: string | null
  // Set of item ids whose underlying file failed to load mid-session.
  // Such tiles render a "missing" placeholder + a prominent Remove
  // affordance, and their click handler is no-op'd in the parent so
  // the operator can't accidentally stage a dead file on air.
  brokenIds: ReadonlySet<string>
  onItemClick: (m: MediaItem) => void
  onRemove: (id: string) => void
  onBroken: (id: string) => void
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
          const broken = brokenIds.has(m.id)
          return (
            <div
              key={m.id}
              onClick={() => onItemClick(m)}
              className={cn(
                'group relative rounded border bg-background overflow-hidden cursor-pointer transition-colors',
                broken
                  ? 'border-rose-500/50 ring-1 ring-rose-500/30'
                  : active
                  ? 'border-fuchsia-500/60 ring-1 ring-fuchsia-500/40'
                  : 'border-border hover:border-border',
              )}
              title={
                broken
                  ? 'File missing on disk — remove this entry'
                  : staged
                  ? 'Click again to send to live'
                  : 'Click to replace preview with this media'
              }
            >
              <div className="aspect-video bg-black flex items-center justify-center">
                {broken ? (
                  <div className="flex flex-col items-center gap-1 text-rose-400">
                    <ImageOff className="h-5 w-5" />
                    <span className="text-[8px] uppercase tracking-wider font-bold">File missing</span>
                  </div>
                ) : m.kind === 'video' ? (
                  <video
                    src={m.url}
                    muted
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-contain"
                    onError={() => onBroken(m.id)}
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.url}
                    alt={m.name}
                    decoding="async"
                    className="w-full h-full object-contain"
                    onError={() => onBroken(m.id)}
                  />
                )}
              </div>
              <div className="absolute inset-x-0 bottom-0 px-1.5 py-1 bg-gradient-to-t from-black/80 to-transparent flex items-center gap-1">
                {m.kind === 'video' ? (
                  <Film className="h-2.5 w-2.5 text-fuchsia-300 shrink-0" />
                ) : (
                  <ImageIcon className="h-2.5 w-2.5 text-fuchsia-300 shrink-0" />
                )}
                <span className={cn('text-foreground truncate', labelSize)}>
                  {m.name}
                </span>
              </div>
              {staged && (
                <div className="absolute top-1 left-1 text-[8px] uppercase tracking-wider font-bold px-1 py-0.5 rounded bg-amber-500/80 text-black">
                  In Preview
                </div>
              )}
              <div className="absolute top-1 right-1 flex gap-1">
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-6 w-6 p-0 shadow-md ring-1 ring-rose-700/60"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemove(m.id)
                  }}
                  title="Remove"
                >
                  <Trash2 className="h-3 w-3" />
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
          const broken = brokenIds.has(m.id)
          return (
            <div
              key={m.id}
              onClick={() => onItemClick(m)}
              className={cn(
                'group relative flex items-center gap-2 rounded border bg-background overflow-hidden cursor-pointer transition-colors p-1.5',
                broken
                  ? 'border-rose-500/50 ring-1 ring-rose-500/30'
                  : active
                  ? 'border-fuchsia-500/60 ring-1 ring-fuchsia-500/40'
                  : 'border-border hover:border-border',
              )}
            >
              <div className="w-12 h-12 shrink-0 bg-black flex items-center justify-center rounded overflow-hidden">
                {broken ? (
                  <ImageOff className="h-5 w-5 text-rose-400" />
                ) : m.kind === 'video' ? (
                  <video
                    src={m.url}
                    muted
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-cover"
                    onError={() => onBroken(m.id)}
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.url}
                    alt={m.name}
                    decoding="async"
                    className="w-full h-full object-cover"
                    onError={() => onBroken(m.id)}
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-foreground truncate font-medium">
                  {m.name}
                </div>
                <div className="text-[9px] text-muted-foreground flex items-center gap-1">
                  {m.kind === 'video' ? (
                    <Film className="h-2.5 w-2.5 text-fuchsia-300" />
                  ) : (
                    <ImageIcon className="h-2.5 w-2.5 text-fuchsia-300" />
                  )}
                  {m.kind === 'video' ? 'Video' : 'Image'}
                  {broken ? (
                    <span className="ml-1 px-1 rounded bg-rose-600/80 text-white uppercase tracking-wider font-bold text-[8px]">
                      Missing
                    </span>
                  ) : staged && (
                    <span className="ml-1 px-1 rounded bg-amber-500/80 text-black uppercase tracking-wider font-bold text-[8px]">
                      In Preview
                    </span>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant="destructive"
                className="h-7 w-7 p-0 shrink-0 shadow-md ring-1 ring-rose-700/60"
                onClick={(e) => {
                  e.stopPropagation()
                  onRemove(m.id)
                }}
                title="Remove"
              >
                <Trash2 className="h-3.5 w-3.5" />
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
          const broken = brokenIds.has(m.id)
          return (
            <button
              type="button"
              key={m.id}
              onClick={() => onItemClick(m)}
              className={cn(
                'group flex items-center gap-2 px-1.5 py-1 rounded text-left transition-colors',
                broken
                  ? 'bg-rose-500/10 text-rose-300'
                  : active
                  ? 'bg-fuchsia-500/15 text-fuchsia-200'
                  : 'text-foreground hover:bg-card',
              )}
            >
              {broken ? (
                <ImageOff className="h-3 w-3 text-rose-400 shrink-0" />
              ) : m.kind === 'video' ? (
                <Film className="h-3 w-3 text-fuchsia-300 shrink-0" />
              ) : (
                <ImageIcon className="h-3 w-3 text-fuchsia-300 shrink-0" />
              )}
              <span className={cn('text-[10px] truncate flex-1', broken && 'line-through opacity-70')}>{m.name}</span>
              {broken ? (
                <span className="text-[8px] uppercase tracking-wider font-bold px-1 rounded bg-rose-600/80 text-white">
                  Missing
                </span>
              ) : staged && (
                <span className="text-[8px] uppercase tracking-wider font-bold px-1 rounded bg-amber-500/80 text-black">
                  Preview
                </span>
              )}
              <Trash2
                className="h-5 w-5 shrink-0 box-content p-0.5 rounded bg-rose-500/15 ring-1 ring-rose-700/50 text-rose-400 hover:bg-rose-500/30 hover:text-rose-200 transition-colors"
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
      <div className="grid grid-cols-[1fr_5rem_4rem_2rem] gap-2 px-1.5 py-1 border-b border-border text-muted-foreground uppercase tracking-wider text-[9px] font-semibold">
        <span>Name</span>
        <span>Type</span>
        <span>Size</span>
        <span></span>
      </div>
      {items.map((m) => {
        const active = m.id === selectedId
        const staged = m.id === stagedItemId
        const broken = brokenIds.has(m.id)
        return (
          <button
            type="button"
            key={m.id}
            onClick={() => onItemClick(m)}
            className={cn(
              'group w-full grid grid-cols-[1fr_5rem_4rem_2rem] gap-2 px-1.5 py-1 items-center text-left transition-colors',
              broken
                ? 'bg-rose-500/10 text-rose-300'
                : active
                ? 'bg-fuchsia-500/15 text-fuchsia-200'
                : 'text-foreground hover:bg-card',
            )}
          >
            <span className="flex items-center gap-1.5 truncate">
              {broken ? (
                <ImageOff className="h-3 w-3 text-rose-400 shrink-0" />
              ) : m.kind === 'video' ? (
                <Film className="h-3 w-3 text-fuchsia-300 shrink-0" />
              ) : (
                <ImageIcon className="h-3 w-3 text-fuchsia-300 shrink-0" />
              )}
              <span className={cn('truncate', broken && 'line-through opacity-70')}>{m.name}</span>
              {broken ? (
                <span className="text-[8px] uppercase tracking-wider font-bold px-1 rounded bg-rose-600/80 text-white shrink-0">
                  Missing
                </span>
              ) : staged && (
                <span className="text-[8px] uppercase tracking-wider font-bold px-1 rounded bg-amber-500/80 text-black shrink-0">
                  Preview
                </span>
              )}
            </span>
            <span className="text-muted-foreground truncate">
              {m.kind === 'video' ? 'Video' : 'Image'}
            </span>
            <span className="text-muted-foreground truncate">{formatSize(m.size)}</span>
            <Trash2
              className="h-5 w-5 shrink-0 box-content p-0.5 rounded bg-rose-500/15 ring-1 ring-rose-700/50 text-rose-400 hover:bg-rose-500/30 hover:text-rose-200 transition-colors"
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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Tracks whether the current preview slide originated from this media
  // panel for the selected item — used to gate the "first click previews,
  // second click goes live" interaction.
  const [stagedItemId, setStagedItemId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadPct, setUploadPct] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  // Item #16 — items + per-item fit live in the persisted Zustand
  // store so they survive an app restart. The Media panel used to
  // hold these in component state, which meant every restart of the
  // Electron app emptied the library and the operator had to
  // re-upload all their service videos. Now they're keyed off
  // `mediaLibrary` / `mediaFitById` and rehydrated from localStorage
  // automatically by zustand/persist.
  const {
    setSlides,
    setLiveSlideIndex,
    setIsLive,
    setPreviewSlideIndex,
    setHasShownContent,
    mediaViewMode,
    setMediaViewMode,
    mediaLibrary,
    setMediaLibrary,
    addMediaLibraryItem,
    removeMediaLibraryItem,
    mediaFitById,
    setMediaFit,
  } = useAppStore()
  const items = mediaLibrary
  const fitById = mediaFitById as Record<string, MediaFit>

  // Track items whose file failed to load mid-session — populated
  // by <video>/<img> onError handlers in the grid below. We keep the
  // entries in the library (so the operator sees them and can
  // explicitly remove them) but render them with a "Missing" badge
  // and refuse to stage them on air.
  const [brokenIds, setBrokenIds] = useState<ReadonlySet<string>>(new Set())
  const markBroken = useCallback((id: string) => {
    setBrokenIds((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  // On mount, ask the server which uploads still exist on disk and
  // prune any persisted entries whose underlying file is gone (e.g.
  // the file was lost when an older build wrote uploads under the
  // install dir and the auto-updater wiped them, or the operator
  // cleared %APPDATA%/scripture-live-ai/uploads). Anything still on
  // disk stays — we never synthesise placeholder names for files we
  // don't recognise so the grid stays clean. When we DO drop entries,
  // the operator gets a single explanatory toast so the shrunken
  // library doesn't look like a bug.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/upload?list=1', { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as { files?: string[] }
        const onDisk = new Set(data.files || [])
        if (cancelled) return
        const surviving = mediaLibrary.filter((m) => {
          const m2 = m.url.match(/[?&]file=([^&]+)/)
          const fname = m2 ? decodeURIComponent(m2[1]) : ''
          return !fname || onDisk.has(fname)
        })
        const dropped = mediaLibrary.length - surviving.length
        if (dropped > 0) {
          setMediaLibrary(surviving)
          toast.info(
            dropped === 1
              ? 'Removed 1 media item whose file was no longer on disk.'
              : `Removed ${dropped} media items whose files were no longer on disk.`,
            { duration: 6000 },
          )
        }
      } catch {
        /* offline first launch — keep persisted entries as-is */
      }
    })()
    return () => { cancelled = true }
    // Run once on mount; we don't want this to re-fire every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        // Persist into the store so each upload survives a restart.
        for (const it of added) addMediaLibraryItem(it)
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
  //
  // Broken items are refused at the door so the operator can never
  // accidentally cue a missing file on air. We do TWO checks:
  //   (a) the cached `brokenIds` set populated by thumbnail onError
  //       handlers in grid/tiles modes — instant rejection, no
  //       network round-trip.
  //   (b) a fresh HEAD probe to /api/upload?file=… — covers list and
  //       details modes (no thumbnails to error out earlier) AND the
  //       race where a file vanished after a successful thumbnail
  //       load. The probe hits the loopback Next server inside
  //       Electron so it's sub-millisecond.
  const onItemClick = useCallback(
    async (item: MediaItem) => {
      if (brokenIds.has(item.id)) {
        toast.error(
          `${item.name} can't be played — its file is missing. Remove it and re-upload.`,
        )
        return
      }
      // Pre-stage existence probe. Network errors are treated as
      // "probably fine" — the slide-renderer and SSE broadcast will
      // surface a real failure if the asset is genuinely gone, and
      // we'd rather not block a cue on a transient blip.
      try {
        const probe = await fetch(item.url, { method: 'HEAD', cache: 'no-store' })
        if (!probe.ok) {
          // Only the explicit 404 means "the file is gone for good" —
          // mark it broken so subsequent clicks fail instantly without
          // another round-trip. For other non-2xx statuses (transient
          // 5xx, 403, etc.) we still refuse the cue but don't poison
          // the entry permanently.
          if (probe.status === 404) markBroken(item.id)
          toast.error(
            probe.status === 404
              ? `${item.name} can't be played — its file is missing. Remove it and re-upload.`
              : `${item.name} can't be played right now (server returned ${probe.status}). Try again or re-upload.`,
          )
          return
        }
      } catch {
        /* probe failed — proceed; downstream will catch a real error */
      }
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
      brokenIds,
      markBroken,
    ]
  )

  const remove = useCallback((id: string) => {
    removeMediaLibraryItem(id)
    setSelectedId((cur) => (cur === id ? null : cur))
    setStagedItemId((cur) => (cur === id ? null : cur))
  }, [removeMediaLibraryItem])

  // Push a fit/aspect-ratio change for the selected item back through
  // the preview/live state so the operator sees it instantly on every
  // surface (Preview, Live Display, secondary screen, NDI). Re-emits
  // the slide rather than mutating in place so the SSE broadcast
  // notices the change and downstream renderers re-resolve their
  // object-fit / aspect-ratio.
  const updateFit = useCallback(
    (item: MediaItem, fit: MediaFit) => {
      setMediaFit(item.id, fit)
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
      setMediaFit,
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
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border/70 shrink-0">
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
        <div className="grid grid-cols-2 gap-2 px-2 py-1.5 border-b border-border/70 shrink-0 text-[10px] text-foreground">
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground uppercase tracking-wider text-[9px] font-semibold">
              Fit
            </span>
            <select
              value={fitById[selectedItem.id] || 'fit'}
              onChange={(e) => updateFit(selectedItem, e.target.value as MediaFit)}
              className="h-6 rounded bg-card border border-border px-1.5 text-[10px] text-foreground focus:outline-none focus:ring-1 focus:ring-fuchsia-500/50"
            >
              <option value="fit">Fit (original)</option>
              <option value="fill">Fill (cover)</option>
              <option value="stretch">Stretch</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted-foreground uppercase tracking-wider text-[9px] font-semibold">
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
              className="h-6 rounded bg-card border border-border px-1.5 text-[10px] text-foreground focus:outline-none focus:ring-1 focus:ring-fuchsia-500/50"
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
            className="flex flex-col items-center justify-center h-full text-center text-[10px] text-muted-foreground gap-2 border border-dashed border-border rounded cursor-pointer hover:border-border hover:text-muted-foreground transition-colors py-6"
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
            brokenIds={brokenIds}
            onItemClick={onItemClick}
            onRemove={remove}
            onBroken={markBroken}
          />
        )}
      </div>

      {selectedItem && (
        <div className="border-t border-border/70 px-2 py-1.5 shrink-0">
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

  // v0.6.4 — drop the hardcoded `dark` class and the literal
  // `bg-[#0a0d14]` color from the root shell div. They were
  // force-pinning the entire console to dark mode regardless of the
  // operator's theme preference (the Settings overlay flipped because
  // it lives outside this tree, but the live console stayed dark).
  // Use the semantic `bg-background` / `text-foreground` tokens so the
  // next-themes class on <html> cascades correctly into both themes.
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background text-foreground">
      <TopToolbar outputActive={outputActive} toggleOutput={toggleOutput} />

      {/* Main workspace — broadcast-style draggable dividers between every
          panel. react-resizable-panels persists sizes per autoSaveId so
          the operator's layout survives restarts. */}
      <div className="flex-1 min-h-0 p-2 overflow-hidden">
        <ResizablePanelGroup
          direction="vertical"
          autoSaveId="logos-shell-rows"
          className="gap-0"
        >
          <ResizablePanel defaultSize={52} minSize={25}>
            <ResizablePanelGroup
              direction="horizontal"
              autoSaveId="logos-shell-top-cols"
              className="gap-0"
            >
              <ResizablePanel defaultSize={22} minSize={12} className="pr-1 pb-1">
                <LiveTranscriptionCard />
              </ResizablePanel>
              <ResizableHandle withHandle className="bg-transparent hover:bg-muted/40 transition-colors" />
              <ResizablePanel defaultSize={28} minSize={15} className="px-1 pb-1">
                <PreviewCard />
              </ResizablePanel>
              <ResizableHandle withHandle className="bg-transparent hover:bg-muted/40 transition-colors" />
              <ResizablePanel defaultSize={28} minSize={15} className="px-1 pb-1">
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
              </ResizablePanel>
              <ResizableHandle withHandle className="bg-transparent hover:bg-muted/40 transition-colors" />
              <ResizablePanel defaultSize={22} minSize={12} className="pl-1 pb-1">
                <ScriptureFeedCard />
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
          <ResizableHandle withHandle className="bg-transparent hover:bg-muted/40 transition-colors" />
          <ResizablePanel defaultSize={48} minSize={20}>
            <ResizablePanelGroup
              direction="horizontal"
              autoSaveId="logos-shell-bottom-cols"
              className="gap-0"
            >
              <ResizablePanel defaultSize={33} minSize={15} className="pr-1 pt-1">
                <ChapterNavigatorCard />
              </ResizablePanel>
              <ResizableHandle withHandle className="bg-transparent hover:bg-muted/40 transition-colors" />
              <ResizablePanel defaultSize={33} minSize={15} className="px-1 pt-1">
                <DetectedVersesCard />
              </ResizablePanel>
              <ResizableHandle withHandle className="bg-transparent hover:bg-muted/40 transition-colors" />
              <ResizablePanel defaultSize={34} minSize={15} className="pl-1 pt-1">
                <MediaCard />
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
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
      <footer className="flex h-7 items-center justify-center gap-2 border-t border-border bg-background/80 shrink-0 select-none">
        <div className="h-4 w-4 rounded-full bg-white flex items-center justify-center overflow-hidden shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" className="h-full w-full object-contain" />
        </div>
        <span className="text-[10px] tracking-wide text-muted-foreground">
          Powered by WassMedia (+233246798526)
        </span>
      </footer>
    </div>
  )
}
