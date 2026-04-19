'use client'

/**
 * Compact "library column" versions of the main views, sized to fit the
 * 320px Library panel in the EasyWorship-style shell. They share the same
 * Zustand store and APIs as the full-size views — they just present a leaner
 * UI and route results into the schedule instead of the old presenter view.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import Image from 'next/image'
import { useAppStore, type Slide, type DetectedVerse } from '@/lib/store'
import {
  parseVerseReference,
  fetchBibleVerse,
  fetchBibleChapter,
  detectVersesInText,
  getAutocompleteSuggestions,
  getNextChapter,
  getPrevChapter,
  type AutocompleteSuggestion,
  type BibleChapter,
} from '@/lib/bible-api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Search,
  BookOpen,
  Send,
  Mic,
  MicOff,
  RotateCcw,
  Sparkles,
  Upload,
  Image as ImageIcon,
  FileText,
  Music2,
  Trash2,
  Plus,
  Wand2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// ════════════════════════════════════════════════════════════════════════
// 1. SCRIPTURES — compact bible lookup
// ════════════════════════════════════════════════════════════════════════
export function BibleLookupCompact() {
  const {
    selectedTranslation,
    searchQuery,
    setSearchQuery,
    addToVerseHistory,
    settings,
    addScheduleItem,
  } = useAppStore()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chapter, setChapter] = useState<BibleChapter | null>(null)
  const [activeVerse, setActiveVerse] = useState<number | null>(null)
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([])
  const [showSuggest, setShowSuggest] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const versesRef = useRef<HTMLDivElement>(null)

  // Load a chapter and optionally focus a specific verse.
  const loadChapter = useCallback(
    async (book: string, chap: number, focusVerse?: number) => {
      setLoading(true)
      setError(null)
      setShowSuggest(false)
      try {
        const data = await fetchBibleChapter(book, chap, selectedTranslation)
        if (!data || data.verses.length === 0) {
          setError('Chapter not found')
          setChapter(null)
          return
        }
        setChapter(data)
        const target = focusVerse && data.verses.find((v) => v.verse === focusVerse) ? focusVerse : data.verses[0].verse
        setActiveVerse(target)
        // Cache the focused verse in history for continuity with rest of app
        const focused = data.verses.find((v) => v.verse === target)
        if (focused) {
          addToVerseHistory({
            reference: `${book} ${chap}:${target}`,
            text: focused.text,
            translation: data.translation,
            book,
            chapter: chap,
            verseStart: target,
          })
        }
        // Scroll the focused verse into view after render
        requestAnimationFrame(() => {
          const el = versesRef.current?.querySelector<HTMLElement>(`[data-verse="${target}"]`)
          el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
        })
      } catch {
        setError('Lookup failed')
      } finally {
        setLoading(false)
      }
    },
    [selectedTranslation, addToVerseHistory],
  )

  // Reload current chapter when translation changes.
  useEffect(() => {
    if (chapter) {
      void loadChapter(chapter.book, chapter.chapter, activeVerse ?? undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTranslation])

  const lookup = useCallback(
    async (q?: string) => {
      const query = (q ?? searchQuery).trim()
      if (!query) return
      const parsed = parseVerseReference(query)
      if (!parsed) {
        setError('Try "John 3:16" or "Psalms 23"')
        return
      }
      await loadChapter(parsed.book, parsed.chapter, parsed.verseStart)
    },
    [searchQuery, loadChapter],
  )

  const goPrev = () => {
    if (!chapter) return
    const p = getPrevChapter(chapter.book, chapter.chapter)
    if (p) void loadChapter(p.book, p.chapter)
  }
  const goNext = () => {
    if (!chapter) return
    const n = getNextChapter(chapter.book, chapter.chapter)
    if (n) void loadChapter(n.book, n.chapter)
  }

  const sendVerse = (verseNum: number, live: boolean) => {
    if (!chapter) return
    const v = chapter.verses.find((x) => x.verse === verseNum)
    if (!v) return
    const reference = `${chapter.book} ${chapter.chapter}:${verseNum}`
    const slide: Slide = {
      id: `slide-${Date.now()}`,
      type: 'verse',
      title: reference,
      subtitle: chapter.translation,
      content: v.text.split('\n').filter(Boolean),
      background: settings.congregationScreenTheme,
    }
    addScheduleItem({
      type: 'verse',
      title: reference,
      subtitle: chapter.translation,
      slides: [slide],
    })
    if (live) {
      // Replace the active slide deck with this verse so the broadcast
      // effect (which reads slides[liveSlideIndex]) actually pushes the
      // new verse to the congregation display instead of a stale entry.
      const s = useAppStore.getState()
      s.setSlides([slide])
      s.setPreviewSlideIndex(0)
      s.setLiveSlideIndex(0)
      s.setIsLive(true)
    }
    toast.success(live ? `${reference} sent live` : `${reference} added to schedule`)
  }

  const sendChapter = (live: boolean) => {
    if (!chapter) return
    const reference = `${chapter.book} ${chapter.chapter}`
    const slides: Slide[] = chapter.verses.map((v) => ({
      id: `slide-${Date.now()}-${v.verse}`,
      type: 'verse',
      title: `${reference}:${v.verse}`,
      subtitle: chapter.translation,
      content: v.text.split('\n').filter(Boolean),
      background: settings.congregationScreenTheme,
    }))
    addScheduleItem({
      type: 'verse',
      title: reference,
      subtitle: `${chapter.translation} • ${chapter.verses.length} verses`,
      slides,
    })
    if (live) {
      const s = useAppStore.getState()
      s.setSlides(slides)
      s.setPreviewSlideIndex(0)
      s.setLiveSlideIndex(0)
      s.setIsLive(true)
    }
    toast.success(live ? `${reference} sent live` : `${reference} added to schedule`)
  }

  const onChange = (v: string) => {
    setSearchQuery(v)
    if (v.trim().length >= 2) {
      const r = getAutocompleteSuggestions(v)
      setSuggestions(r)
      setShowSuggest(r.length > 0)
      setHighlight(-1)
    } else {
      setShowSuggest(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggest && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlight((h) => Math.min(h + 1, suggestions.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlight((h) => Math.max(h - 1, 0))
        return
      }
      if (e.key === 'Enter' && highlight >= 0) {
        e.preventDefault()
        const sel = suggestions[highlight]
        setSearchQuery(sel.reference)
        setShowSuggest(false)
        lookup(sel.reference)
        return
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      lookup()
    }
  }

  return (
    <div className="flex flex-col h-full text-zinc-200">
      {/* Search */}
      <div className="p-2.5 border-b border-zinc-800 bg-zinc-950/40">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
          <Input
            ref={inputRef}
            value={searchQuery}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder='"joh 3 16"'
            className="pl-7 pr-2 h-8 text-xs bg-zinc-900 border-zinc-800 focus-visible:ring-amber-500/40"
          />
          {showSuggest && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-zinc-950 border border-zinc-800 rounded shadow-xl overflow-hidden">
              {suggestions.slice(0, 6).map((s, i) => (
                <button
                  key={s.display}
                  onClick={() => {
                    setSearchQuery(s.reference)
                    setShowSuggest(false)
                    lookup(s.reference)
                  }}
                  className={cn(
                    'w-full text-left px-2 py-1.5 text-[11px] flex items-center gap-1.5',
                    i === highlight ? 'bg-amber-500/15 text-amber-300' : 'hover:bg-zinc-900 text-zinc-300',
                  )}
                >
                  <BookOpen className="h-3 w-3 text-zinc-500 shrink-0" />
                  <span className="truncate">{s.display}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 mt-2">
          <Button
            onClick={() => lookup()}
            disabled={loading || !searchQuery.trim()}
            size="sm"
            className="h-7 text-[11px] flex-1 bg-amber-500 hover:bg-amber-600 text-black font-semibold gap-1"
          >
            {loading ? (
              <span className="h-3 w-3 rounded-full border-2 border-black border-t-transparent animate-spin" />
            ) : (
              <Search className="h-3 w-3" />
            )}
            Lookup
          </Button>
        </div>
      </div>

      {/* Chapter header with prev/next nav (EasyWorship style) */}
      {chapter && (
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-zinc-800 bg-zinc-950/60">
          <Button
            onClick={goPrev}
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-zinc-400 hover:text-amber-300 hover:bg-zinc-800"
            title="Previous chapter"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <div className="flex-1 text-center">
            <div className="text-[12px] font-semibold text-zinc-100 leading-tight">
              {chapter.book} {chapter.chapter}
            </div>
            <div className="text-[9px] text-zinc-500 leading-tight">
              {chapter.translation} · {chapter.verses.length} verses
            </div>
          </div>
          <Button
            onClick={goNext}
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-zinc-400 hover:text-amber-300 hover:bg-zinc-800"
            title="Next chapter"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Verse list + actions */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div ref={versesRef} className="p-2 space-y-1">
          {loading ? (
            <div className="space-y-2 p-1">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
              <Skeleton className="h-3 w-4/6" />
            </div>
          ) : chapter ? (
            <>
              {chapter.verses.map((v) => {
                const active = v.verse === activeVerse
                return (
                  <div
                    key={v.verse}
                    data-verse={v.verse}
                    onClick={() => {
                      // Single click: focus AND add to schedule
                      setActiveVerse(v.verse)
                      sendVerse(v.verse, false)
                    }}
                    onDoubleClick={() => {
                      // Double click: send straight to live output
                      setActiveVerse(v.verse)
                      sendVerse(v.verse, true)
                    }}
                    title="Click → add to schedule · Double-click → send live"
                    className={cn(
                      'group rounded border px-2 py-1.5 cursor-pointer transition-colors select-none',
                      active
                        ? 'border-amber-500/60 bg-amber-500/10'
                        : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900',
                    )}
                  >
                    <div className="flex gap-1.5">
                      <span
                        className={cn(
                          'text-[10px] font-mono shrink-0 mt-[1px]',
                          active ? 'text-amber-300' : 'text-zinc-500',
                        )}
                      >
                        {v.verse}
                      </span>
                      <p className="text-[11.5px] leading-snug text-zinc-200 flex-1">{v.text}</p>
                    </div>
                    {active && (
                      <div className="flex gap-1 mt-1.5">
                        <Button
                          onClick={(e) => {
                            e.stopPropagation()
                            sendVerse(v.verse, false)
                          }}
                          size="sm"
                          variant="outline"
                          className="h-6 text-[10px] flex-1 border-zinc-700 bg-zinc-900 hover:bg-zinc-800 gap-1"
                        >
                          <Plus className="h-3 w-3" /> Schedule
                        </Button>
                        <Button
                          onClick={(e) => {
                            e.stopPropagation()
                            sendVerse(v.verse, true)
                          }}
                          size="sm"
                          className="h-6 text-[10px] flex-1 bg-red-600 hover:bg-red-700 gap-1"
                        >
                          <Send className="h-3 w-3" /> Go Live
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
              {/* Whole-chapter actions */}
              <div className="flex gap-1 pt-1.5 sticky bottom-0 bg-zinc-950/90 backdrop-blur -mx-2 px-2 pb-1">
                <Button
                  onClick={() => sendChapter(false)}
                  size="sm"
                  variant="outline"
                  className="h-7 text-[10px] flex-1 border-zinc-700 bg-zinc-900 hover:bg-zinc-800 gap-1"
                >
                  <Plus className="h-3 w-3" /> Whole chapter
                </Button>
                <Button
                  onClick={() => sendChapter(true)}
                  size="sm"
                  className="h-7 text-[10px] flex-1 bg-amber-500 hover:bg-amber-600 text-black font-semibold gap-1"
                >
                  <Send className="h-3 w-3" /> Chapter live
                </Button>
              </div>
            </>
          ) : error ? (
            <div className="text-center py-6 text-[11px] text-amber-400/80">{error}</div>
          ) : (
            <div className="text-center py-4 space-y-2">
              <BookOpen className="h-7 w-7 text-zinc-700 mx-auto" />
              <p className="text-[11px] text-zinc-500">Search any verse to load the whole chapter.</p>
              <div className="flex flex-wrap gap-1 justify-center">
                {['John 3:16', 'Psalms 23', 'Romans 8:28'].map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      setSearchQuery(r)
                      lookup(r)
                    }}
                    className="text-[10px] px-2 py-0.5 rounded border border-zinc-800 hover:border-amber-500/40 hover:text-amber-300 text-zinc-400"
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// 2. DETECT — compact scripture detection (mic + text)
// ════════════════════════════════════════════════════════════════════════
export function ScriptureDetectionCompact() {
  const {
    isListening,
    liveTranscript,
    liveInterimTranscript,
    speechSupported,
    speechError,
    setSpeechCommand,
    detectedVerses,
    addDetectedVerse,
    clearDetectedVerses,
    selectedTranslation,
    addToVerseHistory,
    settings,
    updateSettings,
    addScheduleItem,
  } = useAppStore()

  const processed = useRef<Set<string>>(new Set())
  const [manualInput, setManualInput] = useState('')

  // Send a detected verse into the schedule and (optionally) live
  const sendDetectedToSchedule = useCallback(
    (verse: { reference: string; text: string; translation: string }, autoLive = false) => {
      const slide: Slide = {
        id: `slide-${Date.now()}`,
        type: 'verse',
        title: verse.reference,
        subtitle: verse.translation,
        content: verse.text.split('\n').filter(Boolean),
        background: useAppStore.getState().settings.congregationScreenTheme,
      }
      addScheduleItem({
        type: 'verse',
        title: verse.reference,
        subtitle: verse.translation,
        slides: [slide],
      })
      if (autoLive) {
        const s = useAppStore.getState()
        s.setSlides([slide])
        s.setPreviewSlideIndex(0)
        s.setLiveSlideIndex(0)
        s.setIsLive(true)
      }
    },
    [addScheduleItem],
  )

  const handleManual = useCallback(async () => {
    const text = manualInput.trim()
    if (!text) return
    const refs = detectVersesInText(text)
    let found = 0
    for (const ref of refs) {
      if (processed.current.has(ref)) continue
      processed.current = new Set(processed.current).add(ref)
      try {
        const verse = await fetchBibleVerse(ref, selectedTranslation)
        if (verse) {
          found++
          const det: DetectedVerse = {
            id: `det-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            reference: ref,
            text: verse.text,
            translation: selectedTranslation,
            detectedAt: new Date(),
            confidence: 0.95,
          }
          addDetectedVerse(det)
          addToVerseHistory(verse)
          sendDetectedToSchedule(det, settings.autoGoLiveOnDetection)
          toast.success(`Detected: ${ref}`)
        }
      } catch {
        /* ignore */
      }
    }
    if (!found) toast.info('No Bible references found')
    setManualInput('')
  }, [
    manualInput,
    selectedTranslation,
    addDetectedVerse,
    addToVerseHistory,
    sendDetectedToSchedule,
    settings.autoGoLiveOnDetection,
  ])

  const toggleListen = () => {
    if (isListening) {
      setSpeechCommand('stop')
    } else {
      processed.current = new Set()
      setSpeechCommand('start')
    }
  }

  return (
    <div className="flex flex-col h-full text-zinc-200">
      {/* Mic + auto live */}
      <div className="p-3 border-b border-zinc-800 bg-zinc-950/40 space-y-2.5">
        <div className="flex items-center gap-2">
          <button
            onClick={toggleListen}
            disabled={!speechSupported}
            className={cn(
              'relative h-12 w-12 rounded-full flex items-center justify-center transition-colors shrink-0',
              isListening
                ? 'bg-red-600/20 ring-2 ring-red-500/60'
                : 'bg-amber-500/15 hover:bg-amber-500/25 ring-1 ring-amber-500/30',
              !speechSupported && 'opacity-40 cursor-not-allowed',
            )}
          >
            {isListening && (
              <span className="absolute inset-0 rounded-full border-2 border-red-500/50 animate-ping" />
            )}
            {isListening ? (
              <MicOff className="h-5 w-5 text-red-400" />
            ) : (
              <Mic className="h-5 w-5 text-amber-400" />
            )}
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold">
              {isListening ? 'Listening…' : speechSupported ? 'Tap to listen' : 'Not supported'}
            </p>
            <button
              onClick={() => updateSettings({ autoGoLiveOnDetection: !settings.autoGoLiveOnDetection })}
              className={cn(
                'mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium border',
                settings.autoGoLiveOnDetection
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-700/40'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-700',
              )}
            >
              <Sparkles className="h-2.5 w-2.5" />
              Auto Live
            </button>
          </div>
        </div>

        {(liveTranscript || liveInterimTranscript) && (
          <div className="rounded bg-zinc-900/60 border border-zinc-800 p-1.5 max-h-20 overflow-y-auto">
            <p className="text-[10px] text-zinc-300 leading-relaxed whitespace-pre-wrap">
              {liveTranscript}
              {liveInterimTranscript && (
                <span className="text-zinc-500 italic"> {liveInterimTranscript}</span>
              )}
            </p>
          </div>
        )}

        {speechError && (
          <div className="rounded border border-red-500/30 bg-red-500/5 p-1.5 text-[10px] text-red-300">
            {speechError}
          </div>
        )}

        {/* Manual paste */}
        <div className="flex gap-1">
          <Input
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleManual()}
            placeholder="Paste sermon text…"
            className="h-7 text-[11px] bg-zinc-900 border-zinc-800"
          />
          <Button
            onClick={handleManual}
            size="sm"
            className="h-7 px-2 text-[10px] bg-amber-500 hover:bg-amber-600 text-black gap-1"
          >
            <Wand2 className="h-3 w-3" />
            Detect
          </Button>
        </div>
      </div>

      {/* Detected list */}
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-zinc-800 bg-zinc-950/20">
        <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-semibold">
          Detected ({detectedVerses.length})
        </span>
        {detectedVerses.length > 0 && (
          <button
            onClick={clearDetectedVerses}
            className="text-[10px] text-zinc-500 hover:text-red-400 flex items-center gap-1"
          >
            <Trash2 className="h-2.5 w-2.5" /> Clear
          </button>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {detectedVerses.length === 0 ? (
          <div className="text-center py-6 px-3">
            <BookOpen className="h-6 w-6 text-zinc-700 mx-auto mb-1.5" />
            <p className="text-[10px] text-zinc-500">
              Detected verses appear here and (with Auto Live) automatically go to the schedule.
            </p>
          </div>
        ) : (
          <ul className="p-1.5 space-y-1">
            {detectedVerses
              .slice()
              .reverse()
              .map((v) => (
                <li
                  key={v.id}
                  className="rounded border border-zinc-800 bg-zinc-900/40 p-2 hover:border-amber-500/40 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold text-amber-300">{v.reference}</span>
                    <span className="text-[9px] text-zinc-500">
                      {v.detectedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-400 line-clamp-2 leading-snug">{v.text}</p>
                  <Button
                    onClick={() => sendDetectedToSchedule(v, true)}
                    size="sm"
                    className="mt-1.5 h-6 w-full text-[10px] bg-red-600 hover:bg-red-700 gap-1"
                  >
                    <Send className="h-3 w-3" /> Send Live
                  </Button>
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// 3. AI SLIDES — compact slide generator
// ════════════════════════════════════════════════════════════════════════
export function SlideGeneratorCompact() {
  const { selectedTranslation, addScheduleItem, settings } = useAppStore()
  const [verseRef, setVerseRef] = useState('')
  const [topic, setTopic] = useState('')
  const [busy, setBusy] = useState(false)

  const generateFromVerse = async () => {
    const ref = verseRef.trim()
    if (!ref) return
    setBusy(true)
    try {
      const verse = await fetchBibleVerse(ref, selectedTranslation)
      if (!verse) {
        toast.error('Verse not found')
        return
      }
      const text = verse.text
      const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean)
      const chunks: string[][] = []
      for (let i = 0; i < sentences.length; i += 2) {
        chunks.push(sentences.slice(i, i + 2))
      }
      const slides: Slide[] = [
        {
          id: `slide-${Date.now()}-title`,
          type: 'title',
          title: verse.reference,
          subtitle: verse.translation,
          content: [],
          background: settings.congregationScreenTheme,
        },
        ...chunks.map((lines, i) => ({
          id: `slide-${Date.now()}-${i}`,
          type: 'verse' as const,
          title: verse.reference,
          subtitle: verse.translation,
          content: lines,
          background: settings.congregationScreenTheme,
        })),
      ]
      addScheduleItem({
        type: 'verse',
        title: verse.reference,
        subtitle: verse.translation,
        slides,
      })
      toast.success(`${slides.length} slides added`)
      setVerseRef('')
    } catch {
      toast.error('Failed')
    } finally {
      setBusy(false)
    }
  }

  const generateAI = async () => {
    const t = topic.trim()
    if (!t) return
    setBusy(true)
    try {
      // The actual AI route lives at /api/ai/generate-slides — this used
      // to point at /api/ai/slides which 404s, so the "Generate with AI"
      // button silently failed for every user. Route now matches the
      // implementation and surfaces real server errors instead of a
      // generic "AI generation failed".
      const r = await fetch('/api/ai/generate-slides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: t,
          theme: settings.congregationScreenTheme,
          translation: selectedTranslation,
        }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) {
        toast.error(data?.error || `AI request failed (${r.status})`)
        return
      }
      const slides: Slide[] = Array.isArray(data?.slides) ? data.slides : []
      if (!slides.length) {
        toast.error('AI returned no slides')
        return
      }
      addScheduleItem({ type: 'sermon', title: t, slides })
      toast.success(`AI generated ${slides.length} slides`)
      setTopic('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI generation failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-3 space-y-3 text-zinc-200">
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">
            From Verse
          </label>
          <Input
            value={verseRef}
            onChange={(e) => setVerseRef(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && generateFromVerse()}
            placeholder="John 3:16-17"
            className="h-7 text-xs bg-zinc-900 border-zinc-800"
          />
          <Button
            onClick={generateFromVerse}
            disabled={busy || !verseRef.trim()}
            size="sm"
            className="h-7 w-full text-[10px] bg-amber-500 hover:bg-amber-600 text-black font-semibold gap-1"
          >
            <Sparkles className="h-3 w-3" /> Generate Slides
          </Button>
        </div>

        <div className="border-t border-zinc-800 pt-3 space-y-1.5">
          <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">
            From Topic (AI)
          </label>
          <Textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder='"Hope in difficult times"'
            rows={3}
            className="text-xs bg-zinc-900 border-zinc-800 resize-none"
          />
          <Button
            onClick={generateAI}
            disabled={busy || !topic.trim()}
            size="sm"
            className="h-7 w-full text-[10px] bg-violet-600 hover:bg-violet-700 gap-1"
          >
            {busy ? (
              <span className="h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
            ) : (
              <Wand2 className="h-3 w-3" />
            )}
            Generate with AI
          </Button>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// 4. SERMON — compact sermon notes (paste text → slides)
// ════════════════════════════════════════════════════════════════════════
export function SermonNotesCompact() {
  const { addScheduleItem, settings } = useAppStore()
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')

  const buildSlides = () => {
    const t = text.trim()
    if (!t) return
    // Split by blank lines into sections
    const sections = t.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean)
    const titleStr = title.trim() || 'Sermon Notes'
    const slides: Slide[] = sections.map((sec, i) => ({
      id: `slide-${Date.now()}-${i}`,
      type: 'custom',
      title: i === 0 ? titleStr : '',
      subtitle: '',
      content: sec.split('\n').filter(Boolean),
      background: settings.congregationScreenTheme,
    }))
    addScheduleItem({ type: 'sermon', title: titleStr, slides })
    toast.success(`${slides.length} sermon slides added`)
    setText('')
    setTitle('')
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-3 space-y-2.5 text-zinc-200">
        <div>
          <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">
            Sermon Title
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Sunday Sermon"
            className="h-7 mt-1 text-xs bg-zinc-900 border-zinc-800"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">
            Notes (split by blank lines)
          </label>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'Point one — God is love\n\nPoint two — His grace is sufficient\n\nPoint three — Walk in faith'}
            rows={10}
            className="mt-1 text-xs bg-zinc-900 border-zinc-800 resize-none font-mono leading-relaxed"
          />
        </div>
        <Button
          onClick={buildSlides}
          disabled={!text.trim()}
          size="sm"
          className="h-7 w-full text-[10px] bg-amber-500 hover:bg-amber-600 text-black font-semibold gap-1"
        >
          <FileText className="h-3 w-3" /> Add to Schedule
        </Button>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// 5. SONGS — compact lyric pad (paste lyrics, sectioned by blank lines)
// ════════════════════════════════════════════════════════════════════════
export function WorshipLyricsCompact() {
  const { addScheduleItem, settings } = useAppStore()
  const [title, setTitle] = useState('')
  const [lyrics, setLyrics] = useState('')

  const addSong = () => {
    const t = lyrics.trim()
    if (!t) return
    const sections = t.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean)
    const titleStr = title.trim() || 'Untitled Song'
    const slides: Slide[] = sections.map((sec, i) => {
      const lines = sec.split('\n').filter(Boolean)
      // Detect section labels like [Chorus]
      const labelMatch = lines[0]?.match(/^\[(.+)\]$/)
      const label = labelMatch ? labelMatch[1] : ''
      const body = labelMatch ? lines.slice(1) : lines
      return {
        id: `slide-${Date.now()}-${i}`,
        type: 'lyrics',
        title: i === 0 ? titleStr : '',
        subtitle: label,
        content: body,
        background: settings.congregationScreenTheme,
      }
    })
    addScheduleItem({ type: 'song', title: titleStr, slides })
    toast.success(`${titleStr} added (${slides.length} slides)`)
    setLyrics('')
    setTitle('')
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-3 space-y-2.5 text-zinc-200">
        <div>
          <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">
            Song Title
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Amazing Grace"
            className="h-7 mt-1 text-xs bg-zinc-900 border-zinc-800"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">
            Lyrics
          </label>
          <Textarea
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
            placeholder={'[Verse 1]\nAmazing grace, how sweet the sound\nThat saved a wretch like me\n\n[Chorus]\n…'}
            rows={12}
            className="mt-1 text-xs bg-zinc-900 border-zinc-800 resize-none font-mono leading-relaxed"
          />
          <p className="text-[9px] text-zinc-500 mt-1">
            Use blank lines to separate verses. <code className="text-amber-300/80">[Chorus]</code> labels become slide titles.
          </p>
        </div>
        <Button
          onClick={addSong}
          disabled={!lyrics.trim()}
          size="sm"
          className="h-7 w-full text-[10px] bg-amber-500 hover:bg-amber-600 text-black font-semibold gap-1"
        >
          <Music2 className="h-3 w-3" /> Add Song to Schedule
        </Button>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════
// 6. MEDIA — local file uploads (images / videos) for backgrounds & slides
// ════════════════════════════════════════════════════════════════════════
interface MediaItem {
  id: string
  name: string
  dataUrl: string
  kind: 'image' | 'video'
}

const MEDIA_KEY = 'scripturelive.media.v1'

export function MediaLibraryCompact() {
  const { addScheduleItem, updateSettings, settings } = useAppStore()
  const [items, setItems] = useState<MediaItem[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load persisted media on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(MEDIA_KEY)
      if (raw) setItems(JSON.parse(raw))
    } catch {
      /* ignore */
    }
  }, [])

  const persist = (next: MediaItem[]) => {
    setItems(next)
    try {
      localStorage.setItem(MEDIA_KEY, JSON.stringify(next))
    } catch {
      toast.error('Storage full — try removing old media')
    }
  }

  const handleFiles = (files: FileList | null) => {
    if (!files || !files.length) return
    Array.from(files).forEach((file) => {
      const isImage = file.type.startsWith('image/')
      const isVideo = file.type.startsWith('video/')
      if (!isImage && !isVideo) {
        toast.error(`Unsupported: ${file.name}`)
        return
      }
      if (file.size > 8 * 1024 * 1024) {
        toast.error(`${file.name} is over 8 MB — too large for in-browser storage`)
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        const next: MediaItem = {
          id: `media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          dataUrl,
          kind: isImage ? 'image' : 'video',
        }
        persist([next, ...items])
        toast.success(`${file.name} uploaded`)
      }
      reader.onerror = () => toast.error(`Could not read ${file.name}`)
      reader.readAsDataURL(file)
    })
  }

  const removeItem = (id: string) => {
    persist(items.filter((m) => m.id !== id))
  }

  const addToSchedule = (m: MediaItem) => {
    const slide: Slide = {
      id: `slide-${Date.now()}`,
      type: 'custom',
      title: m.name,
      subtitle: '',
      content: [],
      background: m.dataUrl,
    }
    addScheduleItem({ type: 'slides', title: m.name, slides: [slide] })
    toast.success(`${m.name} added to schedule`)
  }

  const useAsBackground = (m: MediaItem) => {
    if (m.kind !== 'image') {
      toast.info('Only images can be used as a background right now')
      return
    }
    updateSettings({ customBackground: m.dataUrl })
    toast.success('Background updated')
  }

  return (
    <div className="flex flex-col h-full text-zinc-200">
      <div className="p-2.5 border-b border-zinc-800 bg-zinc-950/40 space-y-2">
        <Button
          onClick={() => fileInputRef.current?.click()}
          size="sm"
          className="h-7 w-full text-[10px] bg-amber-500 hover:bg-amber-600 text-black font-semibold gap-1"
        >
          <Upload className="h-3 w-3" /> Upload from PC
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files)
            if (fileInputRef.current) fileInputRef.current.value = ''
          }}
        />
        <p className="text-[9px] text-zinc-500 leading-snug">
          Upload images or short video clips. Drag onto slides to use as backgrounds, or send straight to the schedule.
        </p>
        {settings.customBackground && (
          <div className="flex items-center gap-1.5 rounded border border-zinc-800 bg-zinc-900/40 p-1">
            <Image
              src={settings.customBackground}
              alt="Current bg"
              width={32}
              height={20}
              className="rounded object-cover"
              style={{ height: 'auto' }}
              unoptimized
            />
            <span className="text-[9px] text-zinc-400 flex-1 truncate">Current background</span>
            <button
              onClick={() => updateSettings({ customBackground: null })}
              className="text-[10px] text-zinc-500 hover:text-red-400"
              aria-label="Clear background"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {items.length === 0 ? (
          <div className="text-center py-6 px-3">
            <ImageIcon className="h-7 w-7 text-zinc-700 mx-auto mb-1.5" />
            <p className="text-[10px] text-zinc-500">No media yet. Upload images or video clips from your computer.</p>
          </div>
        ) : (
          <div className="p-2 grid grid-cols-2 gap-1.5">
            {items.map((m) => (
              <div key={m.id} className="group relative rounded overflow-hidden border border-zinc-800 bg-black">
                {m.kind === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.dataUrl} alt={m.name} className="w-full aspect-video object-cover" />
                ) : (
                  <video src={m.dataUrl} className="w-full aspect-video object-cover" muted />
                )}
                <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-1">
                  <div className="flex justify-end">
                    <button
                      onClick={() => removeItem(m.id)}
                      className="h-5 w-5 rounded bg-red-600/80 hover:bg-red-600 flex items-center justify-center"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-2.5 w-2.5 text-white" />
                    </button>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => addToSchedule(m)}
                      className="text-[9px] py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-black font-bold"
                    >
                      + Schedule
                    </button>
                    {m.kind === 'image' && (
                      <button
                        onClick={() => useAsBackground(m)}
                        className="text-[9px] py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
                      >
                        Set BG
                      </button>
                    )}
                  </div>
                </div>
                <p className="absolute bottom-0 left-0 right-0 px-1 py-0.5 text-[8px] text-zinc-300 bg-black/60 truncate">
                  {m.name}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
