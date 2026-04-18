'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Image from 'next/image'
import { useAppStore, type LibraryTab, type ScheduleItem } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { TRANSLATIONS_INFO } from '@/lib/bible-api'
import { SlideThumb } from '@/components/presenter/slide-renderer'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  BookOpen,
  Music2,
  Mic,
  Sparkles,
  FileText,
  Image as ImageIcon,
  Settings as SettingsIcon,
  Square,
  Send,
  CircleSlash,
  Image as LogoIcon,
  Wifi,
  WifiOff,
  ExternalLink,
  Trash2,
  ChevronUp,
  ChevronDown,
  Clock,
  Radio,
  GripVertical,
  X,
  Plus,
} from 'lucide-react'

import { BibleLookupView } from '@/components/views/bible-lookup'
import { WorshipLyricsView } from '@/components/views/worship-lyrics'
import { ScriptureDetectionView } from '@/components/views/scripture-detection'
import { SlideGeneratorView } from '@/components/views/slide-generator'
import { SermonNotesView } from '@/components/views/sermon-notes'
import { SettingsView } from '@/components/views/settings'

// ──────────────────────────────────────────────────────────────────────
// Library tab definitions
// ──────────────────────────────────────────────────────────────────────
const LIBRARY_TABS: { id: LibraryTab; label: string; icon: typeof BookOpen }[] = [
  { id: 'bible', label: 'Scriptures', icon: BookOpen },
  { id: 'songs', label: 'Songs', icon: Music2 },
  { id: 'detection', label: 'Detect', icon: Mic },
  { id: 'ai-slides', label: 'AI Slides', icon: Sparkles },
  { id: 'sermon', label: 'Sermon', icon: FileText },
  { id: 'media', label: 'Media', icon: ImageIcon },
]

function LibraryPanelContent({ tab }: { tab: LibraryTab }) {
  switch (tab) {
    case 'bible':
      return <BibleLookupView />
    case 'songs':
      return <WorshipLyricsView />
    case 'detection':
      return <ScriptureDetectionView />
    case 'ai-slides':
      return <SlideGeneratorView />
    case 'sermon':
      return <SermonNotesView />
    case 'media':
      return (
        <div className="p-6 text-center">
          <ImageIcon className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
          <h3 className="text-sm font-semibold mb-1">Media Library</h3>
          <p className="text-xs text-zinc-500 max-w-xs mx-auto">
            Upload backgrounds and images from <strong>Settings → Background</strong> for now.
            Full media library coming soon.
          </p>
        </div>
      )
  }
}

// ──────────────────────────────────────────────────────────────────────
// Top toolbar (EasyWorship-style "ribbon" — flat, dark, dense)
// ──────────────────────────────────────────────────────────────────────
function TopToolbar({
  outputActive,
  toggleOutput,
}: {
  outputActive: boolean
  toggleOutput: () => void
}) {
  const {
    selectedTranslation,
    setSelectedTranslation,
    isLive,
    setCurrentView,
    schedule,
    clearSchedule,
  } = useAppStore()

  return (
    <header className="flex h-12 items-center justify-between border-b border-zinc-800 bg-zinc-950 px-3 shrink-0">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Image src="/logo.png" alt="ScriptureLive" width={28} height={28} className="rounded" style={{ height: 'auto' }} />
          <div className="leading-tight">
            <h1 className="text-xs font-bold text-zinc-100 tracking-tight">ScriptureLive AI</h1>
            <p className="text-[9px] text-zinc-500 uppercase tracking-wider">Live Production Console</p>
          </div>
        </div>

        <div className="h-6 w-px bg-zinc-800 mx-1" />

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px] text-zinc-300 hover:bg-zinc-800 hover:text-white gap-1"
            onClick={() => {
              if (schedule.length === 0) {
                toast.info('Schedule is already empty')
                return
              }
              if (window.confirm(`Clear all ${schedule.length} item(s) from the schedule?`)) {
                clearSchedule()
                toast.success('Schedule cleared')
              }
            }}
          >
            <Trash2 className="h-3 w-3" />
            Clear Schedule
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {isLive && (
          <Badge className="bg-red-600 text-white border-0 gap-1 h-6 text-[10px] font-bold tracking-wider animate-pulse">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-white" />
            ON AIR
          </Badge>
        )}

        <Select value={selectedTranslation} onValueChange={(v) => setSelectedTranslation(v)}>
          <SelectTrigger className="w-[100px] h-7 text-[11px] bg-zinc-900 border-zinc-800 text-zinc-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(TRANSLATIONS_INFO).map(([key, info]) => (
              <SelectItem key={key} value={key}>
                {info.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-7 px-2 text-[11px] gap-1.5 border',
            outputActive
              ? 'bg-emerald-600/20 text-emerald-300 border-emerald-700 hover:bg-emerald-600/30'
              : 'text-zinc-300 border-zinc-800 hover:bg-zinc-800',
          )}
          onClick={toggleOutput}
        >
          {outputActive ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {outputActive ? 'Output ON' : 'Output OFF'}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px] text-zinc-300 hover:bg-zinc-800 hover:text-white gap-1"
          onClick={() => setCurrentView('settings')}
        >
          <SettingsIcon className="h-3 w-3" />
          Settings
        </Button>
      </div>
    </header>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Library panel (left column)
// ──────────────────────────────────────────────────────────────────────
function LibraryPanel() {
  const { activeLibraryTab, setActiveLibraryTab } = useAppStore()

  return (
    <aside className="w-[320px] shrink-0 border-r border-zinc-800 bg-zinc-950 flex flex-col">
      <div className="px-2 pt-2 pb-1 border-b border-zinc-800">
        <p className="text-[9px] uppercase tracking-widest text-zinc-500 px-1.5 pb-1.5">Library</p>
        <div className="grid grid-cols-3 gap-1">
          {LIBRARY_TABS.map((tab) => {
            const Icon = tab.icon
            const active = activeLibraryTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveLibraryTab(tab.id)}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 rounded px-1 py-2 text-[10px] font-medium transition-colors',
                  active
                    ? 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30'
                    : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto bg-zinc-900/30">
        <LibraryPanelContent tab={activeLibraryTab} />
      </div>
    </aside>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Schedule panel (running order)
// ──────────────────────────────────────────────────────────────────────
function SchedulePanel() {
  const {
    schedule,
    selectedScheduleItemId,
    selectScheduleItem,
    removeScheduleItem,
    moveScheduleItem,
    setActiveLibraryTab,
  } = useAppStore()

  const itemTypeLabel = (t: ScheduleItem['type']) => {
    switch (t) {
      case 'verse': return 'Scripture'
      case 'song': return 'Song'
      case 'sermon': return 'Sermon'
      case 'announcement': return 'Announce'
      default: return 'Slides'
    }
  }
  const itemAccent = (t: ScheduleItem['type']) => {
    switch (t) {
      case 'verse': return 'bg-blue-500/15 text-blue-300 border-blue-700/40'
      case 'song': return 'bg-purple-500/15 text-purple-300 border-purple-700/40'
      case 'sermon': return 'bg-amber-500/15 text-amber-300 border-amber-700/40'
      case 'announcement': return 'bg-pink-500/15 text-pink-300 border-pink-700/40'
      default: return 'bg-zinc-700/30 text-zinc-300 border-zinc-700'
    }
  }

  return (
    <div className="flex flex-col h-full bg-zinc-900/40 border-r border-zinc-800">
      <div className="flex items-center justify-between px-3 h-9 border-b border-zinc-800 shrink-0 bg-zinc-950/50">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-semibold">Schedule</span>
          <Badge variant="outline" className="text-[9px] h-4 px-1 border-zinc-700 text-zinc-400">
            {schedule.length}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 text-[10px] text-zinc-400 hover:text-white hover:bg-zinc-800 gap-1"
          onClick={() => setActiveLibraryTab('bible')}
        >
          <Plus className="h-3 w-3" /> Add from Library
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {schedule.length === 0 ? (
          <div className="p-6 text-center">
            <div className="text-3xl mb-2 opacity-30">▶</div>
            <h3 className="text-xs font-semibold text-zinc-300 mb-1">Schedule is empty</h3>
            <p className="text-[10px] text-zinc-500 max-w-[200px] mx-auto leading-relaxed">
              Use the <strong className="text-zinc-300">Library</strong> on the left to look up scriptures, add songs,
              or generate slides. Then send them to the schedule.
            </p>
          </div>
        ) : (
          <ul className="p-1.5 space-y-1">
            {schedule.map((item, i) => {
              const selected = item.id === selectedScheduleItemId
              return (
                <li
                  key={item.id}
                  className={cn(
                    'group flex items-stretch rounded border transition-colors',
                    selected
                      ? 'bg-amber-500/10 border-amber-500/40'
                      : 'bg-zinc-900/60 border-zinc-800 hover:bg-zinc-800/60 hover:border-zinc-700',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => selectScheduleItem(item.id)}
                    className="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 text-left"
                  >
                    <GripVertical className="h-3 w-3 text-zinc-600 shrink-0" />
                    <div
                      className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded text-[10px] font-bold',
                        selected ? 'bg-amber-500 text-black' : 'bg-zinc-800 text-zinc-400',
                      )}
                    >
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Badge
                          className={cn(
                            'text-[8px] h-3.5 px-1 border font-medium',
                            itemAccent(item.type),
                          )}
                        >
                          {itemTypeLabel(item.type)}
                        </Badge>
                        <span className="text-[10px] text-zinc-500">{item.slides.length} slides</span>
                      </div>
                      <p className={cn('text-xs truncate mt-0.5', selected ? 'text-white font-semibold' : 'text-zinc-200')}>
                        {item.title}
                      </p>
                      {item.subtitle && (
                        <p className="text-[10px] text-zinc-500 truncate">{item.subtitle}</p>
                      )}
                    </div>
                  </button>
                  <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity border-l border-zinc-800">
                    <button
                      onClick={() => moveScheduleItem(item.id, 'up')}
                      disabled={i === 0}
                      className="flex-1 px-1 hover:bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30"
                      aria-label="Move up"
                    >
                      <ChevronUp className="h-2.5 w-2.5" />
                    </button>
                    <button
                      onClick={() => moveScheduleItem(item.id, 'down')}
                      disabled={i === schedule.length - 1}
                      className="flex-1 px-1 hover:bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30"
                      aria-label="Move down"
                    >
                      <ChevronDown className="h-2.5 w-2.5" />
                    </button>
                  </div>
                  <button
                    onClick={() => removeScheduleItem(item.id)}
                    className="px-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-600/20 text-zinc-500 hover:text-red-400 border-l border-zinc-800 transition-opacity"
                    aria-label="Remove"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </ScrollArea>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Slide thumbnails panel (slides for the currently selected schedule item)
// ──────────────────────────────────────────────────────────────────────
function SlidesPanel() {
  const {
    slides,
    previewSlideIndex,
    setPreviewSlideIndex,
    liveSlideIndex,
    settings,
    schedule,
    selectedScheduleItemId,
  } = useAppStore()

  const currentItem = schedule.find((s) => s.id === selectedScheduleItemId)

  return (
    <div className="flex flex-col h-full bg-zinc-950 border-r border-zinc-800">
      <div className="flex items-center justify-between px-3 h-9 border-b border-zinc-800 shrink-0 bg-zinc-950/50">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-semibold">Slides</span>
          {currentItem && (
            <span className="text-xs text-zinc-300 truncate">· {currentItem.title}</span>
          )}
        </div>
        {slides.length > 0 && (
          <Badge variant="outline" className="text-[9px] h-4 px-1 border-zinc-700 text-zinc-400">
            {slides.length}
          </Badge>
        )}
      </div>

      <ScrollArea className="flex-1">
        {slides.length === 0 ? (
          <div className="p-6 text-center">
            <div className="grid grid-cols-2 gap-2 max-w-[140px] mx-auto opacity-20 mb-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="aspect-video bg-zinc-700 rounded" />
              ))}
            </div>
            <p className="text-[10px] text-zinc-500 max-w-[220px] mx-auto leading-relaxed">
              Select a schedule item to see its slides — or add something from the Library to get started.
            </p>
          </div>
        ) : (
          <div className="p-2 grid grid-cols-2 xl:grid-cols-3 gap-2">
            {slides.map((slide, i) => (
              <div key={slide.id} className="space-y-1">
                <SlideThumb
                  slide={slide}
                  themeKey={slide.background || settings.congregationScreenTheme}
                  isActive={previewSlideIndex === i}
                  isLive={liveSlideIndex === i}
                  onClick={() => setPreviewSlideIndex(i)}
                  size="sm"
                  settings={settings}
                />
                <div className="flex items-center justify-between gap-1 px-0.5">
                  <span
                    className={cn(
                      'text-[9px] font-mono',
                      liveSlideIndex === i
                        ? 'text-red-400 font-bold'
                        : previewSlideIndex === i
                          ? 'text-amber-400 font-bold'
                          : 'text-zinc-500',
                    )}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="text-[9px] text-zinc-600 truncate flex-1 text-right">
                    {slide.type}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Output panel (right column) — Preview on top, Live on bottom
// ──────────────────────────────────────────────────────────────────────
function OutputPanel() {
  const {
    slides,
    previewSlideIndex,
    setPreviewSlideIndex,
    liveSlideIndex,
    settings,
  } = useAppStore()

  const previewSlide = slides[previewSlideIndex] || null
  const liveSlide = liveSlideIndex >= 0 ? slides[liveSlideIndex] : null

  return (
    <aside className="w-[400px] shrink-0 bg-zinc-950 flex flex-col">
      {/* Preview window */}
      <div className="flex flex-col flex-1 min-h-0 border-b border-zinc-800">
        <div className="flex items-center justify-between px-3 h-9 border-b border-zinc-800 shrink-0 bg-zinc-950/50">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-amber-500" />
            <span className="text-[10px] uppercase tracking-widest text-amber-400 font-bold">Preview</span>
            {previewSlide && (
              <span className="text-[10px] text-zinc-500">
                {previewSlideIndex + 1} / {slides.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-zinc-400 hover:text-white hover:bg-zinc-800"
              onClick={() => setPreviewSlideIndex(Math.max(0, previewSlideIndex - 1))}
              disabled={!slides.length || previewSlideIndex === 0}
            >
              <ChevronUp className="h-3.5 w-3.5 -rotate-90" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-zinc-400 hover:text-white hover:bg-zinc-800"
              onClick={() => setPreviewSlideIndex(Math.min(slides.length - 1, previewSlideIndex + 1))}
              disabled={!slides.length || previewSlideIndex >= slides.length - 1}
            >
              <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
            </Button>
          </div>
        </div>
        <div className="flex-1 min-h-0 p-3 flex items-center justify-center bg-black">
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
            <p className="text-[11px] text-zinc-600">No preview slide</p>
          )}
        </div>
      </div>

      {/* Live window */}
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center justify-between px-3 h-9 border-b border-zinc-800 shrink-0 bg-zinc-950/50">
          <div className="flex items-center gap-2">
            <div className={cn('h-2 w-2 rounded-full', liveSlide ? 'bg-red-500 animate-pulse' : 'bg-zinc-700')} />
            <span className={cn('text-[10px] uppercase tracking-widest font-bold', liveSlide ? 'text-red-500' : 'text-zinc-500')}>
              Live Output
            </span>
            {liveSlide && (
              <span className="text-[10px] text-zinc-500">
                {liveSlideIndex + 1} / {slides.length}
              </span>
            )}
          </div>
        </div>
        <div className="flex-1 min-h-0 p-3 flex items-center justify-center bg-black">
          {liveSlide ? (
            <div className="w-full max-w-full">
              <SlideThumb
                slide={liveSlide}
                themeKey={liveSlide.background || settings.congregationScreenTheme}
                isLive
                size="lg"
                settings={settings}
              />
            </div>
          ) : (
            <div className="text-center">
              <CircleSlash className="h-8 w-8 text-zinc-700 mx-auto mb-1" />
              <p className="text-[11px] text-zinc-600">Output is dark</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Bottom transport bar
// ──────────────────────────────────────────────────────────────────────
function TransportBar({
  outputActive,
  elapsedTime,
  onGoLive,
  onClearLive,
  onBlack,
  onLogo,
}: {
  outputActive: boolean
  elapsedTime: number
  onGoLive: () => void
  onClearLive: () => void
  onBlack: () => void
  onLogo: () => void
}) {
  const { slides, previewSlideIndex, liveSlideIndex, isLive, settings } = useAppStore()
  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`

  return (
    <div className="flex items-center justify-between gap-3 px-3 h-14 border-t border-zinc-800 bg-zinc-950 shrink-0">
      <div className="flex items-center gap-1.5">
        <Button
          onClick={onGoLive}
          disabled={!slides.length}
          className={cn(
            'h-10 px-5 font-bold text-xs uppercase tracking-wider gap-1.5 shadow-lg',
            isLive
              ? 'bg-red-600 hover:bg-red-700 text-white shadow-red-600/30'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20',
          )}
        >
          <Send className="h-4 w-4" />
          {isLive ? 'Send to Live' : 'Go Live'}
          <kbd className="ml-1 px-1 py-0.5 rounded bg-black/30 text-[9px] font-mono normal-case tracking-normal">
            ⏎
          </kbd>
        </Button>

        <Button
          onClick={onClearLive}
          disabled={liveSlideIndex < 0 && !isLive}
          variant="ghost"
          className="h-10 px-3 text-xs uppercase tracking-wider gap-1.5 text-zinc-300 hover:bg-zinc-800 hover:text-white border border-zinc-800"
        >
          <Square className="h-3.5 w-3.5" />
          Clear
        </Button>

        <Button
          onClick={onBlack}
          variant="ghost"
          className="h-10 px-3 text-xs uppercase tracking-wider gap-1.5 text-zinc-300 hover:bg-zinc-800 hover:text-white border border-zinc-800"
        >
          <CircleSlash className="h-3.5 w-3.5" />
          Black
        </Button>

        <Button
          onClick={onLogo}
          variant="ghost"
          className="h-10 px-3 text-xs uppercase tracking-wider gap-1.5 text-zinc-300 hover:bg-zinc-800 hover:text-white border border-zinc-800"
        >
          <LogoIcon className="h-3.5 w-3.5" />
          Logo
        </Button>
      </div>

      <div className="flex items-center gap-3 text-[10px] text-zinc-400">
        <span className="hidden md:inline">
          <kbd className="px-1 py-0.5 rounded bg-zinc-800 font-mono">⏎</kbd> Live ·{' '}
          <kbd className="px-1 py-0.5 rounded bg-zinc-800 font-mono">←→</kbd> Nav ·{' '}
          <kbd className="px-1 py-0.5 rounded bg-zinc-800 font-mono">Esc</kbd> Clear
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-zinc-400">
          <Clock className="h-3 w-3" />
          <span className="text-xs font-mono tabular-nums">{formatTime(elapsedTime)}</span>
        </div>

        <div className="h-6 w-px bg-zinc-800" />

        <div className="flex items-center gap-1.5">
          <Radio
            className={cn(
              'h-3 w-3',
              outputActive ? 'text-emerald-400' : 'text-zinc-600',
            )}
          />
          <span className={cn('text-[10px] uppercase font-bold tracking-wider', outputActive ? 'text-emerald-400' : 'text-zinc-600')}>
            {outputActive ? 'NDI / Output Active' : 'Output Idle'}
          </span>
        </div>

        <div className="h-6 w-px bg-zinc-800" />

        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
          {settings.displayMode === 'full' ? 'Full Screen' : 'Lower Third'}
        </span>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────
// Main shell — wires it all together with output broadcasting + hotkeys
// ──────────────────────────────────────────────────────────────────────
export function EasyWorshipShell() {
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
  } = useAppStore()

  const [outputActive, setOutputActive] = useState(false)
  const [elapsedTime, setElapsedTime] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Broadcast helper ─────────────────────────────────────────────────
  const sendToOutput = useCallback(
    async (slide: typeof slides[number] | null, live: boolean) => {
      try {
        await fetch('/api/output', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'slide',
            slide,
            isLive: live,
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
            },
          }),
        })
      } catch {
        /* congregation reconnects via SSE */
      }
    },
    [settings],
  )

  // Auto-enable output if NDI mode set
  useEffect(() => {
    if ((settings.outputDestination === 'ndi' || settings.outputDestination === 'both') && !outputActive) {
      setOutputActive(true) // eslint-disable-line react-hooks/set-state-in-effect
      setNdiConnected(true)
    }
  }, [settings.outputDestination, outputActive, setNdiConnected])

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

  // Sync live changes to output
  useEffect(() => {
    if (outputActive) {
      const cur = liveSlideIndex >= 0 ? slides[liveSlideIndex] : null
      sendToOutput(cur, isLive)
    }
  }, [liveSlideIndex, isLive, outputActive, slides, sendToOutput])

  // ── Transport actions ────────────────────────────────────────────────
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
    sendToOutput(
      {
        id: 'logo',
        type: 'title',
        title: 'ScriptureLive AI',
        subtitle: '',
        content: [],
      },
      true,
    )
    setIsLive(true)
    toast.success('Logo sent to output')
  }, [sendToOutput, setIsLive])

  const toggleOutput = useCallback(() => {
    if (outputActive) {
      setOutputActive(false)
      setNdiConnected(false)
      toast.success('Output stopped')
    } else {
      setOutputActive(true)
      setNdiConnected(true)
      toast.success('Output started')
      const cur = liveSlideIndex >= 0 ? slides[liveSlideIndex] : null
      sendToOutput(cur, isLive)
    }
  }, [outputActive, setNdiConnected, sendToOutput, liveSlideIndex, slides, isLive])

  // ── Keyboard shortcuts ───────────────────────────────────────────────
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

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-black text-zinc-100 dark">
      <TopToolbar outputActive={outputActive} toggleOutput={toggleOutput} />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <LibraryPanel />
        <div className="flex-1 min-w-0 grid grid-cols-2">
          <SchedulePanel />
          <SlidesPanel />
        </div>
        <OutputPanel />
      </div>
      <TransportBar
        outputActive={outputActive}
        elapsedTime={elapsedTime}
        onGoLive={goLive}
        onClearLive={clearLive}
        onBlack={goBlack}
        onLogo={goLogo}
      />
    </div>
  )
}
