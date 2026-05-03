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
  /** v0.6.4 — When true (and Auto Go-Live is on), HIGH-confidence
   *  AI semantic matches are pushed to Live automatically without
   *  requiring the operator to click the suggestion chip. Default
   *  true so the smart-match path "just works" for new operators;
   *  sermon-prep users can flip it off in Settings. */
  aiAutoSendOnHigh: boolean
  /** v0.7.4 — Live transcription confidence tiers (0..1). The
   *  SpeechProvider gates each Deepgram chunk against these:
   *    • confidence < transcriptDropThreshold       → drop entirely
   *    • [drop, transcriptLiveThreshold)            → preview only
   *      (visible in the operator transcript with a tentative marker
   *      but NOT fed to the verse-detection / voice-command pipeline)
   *    • confidence ≥ transcriptLiveThreshold       → full pipeline
   *  Defaults: 0.30 / 0.70. Operators can tune in Settings →
   *  Detection. transcriptPreviewThreshold is the visual cutoff at
   *  which the tentative marker is rendered (0.60 by default — chunks
   *  in [0.30, 0.60) are clearly tentative; [0.60, 0.70) is "almost
   *  good enough" and renders mid-tone). */
  transcriptDropThreshold: number
  transcriptPreviewThreshold: number
  transcriptLiveThreshold: number
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
  // ── v0.6.9 — Bible body line-height ─────────────────────────────
  // Operator-controlled vertical spacing for the verse body (the
  // .slide-text / .slide-paragraph element). Applied to both the
  // secondary screen AND the NDI feed when no NDI-only override
  // (`ndiBibleLineHeight`) is set. Range 0.9 .. 2.5 with default 1.4
  // — same clamp the renderer enforces server-side. Mirrors the
  // existing NDI-only line-height slider so the in-room projector
  // can finally tune verse breathing-room without going through the
  // NDI panel.
  bibleLineHeight?: number
  // ── NDI-only display mode ──────────────────────────────────────
  // The secondary screen and NDI used to share `displayMode`, which
  // forced operators to choose ONE layout for both. Production
  // setups routinely need the projector at Full Screen AND the NDI
  // feed as a Lower Third (so vMix can composite it over a camera).
  // This field drives the NDI feed ONLY; the secondary screen keeps
  // reading `displayMode`. A `null`/missing value falls back to
  // `displayMode` for backwards-compat with pre-v0.6 saved state.
  ndiDisplayMode: 'full' | 'lower-third'

  // ── NDI-only typography overrides (v0.5.48) ────────────────────
  // Same idea as the reference-typography fields above: each value
  // is optional, and `undefined` means "mirror the Live Display
  // setting" (i.e. fall back to fontFamily / fontSize / textShadow /
  // textScale / textAlign). When set, they apply to the NDI feed
  // ONLY — the secondary screen keeps reading the body settings.
  // This lets an operator run their projector at one look (large
  // sans-serif, drop shadow ON) and the broadcast feed at another
  // (smaller serif, no drop shadow because vMix is compositing it
  // over a chyron) without two separate sessions.
  ndiFontFamily?: string
  ndiFontSize?: 'sm' | 'md' | 'lg' | 'xl'
  ndiTextShadow?: boolean
  ndiTextScale?: number
  ndiTextAlign?: 'left' | 'center' | 'right' | 'justify'

  // ── NDI-only display + reference overrides (v0.5.57) ───────────
  // The NDI feed used to share aspect-ratio + reference typography
  // with Live Display. Operators piping into vMix / OBS asked for
  // these to be carved off so they can run a 4:3 broadcast deck
  // while the in-room projector stays 16:9, hide the reference
  // line on the broadcast (lower-third already shows it via a
  // chyron), or pick a translation that differs from what the
  // operator searches against.  Every field is optional — when
  // undefined the renderer falls back to the matching Live Display
  // setting so existing persisted state keeps rendering identically.
  ndiAspectRatio?: 'auto' | '16:9' | '4:3' | '21:9'
  ndiBibleColor?: string
  ndiBibleLineHeight?: number
  ndiRefSize?: 'sm' | 'md' | 'lg' | 'xl'
  ndiRefStyle?: 'normal' | 'italic'
  ndiRefPosition?: 'top' | 'bottom' | 'hidden'
  ndiRefScale?: number
  ndiTranslation?: BibleTranslation
  /** v0.6.3 — when true, the NDI lower-third bar drops its gradient
   *  background + drop-shadow so vMix / OBS receive a clean alpha
   *  matte (text-only). Off by default so existing operator setups
   *  keep their familiar "branded card" look on NDI. */
  ndiLowerThirdTransparent?: boolean

  /** v0.6.4 — Operator-tunable size multiplier for the NDI lower-third
   *  bar. Multiplies the verse + reference font sizes AND the BOX
   *  height/width on the NDI surface. 1 = stock; 0.5 = half; 2 = double.
   *  The in-room projector and live preview ignore this, so operators
   *  can tune their broadcast feed for vMix/OBS without disturbing what
   *  the audience sees in the room.
   *
   *  v0.7.0 — Default was 2.0 (full scale) per operator request and
   *  the lower-third box height scales with this multiplier so the
   *  text still fits inside the bar instead of clipping past the
   *  bottom edge (operator screenshot v0.6.9).
   *  v0.7.3 — Default reverted to 1.0. Operator's screenshot showed
   *  the 2.0× lower-third covering ~65% of the camera frame, hiding
   *  the preacher. 1.0× sits inside the bottom band the operator
   *  marked in red; the auto-fit (fitFont + ltBand) keeps long
   *  verses readable without inflating the bar. When unset (older
   *  persisted profiles) we fall back to 1.0 in the renderer too. */
  ndiLowerThirdScale?: number

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
  // v0.7.60 — Low-confidence "candidate" detections (0.20–0.49). The
  // operator can promote one to live with a click; auto-go-live is
  // never permitted from this bucket. Kept separate from
  // `detectedVerses` so the projector pipeline (which reads
  // detectedVerses + the slides array) can never accidentally surface
  // a sub-50% suggestion to the congregation screen.
  detectedVerseCandidates: DetectedVerse[]
  addDetectedVerseCandidate: (v: DetectedVerse) => void
  clearDetectedVerseCandidates: () => void
  promoteDetectedVerseCandidate: (id: string) => void
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

  // v0.5.30 — Mic loudness control. The Whisper engine routes the
  // captured MediaStream through a Web Audio GainNode whose value is
  // mirrored from this field, so the operator can boost a quiet
  // lapel mic or attenuate a hot pulpit mic without leaving the app.
  // Range 0..2 (1.0 = unity gain).
  micGain: number
  setMicGain: (g: number) => void

  // v0.5.30 — Mic pause. When true the chunk-rotate timer keeps
  // running but the upload pipeline drops every captured chunk —
  // recording resumes the moment the operator un-pauses, without
  // tearing down and rebuilding the MediaRecorder (which would jolt
  // the mic indicator and reset the audio graph).
  micPaused: boolean
  setMicPaused: (b: boolean) => void

  // v0.5.30 — Live Transcription column filter. When true (default),
  // only paragraphs that contain a detected Bible reference / fuzzy
  // text-match to a verse appear in the Live Transcription panes —
  // keeps the panel focused on scripture and hides Whisper
  // hallucinations of stage chatter, applause, etc. Operators can
  // flip this off when they want to see every transcribed word.
  bibleOnlyTranscription: boolean
  setBibleOnlyTranscription: (b: boolean) => void

  // v0.5.49 — Speech engine source picker.
  //
  // `preferredEngine` is the operator's CHOICE for which engine to use:
  //   • 'auto'     — start with Deepgram, auto-fallback through the
  //                  ENGINE_CHAIN (Deepgram → Whisper → Browser) on
  //                  structural failures (default).
  //   • 'deepgram' — pin to Deepgram, no fallback. If it fails, the
  //                  operator sees the error and stays on Deepgram.
  //   • 'whisper'  — pin to OpenAI Whisper.
  //   • 'browser'  — pin to the native browser Web Speech API.
  // Persisted: the operator's choice should survive a relaunch.
  //
  // `activeEngineName` is the engine currently RUNNING in the
  // SpeechProvider — useful for the LiveTranscription card to display
  // "Auto · Deepgram" vs "Auto · Whisper" so the operator knows which
  // engine actually picked up after a fallback. Not persisted.
  // v0.5.52 — Web Speech engine removed entirely. The desktop build
  // ships with baked Deepgram + OpenAI Whisper keys so the browser
  // engine is no longer a useful fallback rung.
  preferredEngine: 'auto' | 'deepgram' | 'whisper'
  setPreferredEngine: (e: 'auto' | 'deepgram' | 'whisper') => void
  activeEngineName: 'deepgram' | 'whisper'
  setActiveEngineName: (e: 'deepgram' | 'whisper') => void

  // v0.5.52 — Voice Control. When ON, leading-position voice commands
  // ("next verse", "go to John 3:16", "blank screen") are recognised
  // before Bible-reference detection runs. Default OFF — opt-in.
  voiceControlEnabled: boolean
  setVoiceControlEnabled: (b: boolean) => void

  // v0.5.52 — Speaker-Follow. When ON and a multi-verse passage is
  // on Live Display, the highlight follows the verse the speaker is
  // currently quoting. Default OFF.
  speakerFollowEnabled: boolean
  setSpeakerFollowEnabled: (b: boolean) => void

  // v0.5.52 — Live Display auto-scroll timer (independent of
  // speaker-follow). Speed is in ms per verse: slow=6000, med=4000,
  // fast=2000. Active verse index is shared with speaker-follow.
  autoScrollEnabled: boolean
  setAutoScrollEnabled: (b: boolean) => void
  autoScrollSpeedMs: number
  setAutoScrollSpeedMs: (n: number) => void
  /** Current highlighted verse index inside the live multi-verse passage (0-based). */
  liveActiveVerseIndex: number
  setLiveActiveVerseIndex: (n: number) => void

  // v0.5.52 — Detection status feedback for the new reference engine.
  detectionStatus: 'idle' | 'listening' | 'processing' | 'detected' | 'no_match' | 'error'
  setDetectionStatus: (s: 'idle' | 'listening' | 'processing' | 'detected' | 'no_match' | 'error') => void

  // v0.5.52 — Per-installation custom themes (Theme Designer).
  customThemes: Array<{ id: string; name: string; settings: Partial<AppSettings> }>
  setCustomThemes: (
    next: Array<{ id: string; name: string; settings: Partial<AppSettings> }>,
  ) => void

  // v0.5.52 — Highlight colour used by the auto-scroll/speaker-follow
  // overlay. Stored as a Tailwind-friendly string, e.g. "amber".
  highlightColor: string
  setHighlightColor: (c: string) => void

  // Slides
  slides: Slide[]
  setSlides: (s: Slide[]) => void
  // Bug #6 — non-destructive single-slide patch. Unlike setSlides
  // (which resets previewSlideIndex/liveSlideIndex), this preserves
  // every other store field so the LiveTranslationSync provider can
  // swap a verse slide's text in place without yanking the slide off
  // air mid-service.
  replaceSlide: (index: number, patch: Partial<Slide>) => void
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

  // v0.5.57 — Mirror of LicenseProvider.isLocked, written by an
  // effect inside <LicenseProvider> at the layer ABOVE this store
  // selector. Speech / mic providers (which are mounted ABOVE the
  // license provider in the React tree, so they can't useLicense())
  // subscribe here to know when to forcibly stop the active engine
  // and release the OS mic on lockdown. Plain boolean — no nullable
  // unknown state because LicenseProvider always writes the resolved
  // value on mount.
  licenseLocked: boolean
  setLicenseLocked: (b: boolean) => void

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
  // v0.6.9 — Bible body line-height. 1.4 mirrors the typographic
  // default the NDI panel suggested (its slider seeded at 1.40 too)
  // so the secondary screen renders the same vertical rhythm out of
  // the box and operators only see a visible change once they
  // actually drag the slider.
  bibleLineHeight: 1.4,
  congregationScreenTheme: 'minimal',
  // English-only per v0.5.5 spec — the multi-language picker was a
  // footgun because Whisper's Base model is English-only and the
  // UI let operators pick locales that silently broke detection.
  speechLanguage: 'en-US',
  // v0.5.34 — default ON. Users were confused that detected verses
  // never appeared on Output until they manually flipped this. Most
  // operators want hands-free flow during a sermon; the explicit
  // toggle in Scripture Detection still lets them turn it off.
  autoGoLiveOnDetection: true,
  autoGoLiveOnLookup: false,
  aiAutoSendOnHigh: true,
  // v0.7.4 — Confidence tiers. Defaults match the operator spec:
  // ≥0.70 live / [0.30, 0.70) preview / <0.30 drop.
  transcriptDropThreshold: 0.30,
  transcriptPreviewThreshold: 0.60,
  transcriptLiveThreshold: 0.70,
  ndiDisplayMode: 'full',
  // NDI typography overrides (v0.5.48): leave undefined so the NDI
  // feed mirrors Live Display by default. The operator opts in via
  // the NDI Output panel.
  ndiFontFamily: undefined,
  ndiFontSize: undefined,
  ndiTextShadow: undefined,
  ndiTextScale: undefined,
  ndiTextAlign: undefined,
  // v0.5.57 — All undefined so existing operators see no behaviour
  // change until they explicitly opt-in via the NDI Settings panel.
  ndiAspectRatio: undefined,
  ndiBibleColor: undefined,
  ndiLowerThirdTransparent: false,
  // v0.7.3 — Reverted to 1.0× (was 2.0× in v0.7.0). Operator's
  // broadcast frame showed 2.0× was way too large; their lower-third
  // was covering the preacher. The slider Reset button also returns
  // to 1.0× to match (see ndi-output-panel.tsx). Pre-v0.7.0 shipped
  // undefined (effective 1.0) so this matches the original safe default.
  ndiLowerThirdScale: 1,
  ndiBibleLineHeight: undefined,
  ndiRefSize: undefined,
  ndiRefStyle: undefined,
  ndiRefPosition: undefined,
  ndiRefScale: undefined,
  ndiTranslation: undefined,
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
      // v0.7.60 — Candidates bucket. Cap at 50 entries (operator only
      // ever scans the recent few in a service, and we don't want a
      // long quiet stretch of low-confidence noise to keep growing).
      detectedVerseCandidates: [],
      addDetectedVerseCandidate: (v) =>
        set((state) => {
          // Skip dupes by reference within the recent window so a
          // semantic matcher firing on every transcript chunk doesn't
          // stack the same suggestion 10 times.
          const existing = state.detectedVerseCandidates.find(
            (c) => c.reference === v.reference,
          )
          if (existing) return {}
          return {
            detectedVerseCandidates: [v, ...state.detectedVerseCandidates].slice(0, 50),
          }
        }),
      clearDetectedVerseCandidates: () => set({ detectedVerseCandidates: [] }),
      promoteDetectedVerseCandidate: (id) =>
        set((state) => {
          const candidate = state.detectedVerseCandidates.find((c) => c.id === id)
          if (!candidate) return {}
          // Promote = remove from candidates, add to detectedVerses
          // with a synthetic 0.50 confidence so the LIVE column treats
          // it as eligible (the operator has explicitly endorsed it).
          const promoted: DetectedVerse = { ...candidate, confidence: Math.max(0.5, candidate.confidence) }
          return {
            detectedVerseCandidates: state.detectedVerseCandidates.filter((c) => c.id !== id),
            detectedVerses: [promoted, ...state.detectedVerses].slice(0, 100),
          }
        }),
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

      // v0.5.30 — mic gain / pause / Bible-only transcription
      micGain: 1,
      setMicGain: (g) => set({ micGain: Math.max(0, Math.min(2, g)) }),
      micPaused: false,
      setMicPaused: (b) => set({ micPaused: b }),
      bibleOnlyTranscription: true,
      setBibleOnlyTranscription: (b) => set({ bibleOnlyTranscription: b }),

      // v0.5.49 — Speech engine source picker. `auto` lets the
      // SpeechProvider pick Deepgram and fall back through the chain
      // on structural failures; the explicit choices pin the engine.
      preferredEngine: 'auto',
      setPreferredEngine: (e) => set({ preferredEngine: e }),
      activeEngineName: 'deepgram',
      setActiveEngineName: (e) => set({ activeEngineName: e }),

      // v0.5.52 — feature toggles default OFF for safety.
      // v0.7.54 — default-ON. Prior to this version the flag defaulted
      // to false, which meant the entire voice-command pre-pass in
      // SpeechProvider (regex classifier + chain detector + LLM
      // classifier + wake-word handling) was silently skipped on every
      // fresh install. Operators reported "voice commands not working"
      // because the toggle was buried in Settings → Voice Control and
      // most never knew it existed. The classifier infrastructure has
      // been hardened across v0.7.19 → v0.7.32 with filler filtering,
      // wake-word stripping ("Media, ..."), translation aliases,
      // confidence floors, and a 4 s dedupe window — defaulting on
      // matches operator expectation now that false-positive risk is
      // bounded. The persist migrate (version 2 → 3) below also
      // force-flips this to true for existing installs so the upgrade
      // path matches the fresh-install default.
      voiceControlEnabled: true,
      setVoiceControlEnabled: (b) => set({ voiceControlEnabled: b }),
      speakerFollowEnabled: false,
      setSpeakerFollowEnabled: (b) => set({ speakerFollowEnabled: b }),
      autoScrollEnabled: false,
      setAutoScrollEnabled: (b) => set({ autoScrollEnabled: b }),
      autoScrollSpeedMs: 4000,
      setAutoScrollSpeedMs: (n) => set({ autoScrollSpeedMs: n }),
      liveActiveVerseIndex: 0,
      setLiveActiveVerseIndex: (n) => set({ liveActiveVerseIndex: n }),
      detectionStatus: 'idle',
      setDetectionStatus: (s) => set({ detectionStatus: s }),
      customThemes: [],
      setCustomThemes: (next) => set({ customThemes: next }),
      highlightColor: 'amber',
      setHighlightColor: (c) => set({ highlightColor: c }),

      // Slides
      slides: [],
      setSlides: (s) => set({ slides: s, previewSlideIndex: 0, liveSlideIndex: -1 }),
      replaceSlide: (index, patch) =>
        set((state) => {
          if (index < 0 || index >= state.slides.length) return {}
          const nextSlides = state.slides.map((sl, i) =>
            i === index ? { ...sl, ...patch } : sl,
          )
          return { slides: nextSlides }
        }),
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

      // v0.5.57 — License lockdown mirror. Default false (unknown =
      // not locked) so the speech effect doesn't fire on first paint
      // before LicenseProvider has resolved the status.
      licenseLocked: false,
      setLicenseLocked: (b) => set({ licenseLocked: b }),

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
      // Operator request: dropped media must autoplay with sound on
      // BOTH the Preview and Live panes by default. Previously these
      // defaulted to false, forcing a manual click on the speaker /
      // headphone icon every time. The Preview pane freezes the
      // moment a slide goes Live (slide-renderer.tsx isLive branch),
      // so even with both surfaces audible there's no double-audio
      // playback during normal use.
      previewAudio: true,
      setPreviewAudio: (b) => set({ previewAudio: b }),
      liveBroadcastAudio: true,
      setLiveBroadcastAudio: (b) => set({ liveBroadcastAudio: b }),
      liveMonitorAudio: true,
      setLiveMonitorAudio: (b) => set({ liveMonitorAudio: b }),

      globalVolume: 1,
      setGlobalVolume: (v) => set({ globalVolume: Math.max(0, Math.min(1, v)) }),
      globalMuted: false,
      setGlobalMuted: (b) => set({ globalMuted: b }),

      // v0.5.34 — default ON so detected verses flow to Output
      // immediately. Not persisted (intentional — every fresh launch
      // starts in known-good auto-live state). Operator can disable
      // via the lightning-bolt button in the toolbar.
      autoLive: true,
      setAutoLive: (b) => set({ autoLive: b }),

      // 0.9 = 90%. Verses below this never auto-go-live; they only
      // appear in the Detected Verses panel as preview suggestions.
      // v0.7.60 — Lowered from 0.9 → 0.5 per operator spec
      // ("display 50–100% to live"). The speech-provider also clamps
      // any persisted value to ≤ 0.5 at the auto-live decision sites,
      // so an upgrader whose localStorage still holds 0.9 still gets
      // the new 50% floor without needing a settings change.
      autoLiveThreshold: 0.5,
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
      // v0.6.0 — bump to v2 to honour Case2 #6 (defaults must NOT
      // overwrite an existing operator's saved preferences). The v2
      // migration is intentionally a no-op preserve: we layer the
      // CURRENT defaults UNDER the operator's persisted settings so
      // any field the operator never touched picks up new defaults
      // automatically, but every field they explicitly set survives.
      // This stops the "I upgraded and my trial reset / my fonts
      // changed / my mic gain went back to 1" complaints.
      version: 3,
      migrate: (persistedState: unknown, version: number) => {
        const ps = (persistedState as {
          settings?: Partial<AppSettings>
          voiceControlEnabled?: boolean
        } | undefined) ?? {}
        // v0.5.34 → v1: flip autoGoLiveOnDetection on for early adopters.
        if (version < 1) {
          return {
            ...ps,
            settings: {
              ...defaultSettings,
              ...(ps.settings ?? {}),
              autoGoLiveOnDetection: true,
            },
            voiceControlEnabled: true,
          }
        }
        // v0.6.0 → v2: pure preserve. New defaults apply only to
        // fields the operator never set; everything else passes
        // through untouched. We DO NOT overwrite trial / activation
        // state here because licensing lives in license.json on the
        // main process, not in this client store.
        if (version < 2) {
          return {
            ...ps,
            settings: {
              ...defaultSettings,
              ...(ps.settings ?? {}),
            },
            voiceControlEnabled: true,
          }
        }
        // v0.7.54 → v3: one-time force-enable of voiceControlEnabled.
        // Prior to v0.7.54 the default was false AND the toggle lived
        // buried in Settings → Voice Control, so the overwhelming
        // majority of installed seats had it off without realising it
        // existed — voice commands silently never fired. We flip it
        // true on this migration so existing operators get the same
        // out-of-box behaviour as fresh installs. An operator who
        // genuinely WANTS commands disabled can flick the switch off
        // again in Settings; their preference will then persist
        // forward (this migration only runs once at version bump).
        if (version < 3) {
          return {
            ...ps,
            voiceControlEnabled: true,
          }
        }
        return ps
      },
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
        // v0.5.30 — operator's mic loudness and Bible-only filter
        // pref persist across restarts so each operator's tuning
        // sticks. micPaused is intentionally NOT persisted — every
        // session starts unpaused so a closed-and-reopened app
        // never freezes its own input pipeline silently.
        micGain: state.micGain,
        bibleOnlyTranscription: state.bibleOnlyTranscription,
        // v0.5.49 — operator's engine preference survives a relaunch.
        preferredEngine: state.preferredEngine,
        // v0.5.52 — operator's feature preferences survive a relaunch.
        voiceControlEnabled: state.voiceControlEnabled,
        speakerFollowEnabled: state.speakerFollowEnabled,
        autoScrollSpeedMs: state.autoScrollSpeedMs,
        customThemes: state.customThemes,
        highlightColor: state.highlightColor,
      }),
    }
  )
)
