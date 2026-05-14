'use client'

import { useAppStore } from '@/lib/store'
import { SidebarNav } from './sidebar-nav'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TRANSLATIONS_INFO } from '@/lib/bible-api'
import { Menu, Mic, MonitorPlay } from 'lucide-react'
import { cn } from '@/lib/utils'

export function AppShell({ children }: { children: React.ReactNode }) {
  const {
    sidebarOpen,
    setSidebarOpen,
    currentView,
    selectedTranslation,
    setSelectedTranslation,
    isListening,
    setIsPresenterMode,
    setCurrentView,
  } = useAppStore()

  const viewTitles: Record<string, string> = {
    dashboard: 'Dashboard',
    bible: 'Bible Lookup',
    detection: 'Live Scripture Detection',
    slides: 'AI Slide Generator',
    lyrics: 'Worship Lyrics Manager',
    presenter: 'Live Presenter Mode',
    sermon: 'Sermon Notes',
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <SidebarNav />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-14 items-center justify-between border-b border-border bg-card/50 px-4 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden h-9 w-9"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-base font-semibold text-foreground">
                {viewTitles[currentView] || 'ScriptureLive AI'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Translation Selector */}
            <Select
              value={selectedTranslation}
              onValueChange={(v) => setSelectedTranslation(v)}
            >
              <SelectTrigger className="w-[110px] h-8 text-xs bg-secondary/50 border-border">
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

            {/* Live Detection Badge - shows on ALL pages when listening */}
            {isListening && (
              <Badge
                variant="destructive"
                className={cn(
                  'gap-1.5 px-2.5 py-0.5 text-xs cursor-pointer transition-all',
                  currentView !== 'detection' && 'animate-pulse',
                )}
                onClick={() => setCurrentView('detection')}
              >
                <span className="live-indicator inline-block h-2 w-2 rounded-full bg-white" />
                {currentView !== 'detection' ? 'LISTENING' : 'LIVE'}
              </Badge>
            )}

            {/* Quick actions */}
            <Button
              variant={isListening ? 'destructive' : 'outline'}
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => setCurrentView('detection')}
            >
              <Mic className={cn('h-3.5 w-3.5', isListening && 'animate-pulse')} />
              <span className="hidden sm:inline">{isListening ? 'Listening...' : 'Detect'}</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => {
                setIsPresenterMode(true)
                setCurrentView('presenter')
              }}
            >
              <MonitorPlay className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Present</span>
            </Button>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
