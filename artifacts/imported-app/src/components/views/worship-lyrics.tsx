'use client'

import { useState, useEffect } from 'react'
import { useAppStore, type SongSection } from '@/lib/store'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Music,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'

interface Song {
  id: string
  title: string
  artist?: string
  lyrics: string
  structured?: string
  category: string
  tags?: string
  keySignature?: string
  tempo?: number
  createdAt: string
}

const sampleSongs: Song[] = [
  {
    id: 'sample-1',
    title: 'Amazing Grace',
    artist: 'John Newton',
    lyrics: `[Verse 1]
Amazing grace, how sweet the sound
That saved a wretch like me
I once was lost, but now am found
Was blind, but now I see

[Verse 2]
'Twas grace that taught my heart to fear
And grace my fears relieved
How precious did that grace appear
The hour I first believed

[Chorus]
Amazing grace, how sweet the sound
That saved a wretch like me
I once was lost, but now am found
Was blind, but now I see

[Verse 3]
Through many dangers, toils and snares
I have already come
'Tis grace hath brought me safe thus far
And grace will lead me home`,
    category: 'hymn',
    tags: 'grace, salvation, classic',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'sample-2',
    title: 'How Great Is Our God',
    artist: 'Chris Tomlin',
    lyrics: `[Verse 1]
The splendor of the King
Clothed in majesty
Let all the earth rejoice
All the earth rejoice

[Chorus]
How great is our God
Sing with me
How great is our God
And all will see
How great, how great
Is our God

[Verse 2]
Age to age He stands
And time is in His hands
Beginning and the end
Beginning and the end`,
    category: 'contemporary',
    tags: 'praise, worship, modern',
    keySignature: 'A',
    tempo: 72,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'sample-3',
    title: 'Holy, Holy, Holy',
    artist: 'Reginald Heber',
    lyrics: `[Verse 1]
Holy, holy, holy! Lord God Almighty
Early in the morning our song shall rise to Thee
Holy, holy, holy, merciful and mighty
God in three persons, blessed Trinity

[Chorus]
Holy, holy, holy! Lord God Almighty
Early in the morning our song shall rise to Thee
Holy, holy, holy, merciful and mighty
God in three persons, blessed Trinity

[Verse 2]
Holy, holy, holy! All the saints adore Thee
Casting down their golden crowns around the glassy sea
Cherubim and seraphim falling down before Thee
Which wert and art and evermore shalt be`,
    category: 'hymn',
    tags: 'holiness, worship, trinity, classic',
    createdAt: new Date().toISOString(),
  },
]

function parseLyricsToSections(rawLyrics: string): SongSection[] {
  const sections: SongSection[] = []
  const lines = rawLyrics.split('\n')
  let currentSection: { type: SongSection['type']; label: string; lines: string[] } | null = null

  const sectionPattern = /^\[(Verse|Chorus|Bridge|Pre-Chorus|Pre-Chorus|Tag|Intro|Outro|Verse \d+|Chorus \d+|Bridge \d+)\]/i

  for (const line of lines) {
    const match = line.match(sectionPattern)
    if (match) {
      if (currentSection && currentSection.lines.length > 0) {
        sections.push({ ...currentSection })
      }
      const rawType = match[1].toLowerCase().replace(/\d+/, '').trim() as SongSection['type']
      currentSection = {
        type: rawType,
        label: match[1],
        lines: [],
      }
    } else if (line.trim() && currentSection) {
      currentSection.lines.push(line.trim())
    } else if (line.trim() && !currentSection) {
      currentSection = { type: 'verse', label: 'Verse 1', lines: [line.trim()] }
    }
  }

  if (currentSection && currentSection.lines.length > 0) {
    sections.push(currentSection)
  }

  return sections
}

export function WorshipLyricsView() {
  const { setCurrentSongSections, currentLyricIndex, setCurrentLyricIndex } = useAppStore()

  const [songs, setSongs] = useState<Song[]>(sampleSongs)
  const [selectedSong, setSelectedSong] = useState<Song | null>(null)
  const [sections, setSections] = useState<SongSection[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [newSongTitle, setNewSongTitle] = useState('')
  const [newSongArtist, setNewSongArtist] = useState('')
  const [newSongLyrics, setNewSongLyrics] = useState('')
  const [newSongCategory, setNewSongCategory] = useState('contemporary')
  const [isStructuring, setIsStructuring] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importText, setImportText] = useState('')

  useEffect(() => {
    if (selectedSong) {
      const parsed = parseLyricsToSections(selectedSong.lyrics)
      setSections(parsed)
      setCurrentSongSections(parsed)
      setCurrentLyricIndex(0)
    }
  }, [selectedSong, setCurrentSongSections, setCurrentLyricIndex])

  const filteredSongs = songs.filter((song) => {
    const matchesSearch =
      song.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      song.artist?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      song.tags?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = categoryFilter === 'all' || song.category === categoryFilter
    return matchesSearch && matchesCategory
  })

  const structureWithAI = async () => {
    if (!newSongLyrics.trim()) {
      toast.error('Please paste lyrics first')
      return
    }

    setIsStructuring(true)
    try {
      const response = await fetch('/api/ai/structure-lyrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lyrics: newSongLyrics }),
      })

      if (!response.ok) throw new Error('Failed to structure')

      const data = await response.json()
      if (data.structuredLyrics) {
        setNewSongLyrics(data.structuredLyrics)
        toast.success('Lyrics structured successfully')
      }
    } catch {
      toast.error('Failed to structure lyrics with AI')
    } finally {
      setIsStructuring(false)
    }
  }

  const addSong = () => {
    if (!newSongTitle.trim()) {
      toast.error('Please enter a song title')
      return
    }

    const song: Song = {
      id: `song-${Date.now()}`,
      title: newSongTitle,
      artist: newSongArtist || undefined,
      lyrics: newSongLyrics,
      category: newSongCategory,
      createdAt: new Date().toISOString(),
    }

    setSongs([song, ...songs])
    setSelectedSong(song)
    setShowAddDialog(false)
    setNewSongTitle('')
    setNewSongArtist('')
    setNewSongLyrics('')
    setNewSongCategory('contemporary')
    toast.success(`"${song.title}" added to library`)
  }

  const deleteSong = (id: string) => {
    setSongs(songs.filter((s) => s.id !== id))
    if (selectedSong?.id === id) {
      setSelectedSong(null)
      setSections([])
    }
    toast.success('Song removed')
  }

  const importSongs = () => {
    if (!importText.trim()) return

    const parsedSections = parseLyricsToSections(importText)
    if (parsedSections.length === 0) {
      toast.error('Could not parse the lyrics')
      return
    }

    const firstLine = parsedSections[0].lines[0] || 'Imported Song'
    const song: Song = {
      id: `song-${Date.now()}`,
      title: firstLine.slice(0, 50),
      lyrics: importText,
      category: 'worship',
      createdAt: new Date().toISOString(),
    }

    setSongs([song, ...songs])
    setSelectedSong(song)
    setShowImportDialog(false)
    setImportText('')
    toast.success('Song imported successfully')
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

  const currentSection = sections[currentLyricIndex] || null

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* Song Library */}
      <div className="w-full lg:w-80 border-b lg:border-b-0 lg:border-r border-border flex flex-col shrink-0">
        {/* Search & Filter */}
        <div className="p-3 border-b border-border space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search songs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 h-9 text-sm bg-card border-border"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-8 text-xs bg-card border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="hymn">Hymns</SelectItem>
              <SelectItem value="contemporary">Contemporary</SelectItem>
              <SelectItem value="worship">Worship</SelectItem>
              <SelectItem value="gospel">Gospel</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Add & Import Buttons */}
        <div className="flex gap-1.5 px-3 py-2 border-b border-border">
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="flex-1 h-8 text-xs gap-1">
                <Plus className="h-3.5 w-3.5" />
                Add Song
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New Song</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Title *</label>
                  <Input value={newSongTitle} onChange={(e) => setNewSongTitle(e.target.value)} placeholder="Song title" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Artist</label>
                  <Input value={newSongArtist} onChange={(e) => setNewSongArtist(e.target.value)} placeholder="Artist name" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Category</label>
                  <Select value={newSongCategory} onValueChange={setNewSongCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contemporary">Contemporary</SelectItem>
                      <SelectItem value="hymn">Hymn</SelectItem>
                      <SelectItem value="worship">Worship</SelectItem>
                      <SelectItem value="gospel">Gospel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-medium">Lyrics *</label>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary" onClick={structureWithAI} disabled={isStructuring}>
                      <Sparkles className="h-3 w-3" />
                      {isStructuring ? 'Structuring...' : 'AI Structure'}
                    </Button>
                  </div>
                  <Textarea
                    value={newSongLyrics}
                    onChange={(e) => setNewSongLyrics(e.target.value)}
                    placeholder="Paste lyrics here... Use [Verse], [Chorus], [Bridge] tags for sections"
                    className="min-h-[200px] font-mono text-sm"
                  />
                </div>
                <Button onClick={addSong} className="w-full">Add to Library</Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="flex-1 h-8 text-xs gap-1">
                <Upload className="h-3.5 w-3.5" />
                Import
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Import Song Lyrics</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <Textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder="Paste plain text or XML lyrics here..."
                  className="min-h-[200px] font-mono text-sm"
                />
                <Button onClick={importSongs} className="w-full gap-2">
                  <Upload className="h-4 w-4" />
                  Import Song
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Song List */}
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-1 p-2">
            {filteredSongs.map((song) => (
              <div
                key={song.id}
                onClick={() => setSelectedSong(song)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer transition-colors group',
                  selectedSong?.id === song.id
                    ? 'bg-primary/10 border border-primary/20'
                    : 'hover:bg-muted/50 border border-transparent'
                )}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Music className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{song.title}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {song.artist || 'Unknown'} · {song.category}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteSong(song.id)
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Lyrics Display */}
      <div className="flex-1 flex flex-col">
        {!selectedSong ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center space-y-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted mx-auto">
                <Music className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-1">Worship Lyrics Manager</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Select a song from your library or add a new one. AI can auto-structure raw lyrics into sections.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Song Header */}
            <div className="flex items-center justify-between px-4 md:px-8 py-4 border-b border-border">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{selectedSong.title}</h2>
                <p className="text-sm text-muted-foreground">{selectedSong.artist}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">{selectedSong.category}</Badge>
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={toggleFullscreen}>
                  {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* Section Display */}
            <div className="flex-1 flex items-center justify-center p-4 md:p-8">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentLyricIndex}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                  className="w-full max-w-4xl"
                >
                  {currentSection ? (
                    <div className="text-center space-y-4">
                      <Badge variant="outline" className="text-xs uppercase tracking-wider">
                        {currentSection.label}
                      </Badge>
                      <div className="space-y-3">
                        {currentSection.lines.map((line, i) => (
                          <p
                            key={i}
                            className="text-2xl md:text-3xl lg:text-4xl font-medium text-foreground leading-relaxed slide-transition"
                            style={{ textShadow: '0 2px 12px rgba(0,0,0,0.3)' }}
                          >
                            {line}
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground">No sections available</p>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Section Navigation */}
            <div className="flex items-center justify-center gap-4 px-4 py-4 border-t border-border">
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10"
                onClick={() => setCurrentLyricIndex(Math.max(0, currentLyricIndex - 1))}
                disabled={currentLyricIndex === 0}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>

              <div className="flex gap-1.5 overflow-x-auto max-w-md py-1">
                {sections.map((section, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentLyricIndex(i)}
                    className={cn(
                      'shrink-0 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                      currentLyricIndex === i
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    )}
                  >
                    {section.label}
                  </button>
                ))}
              </div>

              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10"
                onClick={() => setCurrentLyricIndex(Math.min(sections.length - 1, currentLyricIndex + 1))}
                disabled={currentLyricIndex === sections.length - 1}
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
