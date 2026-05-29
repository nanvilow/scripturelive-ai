'use client'

import { useEffect, useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { bootstrapRuntimeKeys } from '@/lib/runtime-keys'
import { detectBestReference, parseExplicitReference } from '@/lib/bibles/reference-engine'
import {
  pushWords,
  bufferText,
  detectionText,
  type RollingWord,
} from '@/lib/transcript-rolling-buffer'
import { decideReferenceFire } from '@/lib/reference-fire-policy'
import { lookupRange, lookupVerse, isTranslationBundled } from '@/lib/bibles/local-bible'
// v0.7.65 — Curated preacher-phrase dictionary (~190 unaddressed
// quotations like "the heavens declare the glory of God" or
// "trouble don't last always"). Runs strictly local, no network.
import { detectBestPreacherPhrase } from '@/lib/bibles/preacher-phrases'
// v0.7.4 — chapter metadata for "next chapter" / "previous chapter"
// voice commands. Same JSON the reference engine uses for validation.
import bibleStructure from '@/data/bible-structure.json'
import { detectCommand, detectCommandChain, type VoiceCommand } from '@/lib/voice/commands'
// v0.7.241 — Local sub-millisecond n-gram paraphrase matcher. Wired
// here so a 2-4 word distinctive paraphrase ("king couldn't sleep",
// "let there be light", "valley of the shadow") fires INSTANTLY,
// without the /api/bible keyword search or the OpenAI embedding
// roundtrip the cosine matcher needs. Shipped as a library in
// v0.7.239 + a standalone API route, but never invoked from the
// live voice pipeline — operator escalation "search should be fast
// even when speaker say any 4 words should know the verse fast" was
// the visible symptom of that gap.
import { matchTranscript as matchPhraseIndex, warmPhraseIndex } from '@/lib/ai/phrase-index'
// v0.7.29 — LLM-classifier command-likeness gate (Phase 2 of v0.8.0).
// Used as a CHEAP local pre-check before we POST to /api/voice/classify
// so most non-command transcripts skip the OpenAI roundtrip entirely.
import { isLikelyCommandUtterance } from '@/lib/voice/llm-gate'
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
    handle: { startListening: (cb?: (t: string, confidence: number, isFinal?: boolean) => void) => void },
    cb: ((text: string, confidence: number, isFinal?: boolean) => void) | null,
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

  // v0.7.241 — Warm the local n-gram phrase index ONCE on mount so
  // the ~30-50 ms cold-build cost (tokenise + n-gram all ~1300
  // catalogue entries) lands BEFORE the operator's first spoken
  // phrase, not in the critical path of the first transcript chunk.
  // Subsequent matchPhraseIndex() calls are sub-millisecond.
  useEffect(() => {
    try { warmPhraseIndex() } catch { /* defensive */ }
  }, [])

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
  const processCallbackRef = useRef<(text: string, confidence: number, isFinal?: boolean) => Promise<void>>(async () => {})

  // v0.7.263 — Rolling window of recent FINAL transcript words. Bridges
  // Bible references split across Deepgram segment boundaries — both the
  // "John" <pause> "3:7" two-finals case and a reference buried mid-
  // monologue whose book name + chapter:verse straddle a cut. Pure logic
  // lives in transcript-rolling-buffer.ts (unit-tested); this ref just
  // holds the persisted window.
  const recentWordsRef = useRef<RollingWord[]>([])
  // Throttle for the interim (non-final) explicit-only detection path so
  // a fast talker's continuous interim stream doesn't run the detector
  // every few ms. 150 ms is responsive (sub-quarter-second) yet cheap.
  const lastInterimDetectAtRef = useRef<number>(0)
  const INTERIM_DETECT_THROTTLE_MS = 150

  // Track the spoken-text searches we've already attempted so we don't spam
  // the search API every couple of words as the transcript grows.
  const lastTextSearchAtRef = useRef<number>(0)
  const processedTextHitsRef = useRef<Set<string>>(new Set())
  // v0.7.241 — Sub-ms local phrase-index throttle. Set to 200 ms (not
  // 800/1000 like the network paths) because phrase-index is pure
  // in-memory Map lookup — no API quota to protect, no latency to
  // amortize. The only purpose of this throttle is to avoid hammering
  // the index on rapid-fire interim chunks; processedTextHitsRef
  // dedupes per-reference, so a second chunk that returns the same
  // hit is a no-op anyway.
  const lastPhraseAtRef = useRef<number>(0)

  // v0.7.60 — Live AI semantic-match throttle + dedupe. The semantic
  // matcher costs one OpenAI embedding per call (~80–150 ms); we
  // gate it inside the same conditional block as the keyword search
  // so a quiet transcript doesn't burn quota, and we record each
  // accepted reference so a single paraphrase doesn't get re-pushed
  // on every subsequent chunk that still contains it. The pipeline
  // is what turns "in his time he make all things" into a live
  // suggestion of Ecclesiastes 3:11 — without it the regex matcher
  // would never recognise the paraphrase.
  const lastSemanticAtRef = useRef<number>(0)
  const processedSemanticHitsRef = useRef<Set<string>>(new Set())

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

  // v0.7.29 — Phase 2 of v0.8.0: LLM voice classifier opt-in flag.
  // We cache the value in a ref because the regex pre-pass below runs
  // dozens of times per minute on a busy mic and we don't want each
  // run to allocate a Zustand selector or hit the storage layer. The
  // useEffect below fetches /api/voice/classifier-status once on
  // mount; a stale "true" value is harmless (the /classify endpoint
  // also gates on the flag and returns `reason: 'disabled'`), and a
  // stale "false" requires the operator to reload the renderer after
  // toggling the flag on — acceptable for a beta feature.
  const llmClassifierEnabledRef = useRef(false)
  // Dedupe ref for LLM-fired commands. Same 4 s window the regex
  // path uses; LLM commands carry the `[AI]` toast prefix so they're
  // visually distinguishable from regex hits.
  const lastLlmCmdRef = useRef<{ sig: string; at: number }>({ sig: '', at: 0 })

  useEffect(() => {
    // Fire-and-forget. If the fetch fails (network, 404 during
    // dev-server boot, etc.) the ref stays false and the LLM
    // fallback never engages — same behaviour as the feature being
    // disabled, which is the safe default.
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/api/voice/classifier-status', { cache: 'no-store' })
        if (!r.ok) return
        const j = (await r.json()) as { ok?: boolean; enabled?: boolean; hasApiKey?: boolean }
        if (cancelled) return
        // Only enable when the operator opted in AND we know the
        // server can resolve an OpenAI key. With no key, every call
        // would 0-confidence anyway and burn the OpenAI roundtrip
        // budget for nothing.
        llmClassifierEnabledRef.current = j.ok === true && j.enabled === true && j.hasApiKey === true
        if (typeof window !== 'undefined' && llmClassifierEnabledRef.current) {
          // eslint-disable-next-line no-console
          console.log('[SpeechProvider] LLM voice classifier ENABLED (v0.7.29 Phase 2)')
        }
      } catch {
        /* see comment above — silent no-op */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

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
      // v0.7.22 — "next verse" / "previous verse" now actually steps
      // through scripture. Operator bug report on v0.7.21:
      // "When it's on John 3:3 and a voice command is given for the
      // next verse, it should move to John 3:4" — but the old handler
      // only advanced the highlight WITHIN a multi-verse passage and
      // fell back to a no-op for single-verse slides (which is what
      // the operator was on). Now we:
      //   1. If on a multi-verse passage AND the highlight isn't yet
      //      at the boundary, advance the highlight (existing UX).
      //   2. Otherwise, parse the live slide's title (e.g. "John 3:3"
      //      or "John 3:1-10"), step the verse number ±1, validate
      //      against bibleStructure (don't run past the end of the
      //      chapter), look up the new verse, and append it as a new
      //      live slide — same pattern as next_chapter.
      //   3. Only as a last resort (no live verse-passage at all),
      //      advance the slide deck cursor.
      case 'next_verse':
      case 'previous_verse': {
        const dir = cmd.kind === 'next_verse' ? 1 : -1
        // v0.7.214 — Voice nav reads from LIVE direct-ref FIRST.
        // Pre-214 this read `slides[liveIdx]` only, ignoring the
        // AI-detected verse held in `s.liveSlide` (which is what's
        // actually rendering on the live display per output-payload
        // L19's `liveSlide ?? slides[liveSlideIndex]` read). Operator
        // bug: AI auto-detected John 3:16 onto live (liveSlide ref set,
        // liveSlideIndex=-1), operator says "next verse" → this branch
        // saw `null` from slides[-1], fell through to slide-deck
        // fallback, and either did nothing or stepped a stale deck
        // entry. Mirror logos-shell.tsx L3929 read pattern.
        const slide = s.liveSlide ?? (liveIdx >= 0 ? slides[liveIdx] : null)

        // (1) Multi-verse passage: try to advance highlight first.
        if (slide && slide.type === 'verse' && (slide.content?.length ?? 0) > 1) {
          const max = (slide.content?.length ?? 1) - 1
          const cur = s.liveActiveVerseIndex
          if (dir === 1 && cur < max) {
            s.setLiveActiveVerseIndex(cur + 1)
            break
          }
          if (dir === -1 && cur > 0) {
            s.setLiveActiveVerseIndex(cur - 1)
            break
          }
          // At boundary — fall through to scripture-step.
        }

        // (2) Single-verse slide OR boundary of multi-verse range:
        //     load the next/previous verse from scripture and push
        //     it live as a new slide.
        if (slide && slide.type === 'verse' && slide.title) {
          const ref = parseExplicitReference(slide.title)
          if (ref) {
            // Anchor the step against the END of a forward range and
            // the START of a backward step — so "John 3:1-10" + next
            // gives John 3:11, but "John 3:1-10" + previous gives
            // John 2:25 (rollover into the previous chapter).
            const anchor = dir === 1
              ? (ref.verseEnd ?? ref.verseStart)
              : ref.verseStart
            const targetBook = ref.book
            let targetChapter = ref.chapter
            let targetVerse = anchor + dir
            const struct = (bibleStructure as unknown as Record<string, number[]>)[ref.book]
            const verseCount = struct?.[ref.chapter - 1] ?? 0

            // v0.7.24 — Cross-chapter rollover. Operator complaint:
            // "next verse" on John 3:36 (last verse) used to do
            // nothing because the validation block below rejected
            // verse 37. Now we roll over to John 4:1. Same for
            // "previous verse" on John 4:1 → John 3:36.
            //
            // Rollover ONLY happens within the same book. At a book
            // boundary (Revelation 22:21 + next, Genesis 1:1 +
            // previous) we still fall through to the legacy slide-
            // deck behaviour rather than guessing the next book.
            if (verseCount > 0 && targetVerse > verseCount && struct) {
              if (targetChapter < struct.length) {
                targetChapter = targetChapter + 1
                targetVerse = 1
              }
              // else: last chapter of the book, no rollover possible.
            } else if (targetVerse < 1 && struct && targetChapter > 1) {
              targetChapter = targetChapter - 1
              targetVerse = struct[targetChapter - 1] ?? 1
            }

            // Re-validate after potential rollover.
            const newStruct = (bibleStructure as unknown as Record<string, number[]>)[targetBook]
            const newVerseCount = newStruct?.[targetChapter - 1] ?? 0
            if (newVerseCount > 0 && targetVerse >= 1 && targetVerse <= newVerseCount) {
              const tx = s.selectedTranslation
              const refKey = `${targetBook} ${targetChapter}:${targetVerse}`
              let textOut: string | null = lookupVerse(targetBook, targetChapter, targetVerse, tx)
              if (!textOut && !isTranslationBundled(tx)) {
                try {
                  const v = await fetchBibleVerse(refKey, tx)
                  if (v) textOut = v.text
                } catch { /* ignore — toast below */ }
              }
              if (textOut) {
                const slideNew = {
                  id: `slide-${Date.now()}`,
                  type: 'verse' as const,
                  title: refKey,
                  subtitle: tx,
                  content: textOut.split('\n').filter(Boolean),
                  background: s.settings.congregationScreenTheme,
                }
                // v0.7.208 — Voice commands target LIVE ONLY. Preview
                // is reserved for operator manual control. Use the
                // setLiveAuto direct-ref path (same one the AI auto-
                // detect useEffect uses in logos-shell.tsx) so the
                // operator's previewSlideIndex / pinnedPreviewSlide
                // are NEVER touched by a voice-triggered verse push.
                //
                // Pre-208 this branch did setSlides + setPreviewSlideIndex
                // + setLiveSlideIndex, which clobbered the operator's
                // preview. The v0.7.194-hotfix.11 "preserve manual
                // preview" guard tried to mitigate by routing to
                // addScheduleItemQuiet when preview was off-live, but
                // that meant the voice-stepped verse silently went to
                // the schedule instead of live — operator's actual
                // ask ("next verse" → put John 3:4 on screen) failed.
                // setLiveAuto fixes both: live updates, preview stays.
                useAppStore.getState().setLiveAuto(slideNew)
                useAppStore.getState().setLiveActiveVerseIndex(0)
                // v0.7.24 — Surface a small toast when we rolled
                // over so the operator knows the chapter changed.
                if (targetChapter !== ref.chapter) {
                  toast.success(`${refKey} (chapter ${targetChapter})`, {
                    duration: 1800,
                    position: 'bottom-right',
                  })
                }
                break
              }
              toast.error(`Could not load ${refKey}`, { duration: 2000, position: 'bottom-right' })
              break
            }
            // Truly off the end (or start) of the BOOK — fall
            // through to slide deck.
          }
        }

        // (3) Fallback: slide-deck advance (legacy behaviour).
        // v0.7.208 — Voice "next slide" no longer drags previewSlideIndex
        // along; it only advances LIVE. Operator's preview stays put
        // unless they manually move it.
        if (slides.length) {
          const nextI = dir === 1
            ? Math.min(slides.length - 1, Math.max(0, liveIdx + 1))
            : Math.max(0, liveIdx - 1)
          s.setLiveSlideIndex(nextI)
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
          // v0.7.208 — Voice "go to <ref>" targets LIVE ONLY via the
          // setLiveAuto direct-ref path. See the matching block in
          // next_verse for the full rationale. Operator preview stays.
          useAppStore.getState().setLiveAuto(slide)
          useAppStore.getState().setLiveActiveVerseIndex(0)
        }
        break
      }
      // ── v0.7.23 — AI Verse Search ──────────────────────────────────
      // Operator described a verse instead of citing it ("find the
      // verse about loving your enemies"). We hand the quote to the
      // existing semantic matcher endpoint (OpenAI embeddings against
      // POPULAR_VERSES_KJV), accept the top match if its confidence
      // is HIGH or MEDIUM, re-fetch in the operator's currently-
      // selected translation, and push it as a live slide. Mirrors
      // the go_to_reference dispatch shape so the live behaviour is
      // identical from the operator's point of view.
      //
      // Failure modes are spoken to the operator via toast so a quiet
      // failure (no internet / no API key / no good match) doesn't
      // leave them wondering what happened.
      case 'find_by_quote': {
        const quote = (cmd.quoteText || '').trim()
        if (!quote) {
          // v0.7.111 — silent on empty (operator complaint about
          // toast spam from misfired voice commands).
          break
        }
        // v0.7.111 — Silenced the always-on loading toast. It only
        // ever told the operator something they could already see in
        // the detection panel, and on failures combined with the
        // "No match" error toast to triple-stack noise on a single
        // misfired utterance. Loading state is now console-only;
        // the success toast at the bottom of this case is the only
        // user-visible signal.
        if (typeof console !== 'undefined') {
          console.log('[voice] find_by_quote searching:', quote)
        }
        let match: {
          reference: string
          book: string
          chapter: number
          verseStart: number
          verseEnd?: number
          confidence: 'high' | 'medium' | 'low'
        } | null = null
        try {
          const resp = await fetch('/api/scripture/semantic-match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: quote, topK: 1 }),
          })
          if (resp.ok) {
            const j = (await resp.json()) as {
              ok?: boolean
              matches?: Array<{
                reference: string
                book: string
                chapter: number
                verseStart: number
                verseEnd?: number
                confidence: 'high' | 'medium' | 'low'
              }>
              status?: { hasApiKey?: boolean }
            }
            if (j.ok && j.matches && j.matches.length > 0) {
              match = j.matches[0]!
            } else if (j.status && j.status.hasApiKey === false) {
              toast.error('AI Verse Search needs an OpenAI key (Settings → AI)', {
                id: 'ai-verse-search',
                duration: 4000,
                position: 'bottom-right',
              })
              break
            }
          }
        } catch {
          /* network error — fall through to "no match" toast */
        }
        if (!match) {
          // v0.7.111 — Silent failure (operator complaint: red
          // "No match for ..." toasts on every misfired voice
          // command were clutter). The semantic matcher only knows
          // the POPULAR_VERSES_KJV shortlist, so the fail rate on
          // arbitrary preacher questions ("in the bible Jesus was
          // crucified", "where was Stephen stoned") is naturally
          // high. Failure path is console-only; the operator can
          // see the detection card if they want to debug.
          toast.dismiss('ai-verse-search')
          if (typeof console !== 'undefined') {
            console.log('[voice] find_by_quote: no match for', quote)
          }
          break
        }
        const refKey = `${match.book} ${match.chapter}:${match.verseStart}${
          match.verseEnd && match.verseEnd !== match.verseStart ? `-${match.verseEnd}` : ''
        }`
        const tx = s.selectedTranslation
        let textOut: string | null = null
        const vEnd = match.verseEnd ?? match.verseStart
        if (vEnd > match.verseStart) {
          const rr = lookupRange(match.book, match.chapter, match.verseStart, vEnd, tx)
          if (rr) textOut = rr.text
        } else {
          const v = lookupVerse(match.book, match.chapter, match.verseStart, tx)
          if (v) textOut = v
        }
        if (!textOut) {
          try {
            const v = await fetchBibleVerse(refKey, tx)
            if (v) textOut = v.text
          } catch {
            /* ignore — handled below */
          }
        }
        if (!textOut) {
          toast.error(`Found ${refKey} but couldn't load text`, {
            id: 'ai-verse-search',
            duration: 2500,
            position: 'bottom-right',
          })
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
        // v0.7.214 — AI / voice verse search targets LIVE ONLY via
        // setLiveAuto. Pre-214 this used the legacy
        // `setSlides + setPreviewSlideIndex + setLiveSlideIndex + setIsLive`
        // combo, which clobbered the operator's preview (yanked their
        // pin to the AI-loaded verse). The v0.7.194-hotfix.11 "preserve
        // manual preview" guard above tried to mitigate by routing to
        // addScheduleItemQuiet when preview was off-live, but the
        // operator's actual ask ("find this quote → put on live") was
        // silently going to the schedule instead. v0.7.208 / v0.7.210
        // already proved setLiveAuto is the canonical direct-ref
        // primitive for "AI/voice → live without touching preview".
        useAppStore.getState().setLiveAuto(slide)
        useAppStore.getState().setLiveActiveVerseIndex(0)
        toast.success(
          `${refKey} (${match.confidence === 'high' ? 'AI: high match' : 'AI: best match'})`,
          { id: 'ai-verse-search', duration: 2200, position: 'bottom-right' },
        )
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
        // v0.7.214 — read LIVE direct-ref first (see L609 note).
        const slide = s.liveSlide ?? (liveIdx >= 0 ? slides[liveIdx] : null)
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
        // v0.7.114 — Operator complaint: "next chapter brings a bunch
        // of scriptures and live displays them, which is very
        // embarrassing." Pre-114 we loaded the WHOLE chapter range
        // (e.g. John 2:1-25) into one slide. Operator wants the same
        // jump pattern as Bible study apps: from John 1:51 → "next
        // chapter" lands on John 2:1 (single verse). They can use
        // "next verse" / "verse N" to walk forward from there.
        const tx = s.selectedTranslation
        const refKey = `${ref.book} ${targetChapter}:1`
        let textOut: string | null = lookupVerse(ref.book, targetChapter, 1, tx)
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
        // v0.7.214 — Voice next/previous_chapter → LIVE only via setLiveAuto
        // (see L905 note). Preview is never touched.
        useAppStore.getState().setLiveAuto(slideNew)
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
      // ── v0.7.19 — Translation switch ───────────────────────────────
      // Calls setSelectedTranslation. live-translation-sync.tsx watches
      // selectedTranslation + liveSlideIndex and refetches the active
      // verse slide's text in the new translation, then patches it
      // in place via replaceSlide — that's what makes the live output
      // / NDI feed update without "send to live again". The NDI
      // payload picks up the change automatically because it's
      // sourced from slides[liveSlideIndex].
      case 'change_translation': {
        if (!cmd.translation) break
        // Idempotent: don't churn the live slide if the operator just
        // re-stated the same translation.
        if (s.selectedTranslation === cmd.translation) break
        s.setSelectedTranslation(cmd.translation)
        break
      }
      // ── v0.7.19 — Delete previous verse ───────────────────────────
      // Pops the most-recently-pushed slide off the deck. Used by
      // operators to recover from a misfired auto-detection without
      // touching the keyboard. We:
      //   1. Refuse if there are no slides (no-op + toast).
      //   2. Splice off the LAST slide.
      //   3. Move preview/live indices back to the new last slide,
      //      OR -1 (blank) when the deck is now empty.
      //   4. Reset liveActiveVerseIndex so the next render doesn't
      //      try to highlight a verse that no longer exists.
      // The setSlides + setLive*Index combo triggers the
      // output-broadcaster watcher, which re-broadcasts to /api/output
      // and propagates to NDI / preview / congregation screens.
      case 'delete_previous_verse': {
        const cur = useAppStore.getState().slides
        if (!cur.length) {
          toast.error('Nothing to delete on the deck', { duration: 1500, position: 'bottom-right' })
          break
        }
        const next = cur.slice(0, -1)
        const newIdx = next.length - 1
        useAppStore.getState().setSlides(next)
        // v0.7.214 — voice commands target LIVE ONLY. Preview is the
        // operator's surface and MUST NOT be reseated by a voice path.
        // Pre-214 this also wrote previewSlideIndex which yanked the
        // operator's pinned preview to the new last-deck slot.
        useAppStore.getState().setLiveSlideIndex(newIdx)
        useAppStore.getState().setLiveActiveVerseIndex(0)
        if (newIdx < 0) {
          // Deck is now empty; bring the live output to a clean state
          // rather than leaving a stale frame on screen.
          useAppStore.getState().setIsLive(false)
        }
        break
      }
      // ── v0.7.19 — Show verse N within current chapter ─────────────
      // Two cases:
      //   (A) The current live slide IS a multi-verse passage (e.g.
      //       loaded "John 3:1-30") — just move the highlight cursor
      //       to verse N within that slide. No fetch needed.
      //   (B) The current live slide is a single verse OR not a
      //       Bible passage at all — we need a chapter context to
      //       know which verse N to load. Try to parse the live
      //       slide's title as a reference and fetch <book> <chapter>:N
      //       in the active translation, then push as a new slide.
      // If we can't recover any chapter context (no live verse
      // currently), surface a toast — the operator probably meant to
      // wake-prefix this with a book/chapter first.
      case 'show_verse_n': {
        if (!cmd.verseNumber) break
        const n = cmd.verseNumber
        // v0.7.214 — read LIVE direct-ref first (see L609 note).
        const slide = s.liveSlide ?? (liveIdx >= 0 ? slides[liveIdx] : null)
        // We need to know the passage anchor (book/chapter/verseStart)
        // for BOTH branches: Case A uses verseStart to map "show verse
        // 17" against a "John 3:16-18" slide to range-index 1 (NOT
        // index 16). Case B reuses the same parse to fetch
        // <book> <chapter>:N in the active translation.
        const refFromSlide = slide && slide.type === 'verse' && slide.title
          ? parseExplicitReference(slide.title)
          : null
        if (
          slide &&
          slide.type === 'verse' &&
          (slide.content?.length ?? 0) > 1 &&
          refFromSlide
        ) {
          // Case A — passage already loaded as a multi-verse range.
          // Map the requested verse number to its position WITHIN the
          // loaded range. If the request falls outside the loaded
          // range we deliberately fall through to Case B, which will
          // fetch the requested verse and append it as a new slide
          // — matches operator expectation ("show verse 30" should
          // load verse 30, not silently clamp to the last loaded one).
          const start = refFromSlide.verseStart
          const end = refFromSlide.verseEnd ?? refFromSlide.verseStart
          if (n >= start && n <= end) {
            const target = n - start
            s.setLiveActiveVerseIndex(target)
            break
          }
          // else: fall through to Case B fetch.
        }
        // Case B — need to fetch <currentBook> <currentChapter>:N.
        if (!slide || slide.type !== 'verse' || !slide.title) {
          toast.error(`No live passage to anchor verse ${n} against`, { duration: 2000, position: 'bottom-right' })
          break
        }
        const ref = refFromSlide
        if (!ref) {
          toast.error(`Cannot parse current passage: ${slide.title}`, { duration: 2000, position: 'bottom-right' })
          break
        }
        const struct = (bibleStructure as unknown as Record<string, number[]>)[ref.book]
        const verseCount = struct?.[ref.chapter - 1] ?? 0
        if (verseCount && (n < 1 || n > verseCount)) {
          toast.error(`${ref.book} ${ref.chapter} only has ${verseCount} verses`, { duration: 2000, position: 'bottom-right' })
          break
        }
        const tx = s.selectedTranslation
        const refKey = `${ref.book} ${ref.chapter}:${n}`
        let textOut: string | null = lookupVerse(ref.book, ref.chapter, n, tx)
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
        // v0.7.214 — show_verse_n → LIVE only via setLiveAuto (see L905 note).
        useAppStore.getState().setLiveAuto(slideNew)
        useAppStore.getState().setLiveActiveVerseIndex(0)
        break
      }
      // ── v0.7.235 — Show chapter N within current book ─────────────
      // Operator says "chapter 5" / "go to chapter 5" / "take me to
      // chapter 5". Resolve the current book from the live slide and
      // load <currentBook> N:1 in the active translation. Mirror of
      // show_verse_n Case B but at chapter granularity. If we can't
      // recover any book context (no live verse currently), surface a
      // toast — the operator probably meant to wake-prefix this with
      // a book reference first.
      case 'show_chapter_n': {
        if (!cmd.chapterNumber) break
        const n = cmd.chapterNumber
        const slide = s.liveSlide ?? (liveIdx >= 0 ? slides[liveIdx] : null)
        if (!slide || slide.type !== 'verse' || !slide.title) {
          toast.error(`No live passage — say "<book> chapter ${n}" first`, { duration: 2200, position: 'bottom-right' })
          break
        }
        const refFromSlide = parseExplicitReference(slide.title)
        if (!refFromSlide) {
          toast.error(`Cannot parse current passage: ${slide.title}`, { duration: 2000, position: 'bottom-right' })
          break
        }
        const struct = (bibleStructure as unknown as Record<string, number[]>)[refFromSlide.book]
        const chapterCount = struct?.length ?? 0
        if (chapterCount && (n < 1 || n > chapterCount)) {
          toast.error(`${refFromSlide.book} only has ${chapterCount} chapters`, { duration: 2200, position: 'bottom-right' })
          break
        }
        const tx = s.selectedTranslation
        const refKey = `${refFromSlide.book} ${n}:1`
        let textOut: string | null = lookupVerse(refFromSlide.book, n, 1, tx)
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
        useAppStore.getState().setLiveAuto(slideNew)
        useAppStore.getState().setLiveActiveVerseIndex(0)
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

  // ── v0.7.263 — Explicit (Reference Engine v2) detection, extracted ──
  // Pulled out of the monolithic processCallbackRef so the SAME high-
  // precision, structurally-unambiguous address detector can run from
  // three call sites with identical semantics:
  //   1. FINAL full pipeline — on the bridged rolling-buffer span.
  //   2. INTERIM fast path   — explicit-only, throttled, on buffer +
  //      live interim hypothesis (sub-second fire mid-utterance).
  //   3. LOW-ACOUSTIC-CONF   — fast/loud speech that drops below the
  //      live tier still gets its explicit address detected; only the
  //      heavier semantic / text-search / preacher pipeline stays gated.
  // Returns true when it fired (or deliberately suppressed a re-mention)
  // so the caller knows to stop the rest of the pipeline; false means
  // "no explicit address here, carry on".
  const runExplicitV2Detection = useCallback(async (span: string, allowRemention = true): Promise<boolean> => {
    const v2Tail = span.trim().split(/\s+/).slice(-30).join(' ')
    const v2 = detectBestReference(v2Tail)
    if (!v2 || v2.confidence < 80) return false
    const state = useAppStore.getState()
    const refKey = `${v2.book} ${v2.chapter}:${v2.verseStart}${
      v2.verseEnd && v2.verseEnd !== v2.verseStart ? `-${v2.verseEnd}` : ''
    }`
    const dedupKey = `v2:${refKey}`
    const now = Date.now()
    const lastAt = processedRefsRef.current.get(dedupKey) ?? 0
    // v0.7.263 — Reference-fire policy (reference-fire-policy.ts, unit-
    // tested). Collapses the two spam vectors the interim accelerator
    // introduced: (1) interim self-spam — the same ref re-detected every
    // ~150 ms during one utterance; (2) the final echoing the interim
    // that just fired ~1 s later (would double-fire auto-live). A 2.5 s
    // per-ref promotion cooldown suppresses both while still letting a
    // deliberate re-mention seconds later promote.
    let decision = decideReferenceFire(lastAt, now, {
      dedupeTtlMs: REF_DEDUPE_TTL_MS,
    })
    // The INTERIM path is an explicit-detection ACCELERATOR only — it
    // must never drive re-mention promotion (interim hypotheses are
    // unstable and re-promotion has projector-visible side effects).
    // Genuine re-mentions are handled on the final path.
    if (decision === 'rementtion' && !allowRemention) decision = 'suppress'
    // Suppressed: already handled recently (interim spam / final echo).
    // Stop the rest of the pipeline but make NO store changes and do NOT
    // re-stamp the timestamp, so the cooldown is measured from the
    // ORIGINAL fire and a true later re-mention can still cross it.
    if (decision === 'suppress') return true
    // Re-mention within the dedupe window, past the cooldown: re-route
    // the navigator + re-fire auto-live via the store's promotion path,
    // but never duplicate the column entry. (Full rationale preserved in
    // CHANGELOG v0.7.184.2 / v0.7.247.)
    if (decision === 'rementtion') {
      try { useAppStore.getState().requestNavigatorRef(refKey) } catch { /* defensive */ }
      const existing = useAppStore
        .getState()
        .detectedVerses.find((d) => d.reference === refKey)
      const reAdd: DetectedVerse = existing
        ? { ...existing }
        : {
            id: `det-rementioned-${Date.now()}-${Math.random()
              .toString(36)
              .slice(2, 8)}`,
            reference: refKey,
            text: '',
            translation: state.selectedTranslation,
            detectedAt: new Date(),
            confidence: v2.confidence / 100,
            source: 'explicit' as const,
          }
      if (existing) {
        useAppStore.getState().addDetectedVerse(reAdd)
        useAppStore.getState().setDetectionStatus('detected')
      }
      processedRefsRef.current.set(dedupKey, now)
      return true
    }
    // decision === 'new' — fresh detection (never fired, or dedupe
    // window expired). Run the full lookup + column-insert path.
    {
      for (const [k, ts] of processedRefsRef.current) {
        if (now - ts >= REF_DEDUPE_TTL_MS) processedRefsRef.current.delete(k)
      }
      // NOTE: do NOT stamp the dedupe timestamp here. We stamp ONLY after
      // a verse text actually resolves + fires (inside `if (textOut)`
      // below). Stamping up-front would let an interim that detected the
      // ref but FAILED to resolve text (transient fetch miss / unbundled
      // translation) block the FINAL of the same utterance via the
      // cooldown — yielding zero fire for that utterance.
      const tx = state.selectedTranslation
      const vEnd = v2.verseEnd ?? v2.verseStart
      // Bundled JSON first (instant); fall back to network only when the
      // operator's translation isn't bundled.
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
          source: 'explicit',
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
        useAppStore.getState().setLiveActiveVerseIndex(0)
        // Stamp the dedupe timestamp ONLY now that a real fire happened,
        // so the cooldown/dedupe window is anchored to an actual fire (not
        // a detection that failed to resolve text). See the NOTE above.
        processedRefsRef.current.set(dedupKey, now)
        // Centralized auto-fire effect in logos-shell.tsx is the SOLE
        // authority for pushing to the projector (0.85 floor + stability).
        return true
      }
    }
    return false
  }, [])

  // Update the ref in an effect (not during render) to satisfy ESLint react-hooks/refs
  useEffect(() => {
    processCallbackRef.current = async (text: string, confidence: number, isFinal = true) => {
      if (!text.trim()) return

      // ── v0.7.263 — INTERIM EXPLICIT-ONLY FAST PATH ───────────────────
      // Deepgram emits interim hypotheses continuously between finals.
      // During fast/continuous speech the finals are large + infrequent,
      // so detection used to go idle until the speaker paused. We now run
      // the explicit (structurally-unambiguous) detector on the bridged
      // buffer + live interim, throttled, so an address fires the instant
      // its chapter:verse appears — without waiting for the next final.
      // Interim text is NEVER persisted to the rolling buffer (it's a
      // moving hypothesis); only finals are persisted below.
      if (!isFinal) {
        const nowI = Date.now()
        if (nowI - lastInterimDetectAtRef.current < INTERIM_DETECT_THROTTLE_MS) return
        lastInterimDetectAtRef.current = nowI
        const span = detectionText(recentWordsRef.current, text)
        // allowRemention=false — interim is a first-detection accelerator
        // only; re-mention promotion is reserved for the final path.
        await runExplicitV2Detection(span, false)
        return
      }

      // FINAL — persist words to the rolling window so a reference split
      // across segment boundaries ("John" <pause> "3:7", or one buried
      // mid-monologue) co-occurs in a single detection span.
      recentWordsRef.current = pushWords(recentWordsRef.current, text, Date.now())

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
      const liveT = state.settings.transcriptLiveThreshold ?? 0.65
      // v0.7.112 — Voice commands MUST run even at low transcript
      // confidence. Operators reported "nothing works" when preaching
      // in noisy church environments where Deepgram returns chunk
      // confidence < 0.65. The pre-112 gate dropped the entire
      // pipeline (commands AND verses) in that case, so even a
      // perfectly-spoken "next verse" was silently swallowed when the
      // surrounding music dragged the chunk confidence down. We now
      // always run the command pre-pass; only the heavier verse-
      // detection / semantic-match pipeline is gated on liveT.
      const lowConfidence = confidence < liveT
      if (state.voiceControlEnabled) {
        const tail0 = text.trim().slice(-200)
        const cmd0 = detectCommand(tail0)
        if (cmd0 && cmd0.confidence >= 80) {
          const refSig0 = cmd0.reference
            ? `${cmd0.reference.book}|${cmd0.reference.chapter}|${cmd0.reference.verseStart}|${cmd0.reference.verseEnd ?? ''}`
            : ''
          const sig0 = `${cmd0.kind}|${refSig0}|${cmd0.translation ?? ''}|${cmd0.verseNumber ?? ''}`
          const now0 = Date.now()
          if (cmd0.wakeWord || lastVoiceCmdRef.current.sig !== sig0 || now0 - lastVoiceCmdRef.current.at > 4000) {
            lastVoiceCmdRef.current = { sig: sig0, at: now0 }
            speakerFollowSuspendedUntilRef.current = Date.now() + 2000
            await dispatchVoiceCommand(cmd0)
            state.setDetectionStatus('detected')
            if (cmd0.kind !== 'find_by_quote') {
              toast.message(cmd0.label, { duration: 1500, position: 'bottom-right' })
            }
            return
          }
        }
      }
      if (lowConfidence) {
        // Below the live tier — the heavy semantic / text-search /
        // preacher pipeline stays suppressed (those guess at meaning and
        // need clean audio). BUT a structurally-unambiguous explicit
        // address ("John 3:16") is safe to fire even from low-acoustic-
        // confidence audio: the detector's own ≥80 confidence gate
        // protects against garble. v0.7.263 — fast/loud preaching that
        // dragged chunk confidence under liveT used to silently drop
        // explicit references; now they still fire off the bridged
        // rolling buffer. Command pre-pass above already ran.
        void dropT
        if (await runExplicitV2Detection(bufferText(recentWordsRef.current))) return
        state.setDetectionStatus('idle')
        return
      }
      state.setDetectionStatus('processing')

      // ── v0.5.52 — Voice Command pre-pass (commands.ts) ─────────────
      // Runs BEFORE Bible detection. When a leading-position command
      // matches with confidence ≥80, we dispatch + suppress all
      // downstream processing on this transcript so a sentence like
      // "next verse" never accidentally triggers a "verse" detection.
      //
      // v0.7.19 — Now chain-aware. If the operator chains commands
      // ("John 3:16, message version, next verse" or "media, KJV,
      // clear screen"), detectCommandChain returns each segment as
      // its own VoiceCommand and we dispatch them in order with a
      // tiny delay so the live-translation-sync watcher and the
      // output-broadcaster have a chance to settle between actions.
      // The single-command path is kept as a fast path for the
      // overwhelming majority of utterances that AREN'T chains.
      if (state.voiceControlEnabled) {
        const tail = text.trim().slice(-200) // command must be near the end

        // Chain-mode: only fires when the utterance has explicit
        // separators AND yields ≥ 2 dispatchable commands. Anything
        // less falls through to single-command detection so we don't
        // change behaviour for the common case.
        const hasSeparator = /[,;]|\bthen\b/i.test(tail)
        if (hasSeparator) {
          const chain = detectCommandChain(tail)
          if (chain.length >= 2) {
            const now = Date.now()
            // Single dedupe key for the WHOLE chain so a re-spoken
            // chain doesn't fire twice in the 4 s window.
            const sig = 'chain|' + chain.map((c) => {
              const refSig = c.reference
                ? `${c.reference.book}|${c.reference.chapter}|${c.reference.verseStart}|${c.reference.verseEnd ?? ''}`
                : ''
              return `${c.kind}|${refSig}|${c.translation ?? ''}|${c.verseNumber ?? ''}`
            }).join(';')
            // v0.7.19 — Wake-word bypass also applies to chains. If
            // ANY segment was wake-prefixed, the operator explicitly
            // re-issued the chain and we should always fire — matches
            // the single-command behaviour. Without this, "Media,
            // NKJV, clear screen" repeated within 4 s would only fire
            // once.
            const chainWoke = chain.some((c) => c.wakeWord === true)
            if (chainWoke || lastVoiceCmdRef.current.sig !== sig || now - lastVoiceCmdRef.current.at > 4000) {
              lastVoiceCmdRef.current = { sig, at: now }
              speakerFollowSuspendedUntilRef.current = Date.now() + 2000
              for (const c of chain) {
                await dispatchVoiceCommand(c)
                // Stagger by 120 ms so the live-translation-sync
                // refetch (triggered by setSelectedTranslation) and
                // the slide-broadcast settle before the next action
                // mutates state again. Without the gap, a chain like
                // "John 3:16, message version, next verse" can race:
                // next_verse advances the cursor BEFORE the
                // translation-swap re-fetch finishes and the
                // resulting NDI frame briefly shows the wrong text.
                await new Promise((res) => setTimeout(res, 120))
                toast.message(c.label, { duration: 1200, position: 'bottom-right' })
              }
              state.setDetectionStatus('detected')
              return
            }
          }
        }

        const cmd = detectCommand(tail)
        if (cmd && cmd.confidence >= 80) {
          // Dedup: ignore the same command if we already executed it
          // with the same parameter signature in the last 4 s.
          // v0.7.19 — Wake-word commands ("Media, ...") bypass dedupe
          // because the operator explicitly invoked them. Without
          // this, saying "Media, next verse" twice in quick
          // succession would only fire once.
          const refSig = cmd.reference
            ? `${cmd.reference.book}|${cmd.reference.chapter}|${cmd.reference.verseStart}|${cmd.reference.verseEnd ?? ''}`
            : ''
          const sig = `${cmd.kind}|${refSig}|${cmd.translation ?? ''}|${cmd.verseNumber ?? ''}`
          const now = Date.now()
          if (cmd.wakeWord || lastVoiceCmdRef.current.sig !== sig || now - lastVoiceCmdRef.current.at > 4000) {
            lastVoiceCmdRef.current = { sig, at: now }
            speakerFollowSuspendedUntilRef.current = Date.now() + 2000
            await dispatchVoiceCommand(cmd)
            state.setDetectionStatus('detected')
            // v0.7.111 — Skip the outer "Find: ..." label toast for
            // find_by_quote because the dispatcher above manages its
            // own success / silent-failure messaging. Pre-111 the
            // outer label toast surfaced things like
            // `Find: in the bible Jesus was crucified` on EVERY
            // misfire, even when the dispatcher then went quiet.
            if (cmd.kind !== 'find_by_quote') {
              toast.message(cmd.label, { duration: 1500, position: 'bottom-right' })
            }
            // Suppress the rest of the pipeline for this transcript.
            return
          }
        }

        // ── v0.7.29 — LLM voice classifier fallback (Phase 2 v0.8.0) ─
        // The regex classifier above (commands.ts → detectCommand)
        // either returned null OR a low-confidence (<80) match. If the
        // operator has opted in to the LLM fallback and the utterance
        // PASSES the local command-likeness gate (a cheap heuristic
        // checking for trigger verbs / structural hints, see
        // src/lib/voice/llm-gate.ts), we POST the tail + live slide
        // context to /api/voice/classify which calls classifyIntent
        // server-side. classifyIntent is built to NEVER throw and
        // tops out at 1.5 s (its internal timeout); we wrap the fetch
        // in our own 2 s AbortController as a belt-and-braces guard.
        //
        // On a returned VoiceCommand we apply the SAME dedupe + the
        // SAME dispatch + the SAME speaker-follow suspension as the
        // regex path. The toast carries an "[AI]" prefix so the
        // operator can tell at a glance which path fired the command
        // (helpful for triage during the beta).
        // v0.7.30 — gate the LLM call on the REGEX OUTCOME, not on
        // whether dispatch happened. Without this guard, a regex
        // command that matched at >=80 confidence but was dedupe-
        // suppressed (`lastVoiceCmdRef` 4 s window) would fall
        // through here and trigger an LLM roundtrip on a command we
        // already understood — wasting an OpenAI call AND, because
        // `lastLlmCmdRef` is a SEPARATE dedupe ref, potentially
        // double-executing the command via the LLM path.
        if (
          (!cmd || cmd.confidence < 80) &&
          llmClassifierEnabledRef.current &&
          isLikelyCommandUtterance(tail)
        ) {
          try {
            const slides = state.slides
            const liveIdx = state.liveSlideIndex
            // v0.7.214 — LLM classifier context reads LIVE direct-ref first.
            // Pre-214 the classifier only saw `slides[liveIdx]`, so when the
            // current live verse came from AI auto-detect (liveSlide ref set,
            // liveIdx=-1) the LLM was given NO context and couldn't resolve
            // "next verse" / "show verse 17" against the actual live passage.
            const liveSlide =
              state.liveSlide ?? (liveIdx >= 0 && liveIdx < slides.length ? slides[liveIdx] : undefined)
            // For verse slides, the reference text lives in `title`
            // (e.g. "John 3:16"). Other slide types don't carry a
            // reference — we just omit the field rather than feeding
            // the LLM a misleading "Welcome" / "Announcement" string.
            const liveReference =
              liveSlide && liveSlide.type === 'verse' && typeof liveSlide.title === 'string'
                ? liveSlide.title
                : undefined
            // v0.7.241 — Outer fetch timeout MUST stay > classifier's
            // internal DEFAULT_TIMEOUT_MS (currently 1200 ms; see
            // llm-classifier.ts). Pre-v0.7.241 the outer was 1000 ms
            // and the inner was 1200 ms — the outer AbortController
            // fired BEFORE the inner could return, the catch silently
            // swallowed the result, and EVERY slow-network LLM call
            // looked to the operator like "the AI didn't hear me."
            // This is the v0.7.169 timeout regression repeating: that
            // release raised inner 800 → 1200, but the stale comment
            // here ("classifyIntent caps at 800 ms") meant the outer
            // wrapper was never lifted in lockstep. 1500 ms keeps
            // 300 ms of network headroom above the inner cap while
            // still bounding total wall time per utterance.
            // GUARD-RAIL: any future change to DEFAULT_TIMEOUT_MS in
            // llm-classifier.ts MUST be paired with a matching bump
            // here (outer = inner + ≥200 ms). Drift = silent regression.
            const ac = new AbortController()
            const timer = setTimeout(() => ac.abort(), 1500)
            let resp: Response
            try {
              resp = await fetch('/api/voice/classify', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                cache: 'no-store',
                signal: ac.signal,
                body: JSON.stringify({
                  transcript: tail,
                  context: {
                    ...(liveReference ? { currentReference: liveReference } : {}),
                    currentTranslation: state.selectedTranslation,
                    currentVerseIndex: state.liveActiveVerseIndex,
                    autoscrollActive: state.autoScrollEnabled,
                  },
                }),
              })
            } finally {
              clearTimeout(timer)
            }
            if (resp.ok) {
              const j = (await resp.json()) as {
                ok?: boolean
                command?: VoiceCommand | null
                reason?: 'disabled' | 'no_api_key'
              }
              // Server told us the flag flipped off mid-session — sync
              // our cached ref so we stop wasting roundtrips.
              if (j.reason === 'disabled') {
                llmClassifierEnabledRef.current = false
              } else if (j.command) {
                const llmCmd = j.command
                const llmRefSig = llmCmd.reference
                  ? `${llmCmd.reference.book}|${llmCmd.reference.chapter}|${llmCmd.reference.verseStart}|${llmCmd.reference.verseEnd ?? ''}`
                  : ''
                const llmSig = `ai|${llmCmd.kind}|${llmRefSig}|${llmCmd.translation ?? ''}|${llmCmd.verseNumber ?? ''}`
                const now = Date.now()
                if (
                  lastLlmCmdRef.current.sig !== llmSig ||
                  now - lastLlmCmdRef.current.at > 4000
                ) {
                  lastLlmCmdRef.current = { sig: llmSig, at: now }
                  speakerFollowSuspendedUntilRef.current = Date.now() + 2000
                  await dispatchVoiceCommand(llmCmd)
                  state.setDetectionStatus('detected')
                  toast.message(`[AI] ${llmCmd.label}`, {
                    duration: 1500,
                    position: 'bottom-right',
                  })
                  // Suppress the rest of the pipeline — same as the
                  // regex path. The downstream Reference Engine v2 +
                  // text-search still benefit from running when the
                  // LLM returned null (we only return when it fired).
                  return
                }
              }
            }
          } catch {
            // Network error / abort / JSON parse — silent no-op. The
            // regex path already ran; the v2 reference engine and
            // text-search paths still execute below. The whole point
            // of the LLM fallback is that it's an OPPORTUNISTIC
            // additive layer, never a blocker.
          }
        }
      }

      // ── v0.5.52 — Reference Engine v2 (reference-engine.ts) ────────
      // Higher precision than the legacy detector + uses the bundled
      // local-bible.ts JSON for instant lookup. Falls back to the
      // legacy path only when the new engine returns no high-conf
      // match, so spoken phrases the legacy detector already handles
      // (text-search of recent quotations) still work. v0.7.263 — runs
      // on the bridged rolling-buffer span (see runExplicitV2Detection)
      // so a reference split across Deepgram finals still co-occurs.
      if (await runExplicitV2Detection(bufferText(recentWordsRef.current))) return

      // ── v0.7.65 — Preacher Phrase Engine ───────────────────────────
      // Catches the un-addressed quotations the explicit-reference
      // engines (regex + Reference Engine v2) cannot — phrases like
      // "Jesus wept", "the heavens declare the glory of God", "trouble
      // don't last always", "Lazarus come forth". Same dispatch shape
      // as the v2 block above: detect → fetch verse text → push
      // DetectedVerse → optionally auto-go-live. Sermon-only entries
      // ("say amen somebody") are skipped — they have no Bible address
      // to project. Dedupe via the existing processedTextHitsRef so a
      // single phrase doesn't refire on every transcript chunk.
      try {
        const phraseHit = detectBestPreacherPhrase(text, {
          excludeReferences: processedTextHitsRef.current,
        })
        if (phraseHit && !phraseHit.sermonOnly) {
          processedTextHitsRef.current = new Set(processedTextHitsRef.current).add(
            phraseHit.reference,
          )
          const params = new URLSearchParams({
            reference: phraseHit.reference,
            translation: state.selectedTranslation,
          })
          const r = await fetch(`/api/bible?${params.toString()}`)
          if (r.ok) {
            // /api/bible?reference= returns a single verse object:
            //   { reference, text, translation, book, chapter, verseStart, ... }
            // (the ?search= path is the one that returns { hits: [] })
            const v = (await r.json()) as {
              reference?: string; text?: string; translation?: string
              book?: string; chapter?: number; verseStart?: number
            }
            if (v?.reference && v.text && v.translation) {
              // v0.7.104 — Preacher-phrase catalogue hits are
              // paraphrase / quotation matches, not address parses,
              // so they belong in the Bible Reference Quoted column
              // (semantic pipeline).
              // v0.7.116 + v0.7.117 — Tag-then-route with refined
              // exact-match promotion. Operator complaint after
              // v0.7.116: "Sometimes accurate Bible detections go to
              // Suggested Verses. Why is it so?" Root cause: v0.7.116
              // demoted ALL auto-derived hits to 'suggestion', even
              // when an EXACT verbatim substring was matched (which is
              // accurate by construction — there's no fuzz, the
              // preacher said the literal phrase). v0.7.117 refines:
              //
              //   • Hand-curated EXACT  → semantic  conf 0.95
              //   • Hand-curated FUZZY  → semantic  conf 0.85
              //   • Auto-derived EXACT  → semantic  conf 0.65
              //                           (clears 0.55 floor, lands
              //                           in COL 2 live-eligible)
              //   • Auto-derived FUZZY  → suggestion conf 0.42
              //                           (COL 3 only — operator
              //                           clicks to promote)
              //
              // This keeps the v0.7.116 false-positive guard (fuzzy
              // matches on generic 5-7-word slices stay in suggestions)
              // while letting verbatim quotations of POPULAR_VERSES_KJV
              // entries auto-fire as the operator expects.
              const isAuto = phraseHit.autoDerived === true
              const isExact = phraseHit.matchType === 'exact'
              const conf = isAuto
                ? (isExact ? 0.65 : 0.42)
                : (isExact ? 0.95 : 0.85)
              const detected: DetectedVerse = {
                id: `det-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                reference: v.reference,
                text: v.text,
                translation: v.translation,
                detectedAt: new Date(),
                confidence: conf,
                source: isAuto && !isExact ? 'suggestion' : 'semantic',
              }
              const tBefore = useAppStore.getState().liveTranscript
              useAppStore.getState().pushTranscriptBreak(tBefore.length)
              useAppStore.getState().addDetectedVerse(detected)
              useAppStore.getState().addToVerseHistory({
                reference: v.reference,
                text: v.text,
                translation: v.translation,
                book: v.book ?? '',
                chapter: v.chapter ?? 0,
                verseStart: v.verseStart ?? 0,
              })
              // v0.7.105 — REMOVED inline auto-go-live block.
              // Preacher-phrase hits now route through the
              // centralized stability gate in logos-shell.tsx via
              // the 'semantic' source tag set above. The pre-v0.7.105
              // inline path here fired immediately on any
              // catalogue match when autoGoLiveOnDetection was on,
              // bypassing the 3-frame stability requirement.
              state.setDetectionStatus('detected')
              return
            }
          }
        }
      } catch {
        /* phrase-engine failures are silent — keyword + AI paths still run */
      }

      const detectedRefs = detectVersesInTextWithScore(text)
      const references = detectedRefs.map((r) => r.reference)
      const autoLiveOn = state.autoLive || state.settings.autoGoLiveOnDetection
      // v0.7.73 — Honour the operator's autoLiveThreshold setting EXACTLY,
      // floored at 0.50 so an accidental 0 doesn't auto-live every fuzzy
      // hit and ceilinged at 1.0. v0.7.60's hard-cap at 0.50 was the
      // primary cause of "displays random scriptures even when nobody
      // is quoting one" — operators who tightened the slider in Settings
      // were silently ignored. Default 0.78 (high-confidence band) when
      // the operator never touched the slider — matches the semantic
      // matcher's CONFIDENCE_HIGH_THRESHOLD so AI hits only auto-live
      // when they're near-verbatim quotations.
      const operatorThreshold = state.autoLiveThreshold ?? 0.78
      const threshold = Math.max(0.50, Math.min(1.0, operatorThreshold))

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
      const throttle = hasAttribution ? 350 : 550

      // ── v0.7.241 — FAST local n-gram phrase matcher ───────────────
      // Sub-millisecond, zero network, no API key required. Runs
      // BEFORE the keyword search + semantic embedding paths so a
      // 2-4 word distinctive paraphrase fires INSTANTLY without
      // waiting on the slower remote calls. Covers exactly the
      // operator-asked case "any 4 words should know the verse fast":
      //   "king couldn't sleep"        → Esther 6:1
      //   "let there be light"         → Genesis 1:3
      //   "valley of the shadow"       → Psalm 23:4
      //   "be still and know"          → Psalm 46:10
      //   "ask and it shall be given"  → Matthew 7:7
      // The local matcher requires only 2+ words (vs minWords=4 on
      // the network paths) because n-gram lookup is precise — a
      // 2-3 token hit on the curated paraphrase catalogue is
      // intrinsically high-signal, no quota cost to spending probes
      // on shorter tails. Throttle is 200 ms vs 800 ms on the network
      // paths because phrase-index lookups are free.
      // Score 0.65 floor = 3-token n-gram (lengthBase 0.75) OR
      // 2-token + meaningful rarity bonus. Below 0.65 we let the
      // slower network paths arbitrate. GUARD-RAIL: do NOT lower
      // this below 0.55 — 2-token n-grams with no rarity bonus
      // (i.e. tokens that appear in many verses) would flood the
      // detected-verse column with false positives.
      if (allWords.length >= 2 && now - lastPhraseAtRef.current > 120) {
        lastPhraseAtRef.current = now
        try {
          const phraseRes = matchPhraseIndex(recentText, { topK: 3, minN: 2 })
          const topPhrase = phraseRes.matches[0]
          if (
            topPhrase &&
            topPhrase.score >= 0.65 &&
            !processedTextHitsRef.current.has(topPhrase.reference) &&
            !processedRefsRef.current.has(topPhrase.reference) &&
            !references.includes(topPhrase.reference)
          ) {
            processedTextHitsRef.current = new Set(processedTextHitsRef.current).add(
              topPhrase.reference,
            )
            const detected: DetectedVerse = {
              id: `det-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              reference: topPhrase.reference,
              text: topPhrase.text,
              translation: state.selectedTranslation,
              detectedAt: new Date(),
              confidence: topPhrase.score,
              // 'semantic' source routes to the paraphrase column
              // (column 2 in v0.7.104 UI architecture) — identical
              // tagging to the cosine path below so the existing
              // auto-go-live + stability-gate logic in logos-shell
              // applies without special-casing.
              source: topPhrase.score < 0.5 ? 'suggestion' : 'semantic',
            }
            const tBefore = useAppStore.getState().liveTranscript
            useAppStore.getState().pushTranscriptBreak(tBefore.length)
            useAppStore.getState().addDetectedVerse(detected)
            useAppStore.getState().addToVerseHistory({
              reference: topPhrase.reference,
              text: topPhrase.text,
              translation: state.selectedTranslation,
              book: topPhrase.book,
              chapter: topPhrase.chapter,
              verseStart: topPhrase.verseStart,
            })
            state.setDetectionStatus('detected')
          }
        } catch {
          /* defensive — index build failure must not break the rest of the pipeline */
        }
      }

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
            // v0.7.184.2 — RE-MENTION NAVIGATOR FIRE on the keyword
            // text-search (sticky-live) path. When the top hit IS
            // already in one of the dedupe sets, the if-block below
            // skips column add (correct) but pre-v0.7.184.2 also
            // silently skipped navigator update. Fire it here so a
            // re-quoted paraphrase still routes the Chapter Navigator
            // back to the matched verse.
            if (top && (willHandleBelow || processedTextHitsRef.current.has(top.reference))) {
              try { useAppStore.getState().requestNavigatorRef(top.reference) } catch { /* defensive */ }
            }
            if (top && !willHandleBelow && !processedTextHitsRef.current.has(top.reference)) {
              // v0.7.73 — Raised minSim 0.32/0.40 → 0.55/0.60. The
              // previous floor matched any verse sharing two content
              // words with the spoken tail, which is why "thank you for
              // coming today" could surface a verse about thanksgiving.
              // 0.55+ requires a real overlap of distinctive words, so
              // only actual quotations (or close paraphrases) survive
              // this gate. Attribution still gets the small handicap
              // because the preacher has explicitly signalled scripture.
              const minSim = hasAttribution ? 0.55 : 0.60
              if (sim < minSim) {
                /* not a real quotation — drop silently */
              } else {
                processedTextHitsRef.current = new Set(processedTextHitsRef.current).add(top.reference)
                const baseConf = Math.min(1, 0.5 + (sim - minSim) * 0.83)
                const confidence = hasAttribution ? Math.min(1, baseConf + 0.08) : baseConf
                // v0.7.104 — Keyword text-search hits are paraphrase
                // matches → semantic pipeline (column 2). Sub-0.60
                // confidence will be re-routed to the suggestions
                // column by the UI selector.
                const detected: DetectedVerse = {
                  id: `det-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                  reference: top.reference,
                  text: top.text,
                  translation: top.translation,
                  detectedAt: new Date(),
                  confidence,
                  // v0.7.114 — Was `< 0.6` which demoted 0.55-0.59
                  // hits to the Suggested Verses column even though
                  // they cleared SEMANTIC_AUTO_LIVE_MIN.
                  // v0.7.127 — Moved 0.55 → 0.50 to track the new
                  // SEMANTIC_AUTO_LIVE_MIN (lowered to close the
                  // 50–54 % dead gap; see verse-auto-live.ts comment
                  // block). Operator: same complaint pattern, one
                  // band lower — "Suggested Verses keeps catching
                  // 50–54 % detections even though the column says
                  // 10–49%". This keeps tag-floor == column-floor so
                  // there's no slot a detection can fall through.
                  source: confidence < 0.5 ? 'suggestion' : 'semantic',
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
                // v0.7.105 — REMOVED inline auto-go-live block.
                // Keyword-search semantic hits now route through
                // the centralized stability gate in logos-shell.tsx
                // via the 'semantic' source tag set above (or
                // 'suggestion' when confidence < 0.6). The
                // pre-v0.7.105 inline path here fired at the
                // operator's autoLiveThreshold (default 0.78) with
                // no stability requirement.
              }
            }
          }
        } catch {
          /* ignore search failures */
        }
      }

      // ── v0.7.60 — Live AI semantic-match (paraphrase recovery) ─
      // Runs in the SAME throttle window as the keyword search above
      // so a chatty transcript can't double-burn API quota. Where
      // the keyword search wants a stripped, high-signal query, the
      // semantic matcher wants the natural recent phrasing — so we
      // pass the raw `recentText` (which already has the operator-
      // preamble stripped inside the matcher itself).
      //
      // Tier routing:
      //   • score ≥ 0.50 → live-eligible (addDetectedVerse + auto-
      //     live if autoLiveOn). Auto-live only fires for the SINGLE
      //     best match each call so we never push two competing
      //     paraphrases at once.
      //   • 0.20 ≤ score < 0.50 → candidates bucket only (operator
      //     must click to promote; never auto-live).
      //   • score < 0.20 → drop (noise floor).
      //
      // We dedupe per-reference inside this hook AND inside
      // addDetectedVerseCandidate (which skips already-present refs)
      // so the same suggestion can't pile up across chunks.
      // v0.7.169 — Lowered 1500 → 1000 ms after operator reported the
      // AI detector felt slow. 1500 ms throttle meant up to a 1.5 s
      // gap between consecutive semantic-match probes during a fast
      // sermon, which left visible dead-air on the "Bible Reference
      // Quoted" column. 1000 ms still rate-limits the OpenAI semantic
      // endpoint (~1 req/sec/seat is comfortable headroom under the
      // gpt-4o-mini ceiling) while doubling responsiveness perception.
      // v0.7.253 — Lowered 1000 → 600 ms. Operator: "make the LLM and
      // AI search faster and smoother; AI Detector should listen sharp
      // and fast detection with no delays." 600 ms still rate-limits
      // the semantic-match endpoint (~1.6 req/s/seat — well under the
      // gpt-4o-mini ceiling) while cutting paraphrase-detection
      // dead-air ~40%. Phrase-index throttle was lowered to 120 ms
      // (free in-memory n-gram lookup) and the text-search throttle
      // was lowered to 350/550 ms in the same release.
      const SEMANTIC_THROTTLE_MS = 600
      if (
        allWords.length >= minWords &&
        keywords.length >= minKeywords &&
        now - lastSemanticAtRef.current > SEMANTIC_THROTTLE_MS
      ) {
        lastSemanticAtRef.current = now
        try {
          const semResp = await fetch('/api/scripture/semantic-match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: recentText,
              topK: 5,
              includeLow: true, // we want the 0.20–0.49 band for the candidates column
            }),
          })
          if (semResp.ok) {
            const semJson = (await semResp.json()) as {
              ok: boolean
              matches?: Array<{
                reference: string
                book: string
                chapter: number
                verseStart: number
                verseEnd?: number
                text: string
                score: number
              }>
            }
            if (semJson.ok && Array.isArray(semJson.matches) && semJson.matches.length) {
              const tx = state.selectedTranslation
              // v0.7.116 — Cap fused multi-fire. Pre-116 the loop
              // pushed EVERY semantic match (topK=5) above the noise
              // floor, so a single chunk of preaching that fuzzy-
              // matched 4 adjacent verses fired all 4 — flooding the
              // detected list with "fused" results and confusing the
              // auto-live picker. Cap to the highest-scoring match per
              // chunk; the operator can still see lower-scored
              // candidates if they appear on subsequent chunks.
              const sortedMatches = [...semJson.matches].sort(
                (a, b) => b.score - a.score,
              )
              const cappedMatches = sortedMatches.slice(0, 1)
              for (const m of cappedMatches) {
                // v0.7.73 — Raised semantic noise floor 0.20 → 0.55.
                // Cosine similarity of 0.20–0.50 between the transcript
                // and a verse means "loosely related topic" not "the
                // speaker is quoting/paraphrasing this verse." Embedding
                // models cluster anything biblical into a tight subspace,
                // so even casual sermon talk lights up a dozen verses
                // in that band. Below 0.55 = drop entirely (don't show
                // as a candidate either — the operator was getting noise
                // suggestions for verses nobody mentioned).
                if (m.score < 0.55) continue
                // v0.7.184.2 — RE-MENTION NAVIGATOR FIRE on the AI
                // cosine-matcher (semantic) path. Three separate
                // dedupe checks suppress duplicate column adds; each
                // one now also fires the navigator so the operator's
                // re-mention re-routes the Chapter Navigator. Same
                // operator bug pattern as the v2/regex paths above.
                if (processedSemanticHitsRef.current.has(m.reference)) {
                  try { useAppStore.getState().requestNavigatorRef(m.reference) } catch { /* defensive */ }
                  continue
                }
                if (processedRefsRef.current.has(m.reference)) {
                  try { useAppStore.getState().requestNavigatorRef(m.reference) } catch { /* defensive */ }
                  continue
                }
                if (processedTextHitsRef.current.has(m.reference)) {
                  try { useAppStore.getState().requestNavigatorRef(m.reference) } catch { /* defensive */ }
                  continue
                }
                processedSemanticHitsRef.current.add(m.reference)

                // Re-fetch in operator's selected translation when
                // bundled, falling back to the canonical KJV text
                // from POPULAR_VERSES_KJV (which is what came back
                // in `m.text`). This mirrors the v2-detector path so
                // the projector slide always shows the operator's
                // translation pick when one is available.
                let textOut: string | null = null
                let translationOut: string = tx
                const vEnd = m.verseEnd ?? m.verseStart
                if (vEnd > m.verseStart) {
                  const r = lookupRange(m.book, m.chapter, m.verseStart, vEnd, tx)
                  if (r) textOut = r.text
                } else {
                  const r = lookupVerse(m.book, m.chapter, m.verseStart, tx)
                  if (r) textOut = r
                }
                if (!textOut && !isTranslationBundled(tx)) {
                  try {
                    const v = await fetchBibleVerse(m.reference, tx)
                    if (v) {
                      textOut = v.text
                      translationOut = v.translation
                    }
                  } catch { /* fall through */ }
                }
                if (!textOut) {
                  // Fall back to the KJV text the matcher used. The
                  // projector still gets a usable slide.
                  textOut = m.text
                  translationOut = 'KJV'
                }

                // v0.7.104 — AI cosine matcher hits are semantic by
                // definition. Score < 0.60 → suggestions column;
                // ≥ 0.60 → semantic live column (auto-fire still
                // requires ≥ 0.85 + 3-frame stability).
                const detected: DetectedVerse = {
                  id: `det-sem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                  reference: m.reference,
                  text: textOut,
                  translation: translationOut,
                  detectedAt: new Date(),
                  confidence: m.score,
                  // v0.7.114 — Lowered from `< 0.6` to `< 0.55` to
                  // match SEMANTIC_AUTO_LIVE_MIN.
                  // v0.7.127 — Lowered again 0.55 → 0.50 to track the
                  // new SEMANTIC_AUTO_LIVE_MIN (closes the 50–54 %
                  // dead gap). The 52 % Matthew 4:19 leak the
                  // operator screenshotted came through THIS path:
                  // m.score=0.52 was tagged 'suggestion' by the old
                  // `< 0.55` predicate AND fell outside the 10-49%
                  // suggestion band, so it appeared briefly via the
                  // (now-removed) source==='suggestion' bypass in
                  // suggestionsFor() then vanished. Tagging at <0.50
                  // keeps it in the semantic column where it belongs.
                  source: m.score < 0.5 ? 'suggestion' : 'semantic',
                }

                if (m.score >= threshold) {
                  // v0.7.73 — Auto-live now uses the operator's
                  // autoLiveThreshold (default 0.78 = high-confidence
                  // band). The 0.55–threshold band still surfaces as a
                  // candidate chip the operator can click; only strong
                  // semantic matches reach the projector automatically.
                  const tBefore = useAppStore.getState().liveTranscript
                  useAppStore.getState().pushTranscriptBreak(tBefore.length)
                  useAppStore.getState().addDetectedVerse(detected)
                  useAppStore.getState().addToVerseHistory({
                    reference: m.reference,
                    text: textOut,
                    translation: translationOut,
                    book: m.book,
                    chapter: m.chapter,
                    verseStart: m.verseStart,
                    verseEnd: m.verseEnd ?? undefined,
                  })
                  state.setDetectionStatus('detected')
                  // v0.7.105 — REMOVED inline auto-go-live block.
                  // AI cosine matcher hits now route through the
                  // centralized stability gate in logos-shell.tsx via
                  // the 'semantic' source tag set above (or
                  // 'suggestion' when score < 0.6). The pre-v0.7.105
                  // inline path here fired at the operator's
                  // autoLiveThreshold (default 0.78) with no
                  // stability requirement.
                } else {
                  // 0.20–0.49 band → candidates only. Operator must
                  // explicitly promote; never auto-live.
                  useAppStore.getState().addDetectedVerseCandidate(detected)
                }
              }
            }
          }
        } catch {
          /* network/quota errors fail open — the regex + keyword paths
             still get to run on subsequent chunks. */
        }
      }

      for (const detectedRef of detectedRefs) {
        const ref = detectedRef.reference
        if (processedRefsRef.current.has(ref) || processedTextHitsRef.current.has(ref)) {
          // v0.7.184.2 — RE-MENTION NAVIGATOR FIRE on the regex-detector
          // explicit-reference path. Same operator bug as the v2 path
          // above: a re-mentioned reference is dedupe-suppressed for
          // the column (correct) but the navigator silently stayed put
          // (wrong). Fire requestNavigatorRef before continuing so the
          // operator can flip to the re-mentioned verse instantly.
          try { useAppStore.getState().requestNavigatorRef(ref) } catch { /* defensive */ }
          continue
        }
        processedRefsRef.current.set(ref, Date.now())

        try {
          const verse = await fetchBibleVerse(ref, state.selectedTranslation)
          if (verse) {
            const t = useAppStore.getState().liveTranscript
            useAppStore.getState().pushTranscriptBreak(t.length)
            // v0.7.104 — Regex-based reference detector hits are
            // explicit address parses → column 1.
            const detected: DetectedVerse = {
              id: `det-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              reference: ref,
              text: verse.text,
              translation: state.selectedTranslation,
              detectedAt: new Date(),
              confidence: detectedRef.confidence,
              source: 'explicit',
            }

            useAppStore.getState().addDetectedVerse(detected)
            useAppStore.getState().setLiveVerse(verse)
            useAppStore.getState().addToVerseHistory(verse)
            // v0.7.105 — REMOVED inline auto-go-live block.
            // Regex-detected explicit references now route through
            // the centralized stability gate in logos-shell.tsx via
            // the 'explicit' source tag set above. The pre-v0.7.105
            // inline path here fired at the operator's
            // autoLiveThreshold (default 0.78, floor 0.50) with no
            // stability requirement.
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
  const stableProcessCallback = useCallback((text: string, confidence: number, isFinal?: boolean) => {
    processCallbackRef.current(text, confidence, isFinal)
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
      // v0.7.60 — Reset semantic-match dedupe so a fresh service
      // doesn't carry over yesterday's accepted suggestions.
      processedSemanticHitsRef.current = new Set()
      lastSemanticAtRef.current = 0
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
      // v0.7.60 — Reset semantic dedupe on transcript reset too.
      processedSemanticHitsRef.current = new Set()
      lastSemanticAtRef.current = 0
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
      // v0.7.110 — Removed the explicit switchThreshold: 0.20 override
      // that masked the new bigram defaults (0.10 / 0.04). The hard-
      // coded 0.20 was the production cause of "speaker-follow does
      // nothing" — virtually no preacher paraphrase ever scored that
      // high on the trigram model, let alone bigram. Falls back to
      // speaker-follow.ts defaults: switchThreshold 0.10, minDelta
      // 0.04, antiRewindMs 1500.
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
