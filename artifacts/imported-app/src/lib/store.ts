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
// v0.7.184 — In-app DisplayMode narrowed to 'full' ONLY. The two
// 'lower-third*' variants were removed from the in-app UI entirely
// (operator: "remove the lower third from the app, leaving only the
// lower third that can be operated in NDI settings only"). NDI broadcast
// keeps its own LT mode via the separate `ndiDisplayMode` field below
// (line ~184). Migration v4→v5 silently coerces any persisted stale
// 'lower-third' / 'lower-third-black' value to 'full' on first boot.
// See v0.7.184 GR-A in CHANGELOG: re-introducing in-app LT requires
// coordinated rollback of (1) this narrow + (2) the v4→v5 migration.
export type DisplayMode = 'full'
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
  // v0.7.104 — Detection source tag drives the three-column split in
  // the Detected Verses card. Each pipeline runs independently; the
  // tag tells the UI which column to render the row in:
  //   • 'explicit'   — Reference Engine v2 / regex hit ("Amos 1:3")
  //   • 'semantic'   — preacher-phrase, keyword search, AI cosine
  //   • 'suggestion' — low-confidence (0.10–0.60) band, manual only
  // Optional for back-compat: any persisted detection from before
  // v0.7.104 (or any new code path that hasn't been tagged yet) is
  // treated as 'explicit' by the column selectors.
  source?: 'explicit' | 'semantic' | 'suggestion'
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

  // ── Lower-Third-only typography overrides (v0.7.167) ───────────
  // Mirror of the ndi* block above, but for the IN-APP lower-third
  // surfaces ONLY: Settings → "PREVIEW (LOWER THIRD)" box, the
  // operator's live display window when displayMode==='lower-third',
  // the secondary screen / projector when displayMode==='lower-third',
  // and the OBS Browser Source URL fallback at /api/output/congregation
  // (when the route resolves dm==='lower-third' AND IS_NDI is false).
  // The actual NDI capture surface keeps reading the ndi* fields
  // above so vMix/OBS broadcast feeds are decoupled from the in-room
  // lower-third look — operators can run the in-room lower-third in
  // a big sans-serif chyron AND a separate broadcast lower-third in
  // a smaller serif without one disturbing the other.
  //
  // Resolution chain in route.ts: IS_NDI → ndi* override → fall back
  // to body. Non-NDI lower-third (preview/live/secondary/OBS) →
  // lowerThird* override → fall back to body. Full-screen → body
  // only (lower-third keys are NEVER read).
  lowerThirdFontFamily?: string
  lowerThirdFontSize?: 'sm' | 'md' | 'lg' | 'xl'
  lowerThirdTextShadow?: boolean
  lowerThirdTextScale?: number
  lowerThirdTextAlign?: 'left' | 'center' | 'right' | 'justify'
  lowerThirdBibleColor?: string
  lowerThirdBibleLineHeight?: number

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

  /** v0.7.194-hotfix.2 — NDI capture frame rate. The offscreen Electron
   *  capture window uses SOFTWARE video decode (Chromium's offscreen
   *  rendering path has no GPU video decode on Windows) which struggles
   *  to keep a 1080p video playing in real time at 60fps capture. Drop
   *  to 30 (default), 25, 20, or 15 to give the software decoder more
   *  headroom and stop the background-video judder operators reported.
   *  Changing this restarts NDI (handled via the restart guard in
   *  ndi-output-panel.tsx). 60 stays available for high-end machines.
   *  v0.7.194-hotfix.3 — 15fps added as a deeper relief option for very
   *  old hardware (Ivy Bridge / pre-2015 mobile chips). */
  ndiCaptureFps?: 60 | 30 | 25 | 20 | 15

  /** v0.7.194-hotfix.3 — NDI capture resolution. The offscreen capture
   *  window is created at this resolution. 1080p (1920×1080) is the
   *  default and matches what vMix/OBS/Wirecast scenes are usually
   *  configured for. 720p (1280×720) cuts per-frame work by ~56% (BGRA
   *  buffer 8.3 MB → 3.7 MB, encoding + memory bandwidth drop in step)
   *  which is the single biggest CPU relief for operators on older
   *  hardware (Ivy Bridge mobile, pre-2015 laptops, integrated graphics)
   *  where software HD video decode saturates the CPU. Downstream
   *  vMix/Wirecast/OBS upscale 720→1080 in their program output with
   *  hardware-accelerated bicubic; the visible quality drop on chyron
   *  text + Bible verses is zero, and full-bleed video media is only
   *  slightly softer but smooth. Changing this restarts NDI via the
   *  restart guard in ndi-output-panel.tsx. */
  ndiCaptureResolution?: '1080p' | '720p'

  /** v0.7.194-hotfix.4 — NDI Full-Screen background mode. When
   *  'themed' (default) the full-screen NDI surface renders with the
   *  themed gradient + custom background — identical to the secondary
   *  screen (v0.6.9 behaviour). When 'transparent' it strips both so
   *  vMix/OBS/Wirecast receive only the verse text on a clean alpha
   *  matte, useful when the production switcher already has its own
   *  program-output background. Lower-third has the per-box equivalent
   *  via `ndiLowerThirdTransparent`. */
  ndiFullScreenBackground?: 'themed' | 'transparent'

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
  /** v0.7.194-hotfix.4 — Remove a single entry from the Scripture
   *  Feed history pane (per-row × button). Index-based; the React
   *  key in the list is `${reference}-${i}` which is stable for
   *  the render. */
  removeVerseFromHistoryAt: (index: number) => void
  removeVerseHistoryByIndices: (indices: number[]) => void
  /** v0.7.194-hotfix.9 Item C — Wipe the entire Scripture Feed
   *  History pane in one shot. Used by the new Delete All button. */
  removeAllVerseHistory: () => void
  searchQuery: string
  setSearchQuery: (q: string) => void

  // Scripture Detection
  isListening: boolean
  setIsListening: (l: boolean) => void
  detectedVerses: DetectedVerse[]
  addDetectedVerse: (v: DetectedVerse) => void
  clearDetectedVerses: () => void
  // v0.7.134 — Per-column Clear button on the Detected Verses card.
  // `'explicit'` clears the "Auto Verse Match" column (regex hits),
  // `'semantic'` clears the "Bible Reference Quoted" column (paraphrase
  // hits), `'suggestion'` clears the SUGGESTIONS bucket entries that
  // live in detectedVerses (10–49% band). detectedVerseCandidates is
  // cleared by clearDetectedVerseCandidates() — the Suggested Verses
  // column wipe calls BOTH so the UI matches what the operator sees.
  clearDetectedVersesBySource: (source: 'explicit' | 'semantic' | 'suggestion') => void
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
  // v0.7.194-hotfix.7 — single-click previews a verse WITHOUT
  // yanking the current Live slide. If Live is airing, keeps the
  // current live slide at index 0 and appends the previewed slide
  // at index 1 (previewSlideIndex=1, liveSlideIndex=0, isLive
  // untouched). If not airing, behaves like setSlides([slide]).
  // De-dupes when the previewed slide has the same stable id as
  // the live slide (just points preview at the live index).
  stageVersePreviewOnly: (slide: Slide) => void
  previewSlideIndex: number
  setPreviewSlideIndex: (i: number) => void
  liveSlideIndex: number
  setLiveSlideIndex: (i: number) => void

  // v0.7.201 — Pinned preview slide. A direct Slide reference (not an
  // index lookup) used by the Preview pane / iframe as its source of
  // truth when set. Set atomically by stageVersePreviewOnly /
  // stageSlidesPreviewOnly so a single-click in any of the 5 columns
  // (Chapter Navigator, Auto Verse Match, Bible Reference Quoted,
  // Suggested Verses, Scripture Feed) is IMMUNE to any subsequent
  // mutation that touches slides[] / previewSlideIndex / liveSlideIndex.
  // Cleared on setIsLive(true), selectScheduleItem, removeAllScheduleItems,
  // clearSchedule, or explicit clearPinnedPreview. This is the
  // bulletproof v0.7.201 fix for the "preview snaps back to live"
  // bug — instead of trying to identify which mystery mutation
  // overwrites preview, we render preview from a slide reference
  // that the operator's click planted and nothing else can move.
  pinnedPreviewSlide: Slide | null
  pinPreviewSlide: (s: Slide | null) => void
  clearPinnedPreview: () => void

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
  // v0.7.194-hotfix.8 — Same as addScheduleItem but DOES NOT mutate
  // slides/previewSlideIndex/liveSlideIndex. Used by the single-click
  // preview-only path so the currently-airing slide is not yanked
  // when a verse is appended to the schedule for history/queue.
  addScheduleItemQuiet: (item: Omit<ScheduleItem, 'id' | 'addedAt'>) => string
  removeScheduleItem: (id: string) => void
  removeScheduleItemsByIds: (ids: string[]) => void
  /** v0.7.194-hotfix.9 Item C — Wipe the entire Queue pane in one
   *  shot. When `preserveLive=true` the currently-on-air schedule
   *  item (selectedScheduleItemId AND isLive) is kept so the live
   *  broadcast does not get yanked. */
  removeAllScheduleItems: (preserveLive?: boolean) => void
  /** v0.7.194-hotfix.9 Item B — Multi-slide preview-only stage.
   *  Like stageVersePreviewOnly but accepts an array of slides
   *  (for verses split across multiple slides). Preserves whatever
   *  is currently live by prepending the live slide at index 0
   *  and pointing the live cursor at it. */
  stageSlidesPreviewOnly: (slides: Slide[]) => void
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
  // v0.7.193-hotfix.2 — split per-surface so Preview and Live transport
  // controls are fully independent. Each pane's Play / Pause / Stop /
  // Loop / Scrub writes ONLY to its own pair of fields. The SSE
  // broadcast (NDI / OBS / secondary screen) follows the LIVE pair only.
  previewMediaPaused: boolean
  setPreviewMediaPaused: (b: boolean) => void
  liveMediaPaused: boolean
  setLiveMediaPaused: (b: boolean) => void

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
  previewMediaCurrentTime: number
  setPreviewMediaCurrentTime: (t: number) => void
  liveMediaCurrentTime: number
  setLiveMediaCurrentTime: (t: number) => void

  // v0.7.193 — Loop toggle for media-video transport. Persists per-
  // session. The in-app React <video> elements (Preview + Live
  // Display) and the iframe-renderer's <video> all read this and
  // mirror it onto their `loop` attribute, so a clip loops on every
  // surface (NDI / OBS / secondary screen too) as long as it's
  // playing.
  previewMediaLoop: boolean
  setPreviewMediaLoop: (b: boolean) => void
  liveMediaLoop: boolean
  setLiveMediaLoop: (b: boolean) => void

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
  lowerThirdHeight: 'lg',
  autoAdvanceSlides: false,
  slideTransitionDuration: 500,
  slideTransitionStyle: 'fade',
  fontFamily: 'sans',
  fontSize: 'lg',
  textShadow: true,
  showReferenceOnOutput: true,
  displayRatio: 'fill',
  // v0.7.97 — Operator request: ship the secondary screen at 90% by
  // default. The previous 100% was too large for the typical projector
  // distance in their venues; operators were dragging the slider down
  // on every fresh install. 0.9 = 90% on the slider's 0.5..2.0 range.
  // Existing installs that have already persisted a value keep theirs
  // ("unless users want to set it to their satisfaction").
  textScale: 0.9,
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
  // v0.7.97 — Operator request: ship Bible line-height at 0.95 by
  // default. The 1.40 typographic default created too much vertical
  // breathing room for their secondary-screen layout; operators were
  // pulling the slider toward "Tight" on every fresh install. 0.95
  // is just past Tight (1.0) and matches what they were dialling in.
  // The "Default (1.40)" reset button on the slider still snaps back
  // to the typographic 1.40 — it's a one-click way for an operator
  // who PREFERS more breathing room to opt back in.
  // Existing installs that have already persisted a value keep theirs.
  bibleLineHeight: 0.95,
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
  transcriptDropThreshold: 0.20,
  transcriptPreviewThreshold: 0.60,
  // v0.7.93 — Raised 0.50 → 0.65 after operator feedback that the
  // v0.7.91 lower threshold let too many low-confidence transcript
  // chunks reach the verse detector and command pre-pass, surfacing
  // wrong references and slowing the operator down. 0.65 still beats
  // the pre-v0.7.91 default of 0.70 so sensitivity is mildly improved
  // without the false-positive flood.
  // v0.7.115 — Lowered from 0.65 → 0.55. Operator complaint: "AI
  // detection doesn't listen to words well and doesn't live transcript
  // well; it kept transcribing wrongly." In real church environments
  // (worship band, choir, congregation noise) Deepgram chunk
  // confidence sits in the 0.50-0.70 band. The pre-115 0.65 floor
  // dropped the entire verse-detection / semantic-match pipeline for
  // every chunk under 0.65, which is why "AI is confused" — it never
  // even got a chance to look. 0.55 lets the matcher run on
  // borderline-noisy speech while still dropping pure music chunks.
  // Voice commands are unaffected (already always-on per v0.7.112).
  transcriptLiveThreshold: 0.55,
  ndiDisplayMode: 'full',
  // NDI typography overrides (v0.5.48): leave undefined so the NDI
  // feed mirrors Live Display by default. The operator opts in via
  // the NDI Output panel.
  ndiFontFamily: undefined,
  ndiFontSize: undefined,
  ndiTextShadow: undefined,
  ndiTextScale: undefined,
  ndiTextAlign: undefined,
  // v0.7.167 — Lower-third typography overrides default to undefined
  // so a fresh install paints lower-third with the same body
  // typography as full-screen. Operators opt-in via the new
  // "Lower Third Typography" controls in Settings → Display & Output.
  lowerThirdFontFamily: undefined,
  lowerThirdFontSize: undefined,
  lowerThirdTextShadow: undefined,
  lowerThirdTextScale: undefined,
  lowerThirdTextAlign: undefined,
  lowerThirdBibleColor: undefined,
  lowerThirdBibleLineHeight: undefined,
  // v0.5.57 — All undefined so existing operators see no behaviour
  // change until they explicitly opt-in via the NDI Settings panel.
  ndiAspectRatio: undefined,
  ndiBibleColor: undefined,
  ndiLowerThirdTransparent: false,
  // v0.7.194-hotfix.4 — NDI Full-Screen background mode. 'themed'
  // (default) keeps the v0.6.9 behaviour: full-screen NDI renders
  // identically to the secondary screen (themed gradient + custom
  // background visible). 'transparent' strips theme + custom bg so
  // vMix/OBS/Wirecast receive only the verse text on a clean alpha
  // matte — useful when the production switcher already has its
  // own program-output background that the operator wants the NDI
  // verse to key over. Lower-third has its own per-box toggle
  // (ndiLowerThirdTransparent); this is the full-screen equivalent.
  ndiFullScreenBackground: 'themed',
  // v0.7.3 — Reverted to 1.0× (was 2.0× in v0.7.0). Operator's
  // broadcast frame showed 2.0× was way too large; their lower-third
  // was covering the preacher. The slider Reset button also returns
  // to 1.0× to match (see ndi-output-panel.tsx). Pre-v0.7.0 shipped
  // undefined (effective 1.0) so this matches the original safe default.
  ndiLowerThirdScale: 1,
  // v0.7.194-hotfix.2 — Default 30 fps. 60 was the pre-fix hardcoded
  // value but software-decoded HD video on the offscreen capture window
  // can't sustain it on most operator machines, causing visible judder
  // on bg/foreground videos. 30 is the broadcast-standard cadence that
  // vMix/OBS happily ingest and that gives the software decoder ~2× the
  // per-frame budget. Operators on high-end machines can opt back into
  // 60 via the dropdown in NDI Output → Source.
  ndiCaptureFps: 30,
  // v0.7.194-hotfix.3 — Default 1080p (no migration for existing installs;
  // matches what vMix/OBS/Wirecast scenes are usually configured for).
  // Operators on older hardware (Ivy Bridge mobile, pre-2015 laptops,
  // integrated graphics) flip to 720p via the dropdown in NDI Output →
  // "NDI Layout & Bible Body" to eliminate software-decode CPU saturation.
  ndiCaptureResolution: '1080p',
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
      // v0.7.194-hotfix.4 — Per-row delete for the Scripture Feed
      // History pane. Index-based because verseHistory items don't
      // carry a unique ID; the index is stable for the lifetime of
      // the rendered list (React key is `${reference}-${i}`).
      removeVerseFromHistoryAt: (index: number) =>
        set((state) => ({
          verseHistory: state.verseHistory.filter((_, i) => i !== index),
        })),
      // v0.7.194-hotfix.7 — Bulk delete for Select-to-delete mode in the
      // Scripture Feed. Set lookup avoids O(N×M) and the index-shift bug
      // that comes from looping single-index deletes from the front.
      removeVerseHistoryByIndices: (indices: number[]) =>
        set((state) => {
          const drop = new Set(indices)
          return { verseHistory: state.verseHistory.filter((_, i) => !drop.has(i)) }
        }),
      // v0.7.194-hotfix.9 Item C — Delete All button on the Scripture
      // Feed History pane. Pure history wipe; never touches slides/
      // live state (verseHistory is operator scrubback memory only).
      removeAllVerseHistory: () => set({ verseHistory: [] }),
      searchQuery: '',
      setSearchQuery: (q) => set({ searchQuery: q }),

      // Scripture Detection
      isListening: false,
      setIsListening: (l) => set({ isListening: l }),
      detectedVerses: [],
      addDetectedVerse: (v) =>
        set((state) => {
          // v0.7.184 — Auto-route to Chapter Navigator. Fire BEFORE the
          // dedupe check below so the navigator updates EVEN WHEN the
          // verse is already in the detected column. Operator-reported
          // bug: "speaker says a verse, detector drops it; speaker
          // mentions previous verse — detector doesn't drop it again
          // because it's in the column already, so it doesn't auto-send."
          // The dedupe correctly suppresses the duplicate column entry
          // (we don't want the same verse appearing twice), but the
          // navigator should STILL re-navigate to that verse so the
          // operator can flip to it instantly. Done at the top so it
          // fires regardless of whether the dedupe block returns early.
          // `addDetectedVerseCandidate` (line ~860) is intentionally NOT
          // wired this way — speculative <50% guesses thrash the navigator.
          if (v.reference) {
            try { get().requestNavigatorRef(v.reference) } catch { /* defensive */ }
          }
          // v0.7.119 — Cross-source dedupe. Operator reported "the
          // verse appeared in Bible Reference Quoted but the live
          // counter incremented in Auto Verse Match" — root cause is
          // both pipelines firing for the same reference, leaving
          // the same verse in BOTH columns and confusing the
          // counter. Source priority: explicit > semantic > suggestion.
          // Higher-priority incoming → evict any existing same-ref
          // entries from lower-priority sources. Lower-priority
          // incoming when a higher-priority entry already exists →
          // skip the addition (the authoritative one stays).
          const rank: Record<string, number> = {
            explicit: 3, semantic: 2, suggestion: 1,
          }
          const incomingRank = rank[(v as { source?: string }).source ?? 'semantic'] ?? 2
          const existing = state.detectedVerses.find((d) => d.reference === v.reference)
          if (existing) {
            const existingRank = rank[(existing as { source?: string }).source ?? 'semantic'] ?? 2
            if (existingRank >= incomingRank) {
              // v0.7.187.2 — RE-MENTION AUTO-LIVE. Operator: "speaker
              // says Amos 1:3 → drops to column → speaker says John 3:4
              // → drops to column → speaker says Amos 1:3 again →
              // detector doesn't drop it again because it's in the
              // column already, so it doesn't auto-send." Pre-fix this
              // branch returned {} (no state change) → the auto-live
              // useEffect in logos-shell.tsx watching `detectedVerses`
              // never re-ran → the re-mentioned verse stayed off air.
              //
              // Fix: PROMOTE the existing entry to the front of the
              // array with a fresh `detectedAt` AND a NEW `id`, so:
              //   (1) array reference changes → useEffect re-fires
              //   (2) new id ≠ lastAutoVerseId.current (the gate at
              //       logos-shell.tsx:3360 that prevents re-firing the
              //       same verse twice in a row) → auto-live actually
              //       sends to broadcast on re-mention
              //   (3) authoritative `source` + `confidence` from the
              //       existing entry are preserved so the column UI +
              //       stability gate still see the higher-quality data
              //   (4) shouldFireAutoLiveStable picks the front-of-array
              //       entry as the live winner, so the re-mentioned
              //       verse goes live exactly as the original mention
              //       did. requestNavigatorRef already fired at the top
              //       of this reducer so the navigator updates too.
              const promoted = {
                ...existing,
                id: `det-rementioned-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                detectedAt: new Date(),
              }
              const filtered = state.detectedVerses.filter((d) => d.reference !== v.reference)
              return { detectedVerses: [promoted, ...filtered].slice(0, 100) }
            }
            // Incoming wins — evict the lower-ranked one(s) for this ref.
            const filtered = state.detectedVerses.filter((d) => d.reference !== v.reference)
            return { detectedVerses: [v, ...filtered].slice(0, 100) }
          }
          return {
            detectedVerses: [v, ...state.detectedVerses].slice(0, 100),
          }
        }),
      clearDetectedVerses: () => set({ detectedVerses: [] }),
      // v0.7.134 — Per-column wipe. Source matching mirrors
      // verse-auto-live.ts `sourceOf()`: untagged detections default
      // to 'explicit'. SUGGESTION wipe drops anything below the
      // SEMANTIC floor (0.50) — that's the same band the Suggested
      // Verses column renders via suggestionsFor() — so the operator
      // sees the column actually empty after the click. We deliberately
      // keep it source-agnostic for the suggestion band because the
      // 10–49% suggestions bucket can contain rows from EITHER pipeline
      // (an explicit regex hit at 0.45 still falls into suggestions).
      clearDetectedVersesBySource: (source) =>
        set((state) => {
          if (source === 'suggestion') {
            return {
              detectedVerses: state.detectedVerses.filter(
                (v) => (v.confidence ?? 0) >= 0.5,
              ),
            }
          }
          return {
            detectedVerses: state.detectedVerses.filter((v) => {
              const conf = v.confidence ?? 0
              if (conf < 0.5) return true // leave the suggestions band alone
              const vSrc = (v.source as 'explicit' | 'semantic' | undefined) ?? 'explicit'
              return vSrc !== source
            }),
          }
        }),
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
      // v0.7.201 — pinnedPreviewSlide. See interface comment.
      pinnedPreviewSlide: null,
      pinPreviewSlide: (s) => set({ pinnedPreviewSlide: s }),
      clearPinnedPreview: () => set({ pinnedPreviewSlide: null }),
      // v0.7.194-hotfix.7 — see interface comment above.
      // v0.7.201 — Atomically PIN the staged slide so the Preview
      // pane / iframe renders directly from this reference and is
      // immune to any subsequent slides[] / previewSlideIndex /
      // liveSlideIndex mutation. Cleared on setIsLive(true) /
      // selectScheduleItem / removeAllScheduleItems / clearSchedule.
      stageVersePreviewOnly: (slide) =>
        set((state) => {
          const cur =
            state.isLive && state.liveSlideIndex >= 0
              ? state.slides[state.liveSlideIndex]
              : null
          if (cur && cur.id === slide.id) {
            return { previewSlideIndex: state.liveSlideIndex, pinnedPreviewSlide: slide }
          }
          if (cur) {
            return { slides: [cur, slide], previewSlideIndex: 1, liveSlideIndex: 0, pinnedPreviewSlide: slide }
          }
          return { slides: [slide], previewSlideIndex: 0, liveSlideIndex: -1, pinnedPreviewSlide: slide }
        }),
      // v0.7.194-hotfix.9 Item B — Multi-slide preview-only. Same
      // contract as stageVersePreviewOnly (preserve live, only
      // change preview) but for verses split into 2+ slides by
      // splitForSlides(). When live, the live slide is preserved
      // at index 0 with liveSlideIndex=0 and the preview slides
      // follow at indices 1..N; previewSlideIndex points at 1.
      stageSlidesPreviewOnly: (slides) =>
        set((state) => {
          if (!slides.length) return {}
          const cur =
            state.isLive && state.liveSlideIndex >= 0
              ? state.slides[state.liveSlideIndex]
              : null
          // v0.7.201 — Pin the first preview slide (the one at the
          // previewSlideIndex after this mutation) so render is
          // immune to subsequent mutations.
          const pinTarget = slides[0]
          if (cur) {
            const sameAsLive = slides.length === 1 && slides[0].id === cur.id
            if (sameAsLive) return { previewSlideIndex: state.liveSlideIndex, pinnedPreviewSlide: pinTarget }
            return {
              slides: [cur, ...slides],
              previewSlideIndex: 1,
              liveSlideIndex: 0,
              pinnedPreviewSlide: pinTarget,
            }
          }
          return { slides, previewSlideIndex: 0, liveSlideIndex: -1, pinnedPreviewSlide: pinTarget }
        }),
      replaceSlide: (index, patch) => {
        return set((state) => {
          if (index < 0 || index >= state.slides.length) return {}
          const nextSlides = state.slides.map((sl, i) =>
            i === index ? { ...sl, ...patch } : sl,
          )
          return { slides: nextSlides }
        })
      },
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
      // v0.7.201 — Going live clears the operator's pinned preview
      // because the act of pushing-to-air consumes the staging
      // intent. Auto-fire effect's curPreview preservation still
      // restores slides[previewIdx]=curPreview, so the visible
      // preview keeps showing the operator's choice via the normal
      // slides[previewSlideIndex] fallback. setIsLive(false) does
      // NOT clear the pin — operator pressing Black should not
      // wipe their staged preview.
      setIsLive: (m) => set(m ? { isLive: m, pinnedPreviewSlide: null } : { isLive: m }),

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
      // v0.7.194-hotfix.8 — Schedule-only mutation; does NOT touch
      // slides/previewSlideIndex/liveSlideIndex. Pairs with
      // stageVersePreviewOnly so single-click append-to-history can run
      // without yanking the on-air slide. selectedScheduleItemId is
      // ALSO preserved (not switched to the new id) so the live
      // operator stays anchored to whatever they were broadcasting.
      addScheduleItemQuiet: (item) => {
        const id = `sch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        const full: ScheduleItem = { ...item, id, addedAt: Date.now() }
        set((state) => ({
          schedule: [...state.schedule, full],
        }))
        return id
      },
      // v0.7.194-hotfix.9 Item C — Delete All on the Queue pane.
      // preserveLive (default true) keeps the currently-selected
      // schedule item if it is on air, so the wipe does NOT yank
      // the live broadcast. When false (operator confirmation
      // dialog could override), the entire queue is cleared and
      // the slide stage is reset.
      removeAllScheduleItems: (preserveLive = true) =>
        set((state) => {
          if (!preserveLive) {
            return {
              schedule: [],
              selectedScheduleItemId: null,
              slides: [],
              previewSlideIndex: 0,
              liveSlideIndex: -1,
              pinnedPreviewSlide: null,
            }
          }
          const liveId =
            state.isLive && state.selectedScheduleItemId
              ? state.selectedScheduleItemId
              : null
          if (!liveId) {
            return {
              schedule: [],
              selectedScheduleItemId: null,
            }
          }
          const liveItem = state.schedule.find((s) => s.id === liveId)
          return {
            schedule: liveItem ? [liveItem] : [],
            selectedScheduleItemId: liveItem ? liveId : null,
          }
        }),
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
      // v0.7.194-hotfix.7 — Bulk delete for Select-to-delete mode in the
      // Scripture Feed Queue tab. Currently-live item is preserved on
      // air; only schedule references are removed.
      removeScheduleItemsByIds: (ids) =>
        set((state) => {
          const drop = new Set(ids)
          const next = state.schedule.filter((s) => !drop.has(s.id))
          const wasSelected = state.selectedScheduleItemId && drop.has(state.selectedScheduleItemId)
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
          if (id === null) return { selectedScheduleItemId: null, pinnedPreviewSlide: null }
          const item = state.schedule.find((s) => s.id === id)
          if (!item) return {}
          return {
            selectedScheduleItemId: id,
            slides: item.slides,
            previewSlideIndex: 0,
            liveSlideIndex: -1,
            pinnedPreviewSlide: null,
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
          pinnedPreviewSlide: null,
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
      previewMediaPaused: false,
      setPreviewMediaPaused: (b) => set({ previewMediaPaused: b }),
      liveMediaPaused: false,
      setLiveMediaPaused: (b) => set({ liveMediaPaused: b }),
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

      previewMediaCurrentTime: 0,
      setPreviewMediaCurrentTime: (t) => set({ previewMediaCurrentTime: Math.max(0, t) }),
      liveMediaCurrentTime: 0,
      setLiveMediaCurrentTime: (t) => set({ liveMediaCurrentTime: Math.max(0, t) }),
      previewMediaLoop: false,
      setPreviewMediaLoop: (b) => set({ previewMediaLoop: b }),
      liveMediaLoop: false,
      setLiveMediaLoop: (b) => set({ liveMediaLoop: b }),

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
      // v0.7.184 — bumped to 5 so the v4→v5 LT-coercion migration block
      // below actually executes on existing installs upgrading from v0.7.183
      // and earlier. Without this bump the migration is dead code: zustand
      // only runs migration steps where `version < currentVersion`, so
      // leaving this at 4 means stale persisted `displayMode='lower-third'`
      // / `'lower-third-black'` would never be coerced and the in-app LT
      // surfaces (now deleted) would render in undefined mode.
      version: 5,
      migrate: (persistedState: unknown, version: number) => {
        const ps = (persistedState as {
          settings?: Partial<AppSettings> & { defaultTranslation?: string; ndiTranslation?: string }
          voiceControlEnabled?: boolean
          selectedTranslation?: string
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
        // v0.7.167 → v4: rewrite persisted Akuapem 'TWI' → 'TWIASANTE'.
        // v0.7.163 dropped the Akuapem TWI key from TRANSLATIONS_INFO,
        // but seats that ran v0.7.137–v0.7.162 still had 'TWI' baked
        // into their persisted store under three keys:
        //   - settings.defaultTranslation
        //   - settings.ndiTranslation
        //   - selectedTranslation
        // After the upgrade those values become orphans: not in the
        // dropdown options list, but still rendered as the SELECTED
        // label and still sent to /api/bible as translation='TWI'.
        // Result: operators saw "TWI" stuck in the header dropdown
        // and on the verse badge, and the API silently fell through
        // to whatever code path used to fetch Akuapem text. This
        // migration is a one-time rewrite — anyone whose persisted
        // value was ALREADY 'TWIASANTE' or any other key passes
        // through untouched.
        if (version < 4) {
          const s = (ps.settings ?? {}) as Partial<AppSettings> & { defaultTranslation?: string; ndiTranslation?: string }
          const fixedSettings: typeof s = { ...s }
          if (s.defaultTranslation === ('TWI' as string)) {
            fixedSettings.defaultTranslation = 'TWIASANTE' as BibleTranslation
          }
          if (s.ndiTranslation === ('TWI' as string)) {
            fixedSettings.ndiTranslation = 'TWIASANTE' as BibleTranslation
          }
          const fixedSelected = (ps.selectedTranslation === ('TWI' as string))
            ? ('TWIASANTE' as BibleTranslation)
            : ps.selectedTranslation
          return {
            ...ps,
            settings: fixedSettings,
            selectedTranslation: fixedSelected,
          }
        }
        // v0.7.184 → v5: coerce stale in-app `displayMode` of
        // 'lower-third' or 'lower-third-black' → 'full'. The in-app
        // Lower Third UI was removed in v0.7.184 (operator-explicit:
        // "remove the lower third from the app, leaving only the lower
        // third that can be operated in NDI settings only"). Without
        // this migration, an existing install that last persisted
        // `displayMode='lower-third'` would render NOTHING on the
        // in-app Live Display surface (the LT branch in route.ts is
        // now NDI-only). Idempotent: a fresh install at version 5
        // already has displayMode='full' and the equality check skips.
        // NDI's separate `ndiDisplayMode` field is intentionally NOT
        // touched — operators who configured an LT NDI broadcast keep it.
        if (version < 5) {
          const s = (ps.settings ?? {}) as Omit<Partial<AppSettings>, 'displayMode'> & { displayMode?: string }
          if (s.displayMode === 'lower-third' || s.displayMode === 'lower-third-black') {
            return {
              ...ps,
              settings: { ...s, displayMode: 'full' as DisplayMode },
            }
          }
          return ps
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
