'use client'

import { useState, useRef, useCallback } from 'react'
import { useAppStore, type DetectedVerse } from '@/lib/store'
import { detectVersesInText, fetchBibleVerse } from '@/lib/bible-api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Mic,
  MicOff,
  BookOpen,
  AlertCircle,
  Volume2,
  Clock,
  Trash2,
  Maximize2,
  Send,
  Type,
  Info,
  Zap,
  RotateCcw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'

export function ScriptureDetectionView() {
  // ── Read ALL speech state from the store (managed by SpeechProvider) ──
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
    liveVerse,
    setLiveVerse,
    selectedTranslation,
    addToVerseHistory,
    setSlides,
    setPreviewSlideIndex,
    setLiveSlideIndex,
    setIsLive,
    slides,
    settings,
    updateSettings,
  } = useAppStore()

  const processedRefsRef = useRef<Set<string>>(new Set())
  const [isFullscreen, setIsFullscreen] = useState(false)
  const liveDisplayRef = useRef<HTMLDivElement>(null)
  const [manualInput, setManualInput] = useState('')

  // ── Go Live with a verse ─────────────────────────────────────────────
  const goLiveWithVerse = useCallback((
    verseOrRef: DetectedVerse | { reference: string; text: string; translation: string },
    navigateToPresenter = false,
  ) => {
    const state = useAppStore.getState()
    const slide = {
      id: `slide-${Date.now()}`,
      type: 'verse' as const,
      title: verseOrRef.reference,
      subtitle: verseOrRef.translation,
      content: verseOrRef.text.split('\n').filter(Boolean),
      background: state.settings.congregationScreenTheme,
    }
    const currentSlides = state.slides.length > 0 ? [...state.slides, slide] : [slide]
    const newLiveIndex = currentSlides.length - 1

    state.setSlides(currentSlides)
    state.setPreviewSlideIndex(newLiveIndex)
    state.setLiveSlideIndex(newLiveIndex)
    state.setIsLive(true)

    // Only navigate to presenter when explicitly requested (manual "Go Live" button)
    if (navigateToPresenter) {
      useAppStore.getState().setCurrentView('presenter')
    }

    // Suppressed per FRS — live pill is the source of truth.
  }, [])

  // ── Manual verse detection from text input ───────────────────────────
  const handleManualDetect = useCallback(async () => {
    if (!manualInput.trim()) return

    const text = manualInput.trim()
    const references = detectVersesInText(text)
    let foundAny = false

    for (const ref of references) {
      if (processedRefsRef.current.has(ref)) continue
      processedRefsRef.current = new Set(processedRefsRef.current).add(ref)

      try {
        const verse = await fetchBibleVerse(ref, selectedTranslation)
        if (verse) {
          foundAny = true
          const detected: DetectedVerse = {
            id: `det-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            reference: ref,
            text: verse.text,
            translation: selectedTranslation,
            detectedAt: new Date(),
            confidence: 0.9,
          }
          addDetectedVerse(detected)
          setLiveVerse(verse)
          addToVerseHistory(verse)
          // Suppressed per FRS — Detected Verses panel is the source of truth.

          if (settings.autoGoLiveOnDetection) {
            goLiveWithVerse(detected)
          }
        }
      } catch {
        // Silently ignore
      }
    }

    if (!foundAny) {
      toast.info('No Bible references detected in the text')
    }
    setManualInput('')
  }, [manualInput, selectedTranslation, addDetectedVerse, setLiveVerse, addToVerseHistory, settings.autoGoLiveOnDetection, goLiveWithVerse])

  // ── Toggle listening via store command ───────────────────────────────
  const toggleListening = () => {
    if (isListening) {
      setSpeechCommand('stop')
    } else {
      processedRefsRef.current = new Set()
      setSpeechCommand('start')
    }
  }

  // ── Reset transcript ────────────────────────────────────────────────
  const handleReset = () => {
    setSpeechCommand('reset')
  }

  // ── Fullscreen toggle ───────────────────────────────────────────────
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      liveDisplayRef.current?.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* Main Detection Panel */}
      <div className="flex-1 flex flex-col p-4 md:p-6 lg:p-8 overflow-y-auto">
        {/* Top Controls */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">Live Scripture Detection</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Detects Bible references from speech or text input
              {isListening && (
                <span className="text-emerald-400 ml-1.5 font-medium">
                  — Active in background
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Auto Go-Live Toggle */}
            <button
              onClick={() => updateSettings({ autoGoLiveOnDetection: !settings.autoGoLiveOnDetection })}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                settings.autoGoLiveOnDetection
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                  : 'bg-muted border-border text-muted-foreground hover:bg-muted/80',
              )}
            >
              <Zap className={cn('h-3.5 w-3.5', settings.autoGoLiveOnDetection && 'text-emerald-400')} />
              Auto Go-Live
            </button>
            {liveTranscript && (
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={handleReset}>
                <RotateCcw className="h-3 w-3" />
                Reset
              </Button>
            )}
          </div>
        </div>

        {/* Mic Button */}
        <div className="flex flex-col items-center mb-6">
          <button
            onClick={toggleListening}
            className={cn(
              'relative flex h-20 w-20 items-center justify-center rounded-full transition-all duration-300',
              isListening
                ? 'bg-red-500/20 shadow-[0_0_40px_rgba(239,68,68,0.3)] hover:bg-red-500/30'
                : 'bg-primary/15 shadow-[0_0_40px_rgba(234,179,8,0.1)] hover:bg-primary/25',
            )}
          >
            {isListening && (
              <span className="absolute inset-0 rounded-full border-2 border-red-500/50 animate-ping pointer-events-none" />
            )}
            {isListening ? (
              <MicOff className="h-9 w-9 text-red-400" />
            ) : (
              <Mic className="h-9 w-9 text-primary" />
            )}
          </button>
          <p className="mt-3 text-sm font-medium text-foreground">
            {isListening ? 'Listening for Bible verses...' : 'Tap to start listening'}
          </p>
          {isListening && (
            <div className="flex items-center gap-1.5 mt-2">
              <Badge variant="destructive" className="gap-1.5">
                <span className="live-indicator inline-block h-2 w-2 rounded-full bg-white" />
                LIVE
              </Badge>
              <span className="text-[10px] text-muted-foreground">Runs in background</span>
            </div>
          )}
        </div>

        {/* Manual Input Fallback */}
        <Card className="mb-6 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Type className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Or type/paste text to detect verses</span>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder='Paste sermon text here... (e.g. "Turn to Romans 8:28")'
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleManualDetect()}
                className="flex-1 h-9 bg-card border-border text-sm"
              />
              <Button onClick={handleManualDetect} size="sm" className="h-9 gap-1.5">
                <BookOpen className="h-3.5 w-3.5" />
                Detect
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Browser Not Supported */}
        {!speechSupported && (
          <Card className="mb-4 border-amber-500/30 bg-amber-500/5">
            <CardContent className="flex items-start gap-3 p-4">
              <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-300">Browser Not Supported</p>
                <p className="text-xs text-amber-400/70 mt-1">
                  Speech recognition requires Google Chrome or Microsoft Edge. Use the manual text input above as an alternative.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Speech Error Messages */}
        {speechError && (
          <Card className="mb-4 border-destructive/30 bg-destructive/5">
            <CardContent className="flex items-start gap-3 p-4">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-destructive">{speechError}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Try the manual text input above as an alternative to speech detection.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Info about background listening */}
        <Card className="mb-6 border-blue-500/20 bg-blue-500/5">
          <CardContent className="flex items-start gap-3 p-3">
            <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-300/70 leading-relaxed">
              Speech recognition runs <strong>continuously in the background</strong> — it won&apos;t stop when you switch pages, minimize the app, or open another tab.
              Detected verses are automatically sent to Live Presenter when Auto Go-Live is enabled.
              Use <strong>Google Chrome</strong> for best results.
            </p>
          </CardContent>
        </Card>

        {/* Live Transcript - Always visible when listening */}
        <Card className="mb-6 border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Volume2 className="h-4 w-4 text-muted-foreground" />
              Live Transcript
              {isListening && <span className="live-indicator inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="max-h-48 overflow-y-auto rounded-lg bg-muted/30 p-4 min-h-[60px]">
              {(liveTranscript || liveInterimTranscript) ? (
                <p className="text-sm text-foreground/80 whitespace-pre-wrap">
                  {liveTranscript}
                  {liveInterimTranscript && (
                    <span className="text-muted-foreground italic"> {liveInterimTranscript}</span>
                  )}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  {isListening ? 'Listening... speak into your microphone' : 'Transcript will appear here when you start listening'}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Live Verse Display */}
        <AnimatePresence mode="wait">
          {liveVerse && (
            <motion.div
              ref={liveDisplayRef}
              key={liveVerse.reference}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              className={cn(
                'bg-gradient-to-br from-card to-card/80 border border-primary/20 rounded-xl overflow-hidden relative',
                isFullscreen && 'flex items-center justify-center min-h-screen',
              )}
            >
              {settings.customBackground && (
                <div className="absolute inset-0 rounded-xl overflow-hidden">
                  <img src={settings.customBackground} alt="" className="w-full h-full object-cover opacity-20" />
                  <div className="absolute inset-0 bg-black/40" />
                </div>
              )}
              <CardContent className={cn('p-8 md:p-12 relative', isFullscreen && 'max-w-4xl')}>
                <div className="flex items-center justify-between mb-4">
                  <Badge className="bg-primary/15 text-primary border-primary/20 text-xs">LIVE DETECTED</Badge>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1.5"
                      onClick={() => goLiveWithVerse({
                        reference: liveVerse.reference,
                        text: liveVerse.text,
                        translation: liveVerse.translation,
                      }, false)}
                    >
                      <Send className="h-3.5 w-3.5" />
                      Send to Live
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 text-xs lg:hidden" onClick={toggleFullscreen}>
                      <Maximize2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="relative">
                  <p
                    className="text-2xl md:text-3xl lg:text-4xl font-medium text-foreground leading-relaxed text-center verse-highlight"
                    style={{ textShadow: settings.textShadow ? '0 2px 12px rgba(0,0,0,0.3)' : 'none' }}
                  >
                    {liveVerse.text}
                  </p>
                  <p className="text-center mt-6 text-base md:text-lg text-primary font-medium">
                    — {liveVerse.reference} ({liveVerse.translation})
                  </p>
                </div>
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Detected Verses Sidebar */}
      <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-border bg-card/30 flex flex-col shrink-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Detected ({detectedVerses.length})</span>
          </div>
          {detectedVerses.length > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={clearDetectedVerses}>
              <Trash2 className="h-3 w-3 mr-1" /> Clear
            </Button>
          )}
        </div>
        <ScrollArea className="flex-1">
          {detectedVerses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <BookOpen className="h-8 w-8 text-muted-foreground/50 mb-2" />
              <p className="text-xs text-muted-foreground">Detected verses will appear here</p>
              {isListening && (
                <p className="text-[10px] text-muted-foreground/70 mt-1">
                  Listening in the background...
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2 p-3">
              {detectedVerses.map((verse, i) => (
                <motion.div
                  key={verse.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={cn(
                    'rounded-lg p-3 transition-colors cursor-pointer',
                    liveVerse?.reference === verse.reference
                      ? 'bg-primary/10 border border-primary/20'
                      : 'bg-muted/30 hover:bg-muted/50 border border-transparent',
                  )}
                  onClick={() => setLiveVerse({
                    reference: verse.reference,
                    text: verse.text,
                    translation: verse.translation,
                    book: '',
                    chapter: 0,
                    verseStart: 0,
                  })}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-primary">{verse.reference}</span>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {verse.detectedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">{verse.text}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[10px] gap-1 mt-2 w-full"
                    onClick={(e) => { e.stopPropagation(); goLiveWithVerse(verse, false) }}
                  >
                    <Send className="h-3 w-3" />
                    Send to Live
                  </Button>
                </motion.div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  )
}
