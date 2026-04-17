'use client'

import {
  BookOpen,
  Mic,
  Presentation,
  Music,
  Monitor,
  FileText,
  Cross,
  Sparkles,
  ArrowRight,
  Zap,
  Globe,
  Layers,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/lib/store'
import { motion } from 'framer-motion'

const modules = [
  {
    view: 'bible' as const,
    title: 'Bible Lookup',
    description: 'Search across KJV, NIV, ESV, NKJV translations with smart verse splitting for projection.',
    icon: BookOpen,
    gradient: 'from-amber-500/20 to-orange-600/10',
    iconColor: 'text-amber-400',
    stat: '66 Books',
  },
  {
    view: 'detection' as const,
    title: 'Scripture Detection',
    description: 'Real-time speech recognition detects Bible verses during sermons with sub-2s latency.',
    icon: Mic,
    gradient: 'from-emerald-500/20 to-teal-600/10',
    iconColor: 'text-emerald-400',
    stat: 'Live AI',
  },
  {
    view: 'slides' as const,
    title: 'AI Slide Generator',
    description: 'Generate beautiful worship slides from any topic, passage, or theme using AI.',
    icon: Presentation,
    gradient: 'from-violet-500/20 to-purple-600/10',
    iconColor: 'text-violet-400',
    stat: 'AI Powered',
  },
  {
    view: 'lyrics' as const,
    title: 'Worship Lyrics',
    description: 'Manage your song library with AI-powered lyric structuring and full-screen display.',
    icon: Music,
    gradient: 'from-rose-500/20 to-pink-600/10',
    iconColor: 'text-rose-400',
    stat: 'Song Library',
  },
  {
    view: 'presenter' as const,
    title: 'Live Presenter',
    description: 'Dual-screen mode with operator controls and clean congregation display.',
    icon: Monitor,
    gradient: 'from-cyan-500/20 to-blue-600/10',
    iconColor: 'text-cyan-400',
    stat: 'Dual Screen',
  },
  {
    view: 'sermon' as const,
    title: 'Sermon Notes',
    description: 'Build sermon outlines with linked Bible references and export to PDF.',
    icon: FileText,
    gradient: 'from-lime-500/20 to-green-600/10',
    iconColor: 'text-lime-400',
    stat: 'Rich Editor',
  },
]

const features = [
  { icon: Zap, label: 'Real-Time Detection', desc: 'Instant verse display' },
  { icon: Sparkles, label: 'AI-Powered', desc: 'Smart slide generation' },
  { icon: Globe, label: 'Multi-Translation', desc: 'KJV, NIV, ESV, NKJV' },
  { icon: Layers, label: 'Smart Splitting', desc: 'Optimal screen layout' },
]

export function Dashboard() {
  const { setCurrentView } = useAppStore()

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-card to-accent/5 border border-border/50 p-8 lg:p-10">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Cross className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">
                ScriptureLive AI
              </h1>
              <p className="text-sm text-muted-foreground">
                AI-Powered Bible & Worship Presentation Platform
              </p>
            </div>
          </div>
          <p className="text-muted-foreground max-w-2xl leading-relaxed">
            Everything you need for powerful church presentations — real-time scripture detection,
            AI-generated slides, worship lyrics management, and professional dual-screen presentation mode.
          </p>
          <div className="flex items-center gap-4 mt-6">
            <Button onClick={() => setCurrentView('bible')} className="gap-2">
              <BookOpen className="h-4 w-4" />
              Get Started
            </Button>
            <Button variant="outline" onClick={() => setCurrentView('presenter')} className="gap-2">
              <Monitor className="h-4 w-4" />
              Start Presenting
            </Button>
          </div>
        </div>
      </div>

      {/* Feature Highlights */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {features.map((feature, i) => (
          <motion.div
            key={feature.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <Card className="border-border/50 bg-card/50 hover:bg-card/80 transition-colors">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                  <feature.icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">{feature.label}</p>
                  <p className="text-[11px] text-muted-foreground">{feature.desc}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Module Cards */}
      <div>
        <h2 className="text-lg font-semibold mb-4 tracking-tight">Modules</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {modules.map((mod, i) => (
            <motion.div
              key={mod.view}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.05 }}
            >
              <Card
                className="group cursor-pointer border-border/50 hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5"
                onClick={() => setCurrentView(mod.view)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${mod.gradient}`}>
                      <mod.icon className={`h-5 w-5 ${mod.iconColor}`} />
                    </div>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/50 px-2 py-1 rounded">
                      {mod.stat}
                    </span>
                  </div>
                  <CardTitle className="text-base mt-3 group-hover:text-primary transition-colors">
                    {mod.title}
                  </CardTitle>
                  <CardDescription className="text-xs leading-relaxed">
                    {mod.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <Button variant="ghost" size="sm" className="w-full gap-2 text-xs text-muted-foreground hover:text-primary group-hover:bg-primary/5">
                    Open Module
                    <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}
