'use client'

import { useAppStore, type AppView } from '@/lib/store'
import { cn } from '@/lib/utils'
import {
  BookOpen,
  Mic,
  Presentation,
  Music,
  MonitorPlay,
  FileText,
  LayoutDashboard,
  Settings,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

const navItems: { view: AppView; label: string; icon: React.ReactNode; description: string }[] = [
  { view: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-5 w-5" />, description: 'Home & quick access' },
  { view: 'bible', label: 'Bible Lookup', icon: <BookOpen className="h-5 w-5" />, description: 'Search & display verses' },
  { view: 'detection', label: 'Live Detection', icon: <Mic className="h-5 w-5" />, description: 'Real-time scripture detection' },
  { view: 'slides', label: 'Slide Generator', icon: <Presentation className="h-5 w-5" />, description: 'AI-powered slides' },
  { view: 'lyrics', label: 'Worship Lyrics', icon: <Music className="h-5 w-5" />, description: 'Song management' },
  { view: 'presenter', label: 'Live Presenter', icon: <MonitorPlay className="h-5 w-5" />, description: 'Presentation mode' },
  { view: 'sermon', label: 'Sermon Notes', icon: <FileText className="h-5 w-5" />, description: 'Outline builder' },
]

const bottomNavItems: { view: AppView; label: string; icon: React.ReactNode }[] = [
  { view: 'settings', label: 'Settings', icon: <Settings className="h-5 w-5" /> },
]

export function SidebarNav() {
  const { currentView, setCurrentView, sidebarOpen, setSidebarOpen } = useAppStore()

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-full w-72 flex-col border-r border-border bg-sidebar transition-transform duration-300 lg:relative lg:z-0 lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl overflow-hidden">
            <img src="/logo.png" alt="ScriptureLive" className="h-full w-full object-contain bg-transparent" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-bold text-foreground tracking-tight">ScriptureLive</span>
            <span className="text-xs text-muted-foreground font-medium">Powered by WassMedia (+233246798526)</span>
          </div>
          <Button variant="ghost" size="icon" className="ml-auto lg:hidden h-8 w-8" onClick={() => setSidebarOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <Separator className="bg-sidebar-border" />

        {/* Navigation */}
        <ScrollArea className="flex-1 px-3 py-4">
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => {
              const isActive = currentView === item.view
              return (
                <button
                  key={item.view}
                  onClick={() => setCurrentView(item.view)}
                  className={cn(
                    'group flex items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-200',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-foreground shadow-sm'
                      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                  )}
                >
                  <div
                    className={cn(
                      'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-sidebar-accent text-muted-foreground group-hover:bg-primary/15 group-hover:text-primary'
                    )}
                  >
                    {item.icon}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{item.label}</span>
                    <span className="text-[11px] text-muted-foreground leading-tight">{item.description}</span>
                  </div>
                </button>
              )
            })}
          </nav>
        </ScrollArea>

        <Separator className="bg-sidebar-border" />

        {/* Bottom Nav */}
        <div className="px-3 py-2">
          {bottomNavItems.map((item) => {
            const isActive = currentView === item.view
            return (
              <button
                key={item.view}
                onClick={() => setCurrentView(item.view)}
                className={cn(
                  'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-200 w-full',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-foreground shadow-sm'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                )}
              >
                <div className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors',
                  isActive ? 'bg-primary text-primary-foreground' : 'bg-sidebar-accent text-muted-foreground group-hover:bg-primary/15 group-hover:text-primary'
                )}>
                  {item.icon}
                </div>
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-sidebar-border px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>Ready</span>
          </div>
        </div>
      </aside>
    </>
  )
}
