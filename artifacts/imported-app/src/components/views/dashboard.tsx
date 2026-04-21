'use client'

import { useAppStore } from '@/lib/store'
import {
  BookOpen,
  Mic,
  Presentation,
  Music,
  MonitorPlay,
  FileText,
  Sparkles,
  ArrowRight,
  Download,
  Wifi,
} from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const featureCards = [
  {
    view: 'bible' as const,
    title: 'Bible Lookup',
    description: 'Search any verse across multiple translations. Display in projector-ready format.',
    icon: <BookOpen className="h-6 w-6" />,
    gradient: 'from-amber-500/20 to-orange-500/10',
    iconBg: 'bg-amber-500/15 text-amber-400',
    tag: 'Core',
  },
  {
    view: 'detection' as const,
    title: 'Live Detection',
    description: 'Real-time speech recognition detects Bible verses during sermons instantly.',
    icon: <Mic className="h-6 w-6" />,
    gradient: 'from-emerald-500/20 to-teal-500/10',
    iconBg: 'bg-emerald-500/15 text-emerald-400',
    tag: 'AI',
  },
  {
    view: 'slides' as const,
    title: 'AI Slide Generator',
    description: 'Generate beautiful presentation slides from any topic or Bible passage.',
    icon: <Presentation className="h-6 w-6" />,
    gradient: 'from-violet-500/20 to-purple-500/10',
    iconBg: 'bg-violet-500/15 text-violet-400',
    tag: 'AI',
  },
  {
    view: 'lyrics' as const,
    title: 'Worship Lyrics',
    description: 'Manage song library, auto-structure lyrics, and display full-screen.',
    icon: <Music className="h-6 w-6" />,
    gradient: 'from-rose-500/20 to-pink-500/10',
    iconBg: 'bg-rose-500/15 text-rose-400',
    tag: 'Music',
  },
  {
    view: 'presenter' as const,
    title: 'Live Presenter',
    description: 'Dual-screen presentation mode with preview and congregation display.',
    icon: <MonitorPlay className="h-6 w-6" />,
    gradient: 'from-sky-500/20 to-cyan-500/10',
    iconBg: 'bg-sky-500/15 text-sky-400',
    tag: 'Present',
  },
  {
    view: 'sermon' as const,
    title: 'Sermon Notes',
    description: 'Build sermon outlines with auto-linked Bible references and PDF export.',
    icon: <FileText className="h-6 w-6" />,
    gradient: 'from-lime-500/20 to-green-500/10',
    iconBg: 'bg-lime-500/15 text-lime-400',
    tag: 'Editor',
  },
]

const dailyVerse = {
  reference: 'Psalm 119:105',
  text: 'Thy word is a lamp unto my feet, and a light unto my path.',
  translation: 'KJV',
}

const quickStats = [
  { label: 'Verses Looked Up', value: '—', icon: <BookOpen className="h-4 w-4" /> },
  { label: 'Songs in Library', value: '—', icon: <Music className="h-4 w-4" /> },
  { label: 'Slides Created', value: '—', icon: <Presentation className="h-4 w-4" /> },
  { label: 'Sermon Notes', value: '—', icon: <FileText className="h-4 w-4" /> },
]

export function DashboardView() {
  const { setCurrentView, addToVerseHistory, setCurrentVerse, verseHistory } = useAppStore()

  const handleViewDailyVerse = () => {
    setCurrentVerse({
      reference: dailyVerse.reference,
      text: dailyVerse.text,
      translation: dailyVerse.translation,
      book: 'Psalms',
      chapter: 119,
      verseStart: 105,
    })
    addToVerseHistory({
      reference: dailyVerse.reference,
      text: dailyVerse.text,
      translation: dailyVerse.translation,
      book: 'Psalms',
      chapter: 119,
      verseStart: 105,
    })
    setCurrentView('bible')
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-card to-card border border-border">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent pointer-events-none" />
        <div className="relative px-6 py-8 md:px-10 md:py-10">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg overflow-hidden">
                <img src="/logo.png" alt="" className="h-full w-full object-contain bg-transparent" />
              </div>
              <Badge variant="secondary" className="bg-primary/15 text-primary border-primary/20 text-xs">
                Powered by WassMedia (+233246798526)
              </Badge>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight mt-2">
              Welcome to ScriptureLive AI
            </h2>
            <p className="text-muted-foreground max-w-xl text-sm md:text-base leading-relaxed">
              Powered by WassMedia (+233246798526)
            </p>
          </div>
        </div>
      </div>

      {/* Desktop app download CTA */}
      <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-transparent p-5 md:p-6 flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300">
          <Download className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">Get the desktop app</h3>
            <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 gap-1 text-[10px]">
              <Wifi className="h-3 w-3" /> Built-in NDI
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            Windows &amp; macOS app with one-click NDI output for vMix, Wirecast, and OBS — no screen capture needed.
          </p>
        </div>
        <Button asChild className="shrink-0 gap-2 bg-amber-500 text-black hover:bg-amber-400">
          <Link href="/download">
            <Download className="h-4 w-4" /> Download for Windows / macOS
          </Link>
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {quickStats.map((stat) => (
          <Card key={stat.label} className="bg-card/50 border-border/50">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                {stat.icon}
              </div>
              <div>
                <p className="text-lg font-semibold text-foreground">{stat.value}</p>
                <p className="text-[11px] text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Feature Cards Grid */}
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">Quick Access</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {featureCards.map((card) => (
            <Card
              key={card.view}
              className="group cursor-pointer border-border/50 bg-card/50 hover:border-primary/30 hover:bg-card transition-all duration-300 overflow-hidden"
              onClick={() => setCurrentView(card.view)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', card.iconBg)}>
                    {card.icon}
                  </div>
                  <Badge variant="outline" className="text-[10px] border-border/50 text-muted-foreground">
                    {card.tag}
                  </Badge>
                </div>
                <CardTitle className="text-base font-semibold mt-3 group-hover:text-primary transition-colors">
                  {card.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                  {card.description}
                </p>
                <div className="flex items-center gap-1 text-xs font-medium text-primary/70 group-hover:text-primary transition-colors">
                  Open module
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Verse of the Day */}
      <Card className="border-border/50 bg-gradient-to-br from-card to-card/80 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-amber-500/5 via-transparent to-transparent pointer-events-none" />
        <CardContent className="relative p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3">
                <BookOpen className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Verse of the Day
                </span>
              </div>
              <blockquote className="text-lg md:text-xl font-medium text-foreground/90 leading-relaxed italic">
                &ldquo;{dailyVerse.text}&rdquo;
              </blockquote>
              <cite className="mt-3 block text-sm font-medium text-primary not-italic">
                — {dailyVerse.reference} ({dailyVerse.translation})
              </cite>
            </div>
            <Button
              variant="outline"
              className="shrink-0 gap-2 border-primary/30 text-primary hover:bg-primary/10"
              onClick={handleViewDailyVerse}
            >
              <BookOpen className="h-4 w-4" />
              Open in Bible
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent History */}
      {verseHistory.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-4">Recent Verses</h3>
          <div className="flex flex-wrap gap-2">
            {verseHistory.slice(0, 8).map((verse, i) => (
              <Badge
                key={i}
                variant="outline"
                className="cursor-pointer hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors py-1 px-3"
                onClick={() => {
                  setCurrentVerse(verse)
                  setCurrentView('bible')
                }}
              >
                {verse.reference}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
