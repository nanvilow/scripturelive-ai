'use client'

import { SpeechProvider } from '@/components/providers/speech-provider'
import { OutputBroadcaster } from '@/components/providers/output-broadcaster'
import { UpdateNotifier } from '@/components/providers/update-notifier'
import { LogosShell } from '@/components/layout/logos-shell'
import { SettingsView } from '@/components/views/settings'
import { useAppStore } from '@/lib/store'
import { ArrowLeft } from 'lucide-react'

function AppContent() {
  const { currentView, setCurrentView } = useAppStore()
  const settingsOpen = currentView === 'settings'

  // We always keep the LogosShell mounted and overlay Settings on top
  // when the operator opens it. This preserves every panel's local
  // state (Live Transcription, Chapter Navigator, Detected Verses,
  // Media library, view-modes, scroll positions, etc.) when the
  // operator pops into Settings and back out — instead of unmounting
  // the shell and resetting everything to defaults.
  return (
    <>
      {/* Hide the live console behind Settings rather than unmounting
          it, so React keeps the component tree alive. aria-hidden +
          inert prevents accidental keyboard focus while the overlay
          owns the screen. */}
      <div
        aria-hidden={settingsOpen}
        // @ts-expect-error - inert is a valid HTML attribute, types lag behind
        inert={settingsOpen ? '' : undefined}
        style={settingsOpen ? { visibility: 'hidden' } : undefined}
      >
        <LogosShell />
      </div>
      {settingsOpen && (
        <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col">
          <div className="flex items-center justify-between px-5 h-14 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-white flex items-center justify-center overflow-hidden shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png" alt="" className="h-full w-full object-contain" />
              </div>
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
      )}
    </>
  )
}

export default function Home() {
  return (
    <SpeechProvider>
      {/* Global secondary-screen broadcaster — runs whether the operator
          is on the live console or the Settings overlay, so display-ratio
          / text-scale / theme tweaks land on the secondary screen
          immediately instead of after a refresh. */}
      <OutputBroadcaster />
      {/* Surfaces a small toast when a new release is detected on launch
          (or by the 4-hour interval check), so the operator never has
          to dig into Settings to find out an update exists. */}
      <UpdateNotifier />
      <AppContent />
    </SpeechProvider>
  )
}
