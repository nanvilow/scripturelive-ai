'use client'

import { useEffect, useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
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
import { useSpeechRecognition } from '@/hooks/use-speech-recognition'
import { useAppStore } from '@/lib/store'
import { detectVersesInTextWithScore, fetchBibleVerse, PREACHER_ATTRIBUTION } from '@/lib/bible-api'
import type { BibleSearchHit } from '@/lib/bible-api'
import type { DetectedVerse } from '@/lib/store'

type EngineName = 'deepgram' | 'whisper' | 'browser'

// Ordered fallback chain. Index 0 is the preferred engine. nextEngine
// returns the name of the next engine in the chain, or null if we're
// at the end.
const ENGINE_CHAIN: EngineName[] = ['deepgram', 'whisper', 'browser']
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
  browser: 'browser speech engine',
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
  const brEngine = useSpeechRecognition()

  // Currently active engine. Defaults to Deepgram (best accuracy +
  // lowest latency); the auto-fallback effect below advances it
  // through ENGINE_CHAIN whenever the active engine surfaces a
  // structural error within the post-start window.
  const [activeEngine, setActiveEngine] = useState<EngineName>('deepgram')
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
  const lastCallbackRef = useRef<((text: string) => void) | null>(null)
  // One-shot guards so each handoff toast only fires once per
  // session and direction (e.g. dg->whisper toast, whisper->browser
  // toast).
  const announcedHandoffsRef = useRef<Set<string>>(new Set())

  // Read from whichever engine is currently active. All three hooks
  // expose the identical surface (verified at compile time by the
  // shared destructure below — TS errors here would mean a hook
  // signature drift).
  const engine =
    activeEngine === 'deepgram'
      ? dgEngine
      : activeEngine === 'whisper'
      ? wsEngine
      : brEngine
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

  // ── Sync hook state → store (so any view can read it) ──────────────
  useEffect(() => {
    setLiveTranscript(hookTranscript)
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
        '  browserSupported =',
        brEngine.isSupported,
        '  active =',
        activeEngine,
      )
    }
  }, [dgEngine.isSupported, wsEngine.isSupported, brEngine.isSupported, activeEngine, setSpeechSupported])

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
    // Pick the live engine handle for the current active name. We
    // index off this rather than dgEngine directly so the same
    // effect handles each step in the chain.
    const liveEngine =
      activeEngine === 'deepgram' ? dgEngine : activeEngine === 'whisper' ? wsEngine : brEngine

    if (!liveEngine.error) return
    const since = Date.now() - startedAtRef.current
    if (startedAtRef.current === 0 || since > 8_000) return
    if (!isStructuralError(activeEngine, liveEngine.error)) return

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
      const candidate = chosen === 'deepgram' ? dgEngine : chosen === 'whisper' ? wsEngine : brEngine
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
    const cb = lastCallbackRef.current
    const nextHandle = chosen === 'deepgram' ? dgEngine : chosen === 'whisper' ? wsEngine : brEngine
    setTimeout(() => {
      try {
        // eslint-disable-next-line no-console
        console.log(`[SpeechProvider] -> ${chosen}.startListening() (fallback)`)
        nextHandle.startListening(cb ?? undefined)
        startedAtRef.current = Date.now()
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(`[SpeechProvider] ${chosen} fallback start failed:`, e)
      }
    }, 0)

    const handoffKey = `${from}->${chosen}`
    if (!announcedHandoffsRef.current.has(handoffKey)) {
      announcedHandoffsRef.current.add(handoffKey)
      const copy = fallbackToastCopy(from, chosen)
      toast.message(copy.title, {
        description: copy.description,
        duration: 6000,
      })
    }
  }, [activeEngine, dgEngine, wsEngine, brEngine])

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
  const processedRefsRef = useRef<Set<string>>(new Set())

  // Use a ref-based callback so the hook always calls the latest version
  const processCallbackRef = useRef<(text: string) => Promise<void>>(async () => {})

  // Track the spoken-text searches we've already attempted so we don't spam
  // the search API every couple of words as the transcript grows.
  const lastTextSearchAtRef = useRef<number>(0)
  const processedTextHitsRef = useRef<Set<string>>(new Set())

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
    processCallbackRef.current = async (text: string) => {
      if (!text.trim()) return

      const detectedRefs = detectVersesInTextWithScore(text)
      const references = detectedRefs.map((r) => r.reference)
      const state = useAppStore.getState()
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
        processedRefsRef.current = new Set(processedRefsRef.current).add(ref)

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
  const stableProcessCallback = useCallback((text: string) => {
    processCallbackRef.current(text)
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
      processedRefsRef.current = new Set()
      // v0.5.44 — track WHEN we started so the auto-fallback effect
      // can scope its 8 s WS-failure window, and remember the
      // callback so the fallback path can re-arm it on the browser
      // engine without losing transcript routing.
      lastCallbackRef.current = stableProcessCallback
      startedAtRef.current = Date.now()
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
      processedRefsRef.current = new Set()
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

  return <>{children}</>
}
