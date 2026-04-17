'use client'

import { SpeechProvider } from '@/components/providers/speech-provider'
import { AppShell } from '@/components/layout/app-shell'
import { DashboardView } from '@/components/views/dashboard'
import { BibleLookupView } from '@/components/views/bible-lookup'
import { ScriptureDetectionView } from '@/components/views/scripture-detection'
import { SlideGeneratorView } from '@/components/views/slide-generator'
import { WorshipLyricsView } from '@/components/views/worship-lyrics'
import { LivePresenterView } from '@/components/views/live-presenter'
import { SermonNotesView } from '@/components/views/sermon-notes'
import { SettingsView } from '@/components/views/settings'
import { useAppStore } from '@/lib/store'
import type { AppView } from '@/lib/store'

const viewComponents: Record<AppView, React.ComponentType> = {
  dashboard: DashboardView,
  bible: BibleLookupView,
  detection: ScriptureDetectionView,
  slides: SlideGeneratorView,
  lyrics: WorshipLyricsView,
  presenter: LivePresenterView,
  sermon: SermonNotesView,
  settings: SettingsView,
}

function AppContent() {
  const { currentView } = useAppStore()
  const ViewComponent = viewComponents[currentView]

  return (
    <AppShell>
      <ViewComponent />
    </AppShell>
  )
}

export default function Home() {
  return (
    <SpeechProvider>
      <AppContent />
    </SpeechProvider>
  )
}
