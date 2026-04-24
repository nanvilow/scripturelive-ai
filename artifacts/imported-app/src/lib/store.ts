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

export interface MediaLibraryItem {
  id: string
  name: string
  url: string
  kind: 'image' | 'video'
  size?: number
}

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
  slideTransitionStyle: 'cut' | 'fade'
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
  // ── Reference text typography (Bug #5) ──────────────────────────
  // Independent typography controls for the reference label (e.g.
  // "John 3:16") shown above the verse body. All five fields are
  // optional — when undefined the renderer falls back to the body
  // equivalents above, so existing operators' persisted settings
  // keep working untouched. Once an operator picks a reference-only
  // value it is decoupled from body changes.
  referenceFontFamily?: string
  referenceFontSize?: 'sm' | 'md' | 'lg' | 'xl'
  referenceTextShadow?: boolean
  referenceTextScale?: number
  referenceTextAlign?: 'left' | 'center' | 'right' | 'justify'
  // User-supplied OpenAI API key for the Whisper transcription
  // pipeline. In dev/Replit the route falls back to the integration
  // proxy creds (AI_INTEGRATIONS_OPENAI_*); on the user's installed
  // desktop build those env vars don't exist, so the key entered here
  // is the only way speech-to-text works. Stored locally only — never
  // sent to anything other than api.openai.com via the local route.
  userOpenaiKey: string | null
  // ── AI Detection Mode ──────────────────────────────────────────
  // Which speech engine drives live scripture detection:
  //   'base'   – bundled local Whisper (whisper.cpp + ggml-base.en-q5_1),
  //              offline, no API key, slower (~2-4s per 5s chunk).
  //   'openai' – api.openai.com/v1/audio/transcriptions via the user's
  //              OpenAI key. Faster (~1s) and higher accuracy on accents
  //              and noisy rooms. Requires internet + paid API usage.
  // Defaults to 'base' so a fresh install works offline immediately,
  // with a gentle nudge inviting the operator to upgrade for better
  // accuracy. The failsafe in SpeechProvider auto-falls-back to
  // 'base' if 'openai' is selected but the key is missing / invalid /
  // offline, so a lost internet connection never kills detection.
  aiMode: 'base' | 'openai'
  // ── NDI-only display mode ──────────────────────────────────────
  // The secondary screen and NDI used to share `displayMode`, which
  // forced operators to choose ONE layout for both. Production
  // setups routinely need the projector at Full Screen AND the NDI
  // feed as a Lower Third (so vMix can composite it over a camera).
  // This field drives the NDI feed ONLY; the secondary screen keeps
  // reading `displayMode`. A `null`/missing value falls back to
  // `displayMode` for backwards-compat with pre-v0.6 saved state.
  ndiDisplayMode: 'full' | 'lower-third'

  // Item #15 follow-up — when the SSE link to the secondary screen
  // drops, the page used to slam a full-screen "Reconnecting…"
  // overlay over the broadcast. Useful for debugging, ugly during a
  // service. Off by default (clean projection); operator can flip on
  // when troubleshooting a flaky network at a new venue.
  showReconnectingOverlay: boolean
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
  // Operator-triggered wipe of the Verse History list. Exposed so
  // the Chapter Navigator / Detected Verses panels can offer a
  // one-click "Clear History" per the v0.5.5 spec.
  clearVerseHistory: () => void
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

  // Hard BLACK / HIDDEN state. When true the secondary screen, the
  // NDI feed and every downstream output render pure black — the
  // current slide stays staged so the operator can un-black to it
  // instantly. This is the production-wide "cut to black" control
  // operators hit during transitions (offering, prayer, camera
  // flips). Distinct from `outputEnabled` which kills the output
  // connection entirely; `outputBlanked` keeps NDI live but sends
  // a black frame so vMix/Wirecast/OBS don't lose the source.
  outputBlanked: boolean
  setOutputBlanked: (b: boolean) => void

  // v0.5.4 T005 — One-way signal from the Detected Verses card to the
  // Chapter Navigator. When the operator single-clicks a verse that
  // the speech pipeline detected, we drop the reference here; the
  // navigator watches the field, auto-loads that chapter + verse,
  // focuses the verse in the list and clears the field. A timestamp
  // is appended so the same reference twice in a row still fires.
  navigatorRequestedRef: string | null
  requestNavigatorRef: (ref: string) => void
  clearNavigatorRequestedRef: () => void

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

  // Media library — persisted (item #16). Items reference files in
  // the server-side `uploads/` directory by URL. They survive an app
  // restart so the operator never has to re-upload service media.
  mediaLibrary: MediaLibraryItem[]
  setMediaLibrary: (items: MediaLibraryItem[]) => void
  addMediaLibraryItem: (item: MediaLibraryItem) => void
  removeMediaLibraryItem: (id: string) => void
  // Per-item display fit (cover / contain / etc) selected in the
  // Media panel. Persisted alongside the library so the operator's
  // chosen framing for each clip survives a relaunch.
  mediaFitById: Record<string, string>
  setMediaFit: (id: string, fit: string) => void

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
  // Real-signal audio levels (0..1) read from the Web Audio analyser
  // attached to the actual <video> element on each surface. The
  // AudioMeter in the operator console reads these so the bar tracks
  // the true sound coming out of the source — no more random bounce
  // when the video is silent.
  audioLevelLive: number
  audioLevelPreview: number
  setAudioLevel: (surface: 'live' | 'preview', level: number) => void

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

  // Global master volume (0..1) and master mute. Multiplies into every
  // <video> element across Preview, Live and the secondary screen so a
  // single slider on the toolbar can raise / lower / silence the whole
  // production. `globalMuted` is an explicit toggle independent of the
  // slider position so the operator can mute and un-mute without
  // losing their level.
  globalVolume: number
  setGlobalVolume: (v: number) => void
  globalMuted: boolean
  setGlobalMuted: (b: boolean) => void

  // When on, every newly detected verse is auto-staged AND auto-sent
  // live without a manual click. Replaces the previously component-local
  // `autoAdvance` flag so both the Live Transcription pill and the
  // Live Display "AUTO" button drive the same state.
  autoLive: boolean
  setAutoLive: (b: boolean) => void

  // Minimum confidence (0..1) required for a detected verse to be
  // *automatically* sent to the Live Display when AUTO is on. Verses
  // below the threshold still appear in the Detected Verses list
  // (preview only) so the operator can review and send manually.
  autoLiveThreshold: number
  setAutoLiveThreshold: (t: number) => void

  // Last sampled `currentTime` from the LIVE media <video>. Other
  // surfaces (Preview pane, secondary congregation screen) read this
  // value and seek to it whenever it drifts more than ~0.4s, so a
  // pause / scrub on Live freezes every screen at the same frame.
  mediaCurrentTime: number
  setMediaCurrentTime: (t: number) => void

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
  slideTransitionStyle: 'fade',
  fontFamily: 'sans',
  fontSize: 'lg',
  textShadow: true,
  showReferenceOnOutput: true,
  displayRatio: 'fill',
  textScale: 1,
  textAlign: 'center',
  // Reference typography defaults: leave undefined so the renderer
  // falls back to the body equivalents above. Persisted operator
  // settings from earlier builds simply won't have these keys, which
  // is the same as the fresh-install state — no migration needed.
  referenceFontFamily: undefined,
  referenceFontSize: undefined,
  referenceTextShadow: undefined,
  referenceTextScale: undefined,
  referenceTextAlign: undefined,
  userOpenaiKey: null,
  aiMode: 'base',
  congregationScreenTheme: 'minimal',
  // English-only per v0.5.5 spec — the multi-language picker was a
  // footgun because Whisper's Base model is English-only and the
  // UI let operators pick locales that silently broke detection.
  speechLanguage: 'en-US',
  autoGoLiveOnDetection: false,
  autoGoLiveOnLookup: false,
  ndiDisplayMode: 'full',
  showReconnectingOverlay: false,
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
      clearVerseHistory: () => set({ verseHistory: [] }),
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

      outputBlanked: false,
      setOutputBlanked: (b) => set({ outputBlanked: b }),

      navigatorRequestedRef: null,
      requestNavigatorRef: (ref) =>
        set({ navigatorRequestedRef: `${ref}\u0000${Date.now()}` }),
      clearNavigatorRequestedRef: () => set({ navigatorRequestedRef: null }),

      sermonNotes: '',
      setSermonNotes: (s) => set({ sermonNotes: s }),
      countdownEndAt: null,
      setCountdown: (endAt) => set({ countdownEndAt: endAt }),

      // Lyrics
      currentSongSections: [],
      setCurrentSongSections: (s) => set({ currentSongSections: s }),
      currentLyricIndex: 0,
      setCurrentLyricIndex: (i) => set({ currentLyricIndex: i }),

      // Media library (item #16)
      mediaLibrary: [],
      setMediaLibrary: (items) => set({ mediaLibrary: items }),
      addMediaLibraryItem: (item) =>
        set((state) => ({
          mediaLibrary: [item, ...state.mediaLibrary.filter((m) => m.id !== item.id)],
        })),
      removeMediaLibraryItem: (id) =>
        set((state) => ({
          mediaLibrary: state.mediaLibrary.filter((m) => m.id !== id),
          mediaFitById: Object.fromEntries(
            Object.entries(state.mediaFitById).filter(([k]) => k !== id),
          ),
        })),
      mediaFitById: {},
      setMediaFit: (id, fit) =>
        set((state) => ({ mediaFitById: { ...state.mediaFitById, [id]: fit } })),

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
      audioLevelLive: 0,
      audioLevelPreview: 0,
      setAudioLevel: (surface, level) =>
        set(
          surface === 'live'
            ? { audioLevelLive: level }
            : { audioLevelPreview: level },
        ),

      // Audio routing — see interface comments above for semantics.
      previewAudio: false,
      setPreviewAudio: (b) => set({ previewAudio: b }),
      liveBroadcastAudio: true,
      setLiveBroadcastAudio: (b) => set({ liveBroadcastAudio: b }),
      liveMonitorAudio: false,
      setLiveMonitorAudio: (b) => set({ liveMonitorAudio: b }),

      globalVolume: 1,
      setGlobalVolume: (v) => set({ globalVolume: Math.max(0, Math.min(1, v)) }),
      globalMuted: false,
      setGlobalMuted: (b) => set({ globalMuted: b }),

      autoLive: false,
      setAutoLive: (b) => set({ autoLive: b }),

      // 0.9 = 90%. Verses below this never auto-go-live; they only
      // appear in the Detected Verses panel as preview suggestions.
      autoLiveThreshold: 0.9,
      setAutoLiveThreshold: (t) =>
        set({ autoLiveThreshold: Math.max(0, Math.min(1, t)) }),

      mediaCurrentTime: 0,
      setMediaCurrentTime: (t) => set({ mediaCurrentTime: Math.max(0, t) }),

      // Media library view density. Defaults to a comfortable middle
      // ground; user pick is persisted via partialize below.
      mediaViewMode: 'tiles',
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
        // Item #16 — uploaded media + per-item fit survive restart.
        mediaLibrary: state.mediaLibrary,
        mediaFitById: state.mediaFitById,
      }),
    }
  )
)
