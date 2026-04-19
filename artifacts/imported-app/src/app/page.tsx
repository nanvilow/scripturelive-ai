'use client'

import { SpeechProvider } from '@/components/providers/speech-provider'
import { LogosShell } from '@/components/layout/logos-shell'
import { AppShell } from '@/components/layout/app-shell'
import { SettingsView } from '@/components/views/settings'
import { useAppStore } from '@/lib/store'

function AppContent() {
  const { currentView, setCurrentView } = useAppStore()

  // Settings opens as an overlay over the live console
  if (currentView === 'settings') {
    return (
      <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col">
        <div className="flex items-center justify-between px-4 h-12 border-b border-zinc-800 bg-zinc-950 shrink-0">
          <h2 className="text-sm font-semibold text-zinc-100">Settings</h2>
          <button
            onClick={() => setCurrentView('dashboard')}
            className="text-xs text-zinc-400 hover:text-white px-3 py-1 rounded hover:bg-zinc-800"
          >
            ← Back to Live Console
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <AppShell>
            <SettingsView />
          </AppShell>
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
