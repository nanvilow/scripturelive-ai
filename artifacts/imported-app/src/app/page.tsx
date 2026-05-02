'use client'

import dynamic from 'next/dynamic'
import { SpeechProvider } from '@/components/providers/speech-provider'
import { OutputBroadcaster } from '@/components/providers/output-broadcaster'
import { LiveTranslationSync } from '@/components/providers/live-translation-sync'
import { UpdateNotifier } from '@/components/providers/update-notifier'
import { UpdateAvailableDialog } from '@/components/providers/update-dialog'
// v1 licensing — wrap the app so every subtree can consult the
// subscription state and open the Subscribe / Admin modals.
import { LicenseProvider } from '@/components/license/license-provider'
import { SubscriptionModal } from '@/components/license/subscription-modal'
import { AdminModal } from '@/components/license/admin-modal'
// v0.7.19 — One-time welcome dialog for first-time users.
import { WelcomeDialog } from '@/components/providers/welcome-dialog'
import { useAppStore } from '@/lib/store'
import { ArrowLeft } from 'lucide-react'

// v0.7.40 — Dynamic-imported. LogosShell is ~3,400 LOC plus its full
// transitive component / hook / icon / Bible-API graph; SettingsView is
// similarly broad. When both were statically imported here, webpack
// pulled their entire combined module graph into the root `/` page
// chunk, and the optimization phase had to hold all of it in memory
// at once — which is what was OOMing the cr-2-4 (4 GB) build VM
// silently mid-compile. Forcing a chunk split via `next/dynamic` lets
// webpack process each big component as its own optimization pass and
// GC between them. `ssr: false` is fine because page.tsx is already
// `'use client'`. The components mount on the client just as before;
// only the build-time module-graph topology changes.
const LogosShell = dynamic(
  () => import('@/components/layout/logos-shell').then((m) => m.LogosShell),
  { ssr: false },
)
const SettingsView = dynamic(
  () => import('@/components/views/settings').then((m) => m.SettingsView),
  { ssr: false },
)

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
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          <div className="flex items-center justify-between px-5 h-14 border-b border-border bg-background/95 backdrop-blur shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-white flex items-center justify-center overflow-hidden shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png" alt="" className="h-full w-full object-contain" />
              </div>
              <div className="leading-tight">
                <h2 className="text-sm font-semibold text-foreground">Settings</h2>
                <p className="text-[10px] text-muted-foreground">Configure ScriptureLive</p>
              </div>
            </div>
            <button
              onClick={() => setCurrentView('dashboard')}
              className="inline-flex items-center gap-1.5 text-xs text-foreground hover:text-foreground px-3 py-1.5 rounded-md border border-border bg-card/60 hover:bg-muted transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Live Console
            </button>
          </div>
          <div className="flex-1 overflow-y-auto bg-background">
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
      {/* Bug #6 — keeps the live verse slide in sync with the
          operator's currently selected translation, in place,
          without taking the slide off air. */}
      <LiveTranslationSync />
      {/* Surfaces a small toast when a new release is detected on launch
          (or by the 4-hour interval check), so the operator never has
          to dig into Settings to find out an update exists. */}
      <UpdateNotifier />
      {/* Prominent modal popup for new releases — complements the toast
          above. The toast is suppressed mid-broadcast by the on-air
          gate (and at app launch NDI auto-starts so the toast effectively
          never fires), while the dialog is purely informational and
          shows once per version per session so the operator actually
          sees the update notice when they open the app. */}
      <UpdateAvailableDialog />
      {/* v1 LICENSING — wraps the entire console so the LogosShell, the
          Settings overlay, and the floating Activate button can all read
          subscription state from one source of truth. The provider also
          owns the Ctrl+Shift+P listener that opens the owner Admin
          panel and the 30-second status poll. The two modals are
          rendered as siblings so they sit above every Card and the
          Settings overlay. */}
      <LicenseProvider>
        <AppContent />
        {/* v0.5.44 — pill is now rendered INSIDE the TopToolbar
            (left side, right after the logo). The two modals stay
            here as siblings of the shell so they can sit above the
            Settings overlay (z-50). */}
        <SubscriptionModal />
        <AdminModal />
        {/* v0.7.19 — One-time welcome popup. Renders nothing on
            repeat launches; only fires the first time a given browser
            profile / Electron userData sees the app. Sits inside the
            LicenseProvider so it can layer above the lock overlay if
            both happen to mount at the same moment (a fresh install
            with no trial budget would still see it before the lock,
            which is the right ordering). */}
        <WelcomeDialog />
      </LicenseProvider>
    </SpeechProvider>
  )
}
