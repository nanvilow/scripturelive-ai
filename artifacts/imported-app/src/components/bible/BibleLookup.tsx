'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { BookOpen, Search, Copy, ChevronDown, ChevronUp, Loader2, History, SplitSquareVertical } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppStore, type BibleVerse } from '@/lib/store'
import { parseVerseReference, splitVerseIntoSlides, getBookNames } from '@/lib/bible-api'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

export function BibleLookup() {
  const {
    selectedTranslation,
    currentVerse,
    setCurrentVerse,
    addToVerseHistory,
    verseHistory,
    searchQuery,
    setSearchQuery,
  } = useAppStore()

  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [expandedHistory, setExpandedHistory] = useState(false)
  const [bookSuggestions, setBookSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [splitMode, setSplitMode] = useState<2 | 4 | 0>(0) // 0 = no split
  const inputRef = useRef<HTMLInputElement>(null)

  const books = getBookNames()

  const handleInputChange = useCallback((value: string) => {
    setInputValue(value)
    if (value.length > 0) {
      const filtered = books.filter((b) =>
        b.toLowerCase().startsWith(value.toLowerCase())
      ).slice(0, 6)
      setBookSuggestions(filtered)
      setShowSuggestions(filtered.length > 0)
    } else {
      setShowSuggestions(false)
    }
  }, [books])

  const lookupVerse = useCallback(async (reference: string) => {
    const trimmed = reference.trim()
    if (!trimmed) return

    const parsed = parseVerseReference(trimmed)
    if (!parsed) {
      toast.error('Invalid verse reference', { description: 'Try format like "John 3:16" or "Psalm 23:1-4"' })
      return
    }

    setLoading(true)
    setShowSuggestions(false)

    try {
      const res = await fetch(`/api/bible?reference=${encodeURIComponent(trimmed)}&translation=${selectedTranslation}`)
      if (!res.ok) throw new Error('Verse not found')

      const verse: BibleVerse = await res.json()
      setCurrentVerse(verse)
      addToVerseHistory(verse)
      toast.success(`Loaded ${verse.reference}`)
    } catch (err) {
      toast.error('Failed to load verse', { description: 'Check the reference and try again.' })
    } finally {
      setLoading(false)
    }
  }, [selectedTranslation, setCurrentVerse, addToVerseHistory])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      lookupVerse(inputValue)
    }
    if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  const copyVerse = () => {
    if (currentVerse) {
      navigator.clipboard.writeText(`${currentVerse.reference}\n\n${currentVerse.text}\n\n— ${currentVerse.translation}`)
      toast.success('Copied to clipboard')
    }
  }

  const verseSlides = currentVerse ? splitVerseIntoSlides(currentVerse, (splitMode || 2) as 2 | 4) : []

  return (
    <div className="space-y-6">
      {/* Search Section */}
      <Card className="border-border/50">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Bible Verse Lookup</CardTitle>
          </div>
          <CardDescription>
            Search by reference (e.g., &quot;John 3:16&quot;, &quot;Psalm 23:1-4&quot;)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter verse reference..."
                  className="pl-9"
                  disabled={loading}
                />
                {/* Book Suggestions Dropdown */}
                <AnimatePresence>
                  {showSuggestions && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="absolute top-full left-0 right-0 z-50 mt-1 rounded-lg border border-border/80 bg-popover shadow-xl overflow-hidden"
                    >
                      {bookSuggestions.map((book) => (
                        <button
                          key={book}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-accent/50 transition-colors flex items-center gap-2"
                          onClick={() => {
                            setInputValue(book + ' ')
                            setShowSuggestions(false)
                            inputRef.current?.focus()
                          }}
                        >
                          <BookOpen className="h-3 w-3 text-muted-foreground" />
                          {book}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <Button onClick={() => lookupVerse(inputValue)} disabled={loading || !inputValue.trim()} className="gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Lookup
              </Button>
            </div>
          </div>

          {/* Quick Access Books */}
          <div className="flex flex-wrap gap-1.5 mt-4">
            {['Genesis 1:1', 'John 3:16', 'Psalm 23', 'Romans 8:28', 'Philippians 4:13', 'Isaiah 40:31'].map((ref) => (
              <Badge
                key={ref}
                variant="outline"
                className="cursor-pointer hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors text-xs"
                onClick={() => lookupVerse(ref)}
              >
                {ref}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Verse Display */}
        <div className="lg:col-span-2 space-y-4">
          {loading ? (
            <Card className="border-border/50">
              <CardContent className="p-8 space-y-4">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-5/6" />
              </CardContent>
            </Card>
          ) : currentVerse ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {/* Main Verse Display - Projector Ready */}
              <Card className="border-border/50 overflow-hidden">
                <div className="bg-gradient-to-br from-card via-card to-accent/5 p-8 lg:p-12">
                  <div className="text-center space-y-6">
                    {/* Reference Badge */}
                    <Badge variant="secondary" className="text-sm font-medium px-4 py-1.5">
                      {currentVerse.reference}
                    </Badge>

                    {/* Verse Text */}
                    <p className="projection-text font-serif leading-relaxed text-foreground/90">
                      {currentVerse.text}
                    </p>

                    {/* Translation */}
                    <p className="text-sm text-muted-foreground">
                      — {currentVerse.translation}
                    </p>
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center justify-between p-4 border-t border-border/50">
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={copyVerse} className="gap-1.5 text-xs">
                      <Copy className="h-3 w-3" />
                      Copy
                    </Button>
                    <div className="flex items-center gap-1">
                      <Button
                        variant={splitMode === 0 ? 'secondary' : 'ghost'}
                        size="sm"
                        className="text-xs"
                        onClick={() => setSplitMode(0)}
                      >
                        Full
                      </Button>
                      <Button
                        variant={splitMode === 2 ? 'secondary' : 'ghost'}
                        size="sm"
                        className="text-xs gap-1"
                        onClick={() => setSplitMode(2)}
                      >
                        <SplitSquareVertical className="h-3 w-3" />
                        2-line
                      </Button>
                      <Button
                        variant={splitMode === 4 ? 'secondary' : 'ghost'}
                        size="sm"
                        className="text-xs gap-1"
                        onClick={() => setSplitMode(4)}
                      >
                        <SplitSquareVertical className="h-3 w-3" />
                        4-line
                      </Button>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    {currentVerse.book} Ch.{currentVerse.chapter}
                  </Badge>
                </div>
              </Card>

              {/* Split View */}
              {splitMode > 0 && (
                <Card className="border-border/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <SplitSquareVertical className="h-4 w-4 text-primary" />
                      Smart Split — {splitMode}-Line Slides
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {verseSlides.map((slide, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="rounded-lg border border-border/50 bg-muted/30 p-4"
                      >
                        <p className="text-xs text-muted-foreground mb-2">Slide {i + 1}</p>
                        <div className="space-y-1">
                          {slide.map((line, j) => (
                            <p key={j} className="text-sm leading-relaxed">{line}</p>
                          ))}
                        </div>
                        {i < verseSlides.length - 1 && (
                          <p className="text-[10px] text-muted-foreground/50 mt-2 text-right">— continues —</p>
                        )}
                      </motion.div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </motion.div>
          ) : (
            <Card className="border-border/50">
              <CardContent className="p-12 text-center">
                <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground text-sm">
                  Enter a Bible reference to display the verse
                </p>
                <p className="text-muted-foreground/50 text-xs mt-1">
                  Try &quot;John 3:16&quot;, &quot;Psalm 23:1-4&quot;, or &quot;Romans 8:28&quot;
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* History Sidebar */}
        <div className="space-y-4">
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" />
                  Recent Verses
                </CardTitle>
                <Badge variant="secondary" className="text-[10px]">
                  {verseHistory.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {verseHistory.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No verses looked up yet
                </p>
              ) : (
                <ScrollArea className="max-h-96">
                  <div className="space-y-2">
                    {verseHistory.slice(0, expandedHistory ? 50 : 10).map((verse) => (
                      <button
                        key={verse.reference + verse.translation}
                        className="w-full text-left rounded-lg border border-border/30 hover:border-primary/30 hover:bg-primary/5 p-2.5 transition-colors"
                        onClick={() => setCurrentVerse(verse)}
                      >
                        <p className="text-xs font-medium text-foreground truncate">
                          {verse.reference}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                          {verse.text.substring(0, 60)}...
                        </p>
                        <Badge variant="outline" className="text-[9px] mt-1">
                          {verse.translation}
                        </Badge>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              )}
              {verseHistory.length > 10 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-2 text-xs"
                  onClick={() => setExpandedHistory(!expandedHistory)}
                >
                  {expandedHistory ? (
                    <><ChevronUp className="h-3 w-3 mr-1" /> Show Less</>
                  ) : (
                    <><ChevronDown className="h-3 w-3 mr-1" /> Show All ({verseHistory.length})</>
                  )}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
