'use client'

import { useEffect, useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { bootstrapRuntimeKeys } from '@/lib/runtime-keys'
import { detectBestReference, parseExplicitReference } from '@/lib/bibles/reference-engine'
import { lookupRange, lookupVerse, isTranslationBundled } from '@/lib/bibles/local-bible'
// v0.7.4 — chapter metadata for "next chapter" / "previous chapter"
// voice commands. Same JSON the reference engine uses for validation.
import bibleStructure from '@/data/bible-structure.json'
import { detectCommand, type VoiceCommand } from '@/lib/voice/commands'
import { pickBestVerse, type VerseLine } from '@/lib/voice/speaker-follow'
// v0.5.45 — TRIPLE-ENGINE WITH AUTO-FALLBACK CHAIN.
//
// v0.5.44 added a 2-engine fallback (Deepgram -> browser Web Speech).
// v0.5.45 inserts the OpenAI Whisper engine (the original "previous
// one" the operator asked back in) as the middle tier. The chain is:
//
//   1. Deepgram streaming     (preferred — real-time WS, interim
//                              transcripts, server-grade accuracy)
//   2. OpenAI Whisper         (HTTP, ~2.5 s chunks via /api/transcribe;
//                              uses OPENAI_API_KEY directly when set,
//                              else the api-server proxy in Electron)
//   3. Web Speech API         (browser-native, last-ditch fallback,
//                              works offline-ish but lower accuracy)
//
// All three hooks expose the identical surface (transcript, interim,
// isListening, isSupported, error, startListening, stopListening,
// resetTranscript), so the rest of the provider reads from a single
// "active" engine without branching downstream.
//
// On startListening:
//   - We try Deepgram first.
//   - If its error within 8 s contains "WebSocket" / "1006" /
//     "connection failed" / "could not be established" /
//     "disconnected", we stop it and advance to Whisper.
//   - If Whisper's error within 8 s contains "503" / "openai" /
//     "api key" / "fetch" / "network" / "upstream" / "proxy" /
//     "HTTP 4xx/5xx", we stop it and advance to the browser engine.
//   - Each advance fires a one-time sonner toast so the operator
//     always sees which engine ended up running.
// Once a session has advanced through the chain we don't retry the
// earlier engines until the next page load — alternative is a
// thrashing audio graph and confused state.
import { useDeepgramStreaming } from '@/hooks/use-deepgram-streaming'
import { useWhisperSpeechRecognition } from '@/hooks/use-whisper-speech-recognition'
import { useAppStore } from '@/lib/store'
import { detectVersesInTextWithScore, fetchBibleVerse, PREACHER_ATTRIBUTION } from '@/lib/bible-api'
import type { BibleSearchHit } from '@/lib/bible-api'
import type { DetectedVerse } from '@/lib/store'

// v0.5.52 — TWO-ENGINE chain. Web Speech API removed entirely; the
// desktop build ships with baked Deepgram + OpenAI keys so the
// browser engine is no longer a useful fallback rung.
//
// v0.7.19 — OpenAI/Whisper engine removed from the runtime chain. The
// operator's OpenAI project key was rotated and the rotation never
// propagated cleanly to the deployed proxy, so Whisper-routed chunks
// were 401-ing for every customer in the field. Rather than maintain
// two STT vendors (one of which we couldn't keep healthy), we
// consolidated on Deepgram for both the streaming WS path AND the
// batched HTTP path. The whisper hook stays mounted for now (cheap)
// and the type still includes it so any persisted preferences stay
// load-safe; ENGINE_CHAIN simply no longer fans out to it.
type EngineName = 'deepgram' | 'whisper'

// Ordered fallback chain. Index 0 is the preferred engine. nextEngine
// returns the name of the next engine in the chain, or null if we're
// at the end. v0.7.19: Deepgram is the only entry — see header note.
const ENGINE_CHAIN: EngineName[] = ['deepgram']
function nextEngine(cur: EngineName): EngineName | null {
  const i = ENGINE_CHAIN.indexOf(cur)
  if (i < 0) return null
  return ENGINE_CHAIN[i + 1] ?? null
}

// Returns true if the engine's error message looks like a structural
// failure (cannot reach backend, key missing, WS won't upgrade, etc.) —
// i.e. something the operator cannot fix mid-service and that we
// should auto-route around.
function isStructuralError(engine: EngineName, msg: string): boolean {
  const e = msg.toLowerCase()
  if (engine === 'deepgram') {
    return (
      e.includes('websocket') ||
      e.includes('1006') ||
      e.includes('connection failed') ||
      e.includes('could not be established') ||
      e.includes('disconnected')
    )
  }
  if (engine === 'whisper') {
    return (
      e.includes('503') ||
      e.includes('502') ||
      e.includes('504') ||
      e.includes('500') ||
      e.includes('openai') ||
      e.includes('api key') ||
      e.includes('quota') ||
      e.includes('fetch') ||
      e.includes('network') ||
      e.includes('upstream') ||
      e.includes('proxy') ||
      e.includes('http ')
    )
  }
  return false
}

// One-time human-readable toast copy per engine handoff.
const ENGINE_LABELS: Record<EngineName, string> = {
  deepgram: 'Deepgram',
  whisper: 'OpenAI Whisper',
}
function fallbackToastCopy(from: EngineName, to: EngineName): { title: string; description: string } {
  return {
    title: `Live transcription switched to ${ENGINE_LABELS[to]}`,
    description:
      `${ENGINE_LABELS[from]} was unreachable in this environment, so we automatically fell back to ${ENGINE_LABELS[to]}. ` +
      `Detection and auto-go-live still work.`,
  }
}

/**
 * SpeechProvider - Persistent speech recognition that survives view navigation.
 *
 * This component wraps the entire app and manages the Deepgram streaming
 * lifecycle (with browser-engine auto-fallback). It syncs transcript/state
 * to the Zustand store so any view can access it. Verse detection and
 * auto go-live processing happen here, ensuring they work even when the
 * user is on a different page/tab.
 */
export function SpeechProvider({ children }: { children: React.ReactNode }) {
  // ── All three engines mounted unconditionally ──────────────────────
  // Mounting all three is cheap — none of them opens the mic, a
  // MediaRecorder, or a WebSocket until startListening() is called.
  // Reading from each on every render means a few extra refs but no
  // measurable overhead.
  const dgEngine = useDeepgramStreaming()
  const wsEngine = useWhisperSpeechRecognition()

  // v0.5.52 — Kick off the runtime-keys override fetch as early as
  // possible so the very first startListening() sees the operator's
  // override (if any) instead of the baked default. The hooks also
  // call this themselves; one extra call is cheap (it's memoised).
  useEffect(() => { bootstrapRuntimeKeys() }, [])

  // v0.5.49 — Honor the operator's engine preference. `preferredEngine`
  // is read once at mount to seed activeEngine; the auto-fallback chain
  // below is gated on `preferredEngine === 'auto'` so a pinned engine
  // never silently switches to another one.
  const preferredEngine = useAppStore((s) => s.preferredEngine)
  const setActiveEngineNameInStore = useAppStore((s) => s.setActiveEngineName)
  // v0.7.19 — Coerce any persisted 'whisper' preference to 'deepgram'.
  // Old installs may have a saved preference of 'whisper' from a prior
  // version where the operator pinned Whisper; that engine is no longer
  // wired up (see ENGINE_CHAIN comment), so silently route them to
  // Deepgram instead of leaving them in a never-starts state.
  const initialEngine: EngineName =
    preferredEngine === 'auto' || preferredEngine === 'whisper'
      ? 'deepgram'
      : preferredEngine
  // Currently active engine. With preferredEngine === 'auto' the
  // auto-fallback effect below advances it through ENGINE_CHAIN
  // whenever the active engine surfaces a structural error within the
  // post-start window. With a pinned preference we stay put.
  const [activeEngine, setActiveEngine] = useState<EngineName>(initialEngine)
  // Tracks how many times we've stepped down the chain in this
  // session. Once we've stepped, we don't go back — the alternative
  // is a thrashing audio graph and OS mic indicator flashes every
  // time the WS to Deepgram retries.
  const fallbackStepsRef = useRef(0)
  // Timestamp of the most recent startListening() (or fallback
  // startListening) — used to scope the 8 s structural-failure
  // window per engine so an unrelated network blip days later
  // doesn't auto-step.
  const startedAtRef = useRef(0)
  // Holds the latest stableProcessCallback so the fallback path can
  // re-arm the next engine's startListening with the same transcript
  // handler.
  const lastCallbackRef = useRef<((text: string, confidence: number) => void) | null>(null)
  // One-shot guards so each handoff toast only fires once per
  // session and direction (e.g. dg->whisper toast, whisper->browser
  // toast).
  const announcedHandoffsRef = useRef<Set<string>>(new Set())
  // v0.5.48 — set the first time the active engine emits ANY
  // transcript text, used by the auto-fallback effect to decide
  // whether to enforce the 8 s window or fall back unconditionally
  // on a structural error (cold-start handshake can exceed 8 s).
  const sawTranscriptRef = useRef(false)

  // v0.5.49 — Race guard for engine switches. Both the auto-fallback
  // effect and the mid-session preferredEngine-change effect defer
  // their `startListening()` call by one tick (so React commits the
  // activeEngine state swap first). If the operator rapid-fires the
  // engine picker, two stale starts could land in order, leaving
  // activeEngine state out of sync with whichever engine is actually
  // hot. We defend in two layers:
  //   1. `engineSwitchGenRef` increments on every scheduled switch
  //      and the deferred callback aborts unless its captured gen
  //      still equals the latest gen.
  //   2. `pendingStartTimerRef` holds the active timer handle so a
  //      newer switch can `clearTimeout()` the previous one before
  //      it ever fires. Belt + suspenders — the gen check alone is
  //      enough, but cancelling the timer is cheap and reduces log
  //      noise.
  const engineSwitchGenRef = useRef(0)
  const pendingStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleEngineStart = (
    target: EngineName,
    handle: { startListening: (cb?: (t: string, confidence: number) => void) => void },
    cb: ((text: string, confidence: number) => void) | null,
    label: string,
  ) => {
    const gen = ++engineSwitchGenRef.current
    if (pendingStartTimerRef.current !== null) {
      clearTimeout(pendingStartTimerRef.current)
      pendingStartTimerRef.current = null
    }
    pendingStartTimerRef.current = setTimeout(() => {
      pendingStartTimerRef.current = null
      // Stale-switch guard. If a newer scheduleEngineStart was queued
      // after us, gen will have advanced and we abort silently.
      if (gen !== engineSwitchGenRef.current) {
        // eslint-disable-next-line no-console
        console.log(`[SpeechProvider] (stale) ${label} → ${target} aborted (gen ${gen} < ${engineSwitchGenRef.current})`)
        return
      }
      try {
        // eslint-disable-next-line no-console
        console.log(`[SpeechProvider] -> ${target}.startListening() (${label})`)
        handle.startListening(cb ?? undefined)
        startedAtRef.current = Date.now()
        sawTranscriptRef.current = false
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(`[SpeechProvider] ${target} ${label} start failed:`, e)
      }
    }, 0)
  }

  // Read from whichever engine is currently active. All three hooks
  // expose the identical surface (verified at compile time by the
  // shared destructure below — TS errors here would mean a hook
  // signature drift).
  const engine = activeEngine === 'deepgram' ? dgEngine : wsEngine
  const {
    transcript: hookTranscript,
    interimTranscript: hookInterim,
    isListening: hookListening,
    isSupported: hookSupported,
    error: hookError,
    startListening,
    stopListening,
    resetTranscript,
  } = engine

  // Store actions for syncing
  const setLiveTranscript = useAppStore((s) => s.setLiveTranscript)
  const setLiveInterimTranscript = useAppStore((s) => s.setLiveInterimTranscript)
  const setSpeechSupported = useAppStore((s) => s.setSpeechSupported)
  const setSpeechError = useAppStore((s) => s.setSpeechError)
  const setIsListening = useAppStore((s) => s.setIsListening)
  const speechCommand = useAppStore((s) => s.speechCommand)
  const setSpeechCommand = useAppStore((s) => s.setSpeechCommand)
  // v0.5.57 — License lockdown signal mirrored from <LicenseProvider>.
  // When this flips to true (trial expired / never_activated /
  // expired) we forcibly tear down every engine so the OS mic
  // indicator goes dark and no transcription bytes leave the
  // machine. The lock-overlay UI already disables operator inputs;
  // this effect shuts the door on any in-flight audio capture
  // that started before the lock fired.
  const licenseLocked = useAppStore((s) => s.licenseLocked)

  // ── Sync hook state → store (so any view can read it) ──────────────
  useEffect(() => {
    setLiveTranscript(hookTranscript)
    // v0.5.48 — flip the "did this engine ever produce text?" latch so
    // the auto-fallback effect can distinguish a never-worked engine
    // (always fall back on structural error) from a once-worked engine
    // that hit a transient mid-service blip (respect the 8 s window).
    if (hookTranscript && hookTranscript.length > 0) sawTranscriptRef.current = true
  }, [hookTranscript, setLiveTranscript])

  useEffect(() => {
    setLiveInterimTranscript(hookInterim)
  }, [hookInterim, setLiveInterimTranscript])

  // v0.5.44 — speechSupported is true if EITHER engine is available.
  // Deepgram works in any modern browser/Electron with mic + WS +
  // AudioContext. Web Speech is available in Chrome / Edge / Electron.
  // Together they cover essentially every operator environment, so
  // we keep the unconditional-true policy but also report the actual
  // capability surface in the console for support tickets.
  useEffect(() => {
    setSpeechSupported(true)
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log(
        '[SpeechProvider] triple-engine: deepgramSupported =',
        dgEngine.isSupported,
        '  whisperSupported =',
        wsEngine.isSupported,
        '  active =',
        activeEngine,
      )
    }
  }, [dgEngine.isSupported, wsEngine.isSupported, activeEngine, setSpeechSupported])

  // ── Auto-fallback: structural failure on active engine → next ──────
  // Watches whichever engine is currently active. If, within 8 s of
  // the latest startListening, that engine surfaces an error matching
  // its structural-failure regex (WS 1006 for Deepgram, HTTP/network
  // for Whisper), we tear it down, advance activeEngine to the next
  // entry in ENGINE_CHAIN, and re-arm startListening with the same
  // callback. Browser engine is the last link — if it fails, the
  // hookError surface still lights up but we don't try to step
  // beyond it.
  useEffect(() => {
    // v0.5.49 — Skip the entire fallback chain when the operator has
    // pinned a specific engine. They explicitly chose Deepgram /
    // Whisper / Browser; silently switching to another one would
    // contradict that choice. Pinned engines surface their error
    // through the existing speechError pipe instead.
    if (preferredEngine !== 'auto') return

    // Pick the live engine handle for the current active name. We
    // index off this rather than dgEngine directly so the same
    // effect handles each step in the chain.
    const liveEngine =
      activeEngine === 'deepgram' ? dgEngine : wsEngine

    if (!liveEngine.error) return
    if (startedAtRef.current === 0) return
    if (!isStructuralError(activeEngine, liveEngine.error)) return
    // v0.5.49 — Tightened the post-start window from 8 s to 3 s.
    // Operator complaint: the previous 8 s wait meant they sat
    // staring at a dead transcription panel for 8 seconds before
    // anything happened. With Deepgram cold-start fixed in v0.5.48,
    // 3 s is plenty for the WS handshake on any reachable network;
    // anything longer is a real failure that should fall back fast.
    //   - Never received a transcript yet → ALWAYS fall back.
    //   - Already produced transcripts → respect the 3 s window so a
    //     transient mid-service network blip doesn't cycle engines.
    const since = Date.now() - startedAtRef.current
    if (sawTranscriptRef.current && since > 3_000) return

    const target = nextEngine(activeEngine)
    if (!target) {
      // We're already on the last engine. Surface the error to the
      // operator via the hookError pipe — nothing else we can do.
      // eslint-disable-next-line no-console
      console.error(
        '[SpeechProvider] last engine in chain failed (',
        activeEngine,
        '):',
        liveEngine.error,
      )
      return
    }

    // The next engine must actually be supported in this environment;
    // otherwise step PAST it and try the one after. (E.g. browser
    // engine would be unsupported in a server-side render context.)
    let chosen: EngineName | null = target
    while (chosen) {
      const candidate = chosen === 'deepgram' ? dgEngine : wsEngine
      if (candidate.isSupported) break
      chosen = nextEngine(chosen)
    }
    if (!chosen) {
      // eslint-disable-next-line no-console
      console.error(
        '[SpeechProvider] no remaining engines support this environment after',
        activeEngine,
        'failed.',
      )
      return
    }

    const from = activeEngine
    fallbackStepsRef.current += 1
    // eslint-disable-next-line no-console
    console.warn(
      `[SpeechProvider] ${from} failed (`,
      liveEngine.error,
      `) — switching to ${chosen} and restarting.`,
    )

    // Tear down the failed engine's audio graph / WS / recorder so
    // the OS mic indicator goes off and the dead engine stops
    // re-emitting errors into our error effect.
    try { liveEngine.stopListening() } catch { /* ignore */ }

    setActiveEngine(chosen)

    // Re-arm the next engine with the same callback the operator
    // last requested. Defer one tick so React commits the engine
    // swap before we fire startListening on the new instance.
    // v0.5.49 — `scheduleEngineStart` carries a generation token +
    // cancellable timer so a rapid second switch supersedes us.
    const cb = lastCallbackRef.current
    const nextHandle = chosen === 'deepgram' ? dgEngine : wsEngine
    scheduleEngineStart(chosen, nextHandle, cb, 'fallback')

    const handoffKey = `${from}->${chosen}`
    if (!announcedHandoffsRef.current.has(handoffKey)) {
      announcedHandoffsRef.current.add(handoffKey)
      const copy = fallbackToastCopy(from, chosen)
      toast.message(copy.title, {
        description: copy.description,
        duration: 6000,
      })
    }
  }, [activeEngine, dgEngine, wsEngine, preferredEngine])

  // v0.5.49 — Mirror the live activeEngine name into the store so the
  // LiveTranscription card can show "Auto · Deepgram" / "Auto · Whisper"
  // / "Auto · Browser" badges. Cheap one-liner effect; the store
  // selector below is a no-op when the value is unchanged.
  useEffect(() => {
    setActiveEngineNameInStore(activeEngine)
  }, [activeEngine, setActiveEngineNameInStore])

  // v0.5.49 — React to a mid-session `preferredEngine` change. If the
  // operator switches from "Auto" to "Whisper" while the mic is hot, we
  // tear down the current engine (which may be Deepgram), swap activeEngine
  // to the chosen one, and restart the new engine with the same callback.
  // Switching TO "Auto" simply re-enables the fallback chain — we don't
  // forcibly hop back to Deepgram, the operator's current engine keeps
  // running until it errors structurally.
  const lastPreferredRef = useRef(preferredEngine)
  useEffect(() => {
    if (lastPreferredRef.current === preferredEngine) return
    lastPreferredRef.current = preferredEngine
    if (preferredEngine === 'auto') return // no forced swap

    const target: EngineName = preferredEngine
    if (activeEngine === target) return // already on it

    const fromHandle =
      activeEngine === 'deepgram' ? dgEngine : wsEngine
    const wasListening = fromHandle.isListening
    try { fromHandle.stopListening() } catch { /* ignore */ }

    setActiveEngine(target)
    fallbackStepsRef.current = 0
    sawTranscriptRef.current = false
    announcedHandoffsRef.current = new Set()

    if (wasListening) {
      const cb = lastCallbackRef.current
      const nextHandle = target === 'deepgram' ? dgEngine : wsEngine
      // v0.5.49 — race-safe via scheduleEngineStart (gen token +
      // cancellable timer). Rapid picker toggles supersede each other.
      scheduleEngineStart(target, nextHandle, cb, 'preferredEngine-swap')
    }
  }, [preferredEngine, activeEngine, dgEngine, wsEngine])

  useEffect(() => {
    setSpeechError(hookError)
    if (hookError && typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.error('[SpeechProvider] hookError (engine =', activeEngine, '):', hookError)
    }
  }, [hookError, setSpeechError, activeEngine])

  useEffect(() => {
    setIsListening(hookListening)
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log('[SpeechProvider] isListening ->', hookListening)
    }
  }, [hookListening, setIsListening])

  // ── Verse detection processing ─────────────────────────────────────
  // Map of refKey -> timestamp(ms) of last fire. The v2 reference
  // engine consults this with a 30 s TTL so a passage spoken twice in
  // the same service still re-detects the second time (architect-flag
  // fix in v0.5.52). Legacy callers below treat presence as a session
  // suppression and don't read the timestamp — they only check `.has`.
  const processedRefsRef = useRef<Map<string, number>>(new Map())
  const REF_DEDUPE_TTL_MS = 30_000

  // Use a ref-based callback so the hook always calls the latest version
  const processCallbackRef = useRef<(text: string, confidence: number) => Promise<void>>(async () => {})

  // Track the spoken-text searches we've already attempted so we don't spam
  // the search API every couple of words as the transcript grows.
  const lastTextSearchAtRef = useRef<number>(0)
  const processedTextHitsRef = useRef<Set<string>>(new Set())

  // v0.5.52 — Voice command dedup. Holds the LAST command signature
  // we executed and when. Re-issuing the same command within 4 s is
  // ignored so a long transcript ending in the same trigger phrase
  // doesn't fire repeatedly.
  const lastVoiceCmdRef = useRef<{ sig: string; at: number }>({ sig: '', at: 0 })

  // v0.5.52 — Speaker-Follow suspension cursor. When a voice command
  // OR a new Bible reference is processed we set this to `now + 2000`
  // so the speaker-follow effect ignores transcript changes for 2 s
  // (otherwise the just-spoken command words would briefly score
  // higher than the verse text and yank the highlight away).
  const speakerFollowSuspendedUntilRef = useRef<number>(0)

  // v0.7.4 — Speaker-Follow anti-rewind: timestamp of the last
  // FORWARD highlight switch. pickBestVerse reads this to suppress
  // backward jumps inside `antiRewindMs` (default 1500 ms) so the
  // highlight doesn't yank back to a previous verse on a single noisy
  // transcript chunk.
  const lastSpeakerSwitchAtRef = useRef<number>(0)

  /**
   * Dispatch a recognised voice command against the Zustand store.
   * Pure side-effect helper — no UI feedback (the caller emits the
   * sonner toast). Reads the LATEST store on every call so it picks
   * up newly-loaded slides / changed `liveSlideIndex` etc.
   */
  const dispatchVoiceCommand = useCallback(async (cmd: VoiceCommand) => {
    const s = useAppStore.getState()
    const slides = s.slides
    const liveIdx = s.liveSlideIndex
    switch (cmd.kind) {
      case 'next_verse': {
        // Advance the live verse highlight in the current passage if
        // we have one; otherwise advance the live slide cursor.
        const slide = liveIdx >= 0 ? slides[liveIdx] : null
        if (slide && slide.type === 'verse' && (slide.content?.length ?? 0) > 1) {
          const nextV = Math.min((slide.content?.length ?? 1) - 1, s.liveActiveVerseIndex + 1)
          s.setLiveActiveVerseIndex(nextV)
        } else if (slides.length) {
          const nextI = Math.min(slides.length - 1, Math.max(0, liveIdx + 1))
          s.setPreviewSlideIndex(nextI)
          s.setLiveSlideIndex(nextI)
          s.setLiveActiveVerseIndex(0)
        }
        break
      }
      case 'previous_verse': {
        const slide = liveIdx >= 0 ? slides[liveIdx] : null
        if (slide && slide.type === 'verse' && (slide.content?.length ?? 0) > 1) {
          const prevV = Math.max(0, s.liveActiveVerseIndex - 1)
          s.setLiveActiveVerseIndex(prevV)
        } else if (slides.length) {
          const prevI = Math.max(0, liveIdx - 1)
          s.setPreviewSlideIndex(prevI)
          s.setLiveSlideIndex(prevI)
          s.setLiveActiveVerseIndex(0)
        }
        break
      }
      case 'go_to_reference': {
        if (!cmd.reference) break
        const r = cmd.reference
        const refKey = `${r.book} ${r.chapter}:${r.verseStart}${
          r.verseEnd && r.verseEnd !== r.verseStart ? `-${r.verseEnd}` : ''
        }`
        let textOut: string | null = null
        const tx = s.selectedTranslation
        const vEnd = r.verseEnd ?? r.verseStart
        if (vEnd > r.verseStart) {
          const rr = lookupRange(r.book, r.chapter, r.verseStart, vEnd, tx)
          if (rr) textOut = rr.text
        } else {
          const v = lookupVerse(r.book, r.chapter, r.verseStart, tx)
          if (v) textOut = v
        }
        if (!textOut) {
          try {
            const v = await fetchBibleVerse(refKey, tx)
            if (v) textOut = v.text
          } catch { /* ignore */ }
        }
        if (textOut) {
          const slide = {
            id: `slide-${Date.now()}`,
            type: 'verse' as const,
            title: refKey,
            subtitle: tx,
            content: textOut.split('\n').filter(Boolean),
            background: s.settings.congregationScreenTheme,
          }
          const cur = useAppStore.getState().slides
          const next = cur.length > 0 ? [...cur, slide] : [slide]
          const idx = next.length - 1
          useAppStore.getState().setSlides(next)
          useAppStore.getState().setPreviewSlideIndex(idx)
          useAppStore.getState().setLiveSlideIndex(idx)
          useAppStore.getState().setIsLive(true)
          useAppStore.getState().setLiveActiveVerseIndex(0)
        }
        break
      }
      case 'scroll_up': {
        s.setLiveActiveVerseIndex(Math.max(0, s.liveActiveVerseIndex - 1))
        break
      }
      case 'scroll_down': {
        const slide = liveIdx >= 0 ? slides[liveIdx] : null
        const max = slide?.content?.length ? slide.content.length - 1 : 0
        s.setLiveActiveVerseIndex(Math.min(max, s.liveActiveVerseIndex + 1))
        break
      }
      // ── v0.7.4 — chapter navigation ───────────────────────────────
      // "next chapter" / "previous chapter" jumps the live output to
      // chapter ±1 of whatever book is currently live. Reads the live
      // slide title (e.g. "John 3:16") to recover book + chapter,
      // validates against bibleStructure (so "Revelation 22" + next
      // doesn't try to load chapter 23), and loads the WHOLE next
      // chapter so the operator can use auto-scroll / speaker-follow
      // to walk through it. Fails gracefully with a toast if there's
      // no live verse-passage to anchor against.
      case 'next_chapter':
      case 'previous_chapter': {
        const slide = liveIdx >= 0 ? slides[liveIdx] : null
        if (!slide || slide.type !== 'verse' || !slide.title) {
          toast.error('Chapter navigation needs a live Bible passage', { duration: 2000, position: 'bottom-right' })
          break
        }
        const ref = parseExplicitReference(slide.title)
        if (!ref) {
          toast.error(`Cannot parse current passage: ${slide.title}`, { duration: 2000, position: 'bottom-right' })
          break
        }
        const dir = cmd.kind === 'next_chapter' ? 1 : -1
        const targetChapter = ref.chapter + dir
        const struct = (bibleStructure as unknown as Record<string, number[]>)[ref.book]
        if (!struct || targetChapter < 1 || targetChapter > struct.length) {
          toast.error(
            `${ref.book} has no ${cmd.kind === 'next_chapter' ? 'chapter ' + targetChapter : 'previous chapter'}`,
            { duration: 2000, position: 'bottom-right' },
          )
          break
        }
        const verseCount = struct[targetChapter - 1] ?? 1
        const tx = s.selectedTranslation
        const refKey = `${ref.book} ${targetChapter}:1${verseCount > 1 ? `-${verseCount}` : ''}`
        let textOut: string | null = null
        const r = lookupRange(ref.book, targetChapter, 1, verseCount, tx)
        if (r) textOut = r.text
        if (!textOut && !isTranslationBundled(tx)) {
          try {
            const v = await fetchBibleVerse(refKey, tx)
            if (v) textOut = v.text
          } catch { /* fall through */ }
        }
        if (!textOut) {
          toast.error(`Could not load ${refKey}`, { duration: 2000, position: 'bottom-right' })
          break
        }
        const slideNew = {
          id: `slide-${Date.now()}`,
          type: 'verse' as const,
          title: refKey,
          subtitle: tx,
          content: textOut.split('\n').filter(Boolean),
          background: s.settings.congregationScreenTheme,
        }
        const cur = useAppStore.getState().slides
        const next = cur.length > 0 ? [...cur, slideNew] : [slideNew]
        const idx = next.length - 1
        useAppStore.getState().setSlides(next)
        useAppStore.getState().setPreviewSlideIndex(idx)
        useAppStore.getState().setLiveSlideIndex(idx)
        useAppStore.getState().setIsLive(true)
        useAppStore.getState().setLiveActiveVerseIndex(0)
        break
      }
      // ── v0.7.4 — "the bible says <ref>" → STANDBY only ────────────
      // Same lookup as go_to_reference but routes the loaded passage
      // to the operator's PREVIEW slot only — never to Live, even
      // when Auto Go-Live is on. Lets a preacher cue up a verse
      // mid-sermon without hijacking the screen ("the bible says
      // John three sixteen…" → John 3:16 sits in preview, operator
      // hits Enter to push it live when ready).
      case 'bible_says': {
        if (!cmd.reference) break
        const r = cmd.reference
        const refKey = `${r.book} ${r.chapter}:${r.verseStart}${
          r.verseEnd && r.verseEnd !== r.verseStart ? `-${r.verseEnd}` : ''
        }`
        let textOut: string | null = null
        const tx = s.selectedTranslation
        const vEnd = r.verseEnd ?? r.verseStart
        if (vEnd > r.verseStart) {
          const rr = lookupRange(r.book, r.chapter, r.verseStart, vEnd, tx)
          if (rr) textOut = rr.text
        } else {
          const v = lookupVerse(r.book, r.chapter, r.verseStart, tx)
          if (v) textOut = v
        }
        if (!textOut) {
          try {
            const v = await fetchBibleVerse(refKey, tx)
            if (v) textOut = v.text
          } catch { /* ignore */ }
        }
        if (!textOut) {
          toast.error(`Could not load ${refKey}`, { duration: 2000, position: 'bottom-right' })
          break
        }
        const slide = {
          id: `slide-${Date.now()}`,
          type: 'verse' as const,
          title: refKey,
          subtitle: tx,
          content: textOut.split('\n').filter(Boolean),
          background: s.settings.congregationScreenTheme,
        }
        const cur = useAppStore.getState().slides
        const next = cur.length > 0 ? [...cur, slide] : [slide]
        const idx = next.length - 1
        useAppStore.getState().setSlides(next)
        useAppStore.getState().setPreviewSlideIndex(idx)
        // Intentional: do NOT setLiveSlideIndex / setIsLive here.
        // Standby = preview slot only. Operator confirms with Enter
        // or the Go Live button.
        break
      }
      case 'autoscroll_start': s.setAutoScrollEnabled(true); break
      case 'autoscroll_pause': s.setAutoScrollEnabled(false); break
      case 'autoscroll_stop': {
        s.setAutoScrollEnabled(false)
        s.setLiveActiveVerseIndex(0)
        break
      }
      case 'clear_screen':
      case 'blank_screen': {
        // Cut to black on the live output without dropping the slide
        // cue — operators expect un-blank to bring the same passage
        // back instantly.
        s.setLiveSlideIndex(-1)
        break
      }
    }
  }, [])

  // ── Spoken-passage verification ─────────────────────────────────────
  // Returns 0..1 reflecting how much of the matched verse's content
  // words appear in the recently spoken transcript. Used to decide
  // whether a text-search hit is accurate enough to push live on its
  // own. Genesis 1:1 — "In the beginning God created the heaven and the
  // earth" — when the speaker says "In the beginning God created
  // heaven and earth" produces ~0.86. A passing-keyword false match
  // typically scores ≤0.35.
  const verseTextSimilarity = (spoken: string, verse: string): number => {
    const STOP = new Set([
      'the','a','an','of','and','or','to','in','for','on','at','is','was','were','be',
      'by','that','this','it','as','with','from','but','so','if','then','than',
      'i','you','he','she','they','we','my','your','our','their','his','her','its',
      'shall','will','have','has','had','am','are','do','did','done',
    ])
    // Bug #1B — when whisper drops letters mid-word ("Chri t" for
    // "Christ", "Je u" for "Jesus") the bigrams become meaningless
    // tokens that previously failed every comparison. We accept both
    // tokens of length ≥ 2 here AND credit prefix / Levenshtein-1
    // matches against verse words below so garbled chunks still snap.
    const tokenize = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9\s']/g, ' ').split(/\s+/)
        .filter((w) => w.length >= 2 && !STOP.has(w))
    const verseWords = tokenize(verse)
    if (!verseWords.length) return 0
    const spokenTokens = tokenize(spoken)
    const spokenSet = new Set(spokenTokens)

    // Helper — Levenshtein distance, capped at 2 (cheaper for our
    // single-edit fuzzy match: a deletion / substitution / insertion).
    const lev2 = (a: string, b: string): number => {
      if (a === b) return 0
      const la = a.length, lb = b.length
      if (Math.abs(la - lb) > 2) return 3
      // Two-row DP
      let prev = new Array(lb + 1)
      let curr = new Array(lb + 1)
      for (let j = 0; j <= lb; j++) prev[j] = j
      for (let i = 1; i <= la; i++) {
        curr[0] = i
        let rowMin = curr[0]
        for (let j = 1; j <= lb; j++) {
          const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1
          curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
          if (curr[j] < rowMin) rowMin = curr[j]
        }
        if (rowMin > 2) return 3
        ;[prev, curr] = [curr, prev]
      }
      return prev[lb]
    }

    let hit = 0
    for (const vw of verseWords) {
      if (spokenSet.has(vw)) { hit++; continue }
      // Prefix match — "chri" ⇒ "christ" (≥ 3 chars to avoid noise).
      let matched = false
      for (const sp of spokenTokens) {
        if (sp.length >= 3 && vw.length >= sp.length + 1 && vw.startsWith(sp)) {
          matched = true
          break
        }
        // Levenshtein-1 match for words ≥ 4 chars on both sides ("sin"
        // vs "in" is too weak, but "salvation" vs "salavation" wins).
        if (sp.length >= 4 && vw.length >= 4 && lev2(sp, vw) <= 1) {
          matched = true
          break
        }
      }
      // Architect feedback — partial-credit weight tightened from
      // 0.85 to 0.6 to keep false-positive pressure low at the
      // 0.4 / 0.32 commit thresholds. Real quotations still cross
      // easily because they pile up many partial AND exact matches;
      // a passing keyword collision rarely accumulates enough.
      if (matched) hit += 0.6
    }
    return Math.min(1, hit / verseWords.length)
  }

  // Update the ref in an effect (not during render) to satisfy ESLint react-hooks/refs
  useEffect(() => {
    processCallbackRef.current = async (text: string, confidence: number) => {
      if (!text.trim()) return

      const state = useAppStore.getState()
      // v0.7.4 — Confidence-tier gate. Three bands:
      //   • confidence < drop  → drop entirely (no detection, no
      //     command pre-pass). The chunk still appears in the
      //     operator's transcript via the hook's internal append —
      //     that's intentional for diagnostics; only the auto-fire
      //     pipeline is suppressed.
      //   • [drop, live)       → preview tier: same — visible in
      //     transcript, NOT processed for commands or references.
      //   • >= live            → full pipeline as before.
      // Defaults: drop 0.30 / live 0.70. Operator-tunable in Settings.
      const dropT = state.settings.transcriptDropThreshold ?? 0.30
      const liveT = state.settings.transcriptLiveThreshold ?? 0.70
      if (confidence < liveT) {
        // Both DROP and PREVIEW tiers terminate here. The hook has
        // already appended the chunk to its internal transcript ref;
        // we deliberately leave it visible to the operator (helps
        // them notice when the mic is being mis-heard) but skip all
        // command + reference processing. _dropT is read so future
        // diagnostics or visual styling can use it without churn.
        void dropT
        state.setDetectionStatus('idle')
        return
      }
      state.setDetectionStatus('processing')

      // ── v0.5.52 — Voice Command pre-pass (commands.ts) ─────────────
      // Runs BEFORE Bible detection. When a leading-position command
      // matches with confidence ≥80, we dispatch + suppress all
      // downstream processing on this transcript so a sentence like
      // "next verse" never accidentally triggers a "verse" detection.
      if (state.voiceControlEnabled) {
        const tail = text.trim().slice(-200) // command must be near the end
        const cmd = detectCommand(tail)
        if (cmd && cmd.confidence >= 80) {
          // Dedup: ignore the same command if we already executed it
          // with the same parameter signature in the last 4 s.
          const refSig = cmd.reference
            ? `${cmd.reference.book}|${cmd.reference.chapter}|${cmd.reference.verseStart}|${cmd.reference.verseEnd ?? ''}`
            : ''
          const sig = `${cmd.kind}|${refSig}`
          const now = Date.now()
          if (lastVoiceCmdRef.current.sig !== sig || now - lastVoiceCmdRef.current.at > 4000) {
            lastVoiceCmdRef.current = { sig, at: now }
            speakerFollowSuspendedUntilRef.current = Date.now() + 2000
            await dispatchVoiceCommand(cmd)
            state.setDetectionStatus('detected')
            toast.message(cmd.label, { duration: 1500, position: 'bottom-right' })
            // Suppress the rest of the pipeline for this transcript.
            return
          }
        }
      }

      // ── v0.5.52 — Reference Engine v2 (reference-engine.ts) ────────
      // Higher precision than the legacy detector + uses the bundled
      // local-bible.ts JSON for instant lookup. Falls back to the
      // legacy path only when the new engine returns no high-conf
      // match, so spoken phrases the legacy detector already handles
      // (text-search of recent quotations) still work.
      const v2Tail = text.trim().split(/\s+/).slice(-30).join(' ')
      const v2 = detectBestReference(v2Tail)
      if (v2 && v2.confidence >= 80) {
        const refKey = `${v2.book} ${v2.chapter}:${v2.verseStart}${
          v2.verseEnd && v2.verseEnd !== v2.verseStart ? `-${v2.verseEnd}` : ''
        }`
        const dedupKey = `v2:${refKey}`
        const now = Date.now()
        const lastAt = processedRefsRef.current.get(dedupKey) ?? 0
        if (now - lastAt >= REF_DEDUPE_TTL_MS) {
          // Prune stale entries opportunistically so the map doesn't grow
          // unbounded across a long service.
          for (const [k, ts] of processedRefsRef.current) {
            if (now - ts >= REF_DEDUPE_TTL_MS) processedRefsRef.current.delete(k)
          }
          processedRefsRef.current.set(dedupKey, now)
          const tx = state.selectedTranslation
          const vEnd = v2.verseEnd ?? v2.verseStart
          // Try the bundled JSON first (instant). If the operator's
          // selected translation isn't bundled, we fall through to
          // fetchBibleVerse (which routes to bolls.life / bible-api).
          let textOut: string | null = null
          if (vEnd > v2.verseStart) {
            const r = lookupRange(v2.book, v2.chapter, v2.verseStart, vEnd, tx)
            if (r) textOut = r.text
          } else {
            const r = lookupVerse(v2.book, v2.chapter, v2.verseStart, tx)
            if (r) textOut = r
          }
          if (!textOut && !isTranslationBundled(tx)) {
            try {
              const v = await fetchBibleVerse(refKey, tx)
              if (v) textOut = v.text
            } catch { /* fall through */ }
          }
          if (textOut) {
            const detected: DetectedVerse = {
              id: `det-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              reference: refKey,
              text: textOut,
              translation: tx,
              detectedAt: new Date(),
              confidence: v2.confidence / 100,
            }
            const tBefore = useAppStore.getState().liveTranscript
            useAppStore.getState().pushTranscriptBreak(tBefore.length)
            useAppStore.getState().addDetectedVerse(detected)
            useAppStore.getState().addToVerseHistory({
              reference: refKey,
              text: textOut,
              translation: tx,
              book: v2.book,
              chapter: v2.chapter,
              verseStart: v2.verseStart,
              verseEnd: v2.verseEnd ?? undefined,
            })
            state.setDetectionStatus('detected')
            // Reset speaker-follow / auto-scroll cursor on new passage.
            useAppStore.getState().setLiveActiveVerseIndex(0)
            const autoLiveOn2 = state.autoLive || state.settings.autoGoLiveOnDetection
            // v0.7.4 — Auto-go-live threshold lowered 90 → 70 to
            // align with the new transcriptLiveThreshold tier.
            // The transcript chunk that produced this v2 detection
            // already passed the 0.70 confidence gate above, and v2
            // adds its own ≥80 detection floor; the prior 90 cutoff
            // was an artifact of pre-tier days when low-confidence
            // chunks reached this code path. 70 matches the operator
            // spec ("≥70% live").
            if (autoLiveOn2 && v2.confidence >= 70) {
              const slide = {
                id: `slide-${Date.now()}`,
                type: 'verse' as const,
                title: refKey,
                subtitle: tx,
                content: textOut.split('\n').filter(Boolean),
                background: state.settings.congregationScreenTheme,
              }
              const cur = useAppStore.getState().slides
              const next = cur.length > 0 ? [...cur, slide] : [slide]
              const idx = next.length - 1
              useAppStore.getState().setSlides(next)
              useAppStore.getState().setPreviewSlideIndex(idx)
              useAppStore.getState().setLiveSlideIndex(idx)
              useAppStore.getState().setIsLive(true)
            }
            return
          }
        }
      }

      const detectedRefs = detectVersesInTextWithScore(text)
      const references = detectedRefs.map((r) => r.reference)
      const autoLiveOn = state.autoLive || state.settings.autoGoLiveOnDetection
      const threshold = state.autoLiveThreshold ?? 0.9

      // ── Voice text detection ─────────────────────────────────────────
      // When the speaker quotes a passage (e.g. "In the beginning God
      // created…") with no explicit reference, search the Bible by text.
      // Throttled: at most one search every ~2.5s and only on chunks of 6+
      // words. We use the *tail* of the running transcript (last ~14 words)
      // to favour the most recent spoken phrase.
      // Strip filler words and use only distinctive content words to give the
      // search engine a high-signal query (it does keyword-match, not phrase
      // match, so a too-long phrase often returns no hits).
      const STOPWORDS = new Set(['the','a','an','of','and','or','to','in','for','on','at','is','was','were','be','by','that','this','it','as','with','from','but','so','if','then','than','i','you','he','she','they','we','my','your','our','their','his','her','its','what','when','where','how','why'])
      const allWords = text.trim().toLowerCase().split(/\s+/)
      // Use a longer tail when a preacher attribution is present —
      // the actual quotation usually starts AFTER phrases like
      // "Jesus said" / "Paul tells us in Romans" / "the Word of God
      // tells us", so we need enough downstream words to match it.
      const recentText = allWords.slice(-40).join(' ')
      const hasAttribution = PREACHER_ATTRIBUTION.test(recentText)
      const tailWords = allWords.slice(hasAttribution ? -22 : -14)
      const keywords = tailWords
        .filter((w) => !STOPWORDS.has(w) && w.length > 2)
        .slice(hasAttribution ? -10 : -6)
      const tail = keywords.join(' ')
      const now = Date.now()
      // Lower the trigger bar when an attribution phrase is detected
      // — the preacher has clearly signalled scripture is coming, so
      // we should search even with a short tail. Throttle is also
      // tighter so the match lands during the same breath.
      const minKeywords = hasAttribution ? 2 : 3
      const minWords = hasAttribution ? 3 : 4
      const throttle = hasAttribution ? 500 : 800
      if (
        allWords.length >= minWords &&
        keywords.length >= minKeywords &&
        now - lastTextSearchAtRef.current > throttle
      ) {
        lastTextSearchAtRef.current = now
        try {
          const params = new URLSearchParams({ search: tail, translation: state.selectedTranslation })
          const r = await fetch(`/api/bible?${params.toString()}`)
          if (r.ok) {
            const { hits } = (await r.json()) as { hits: BibleSearchHit[] }
            const recentSpoken = recentText
            type Ranked = { hit: BibleSearchHit; sim: number }
            const ranked: Ranked[] = (hits || [])
              .map((h) => ({ hit: h, sim: verseTextSimilarity(recentSpoken, h.text) }))
              .sort((a, b) => b.sim - a.sim)
            const best = ranked[0]
            const top = best?.hit
            const sim = best?.sim ?? 0
            const willHandleBelow = top
              ? references.includes(top.reference) ||
                processedRefsRef.current.has(top.reference)
              : false
            if (top && !willHandleBelow && !processedTextHitsRef.current.has(top.reference)) {
              const minSim = hasAttribution ? 0.32 : 0.4
              if (sim < minSim) {
                /* not a real quotation — drop silently */
              } else {
                processedTextHitsRef.current = new Set(processedTextHitsRef.current).add(top.reference)
                const baseConf = Math.min(1, 0.5 + (sim - minSim) * 0.83)
                const confidence = hasAttribution ? Math.min(1, baseConf + 0.08) : baseConf
                const detected: DetectedVerse = {
                  id: `det-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                  reference: top.reference,
                  text: top.text,
                  translation: top.translation,
                  detectedAt: new Date(),
                  confidence,
                }
                const tBefore = useAppStore.getState().liveTranscript
                useAppStore.getState().pushTranscriptBreak(tBefore.length)
                useAppStore.getState().addDetectedVerse(detected)
                useAppStore.getState().addToVerseHistory({
                  reference: top.reference,
                  text: top.text,
                  translation: top.translation,
                  book: top.book,
                  chapter: top.chapter,
                  verseStart: top.verse,
                })
                if (autoLiveOn && sim >= 0.85) {
                  const slide = {
                    id: `slide-${Date.now()}`,
                    type: 'verse' as const,
                    title: top.reference,
                    subtitle: top.translation,
                    content: top.text.split('\n').filter(Boolean),
                    background: state.settings.congregationScreenTheme,
                  }
                  const cur = useAppStore.getState().slides
                  const next = cur.length > 0 ? [...cur, slide] : [slide]
                  const idx = next.length - 1
                  useAppStore.getState().setSlides(next)
                  useAppStore.getState().setPreviewSlideIndex(idx)
                  useAppStore.getState().setLiveSlideIndex(idx)
                  useAppStore.getState().setIsLive(true)
                }
              }
            }
          }
        } catch {
          /* ignore search failures */
        }
      }

      for (const detectedRef of detectedRefs) {
        const ref = detectedRef.reference
        if (processedRefsRef.current.has(ref) || processedTextHitsRef.current.has(ref)) continue
        processedRefsRef.current.set(ref, Date.now())

        try {
          const verse = await fetchBibleVerse(ref, state.selectedTranslation)
          if (verse) {
            const t = useAppStore.getState().liveTranscript
            useAppStore.getState().pushTranscriptBreak(t.length)
            const detected: DetectedVerse = {
              id: `det-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              reference: ref,
              text: verse.text,
              translation: state.selectedTranslation,
              detectedAt: new Date(),
              confidence: detectedRef.confidence,
            }

            useAppStore.getState().addDetectedVerse(detected)
            useAppStore.getState().setLiveVerse(verse)
            useAppStore.getState().addToVerseHistory(verse)

            const latestState = useAppStore.getState()
            const passesThreshold =
              detectedRef.confidence >= threshold && detectedRef.hasExplicitVerse
            if (autoLiveOn && passesThreshold) {
              const slide = {
                id: `slide-${Date.now()}`,
                type: 'verse' as const,
                title: detected.reference,
                subtitle: detected.translation,
                content: detected.text.split('\n').filter(Boolean),
                background: latestState.settings.congregationScreenTheme,
              }
              const currentSlides = latestState.slides.length > 0
                ? [...latestState.slides, slide]
                : [slide]
              const newLiveIndex = currentSlides.length - 1
              useAppStore.getState().setSlides(currentSlides)
              useAppStore.getState().setPreviewSlideIndex(newLiveIndex)
              useAppStore.getState().setLiveSlideIndex(newLiveIndex)
              useAppStore.getState().setIsLive(true)
            }
          }
        } catch {
          // Silently ignore fetch errors for unrecognized references
        }
      }
    }
  })

  // Stable wrapper that delegates to the latest processCallbackRef
  // v0.7.4 — now forwards the per-chunk confidence (0..1) so the
  // tier gate inside processCallbackRef can run.
  const stableProcessCallback = useCallback((text: string, confidence: number) => {
    processCallbackRef.current(text, confidence)
  }, [])

  // Keep the global mic-id mirror in sync so the Deepgram engine can
  // see it (it's hookless and reads window.__selectedMicrophoneId).
  const selectedMicId = useAppStore((s) => s.selectedMicrophoneId)
  useEffect(() => {
    if (typeof window === 'undefined') return
    ;(window as unknown as { __selectedMicrophoneId?: string | null }).__selectedMicrophoneId = selectedMicId
  }, [selectedMicId])

  // ── Handle speech commands from store (start / stop / reset) ───────
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log('[SpeechProvider] command:', speechCommand)
    }
    if (speechCommand === 'start') {
      processedRefsRef.current = new Map()
      // v0.5.44 — track WHEN we started so the auto-fallback effect
      // can scope its 8 s WS-failure window, and remember the
      // callback so the fallback path can re-arm it on the browser
      // engine without losing transcript routing.
      lastCallbackRef.current = stableProcessCallback
      startedAtRef.current = Date.now()
      sawTranscriptRef.current = false
      // eslint-disable-next-line no-console
      console.log('[SpeechProvider] -> startListening() on engine =', activeEngine)
      startListening(stableProcessCallback)
      setSpeechCommand(null)
    } else if (speechCommand === 'stop') {
      // eslint-disable-next-line no-console
      console.log('[SpeechProvider] -> stopListening()')
      stopListening()
      setSpeechCommand(null)
    } else if (speechCommand === 'reset') {
      // eslint-disable-next-line no-console
      console.log('[SpeechProvider] -> resetTranscript()')
      resetTranscript()
      setLiveTranscript('')
      setLiveInterimTranscript('')
      useAppStore.getState().clearTranscriptBreaks()
      processedRefsRef.current = new Map()
      setSpeechCommand(null)
    }
  }, [
    speechCommand,
    startListening,
    stopListening,
    resetTranscript,
    stableProcessCallback,
    setSpeechCommand,
    setLiveTranscript,
    setLiveInterimTranscript,
  ])

  // ── v0.5.57 — License lockdown tear-down ───────────────────────────
  // Watch the licenseLocked mirror written by <LicenseProvider>. The
  // moment it flips to true (trial just expired, never_activated on
  // first launch, expired subscription), forcibly stop BOTH engines,
  // clear interim/final transcripts, drop any pending speechCommand,
  // and zero the listening flag so every consumer (mic indicator,
  // logos-shell action buttons, scripture-detection card) sees the
  // mic as off within the same render.
  //
  // We cannot rely on the lock-overlay's disabled buttons alone — if
  // the operator was already mid-session when the trial timer hit
  // zero, the mic + WS to Deepgram are still hot until something
  // calls stopListening(). This effect is that something.
  //
  // We stop BOTH engines (not just the active one) because a fallback
  // chain step could leave one engine teardown half-done while the
  // new engine is still spinning up — defensive teardown avoids a
  // race where the OS mic indicator stays on for a few seconds.
  useEffect(() => {
    if (!licenseLocked) return
    // eslint-disable-next-line no-console
    console.warn('[SpeechProvider] licenseLocked=true — tearing down all engines')
    try { dgEngine.stopListening() } catch { /* ignore */ }
    try { wsEngine.stopListening() } catch { /* ignore */ }
    // Wipe BOTH the engine's internal hook buffer (resetTranscript) AND
    // the store mirror, plus any verse-break markers, so a re-activation
    // mid-session can't ghost the pre-lock transcript back in via the
    // hook -> setLiveTranscript bridging effect at line 257.
    try { resetTranscript() } catch { /* ignore */ }
    setLiveTranscript('')
    setLiveInterimTranscript('')
    try { useAppStore.getState().clearTranscriptBreaks() } catch { /* ignore */ }
    setIsListening(false)
    setSpeechCommand(null)
  }, [licenseLocked, dgEngine, wsEngine, resetTranscript, setLiveTranscript, setLiveInterimTranscript, setIsListening, setSpeechCommand])

  // ── v0.5.52 — Speaker-Follow effect ────────────────────────────────
  // Watches the running transcript whenever a multi-verse passage is
  // live + Speaker-Follow is on, scores each verse against the last
  // ~8 s of speech, and (when the lead is decisive) advances the
  // highlighted verse via setLiveActiveVerseIndex. Pure consumer of
  // pickBestVerse — no side effects beyond the store mutation.
  const speakerFollowEnabled = useAppStore((s) => s.speakerFollowEnabled)
  const liveSlideIndexSF = useAppStore((s) => s.liveSlideIndex)
  const slidesSF = useAppStore((s) => s.slides)
  const liveActiveVerseIndexSF = useAppStore((s) => s.liveActiveVerseIndex)
  const setLiveActiveVerseIndexSF = useAppStore((s) => s.setLiveActiveVerseIndex)
  useEffect(() => {
    if (!speakerFollowEnabled) return
    if (Date.now() < speakerFollowSuspendedUntilRef.current) return
    if (liveSlideIndexSF < 0) return
    const slide = slidesSF[liveSlideIndexSF]
    if (!slide || slide.type !== 'verse') return
    const content = slide.content ?? []
    if (content.length < 2) return
    // Last ~8 s of speech ≈ ~24 words. Take the tail of the running
    // transcript (final + interim) — this matches the design spec's
    // 8-second window without requiring a per-segment ring buffer.
    const tail = `${hookTranscript ?? ''} ${hookInterim ?? ''}`
      .trim()
      .split(/\s+/)
      .slice(-30)
      .join(' ')
    if (!tail) return
    const verses: VerseLine[] = content.map((text, index) => ({ index, text }))
    const result = pickBestVerse(tail, verses, {
      currentIndex: liveActiveVerseIndexSF,
      switchThreshold: 0.20,
      // v0.7.4 — rely on speaker-follow.ts defaults (minDelta 0.08,
      // antiRewindMs 1500). Pass the last-switch timestamp so the
      // anti-rewind guard can suppress backward flips on a single
      // noisy chunk.
      lastSwitchAt: lastSpeakerSwitchAtRef.current,
    })
    if (result.shouldSwitch && result.bestIndex != null && result.bestIndex !== liveActiveVerseIndexSF) {
      // Only stamp lastSwitchAt on FORWARD progress so the anti-rewind
      // window is anchored to the most recent advance.
      if (liveActiveVerseIndexSF === null || result.bestIndex > liveActiveVerseIndexSF) {
        lastSpeakerSwitchAtRef.current = Date.now()
      }
      setLiveActiveVerseIndexSF(result.bestIndex)
    }
  }, [
    speakerFollowEnabled,
    hookTranscript,
    hookInterim,
    liveSlideIndexSF,
    slidesSF,
    liveActiveVerseIndexSF,
    setLiveActiveVerseIndexSF,
  ])

  return <>{children}</>
}
