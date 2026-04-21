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

export type LibraryTab =
  | 'bible'
  | 'songs'
  | 'detection'
  | 'ai-slides'
  | 'sermon'
  | 'media'

export interface ScheduleItem {
  id: string
  type: 'verse' | 'song' | 'sermon' | 'slides' | 'announcement'
  title: string
  subtitle?: string
  slides: Slide[]
  addedAt: number
}

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
  type: 'title' | 'verse' | 'lyrics' | 'custom' | 'blank' | 'announcement' | 'media'
  title: string
  subtitle: string
  content: string[]
  background?: string
  notes?: string
  // Media slides: full-bleed image or video that the operator uploads
  // from the Media panel and sends straight to the live output.
  mediaUrl?: string
  mediaKind?: 'image' | 'video'
  // How the media should fit its frame on screen. Operator picks this
  // from the Media column when staging the asset; defaults to 'fit'
  // (= contain — letterbox so nothing is cropped). 'fill' covers the
  // frame and may crop, 'stretch' distorts to fill exactly, '16:9'
  // and '4:3' force the picked aspect ratio inside the frame.
  mediaFit?: 'fit' | 'fill' | 'stretch' | '16:9' | '4:3'
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
  // ── Secondary screen layout. `displayRatio` controls how the slide
  // canvas is fitted into the operator's secondary screen window:
  //   'fill'   – stretch to the full window (recommended for projectors)
  //   '16:9'   – pillar/letterbox to 16:9 (broadcast / NDI feeds)
  //   '4:3'    – legacy projector / SD ratio
  //   '21:9'   – ultrawide stage screen
  // `textScale` is a 0.5–2.0 multiplier applied on top of the chosen
  // font size, letting operators dial readability without rebuilding
  // the slide deck. Both update the secondary screen instantly via the
  // existing /api/output broadcast.
  displayRatio: 'fill' | '16:9' | '4:3' | '21:9'
  textScale: number
  // Horizontal alignment of slide and lower-third text. Defaults to
  // 'center'. Operators can pick left / center / right / justify from
  // the Typography settings card; the change is broadcast to the
  // secondary screen and NDI feed in real time.
  textAlign: 'left' | 'center' | 'right' | 'justify'
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
  // Character offsets in `liveTranscript` where a fresh paragraph
  // should be rendered. Each detected scripture pushes the current
  // transcript length onto this array so the Live Transcription pane
  // visually breaks before the new reference. We keep the breaks in
  // the store (rather than embedding `\n\n` into the transcript
  // string) because the speech hook re-emits the full transcript on
  // every chunk and would clobber any inline markers we added.
  transcriptBreaks: number[]
  pushTranscriptBreak: (index: number) => void
  clearTranscriptBreaks: () => void
  liveInterimTranscript: string
  setLiveInterimTranscript: (t: string) => void
  speechSupported: boolean
  setSpeechSupported: (s: boolean) => void
  speechError: string | null
  setSpeechError: (e: string | null) => void
  speechCommand: 'start' | 'stop' | 'reset' | null
  setSpeechCommand: (cmd: 'start' | 'stop' | 'reset' | null) => void
  // User-chosen microphone (deviceId from enumerateDevices). null = system default.
  selectedMicrophoneId: string | null
  setSelectedMicrophoneId: (id: string | null) => void

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

  // Master output enable. When false the global broadcaster stops
  // POSTing to /api/output and pushes a single "clear" so the
  // congregation page goes blank. Operators can re-enable from the
  // Output Display popover. Mirrors the kill switch on hardware
  // mixers like the vMix Output toggle.
  outputEnabled: boolean
  setOutputEnabled: (b: boolean) => void

  // Sermon notes shown on the stage-display window. Persisted with
  // the rest of the operator settings so refreshing the console
  // doesn't lose what the speaker is reading from.
  sermonNotes: string
  setSermonNotes: (s: string) => void

  // Countdown timer end time (Unix ms). null = inactive.
  // The stage display reads this via the SSE feed and renders a
  // ticking timer. Operators can set it from the Output toolbar.
  countdownEndAt: number | null
  setCountdown: (endAt: number | null) => void

  // Lyrics
  currentSongSections: SongSection[]
  setCurrentSongSections: (s: SongSection[]) => void
  currentLyricIndex: number
  setCurrentLyricIndex: (i: number) => void

  // Schedule (EasyWorship-style running order)
  schedule: ScheduleItem[]
  selectedScheduleItemId: string | null
  activeLibraryTab: LibraryTab
  setActiveLibraryTab: (t: LibraryTab) => void
  addScheduleItem: (item: Omit<ScheduleItem, 'id' | 'addedAt'>) => string
  removeScheduleItem: (id: string) => void
  selectScheduleItem: (id: string | null) => void
  moveScheduleItem: (id: string, direction: 'up' | 'down') => void
  clearSchedule: () => void

  // Settings
  settings: AppSettings
  updateSettings: (s: Partial<AppSettings>) => void

  // Startup logo flag — true until the operator first sends content
  // to the live display this session. Drives a centred branded splash
  // on the operator's Live Display card and on the congregation
  // screen. NOT persisted, so it resets to true on every app launch
  // ("show on startup, remove once content is displayed").
  hasShownContent: boolean
  setHasShownContent: (b: boolean) => void

  // Operator-controlled play/pause for media-slide videos. Broadcast
  // to all renderers (preview, secondary screen, NDI). Only
  // meaningful when the active slide is a media video.
  mediaPaused: boolean
  setMediaPaused: (b: boolean) => void

  // Real-time playback signals from the actual <video> elements on
  // the Preview and Live surfaces. Used by the audio meters so they
  // only animate when audio is genuinely playing — never as a
  // pseudo-random "looks alive" effect. Updated via the video
  // element's own play/pause/ended/stalled events.
  previewVideoPlaying: boolean
  setPreviewVideoPlaying: (b: boolean) => void
  liveVideoPlaying: boolean
  setLiveVideoPlaying: (b: boolean) => void

  // Audio routing flags — Wirecast-style monitor controls.
  //   previewAudio       → speaker icon on the Preview pane.
  //                        ON = the operator hears preview audio.
  //                        OFF = preview is silent (audio still
  //                        processed; just not audible locally).
  //   liveBroadcastAudio → speaker icon on the Live pane.
  //                        ON = audio is hot on the broadcast feed
  //                        (but not audible to the operator unless
  //                        liveMonitorAudio is also on).
  //                        OFF = broadcast feed muted.
  //   liveMonitorAudio   → headphone icon on the Live pane.
  //                        ON = the operator hears the live audio
  //                        through their selected output device.
  //                        OFF = operator does not hear the live feed.
  // None of these are persisted — every session starts in a known
  // safe state (preview silent, broadcast hot, monitor off).
  previewAudio: boolean
  setPreviewAudio: (b: boolean) => void
  liveBroadcastAudio: boolean
  setLiveBroadcastAudio: (b: boolean) => void
  liveMonitorAudio: boolean
  setLiveMonitorAudio: (b: boolean) => void

  // Media library view mode. Mirrors the Windows Explorer "View"
  // menu options the user requested: Large Icons / Medium Icons /
  // Small Icons / List / Details / Tiles. Persisted so each operator
  // gets their preferred density next time they launch the console.
  mediaViewMode: 'large' | 'medium' | 'small' | 'list' | 'details' | 'tiles'
  setMediaViewMode: (
    m: 'large' | 'medium' | 'small' | 'list' | 'details' | 'tiles',
  ) => void
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
  displayRatio: 'fill',
  textScale: 1,
  textAlign: 'center',
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
      transcriptBreaks: [],
      pushTranscriptBreak: (index) =>
        set((state) => {
          if (index <= 0) return {}
          if (state.transcriptBreaks[state.transcriptBreaks.length - 1] === index) return {}
          return { transcriptBreaks: [...state.transcriptBreaks, index].slice(-200) }
        }),
      clearTranscriptBreaks: () => set({ transcriptBreaks: [] }),
      liveInterimTranscript: '',
      setLiveInterimTranscript: (t) => set({ liveInterimTranscript: t }),
      speechSupported: false,
      setSpeechSupported: (s) => set({ speechSupported: s }),
      speechError: null,
      setSpeechError: (e) => set({ speechError: e }),
      speechCommand: null,
      setSpeechCommand: (cmd) => set({ speechCommand: cmd }),
      selectedMicrophoneId: null,
      setSelectedMicrophoneId: (id) => set({ selectedMicrophoneId: id }),

      // Slides
      slides: [],
      setSlides: (s) => set({ slides: s, previewSlideIndex: 0, liveSlideIndex: -1 }),
      previewSlideIndex: 0,
      setPreviewSlideIndex: (i) => set({ previewSlideIndex: i }),
      liveSlideIndex: -1,
      setLiveSlideIndex: (i) =>
        set((s) => ({
          liveSlideIndex: i,
          // Any time we put something on air, the startup splash is
          // permanently dismissed for this session — no matter which
          // panel (Media, Bible, Songs, Schedule) initiated the cue.
          hasShownContent: i >= 0 ? true : s.hasShownContent,
        })),

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

      outputEnabled: true,
      setOutputEnabled: (b) => set({ outputEnabled: b }),

      sermonNotes: '',
      setSermonNotes: (s) => set({ sermonNotes: s }),
      countdownEndAt: null,
      setCountdown: (endAt) => set({ countdownEndAt: endAt }),

      // Lyrics
      currentSongSections: [],
      setCurrentSongSections: (s) => set({ currentSongSections: s }),
      currentLyricIndex: 0,
      setCurrentLyricIndex: (i) => set({ currentLyricIndex: i }),

      // Schedule
      schedule: [],
      selectedScheduleItemId: null,
      activeLibraryTab: 'bible',
      setActiveLibraryTab: (t) => set({ activeLibraryTab: t }),
      addScheduleItem: (item) => {
        const id = `sch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        const full: ScheduleItem = { ...item, id, addedAt: Date.now() }
        set((state) => ({
          schedule: [...state.schedule, full],
          selectedScheduleItemId: id,
          slides: full.slides,
          previewSlideIndex: 0,
          liveSlideIndex: -1,
        }))
        return id
      },
      removeScheduleItem: (id) =>
        set((state) => {
          const next = state.schedule.filter((s) => s.id !== id)
          const wasSelected = state.selectedScheduleItemId === id
          return {
            schedule: next,
            selectedScheduleItemId: wasSelected ? next[0]?.id ?? null : state.selectedScheduleItemId,
            slides: wasSelected ? next[0]?.slides ?? [] : state.slides,
            previewSlideIndex: wasSelected ? 0 : state.previewSlideIndex,
            liveSlideIndex: wasSelected ? -1 : state.liveSlideIndex,
          }
        }),
      selectScheduleItem: (id) =>
        set((state) => {
          if (id === null) return { selectedScheduleItemId: null }
          const item = state.schedule.find((s) => s.id === id)
          if (!item) return {}
          return {
            selectedScheduleItemId: id,
            slides: item.slides,
            previewSlideIndex: 0,
            liveSlideIndex: -1,
          }
        }),
      moveScheduleItem: (id, direction) =>
        set((state) => {
          const idx = state.schedule.findIndex((s) => s.id === id)
          if (idx === -1) return {}
          const targetIdx = direction === 'up' ? idx - 1 : idx + 1
          if (targetIdx < 0 || targetIdx >= state.schedule.length) return {}
          const next = [...state.schedule]
          ;[next[idx], next[targetIdx]] = [next[targetIdx], next[idx]]
          return { schedule: next }
        }),
      clearSchedule: () =>
        set({
          schedule: [],
          selectedScheduleItemId: null,
          slides: [],
          previewSlideIndex: 0,
          liveSlideIndex: -1,
        }),

      // Settings
      settings: defaultSettings,
      updateSettings: (partial) =>
        set((state) => ({
          settings: { ...state.settings, ...partial },
        })),

      // Startup logo / media playback flags (not persisted).
      hasShownContent: false,
      setHasShownContent: (b) => set({ hasShownContent: b }),
      mediaPaused: false,
      setMediaPaused: (b) => set({ mediaPaused: b }),
      previewVideoPlaying: false,
      setPreviewVideoPlaying: (b) => set({ previewVideoPlaying: b }),
      liveVideoPlaying: false,
      setLiveVideoPlaying: (b) => set({ liveVideoPlaying: b }),

      // Audio routing — see interface comments above for semantics.
      previewAudio: false,
      setPreviewAudio: (b) => set({ previewAudio: b }),
      liveBroadcastAudio: true,
      setLiveBroadcastAudio: (b) => set({ liveBroadcastAudio: b }),
      liveMonitorAudio: false,
      setLiveMonitorAudio: (b) => set({ liveMonitorAudio: b }),

      // Media library view density. Defaults to a comfortable middle
      // ground; user pick is persisted via partialize below.
      mediaViewMode: 'medium',
      setMediaViewMode: (m) => set({ mediaViewMode: m }),
    }),
    {
      name: 'scripturelive-settings',
      partialize: (state) => ({
        settings: state.settings,
        selectedTranslation: state.selectedTranslation,
        schedule: state.schedule,
        activeLibraryTab: state.activeLibraryTab,
        sermonNotes: state.sermonNotes,
        mediaViewMode: state.mediaViewMode,
      }),
    }
  )
)
