import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AppView =
  | 'dashboard'
  | 'bible'
  | 'detection'
  | 'slides'
  | 'lyrics'
  | 'presenter'
  | 'sermon'
  | 'settings'

export type BibleTranslation = string
export type DisplayMode = 'full' | 'lower-third' | 'lower-third-black'
export type OutputDestination = 'window' | 'ndi' | 'both'

export interface BibleVerse {
  reference: string
  text: string
  translation: string
  book: string
  chapter: number
  verseStart: number
  verseEnd?: number
}

export interface Slide {
  id: string
  type: 'title' | 'verse' | 'lyrics' | 'custom' | 'blank'
  title: string
  subtitle: string
  content: string[]
  background?: string
  notes?: string
}

export interface SongSection {
  type: 'verse' | 'chorus' | 'bridge' | 'pre-chorus' | 'tag' | 'intro' | 'outro'
  label: string
  lines: string[]
}

export interface DetectedVerse {
  id: string
  reference: string
  text: string
  translation: BibleTranslation
  detectedAt: Date
  confidence: number
}

export interface AppSettings {
  defaultTranslation: BibleTranslation
  displayMode: DisplayMode
  outputDestination: OutputDestination
  customBackground: string | null
  lowerThirdPosition: 'bottom' | 'top'
  lowerThirdHeight: 'sm' | 'md' | 'lg'
  autoAdvanceSlides: boolean
  slideTransitionDuration: number
  fontFamily: string
  fontSize: 'sm' | 'md' | 'lg' | 'xl'
  textShadow: boolean
  showReferenceOnOutput: boolean
  congregationScreenTheme: string
  speechLanguage: string
  autoGoLiveOnDetection: boolean
  autoGoLiveOnLookup: boolean
}

interface AppState {
  // Navigation
  currentView: AppView
  setCurrentView: (view: AppView) => void
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void

  // Bible
  selectedTranslation: BibleTranslation
  setSelectedTranslation: (t: BibleTranslation) => void
  currentVerse: BibleVerse | null
  setCurrentVerse: (v: BibleVerse | null) => void
  verseHistory: BibleVerse[]
  addToVerseHistory: (v: BibleVerse) => void
  searchQuery: string
  setSearchQuery: (q: string) => void

  // Scripture Detection
  isListening: boolean
  setIsListening: (l: boolean) => void
  detectedVerses: DetectedVerse[]
  addDetectedVerse: (v: DetectedVerse) => void
  clearDetectedVerses: () => void
  liveVerse: BibleVerse | null
  setLiveVerse: (v: BibleVerse | null) => void

  // Persistent Speech Recognition (not persisted to localStorage)
  liveTranscript: string
  setLiveTranscript: (t: string) => void
  liveInterimTranscript: string
  setLiveInterimTranscript: (t: string) => void
  speechSupported: boolean
  setSpeechSupported: (s: boolean) => void
  speechError: string | null
  setSpeechError: (e: string | null) => void
  speechCommand: 'start' | 'stop' | 'reset' | null
  setSpeechCommand: (cmd: 'start' | 'stop' | 'reset' | null) => void

  // Slides
  slides: Slide[]
  setSlides: (s: Slide[]) => void
  previewSlideIndex: number
  setPreviewSlideIndex: (i: number) => void
  liveSlideIndex: number
  setLiveSlideIndex: (i: number) => void

  // Presenter
  isPresenterMode: boolean
  setIsPresenterMode: (m: boolean) => void
  isLive: boolean
  setIsLive: (m: boolean) => void

  // NDI Output
  ndiConnected: boolean
  setNdiConnected: (c: boolean) => void
  ndiUrl: string
  setNdiUrl: (u: string) => void

  // Lyrics
  currentSongSections: SongSection[]
  setCurrentSongSections: (s: SongSection[]) => void
  currentLyricIndex: number
  setCurrentLyricIndex: (i: number) => void

  // Settings
  settings: AppSettings
  updateSettings: (s: Partial<AppSettings>) => void
}

const defaultSettings: AppSettings = {
  defaultTranslation: 'KJV',
  displayMode: 'full',
  outputDestination: 'window',
  customBackground: null,
  lowerThirdPosition: 'bottom',
  lowerThirdHeight: 'md',
  autoAdvanceSlides: false,
  slideTransitionDuration: 500,
  fontFamily: 'sans',
  fontSize: 'lg',
  textShadow: true,
  showReferenceOnOutput: true,
  congregationScreenTheme: 'minimal',
  speechLanguage: 'en-US',
  autoGoLiveOnDetection: false,
  autoGoLiveOnLookup: false,
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Navigation
      currentView: 'dashboard',
      setCurrentView: (view) => set({ currentView: view, sidebarOpen: false }),
      sidebarOpen: false,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      // Bible
      selectedTranslation: defaultSettings.defaultTranslation,
      setSelectedTranslation: (t) => set({ selectedTranslation: t }),
      currentVerse: null,
      setCurrentVerse: (v) => set({ currentVerse: v }),
      verseHistory: [],
      addToVerseHistory: (v) =>
        set((state) => ({
          verseHistory: [v, ...state.verseHistory].slice(0, 50),
        })),
      searchQuery: '',
      setSearchQuery: (q) => set({ searchQuery: q }),

      // Scripture Detection
      isListening: false,
      setIsListening: (l) => set({ isListening: l }),
      detectedVerses: [],
      addDetectedVerse: (v) =>
        set((state) => ({
          detectedVerses: [v, ...state.detectedVerses].slice(0, 100),
        })),
      clearDetectedVerses: () => set({ detectedVerses: [] }),
      liveVerse: null,
      setLiveVerse: (v) => set({ liveVerse: v }),

      // Persistent Speech Recognition
      liveTranscript: '',
      setLiveTranscript: (t) => set({ liveTranscript: t }),
      liveInterimTranscript: '',
      setLiveInterimTranscript: (t) => set({ liveInterimTranscript: t }),
      speechSupported: false,
      setSpeechSupported: (s) => set({ speechSupported: s }),
      speechError: null,
      setSpeechError: (e) => set({ speechError: e }),
      speechCommand: null,
      setSpeechCommand: (cmd) => set({ speechCommand: cmd }),

      // Slides
      slides: [],
      setSlides: (s) => set({ slides: s, previewSlideIndex: 0, liveSlideIndex: -1 }),
      previewSlideIndex: 0,
      setPreviewSlideIndex: (i) => set({ previewSlideIndex: i }),
      liveSlideIndex: -1,
      setLiveSlideIndex: (i) => set({ liveSlideIndex: i }),

      // Presenter
      isPresenterMode: false,
      setIsPresenterMode: (m) => set({ isPresenterMode: m }),
      isLive: false,
      setIsLive: (m) => set({ isLive: m }),

      // NDI Output
      ndiConnected: false,
      setNdiConnected: (c) => set({ ndiConnected: c }),
      ndiUrl: '',
      setNdiUrl: (u) => set({ ndiUrl: u }),

      // Lyrics
      currentSongSections: [],
      setCurrentSongSections: (s) => set({ currentSongSections: s }),
      currentLyricIndex: 0,
      setCurrentLyricIndex: (i) => set({ currentLyricIndex: i }),

      // Settings
      settings: defaultSettings,
      updateSettings: (partial) =>
        set((state) => ({
          settings: { ...state.settings, ...partial },
        })),
    }),
    {
      name: 'scripturelive-settings',
      partialize: (state) => ({
        settings: state.settings,
        selectedTranslation: state.selectedTranslation,
      }),
    }
  )
)
