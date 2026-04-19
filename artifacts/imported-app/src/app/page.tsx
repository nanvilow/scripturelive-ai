'use client'

import { SpeechProvider } from '@/components/providers/speech-provider'
import { LogosShell } from '@/components/layout/logos-shell'
import { SettingsView } from '@/components/views/settings'
import { useAppStore } from '@/lib/store'
import { ArrowLeft } from 'lucide-react'

function AppContent() {
  const { currentView, setCurrentView } = useAppStore()

  // Settings opens as a clean full-screen overlay over the live console.
  // We deliberately do NOT wrap it in <AppShell>, because AppShell
  // re-renders the whole sidebar nav (Dashboard / Bible Lookup / Live
  // Detection / Slide Generator / Worship Lyrics / Live Presenter /
  // Sermon Notes / Settings) plus the legacy KJV-Detect-Present header
  // — both shipped from the old design and confused operators by
  // duplicating navigation that already lives in the live console.
  if (currentView === 'settings') {
    return (
      <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col">
        <div className="flex items-center justify-between px-5 h-14 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur shrink-0">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" className="h-7 w-7 rounded-md object-cover ring-1 ring-zinc-800" />
            <div className="leading-tight">
              <h2 className="text-sm font-semibold text-zinc-100">Settings</h2>
              <p className="text-[10px] text-zinc-500">Configure ScriptureLive</p>
            </div>
          </div>
          <button
            onClick={() => setCurrentView('dashboard')}
            className="inline-flex items-center gap-1.5 text-xs text-zinc-300 hover:text-white px-3 py-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Live Console
          </button>
        </div>
        <div className="flex-1 overflow-y-auto bg-zinc-950">
          <SettingsView />
        </div>
      </div>
    )
  }

  return <LogosShell />
}

export default function Home() {
  return (
    <SpeechProvider>
      <AppContent />
    </SpeechProvider>
  )
}
