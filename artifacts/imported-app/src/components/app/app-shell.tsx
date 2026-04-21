'use client'

import { useState } from 'react'
import { useAppStore, type AppView } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'
import {
  BookOpen,
  Mic,
  Presentation,
  Music,
  Monitor,
  FileText,
  LayoutDashboard,
  Menu,
  Sparkles,
} from 'lucide-react'

const NAV_ITEMS: { id: AppView; label: string; icon: React.ElementType; description: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, description: 'Overview & Quick Actions' },
  { id: 'bible', label: 'Bible Lookup', icon: BookOpen, description: 'Search & Display Verses' },
  { id: 'detection', label: 'Scripture Detection', icon: Mic, description: 'Real-Time Verse Detection' },
  { id: 'slides', label: 'AI Slide Generator', icon: Sparkles, description: 'Create Presentation Slides' },
  { id: 'lyrics', label: 'Worship Lyrics', icon: Music, description: 'Manage & Display Lyrics' },
  { id: 'presenter', label: 'Live Presenter', icon: Monitor, description: 'Dual-Screen Presentation' },
  { id: 'sermon', label: 'Sermon Notes', icon: FileText, description: 'Build & Export Outlines' },
]

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { currentView, setCurrentView } = useAppStore()

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5">
        <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center overflow-hidden shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="ScriptureLive" className="w-full h-full object-contain" />
        </div>
        <div className="leading-tight">
          <h1 className="text-base font-bold tracking-tight">ScriptureLive</h1>
          <p className="text-[10px] text-muted-foreground -mt-0.5">
            Powered by WassMedia (+233246798526)
          </p>
        </div>
      </div>

      <Separator className="opacity-50" />

      {/* Nav Items */}
      <ScrollArea className="flex-1 px-2 py-3">
        <nav className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = currentView === item.id
            return (
              <button
                key={item.id}
                onClick={() => {
                  setCurrentView(item.id)
                  onNavigate?.()
                }}
                className={cn(
                  'w-full flex items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-150',
                  'hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  isActive && 'bg-accent text-accent-foreground'
                )}
              >
                <Icon className={cn('w-5 h-5 mt-0.5 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground')} />
                <div className="min-w-0">
                  <p className={cn('text-sm font-medium', isActive && 'text-primary')}>{item.label}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{item.description}</p>
                </div>
              </button>
            )
          })}
        </nav>
      </ScrollArea>

      {/* Footer */}
      <Separator className="opacity-50" />
      <div className="px-4 py-3 flex items-center gap-2">
        <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center overflow-hidden shrink-0 opacity-90">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" className="w-full h-full object-contain" />
        </div>
        <p className="text-[10px] text-muted-foreground/80 leading-tight">
          Powered by WassMedia (+233246798526)
        </p>
      </div>
    </div>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { currentView } = useAppStore()
  const [mobileOpen, setMobileOpen] = useState(false)

  const currentNav = NAV_ITEMS.find((n) => n.id === currentView)
  const CurrentIcon = currentNav?.icon || LayoutDashboard

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 border-r border-border/50 bg-card/50">
        <SidebarContent />
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar */}
        <header className="h-14 shrink-0 flex items-center gap-3 px-4 border-b border-border/50 bg-card/30 backdrop-blur-sm">
          {/* Mobile Menu */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden h-9 w-9">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0 bg-card">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SidebarContent onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>

          {/* Current Page Title */}
          <div className="flex items-center gap-2.5">
            <CurrentIcon className="w-4.5 h-4.5 text-primary" />
            <h2 className="text-sm font-semibold">{currentNav?.label || 'Dashboard'}</h2>
            <span className="hidden sm:inline text-xs text-muted-foreground">
              {currentNav?.description}
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hidden sm:flex">
              <Presentation className="w-3.5 h-3.5 mr-1.5" />
              Fullscreen
            </Button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
