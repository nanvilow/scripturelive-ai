'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useAppStore } from '@/lib/store'
import { parseVerseReference, fetchBibleVerse, splitVerseIntoSlides, TRANSLATIONS_INFO, getAutocompleteSuggestions, type AutocompleteSuggestion } from '@/lib/bible-api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Search,
  BookOpen,
  Copy,
  ChevronLeft,
  ChevronRight,
  Split,
  Maximize2,
  Minimize2,
  History,
  RotateCcw,
  Send,
  Languages,
  Zap,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export function BibleLookupView() {
  const {
    selectedTranslation,
    setSelectedTranslation,
    currentVerse,
    setCurrentVerse,
    addToVerseHistory,
    verseHistory,
    searchQuery,
    setSearchQuery,
    setSlides,
    setPreviewSlideIndex,
    setCurrentView,
    settings,
    updateSettings,
  } = useAppStore()

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [splitMode, setSplitMode] = useState<false | 2 | 4>(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [currentSplitIndex, setCurrentSplitIndex] = useState(0)
  const [lookupTranslation, setLookupTranslation] = useState(selectedTranslation)
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1)
  const suggestionsRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const searchVerse = useCallback(async (query?: string, translation?: string) => {
    const q = query || searchQuery
    const t = translation || lookupTranslation
    if (!q.trim()) return

    setIsLoading(true)
    setError(null)
    setCurrentSplitIndex(0)
    setShowSuggestions(false)

    try {
      const parsed = parseVerseReference(q)
      if (!parsed) {
        setError('Could not parse the reference. Try format like "John 3:16" or "Psalms 23"')
        setIsLoading(false)
        return
      }

      const verse = await fetchBibleVerse(q, t)
      if (verse) {
        setCurrentVerse(verse)
        addToVerseHistory(verse)

        // Auto go-live if enabled
        if (settings.autoGoLiveOnLookup) {
          goToLiveWithVerse(verse)
        }
      } else {
        setError('Could not fetch this verse. Please check the reference and try again.')
      }
    } catch (err) {
      setError('An error occurred while fetching the verse.')
    } finally {
      setIsLoading(false)
    }
  }, [searchQuery, lookupTranslation, setCurrentVerse, addToVerseHistory, settings.autoGoLiveOnLookup])

  const goToLiveWithVerse = (verse: typeof currentVerse) => {
    if (!verse) return

    const verseSlides = splitMode ? splitVerseIntoSlides(verse, splitMode) : [verse.text.split('\n').filter(Boolean)]
    const theme = settings.congregationScreenTheme

    const newSlides = [
      {
        id: `slide-${Date.now()}-0`,
        type: 'verse' as const,
        title: verse.reference,
        subtitle: verse.translation,
        content: splitMode && verseSlides.length > 0 ? verseSlides[currentSplitIndex] || verseSlides[0] : [verse.text],
        background: theme,
      },
    ]

    setSlides(newSlides)
    setPreviewSlideIndex(0)
    setCurrentView('presenter')
    toast.success('Verse sent to Live Presenter')
  }

  const goToLive = () => {
    if (!currentVerse) return
    goToLiveWithVerse(currentVerse)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedSuggestionIndex(prev => Math.min(prev + 1, suggestions.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedSuggestionIndex(prev => Math.max(prev - 1, 0))
        return
      }
      if (e.key === 'Enter' && selectedSuggestionIndex >= 0) {
        e.preventDefault()
        const suggestion = suggestions[selectedSuggestionIndex]
        if (suggestion) {
          setSearchQuery(suggestion.reference)
          setShowSuggestions(false)
          setSelectedSuggestionIndex(-1)
          searchVerse(suggestion.reference)
        }
        return
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      searchVerse()
    }
    if (e.key === 'Escape') {
      setShowSuggestions(false)
      setSelectedSuggestionIndex(-1)
    }
  }

  const handleInputChange = (value: string) => {
    setSearchQuery(value)
    if (value.trim().length >= 2) {
      const results = getAutocompleteSuggestions(value)
      setSuggestions(results)
      setShowSuggestions(results.length > 0)
      setSelectedSuggestionIndex(-1)
    } else {
      setSuggestions([])
      setShowSuggestions(false)
    }
  }

  const selectSuggestion = (suggestion: AutocompleteSuggestion) => {
    setSearchQuery(suggestion.reference)
    setShowSuggestions(false)
    setSelectedSuggestionIndex(-1)
    searchVerse(suggestion.reference)
  }

  const handleTranslationChange = (t: string) => {
    setLookupTranslation(t)
    setSelectedTranslation(t)
    // Re-search with new translation if verse exists
    if (searchQuery.trim()) {
      searchVerse(searchQuery, t)
    }
  }

  const copyVerse = () => {
    if (currentVerse) {
      navigator.clipboard.writeText(`${currentVerse.text}\n— ${currentVerse.reference} (${currentVerse.translation})`)
      toast.success('Verse copied to clipboard')
    }
  }

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  // Sync lookupTranslation with global selectedTranslation
  useEffect(() => {
    setLookupTranslation(selectedTranslation)
  }, [selectedTranslation])

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node) &&
          searchInputRef.current && !searchInputRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const splitSlides = currentVerse && splitMode ? splitVerseIntoSlides(currentVerse, splitMode) : []

  return (
    <div className="flex h-full">
      {/* Main Content */}
      <div className="flex-1 flex flex-col p-4 md:p-6 lg:p-8">
        {/* Search Bar */}
        <div className="flex flex-col sm:flex-row gap-2 mb-2 max-w-3xl relative">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder='Search verses... (e.g. "joh 3 16", "Psalms 23")'
              value={searchQuery}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                if (suggestions.length > 0 && searchQuery.trim().length >= 2) {
                  setShowSuggestions(true)
                }
              }}
              className="pl-10 h-11 bg-card border-border"
              autoComplete="off"
            />
            {/* Autocomplete Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div
                ref={suggestionsRef}
                className="absolute top-full left-0 right-0 z-50 mt-1 bg-card border border-border rounded-lg shadow-xl overflow-hidden"
              >
                {suggestions.map((suggestion, index) => (
                  <button
                    key={suggestion.display}
                    onClick={() => selectSuggestion(suggestion)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors text-sm',
                      index === selectedSuggestionIndex
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-muted/50 text-foreground'
                    )}
                  >
                    <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{suggestion.display}</span>
                      {suggestion.book && (
                        <span className="text-xs text-muted-foreground ml-2">
                          {suggestion.chapter ? `Ch. ${suggestion.chapter}` : ''}
                          {suggestion.verse ? `:${suggestion.verse}` : ''}
                        </span>
                      )}
                    </div>
                    <Sparkles className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            {/* Translation Selector */}
            <Select value={lookupTranslation} onValueChange={handleTranslationChange}>
              <SelectTrigger className="w-[100px] h-11 bg-card border-border">
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
            <Button onClick={() => searchVerse()} disabled={isLoading} className="h-11 px-6">
              {isLoading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Lookup
            </Button>
          </div>
        </div>

        {/* Auto Go-Live Toggle + Quick Actions */}
        <div className="flex items-center justify-between mb-6 max-w-3xl">
          <div className="flex items-center gap-2">
            <button
              onClick={() => updateSettings({ autoGoLiveOnLookup: !settings.autoGoLiveOnLookup })}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                settings.autoGoLiveOnLookup
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                  : 'bg-muted border-border text-muted-foreground hover:bg-muted/80'
              )}
            >
              <Zap className={cn('h-3.5 w-3.5', settings.autoGoLiveOnLookup && 'text-emerald-400')} />
              Auto Go-Live on Lookup
            </button>
          </div>
        </div>

        {/* Verse Display */}
        <div className="flex-1 flex flex-col items-center justify-center">
          {isLoading ? (
            <div className="w-full max-w-3xl space-y-4">
              <Skeleton className="h-6 w-48 mx-auto" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-11/12 mx-auto" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-9/12 mx-auto" />
            </div>
          ) : currentVerse ? (
            <div className="w-full max-w-4xl">
              {/* Controls Bar */}
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                    <Languages className="h-3 w-3 mr-1" />
                    {currentVerse.translation}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    {currentVerse.reference}
                  </Badge>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn('h-8 text-xs', splitMode === 2 && 'bg-primary/15 text-primary')}
                    onClick={() => { setSplitMode(splitMode === 2 ? false : 2); setCurrentSplitIndex(0) }}
                  >
                    <Split className="h-3.5 w-3.5 mr-1" />
                    2-Line
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn('h-8 text-xs', splitMode === 4 && 'bg-primary/15 text-primary')}
                    onClick={() => { setSplitMode(splitMode === 4 ? false : 4); setCurrentSplitIndex(0) }}
                  >
                    <Split className="h-3.5 w-3.5 mr-1" />
                    4-Line
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={copyVerse}>
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    Copy
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={toggleFullscreen}>
                    {isFullscreen ? (
                      <Minimize2 className="h-3.5 w-3.5" />
                    ) : (
                      <Maximize2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  {/* Go Live Button */}
                  <Button
                    onClick={goToLive}
                    className="h-8 text-xs gap-1.5 bg-red-600 hover:bg-red-700 text-white"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Go Live
                  </Button>
                </div>
              </div>

              {/* Split mode navigation */}
              {splitSlides.length > 1 && (
                <div className="flex items-center justify-center gap-3 mb-4">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setCurrentSplitIndex(Math.max(0, currentSplitIndex - 1))}
                    disabled={currentSplitIndex === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Slide {currentSplitIndex + 1} of {splitSlides.length}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setCurrentSplitIndex(Math.min(splitSlides.length - 1, currentSplitIndex + 1))}
                    disabled={currentSplitIndex === splitSlides.length - 1}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* Verse Text */}
              <Card
                className="relative bg-gradient-to-br from-card to-card/80 border-border/50 overflow-hidden"
              >
                {settings.customBackground && (
                  <div className="absolute inset-0">
                    <img
                      src={settings.customBackground}
                      alt=""
                      className="w-full h-full object-cover opacity-30"
                    />
                    <div className="absolute inset-0 bg-black/50" />
                  </div>
                )}
                <CardContent className="relative p-8 md:p-12">
                  {splitMode && splitSlides.length > 0 ? (
                    <div className="text-center space-y-1 slide-transition" key={currentSplitIndex}>
                      {splitSlides[currentSplitIndex].map((line, i) => (
                        <p
                          key={i}
                          className="text-2xl md:text-3xl lg:text-4xl font-medium text-foreground leading-relaxed"
                          style={{ textShadow: settings.textShadow ? '0 2px 12px rgba(0,0,0,0.3)' : 'none' }}
                        >
                          {line}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center">
                      <p
                        className="text-xl md:text-2xl lg:text-3xl font-medium text-foreground leading-relaxed whitespace-pre-line verse-highlight"
                        style={{ textShadow: settings.textShadow ? '0 2px 12px rgba(0,0,0,0.3)' : 'none' }}
                      >
                        {currentVerse.text}
                      </p>
                    </div>
                  )}
                  {settings.showReferenceOnOutput && (
                    <p className="text-center mt-6 text-sm md:text-base text-primary font-medium">
                      — {currentVerse.reference} ({currentVerse.translation})
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : error ? (
            <div className="text-center space-y-3">
              <BookOpen className="h-12 w-12 text-muted-foreground/50 mx-auto" />
              <p className="text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" onClick={() => setError(null)}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            </div>
          ) : (
            <div className="text-center space-y-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted mx-auto">
                <BookOpen className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-1">Bible Verse Lookup</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Search for any Bible verse by reference. Type just 3+ letters (e.g. &quot;joh 3 16&quot;) for autocomplete. Supports 17 translations, smart verse splitting, and live output.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 mt-4">
                {['John 3:16', 'Psalms 23', 'Romans 8:28', 'Philippians 4:13', 'Isaiah 40:31'].map((ref) => (
                  <Badge
                    key={ref}
                    variant="outline"
                    className="cursor-pointer hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors py-1.5 px-3"
                    onClick={() => {
                      setSearchQuery(ref)
                      searchVerse(ref)
                    }}
                  >
                    {ref}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* History Sidebar - Desktop */}
      <div className="hidden w-72 border-l border-border bg-card/30 flex-col shrink-0 lg:flex">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">History</span>
          </div>
        </div>
        <ScrollArea className="flex-1">
          {verseHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <History className="h-8 w-8 text-muted-foreground/50 mb-2" />
              <p className="text-xs text-muted-foreground">No verse history yet</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1 p-2">
              {verseHistory.map((verse, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setCurrentVerse(verse)
                    setCurrentSplitIndex(0)
                  }}
                  className={cn(
                    'flex flex-col items-start rounded-lg px-3 py-2 text-left transition-colors',
                    currentVerse?.reference === verse.reference
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                  )}
                >
                  <span className="text-sm font-medium">{verse.reference}</span>
                  <span className="text-[11px] text-muted-foreground truncate max-w-full">
                    {verse.text.slice(0, 60)}...
                  </span>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  )
}
