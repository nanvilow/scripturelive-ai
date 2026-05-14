'use client'

import { useState, useCallback, useRef } from 'react'
import { useAppStore, type BibleVerse } from '@/lib/store'
import { fetchBibleVerse, detectVersesInText } from '@/lib/bible-api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  FileText,
  Plus,
  Save,
  Trash2,
  BookOpen,
  Download,
  Link2,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface SermonNote {
  id: string
  title: string
  content: string
  bibleRefs: string[]
  createdAt: Date
}

interface OutlineItem {
  id: string
  text: string
  children: OutlineItem[]
  expanded: boolean
}

const sampleSermons: SermonNote[] = [
  {
    id: 'sample-1',
    title: 'The Power of Faith',
    content: `# The Power of Faith\n\n## Introduction\nFaith is the foundation of our Christian walk. Hebrews 11:1 tells us that faith is the substance of things hoped for, the evidence of things not seen.\n\n## I. What is Faith?\n- Faith is not wishful thinking\n- Faith is confidence in God's promises\n- Faith is active trust in God's character\n\n## II. Examples of Faith\nThe Bible is filled with examples of men and women who demonstrated extraordinary faith:\n\n- Abraham who believed God's promise\n- Moses who led Israel through the Red Sea\n- David who faced Goliath with confidence\n\n## III. How to Grow in Faith\n1. Read and meditate on God's Word (Romans 10:17)\n2. Pray with expectation\n3. Surround yourself with people of faith\n4. Step out in obedience\n\n## Conclusion\nFaith is not passive — it requires action. As James 2:17 reminds us, faith without works is dead. Let us put our faith into action today.\n\n*References: Hebrews 11:1, Romans 10:17, James 2:17*`,
    bibleRefs: ['Hebrews 11:1', 'Romans 10:17', 'James 2:17'],
    createdAt: new Date(Date.now() - 86400000),
  },
  {
    id: 'sample-2',
    title: 'Walking in Love',
    content: `# Walking in Love\n\n## Introduction\n1 Corinthians 13 is often called the love chapter. It describes the highest form of love — agape love — the unconditional love of God.\n\n## I. Love Defined\nLove is:\n- Patient and kind\n- Not envious or boastful\n- Not arrogant or rude\n- Not insisting on its own way\n- Not irritable or resentful\n- Not rejoicing at wrongdoing\n- Rejoicing with the truth\n- Bearing all things, believing all things, hoping all things, enduring all things\n\n## II. Love in Action\nJesus demonstrated perfect love:\n- He washed His disciples' feet (John 13:1-17)\n- He healed the sick and comforted the broken\n- He gave His life on the cross (John 15:13)\n\n## Conclusion\nLet us walk in love, as Christ loved us and gave himself up for us (Ephesians 5:2).\n\n*References: 1 Corinthians 13, John 13:1-17, John 15:13, Ephesians 5:2*`,
    bibleRefs: ['1 Corinthians 13', 'John 13:1-17', 'John 15:13', 'Ephesians 5:2'],
    createdAt: new Date(),
  },
]

export function SermonNotesView() {
  const { selectedTranslation } = useAppStore()

  const [sermons, setSermons] = useState<SermonNote[]>(sampleSermons)
  const [selectedSermon, setSelectedSermon] = useState<SermonNote | null>(sampleSermons[0])
  const [editContent, setEditContent] = useState(sampleSermons[0]?.content || '')
  const [editTitle, setEditTitle] = useState(sampleSermons[0]?.title || '')
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [linkedVerses, setLinkedVerses] = useState<Map<string, BibleVerse>>(new Map())
  const [searchTerm, setSearchTerm] = useState('')

  const contentRef = useRef<HTMLTextAreaElement>(null)

  const handleSelectSermon = (sermon: SermonNote) => {
    setSelectedSermon(sermon)
    setEditContent(sermon.content)
    setEditTitle(sermon.title)
    linkBibleRefs(sermon.content)
  }

  const linkBibleRefs = useCallback(async (content: string) => {
    const refs = detectVersesInText(content)
    const newLinked = new Map<string, BibleVerse>()

    for (const ref of refs) {
      try {
        const verse = await fetchBibleVerse(ref, selectedTranslation)
        if (verse) {
          newLinked.set(ref, verse)
        }
      } catch {
        // Ignore fetch errors
      }
    }
    setLinkedVerses(newLinked)
  }, [selectedTranslation])

  const saveSermon = () => {
    if (!selectedSermon) return

    const updated: SermonNote = {
      ...selectedSermon,
      title: editTitle,
      content: editContent,
      bibleRefs: detectVersesInText(editContent),
    }

    setSermons(sermons.map((s) => (s.id === updated.id ? updated : s)))
    setSelectedSermon(updated)
    toast.success('Sermon saved')
  }

  const createSermon = () => {
    if (!newTitle.trim()) {
      toast.error('Please enter a title')
      return
    }

    const sermon: SermonNote = {
      id: `sermon-${Date.now()}`,
      title: newTitle,
      content: `# ${newTitle}\n\n## Introduction\n\nStart writing your sermon here...\n`,
      bibleRefs: [],
      createdAt: new Date(),
    }

    setSermons([sermon, ...sermons])
    setSelectedSermon(sermon)
    setEditContent(sermon.content)
    setEditTitle(sermon.title)
    setShowAddDialog(false)
    setNewTitle('')
    toast.success(`"${sermon.title}" created`)
  }

  const deleteSermon = (id: string) => {
    setSermons(sermons.filter((s) => s.id !== id))
    if (selectedSermon?.id === id) {
      const remaining = sermons.filter((s) => s.id !== id)
      if (remaining.length > 0) {
        handleSelectSermon(remaining[0])
      } else {
        setSelectedSermon(null)
        setEditContent('')
        setEditTitle('')
      }
    }
    toast.success('Sermon deleted')
  }

  const exportToPdf = async () => {
    if (!editContent.trim()) {
      toast.error('Nothing to export')
      return
    }

    try {
      const response = await fetch('/api/sermons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle,
          content: editContent,
          bibleRefs: Array.from(linkedVerses.keys()),
        }),
      })

      if (!response.ok) throw new Error('Failed to save')
      toast.success('Sermon saved successfully')
    } catch {
      toast.error('Failed to save sermon')
    }
  }

  const insertBibleRef = (reference: string) => {
    if (!reference.trim()) return

    const textarea = contentRef.current
    if (textarea) {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const newContent = editContent.slice(0, start) + reference + editContent.slice(end)
      setEditContent(newContent)

      // Re-link after a short delay
      setTimeout(() => linkBibleRefs(newContent), 100)
    } else {
      setEditContent(editContent + '\n' + reference)
    }
  }

  const filteredSermons = sermons.filter((s) =>
    s.title.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* Sermon List */}
      <div className="w-full lg:w-72 border-b lg:border-b-0 lg:border-r border-border flex flex-col shrink-0">
        <div className="p-3 border-b border-border">
          <Input
            placeholder="Search sermons..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-9 text-sm bg-card border-border"
          />
        </div>

        <div className="flex gap-1.5 px-3 py-2 border-b border-border">
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="flex-1 h-8 text-xs gap-1">
                <Plus className="h-3.5 w-3.5" />
                New Sermon
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Sermon</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Title</label>
                  <Input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g. The Power of Faith"
                    onKeyDown={(e) => e.key === 'Enter' && createSermon()}
                  />
                </div>
                <Button onClick={createSermon} className="w-full">Create</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-1 p-2">
            {filteredSermons.map((sermon) => (
              <div
                key={sermon.id}
                onClick={() => handleSelectSermon(sermon)}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2.5 cursor-pointer transition-colors group',
                  selectedSermon?.id === sermon.id
                    ? 'bg-primary/10 border border-primary/20'
                    : 'hover:bg-muted/50 border border-transparent'
                )}
              >
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{sermon.title}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {sermon.createdAt.toLocaleDateString()} · {sermon.bibleRefs.length} refs
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100"
                  onClick={(e) => { e.stopPropagation(); deleteSermon(sermon.id) }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Editor Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedSermon ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted mx-auto">
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-1">Sermon Notes</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Create and manage sermon outlines with auto-linked Bible references. Use markdown for formatting.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Editor Header */}
            <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-border">
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="max-w-sm h-9 text-sm font-semibold border-none bg-transparent focus-visible:ring-0 p-0"
              />
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={saveSermon}>
                  <Save className="h-3.5 w-3.5" />
                  Save
                </Button>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={exportToPdf}>
                  <Download className="h-3.5 w-3.5" />
                  Export
                </Button>
              </div>
            </div>

            {/* Bible Ref Quick Insert */}
            <div className="flex items-center gap-2 px-4 md:px-6 py-2 border-b border-border bg-card/30">
              <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                placeholder='Insert Bible reference (e.g. "John 3:16") and press Enter'
                className="h-8 text-xs flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const target = e.target as HTMLInputElement
                    insertBibleRef(target.value)
                    target.value = ''
                  }
                }}
              />
            </div>

            {/* Editor + Linked Verses */}
            <div className="flex-1 flex overflow-hidden">
              {/* Editor */}
              <div className="flex-1 flex flex-col min-w-0">
                <Textarea
                  ref={contentRef}
                  value={editContent}
                  onChange={(e) => {
                    setEditContent(e.target.value)
                  }}
                  onBlur={() => linkBibleRefs(editContent)}
                  className="flex-1 resize-none border-0 rounded-none bg-background font-mono text-sm p-4 md:p-6 leading-relaxed focus-visible:ring-0"
                  placeholder="Write your sermon outline here using Markdown..."
                />
              </div>

              {/* Linked Bible References */}
              {linkedVerses.size > 0 && (
                <div className="w-72 border-l border-border flex flex-col shrink-0">
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
                    <Link2 className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-medium">Linked References ({linkedVerses.size})</span>
                  </div>
                  <ScrollArea className="flex-1">
                    <div className="flex flex-col gap-2 p-3">
                      {Array.from(linkedVerses.entries()).map(([ref, verse]) => (
                        <div key={ref} className="rounded-lg bg-muted/30 p-3 border border-border/50">
                          <p className="text-xs font-medium text-primary mb-1">{ref}</p>
                          <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-4">
                            {verse.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
