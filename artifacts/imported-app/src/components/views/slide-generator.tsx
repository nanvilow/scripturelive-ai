'use client'

import { useState } from 'react'
import { useAppStore, type Slide } from '@/lib/store'
import { fetchBibleVerse, splitVerseIntoSlides } from '@/lib/bible-api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sparkles,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  BookOpen,
  Presentation,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'

const slideThemes = [
  { id: 'worship', name: 'Worship', bg: 'from-violet-950/80 to-indigo-950/80', accent: 'text-violet-300' },
  { id: 'sermon', name: 'Sermon', bg: 'from-amber-950/80 to-orange-950/80', accent: 'text-amber-300' },
  { id: 'easter', name: 'Easter', bg: 'from-emerald-950/80 to-teal-950/80', accent: 'text-emerald-300' },
  { id: 'christmas', name: 'Christmas', bg: 'from-red-950/80 to-rose-950/80', accent: 'text-rose-300' },
  { id: 'praise', name: 'Praise', bg: 'from-yellow-950/80 to-amber-950/80', accent: 'text-yellow-300' },
  { id: 'minimal', name: 'Minimal', bg: 'from-zinc-950 to-neutral-950', accent: 'text-zinc-300' },
]

export function SlideGeneratorView() {
  const { slides, setSlides, previewSlideIndex, setPreviewSlideIndex, selectedTranslation } = useAppStore()
  const [topic, setTopic] = useState('')
  const [bibleRef, setBibleRef] = useState('')
  const [selectedTheme, setSelectedTheme] = useState('worship')
  const [isGenerating, setIsGenerating] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)

  const currentSlide = slides[previewSlideIndex] || null
  const theme = slideThemes.find((t) => t.id === selectedTheme) || slideThemes[0]

  const generateFromVerse = async () => {
    if (!bibleRef.trim()) {
      toast.error('Please enter a Bible reference')
      return
    }

    setIsGenerating(true)
    try {
      const verse = await fetchBibleVerse(bibleRef, selectedTranslation)
      if (!verse) {
        toast.error('Could not fetch verse. Please check the reference.')
        setIsGenerating(false)
        return
      }

      const verseSlides = splitVerseIntoSlides(verse, 2)
      const newSlides: Slide[] = [
        {
          id: `slide-${Date.now()}-0`,
          type: 'title',
          title: verse.reference,
          subtitle: verse.translation,
          content: [],
          background: selectedTheme,
        },
        ...verseSlides.map((lines, i) => ({
          id: `slide-${Date.now()}-${i + 1}`,
          type: 'verse' as const,
          title: verse.reference,
          subtitle: i > 0 ? `(continued)` : '',
          content: lines,
          background: selectedTheme,
        })),
      ]

      useAppStore.getState().addScheduleItem({
        type: 'verse',
        title: verse.reference,
        subtitle: verse.translation,
        slides: newSlides,
      })
      setSlides(newSlides)
      setPreviewSlideIndex(0)
      // Suppressed per FRS — schedule list is the source of truth.
    } catch {
      toast.error('Failed to generate slides')
    } finally {
      setIsGenerating(false)
    }
  }

  const generateWithAI = async () => {
    if (!topic.trim()) {
      toast.error('Please enter a sermon topic or passage')
      return
    }

    setIsGenerating(true)
    try {
      const response = await fetch('/api/ai/generate-slides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, theme: selectedTheme, translation: selectedTranslation }),
      })

      if (!response.ok) throw new Error('Failed to generate')

      const data = await response.json()
      const aiSlides: Slide[] = data.slides || []

      if (aiSlides.length > 0) {
        useAppStore.getState().addScheduleItem({
          type: 'sermon',
          title: topic.trim() || 'AI Slides',
          slides: aiSlides,
        })
        setSlides(aiSlides)
        setPreviewSlideIndex(0)
        // Suppressed per FRS — schedule list is the source of truth.
      } else {
        toast.error('AI could not generate slides. Try a different topic.')
      }
    } catch {
      toast.error('Failed to generate slides with AI')
    } finally {
      setIsGenerating(false)
    }
  }

  const addBlankSlide = () => {
    const newSlide: Slide = {
      id: `slide-${Date.now()}`,
      type: 'blank',
      title: 'New Slide',
      subtitle: '',
      content: [],
      background: selectedTheme,
    }
    setSlides([...slides, newSlide])
    setPreviewSlideIndex(slides.length)
  }

  const removeSlide = (index: number) => {
    const newSlides = slides.filter((_, i) => i !== index)
    setSlides(newSlides)
    if (previewSlideIndex >= newSlides.length) {
      setPreviewSlideIndex(Math.max(0, newSlides.length - 1))
    }
  }

  const exportSlides = async () => {
    if (slides.length === 0) {
      toast.error('No slides to export')
      return
    }

    try {
      const response = await fetch('/api/presentations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: topic || 'Presentation',
          slides: slides.map(s => ({ ...s, background: s.background || selectedTheme })),
          theme: selectedTheme,
        }),
      })
      const data = await response.json()
      toast.success(`Presentation saved: ${data.id}`)
    } catch {
      toast.error('Failed to save presentation')
    }
  }

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* Left Panel - Controls */}
      <div className="w-full lg:w-96 border-b lg:border-b-0 lg:border-r border-border p-4 md:p-6 overflow-y-auto shrink-0">
        <div className="space-y-5">
          {/* Topic Input */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              Sermon Topic or Passage
            </label>
            <Textarea
              placeholder="e.g. The Power of Faith, Grace and Salvation, Love One Another..."
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="min-h-[80px] bg-card border-border resize-none"
            />
          </div>

          {/* Bible Reference */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              Bible Reference (optional)
            </label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. Romans 8:28"
                value={bibleRef}
                onChange={(e) => setBibleRef(e.target.value)}
                className="bg-card border-border"
              />
              <Button
                variant="outline"
                size="icon"
                className="shrink-0 h-10 w-10"
                onClick={generateFromVerse}
                disabled={!bibleRef.trim() || isGenerating}
              >
                <BookOpen className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Theme Selection */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Slide Theme</label>
            <div className="grid grid-cols-3 gap-2">
              {slideThemes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTheme(t.id)}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-lg p-2.5 transition-all border',
                    selectedTheme === t.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-muted-foreground/30'
                  )}
                >
                  <div className={cn('h-6 w-6 rounded-md bg-gradient-to-br', t.bg)} />
                  <span className="text-[11px] font-medium">{t.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Generate Buttons */}
          <div className="flex flex-col gap-2">
            <Button
              onClick={generateWithAI}
              disabled={isGenerating || !topic.trim()}
              className="w-full gap-2"
            >
              {isGenerating ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Generate with AI
            </Button>
            <Button
              variant="outline"
              onClick={generateFromVerse}
              disabled={!bibleRef.trim() || isGenerating}
              className="w-full gap-2"
            >
              <BookOpen className="h-4 w-4" />
              Generate from Bible Verse
            </Button>
          </div>

          {/* Slide List */}
          {slides.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-foreground">
                  Slides ({slides.length})
                </label>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={addBlankSlide}>
                  <Plus className="h-3 w-3" />
                  Add
                </Button>
              </div>
              <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
                {slides.map((slide, i) => (
                  <div
                    key={slide.id}
                    onClick={() => setPreviewSlideIndex(i)}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer transition-colors',
                      previewSlideIndex === i
                        ? 'bg-primary/10 border border-primary/20'
                        : 'bg-muted/30 hover:bg-muted/50 border border-transparent'
                    )}
                  >
                    <div className="flex h-6 w-6 items-center justify-center rounded bg-muted text-[10px] font-bold text-muted-foreground">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{slide.title || 'Untitled'}</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {slide.type} {slide.subtitle && `· ${slide.subtitle}`}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeSlide(i)
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Export */}
          {slides.length > 0 && (
            <Button variant="outline" className="w-full gap-2" onClick={exportSlides}>
              <Download className="h-4 w-4" />
              Save Presentation
            </Button>
          )}
        </div>
      </div>

      {/* Right Panel - Preview */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 bg-background relative overflow-hidden">
        {isGenerating ? (
          <div className="text-center space-y-4">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
            <p className="text-sm text-muted-foreground">Generating slides...</p>
          </div>
        ) : slides.length === 0 ? (
          <div className="text-center space-y-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted mx-auto">
              <Presentation className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1">AI Slide Generator</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Enter a sermon topic or Bible reference to generate beautiful
                presentation slides.
              </p>
              <p className="text-xs text-muted-foreground/70 mt-2">
                Powered by WassMedia (+233246798526)
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Preview Controls */}
            <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
              <Button
                variant="ghost"
                size="sm"
                className={cn('h-8 text-xs', previewMode && 'bg-primary/15 text-primary')}
                onClick={() => setPreviewMode(!previewMode)}
              >
                <Eye className="h-3.5 w-3.5 mr-1" />
                {previewMode ? 'Edit' : 'Preview'}
              </Button>
            </div>

            {/* Slide Display */}
            <div className="relative w-full max-w-4xl aspect-video">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentSlide?.id}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.3 }}
                  className={cn(
                    'w-full h-full rounded-xl bg-gradient-to-br flex flex-col items-center justify-center p-8 md:p-12 shadow-2xl border border-border/20',
                    theme.bg
                  )}
                >
                  {currentSlide?.type === 'title' && (
                    <>
                      <h2 className={cn('text-4xl md:text-5xl lg:text-6xl font-bold text-center', theme.accent)}>
                        {currentSlide.title}
                      </h2>
                      {currentSlide.subtitle && (
                        <p className={cn('text-xl md:text-2xl mt-4 opacity-70', theme.accent)}>
                          {currentSlide.subtitle}
                        </p>
                      )}
                    </>
                  )}

                  {currentSlide?.type === 'verse' && (
                    <div className="text-center max-w-3xl">
                      <p className={cn('text-lg md:text-xl opacity-60 mb-6', theme.accent)}>
                        {currentSlide.title}
                      </p>
                      {currentSlide.content.map((line, i) => (
                        <p
                          key={i}
                          className={cn('text-2xl md:text-3xl lg:text-4xl font-medium leading-relaxed', theme.accent)}
                          style={{ textShadow: '0 2px 16px rgba(0,0,0,0.5)' }}
                        >
                          {line}
                        </p>
                      ))}
                    </div>
                  )}

                  {currentSlide?.type === 'lyrics' && (
                    <div className="text-center max-w-3xl space-y-2">
                      <p className={cn('text-sm opacity-60 mb-4', theme.accent)}>
                        {currentSlide.title}
                      </p>
                      {currentSlide.content.map((line, i) => (
                        <p key={i} className={cn('text-xl md:text-2xl font-medium', theme.accent)}>
                          {line}
                        </p>
                      ))}
                    </div>
                  )}

                  {currentSlide?.type === 'blank' && (
                    <div className={cn('text-2xl text-muted-foreground', theme.accent)}>
                      Blank Slide
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Navigation */}
            <div className="flex items-center gap-4 mt-6">
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10"
                onClick={() => setPreviewSlideIndex(Math.max(0, previewSlideIndex - 1))}
                disabled={previewSlideIndex === 0}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <span className="text-sm text-muted-foreground min-w-[80px] text-center">
                {previewSlideIndex + 1} / {slides.length}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10"
                onClick={() => setPreviewSlideIndex(Math.min(slides.length - 1, previewSlideIndex + 1))}
                disabled={previewSlideIndex === slides.length - 1}
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
