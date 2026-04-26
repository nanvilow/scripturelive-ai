'use client'

import { useEffect, useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
// v0.5.44 — DUAL-ENGINE WITH AUTO-FALLBACK.
//
// Field report after v0.5.42/43 shipped: the dev preview throws WS
// 1006 ("WebSocket could not be established") when the operator
// clicks the mic, because the Replit iframe proxy's WS upgrade is
// flaky for the api-server's /api/transcribe-stream route. Operators
// running the packaged Electron build get a clean Deepgram path
// (api-server is on localhost:3001 and the upgrade handler is
// always reachable), but anyone testing in a browser through a
// reverse proxy could see the silent-mic experience.
//
// v0.5.44 mounts BOTH engines:
//   - Deepgram streaming (preferred, server-grade accuracy + interim)
//   - Web Speech API (browser-native, works without WSS)
// On startListening:
//   1. We try Deepgram first.
//   2. If Deepgram surfaces an error containing "WebSocket" /
//      "1006" / "connection failed" within 4 s, we automatically
//      stop Deepgram and restart with the browser engine, then
//      surface a one-time toast so the operator knows the
//      fallback engaged.
//   3. The active engine name is mirrored into the store as
//      `speechEngine` ('deepgram' | 'browser') for any UI that
//      wants to badge it.
// Once a session has fallen back, we remember that for the rest of
// the session so we don't keep retrying Deepgram and bouncing the
// audio graph. The operator can force a retry by toggling the mic
// off and on again from a fresh page load.
import { useDeepgramStreaming } from '@/hooks/use-deepgram-streaming'
import { useSpeechRecognition } from '@/hooks/use-speech-recognition'
import { useAppStore } from '@/lib/store'
import { detectVersesInTextWithScore, fetchBibleVerse, PREACHER_ATTRIBUTION } from '@/lib/bible-api'
import type { BibleSearchHit } from '@/lib/bible-api'
import type { DetectedVerse } from '@/lib/store'

type EngineName = 'deepgram' | 'browser'

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
  // ── Both engines mounted unconditionally ───────────────────────────
  // Mounting both is cheap — neither opens the mic or any WebSocket
  // until startListening() is called. Reading from both on every
  // render does mean we re-render slightly more, which is acceptable.
  const dgEngine = useDeepgramStreaming()
  const brEngine = useSpeechRecognition()

  // Currently active engine. Defaults to Deepgram (better accuracy);
  // auto-flips to 'browser' if Deepgram fails to establish a WS in
  // the user's environment (e.g. behind a reverse proxy that doesn't
  // forward Upgrade headers).
  const [activeEngine, setActiveEngine] = useState<EngineName>('deepgram')
  // Once we've fallen back this session, stay fallen back. Avoids the
  // "keep trying Deepgram, audio graph thrashes every time" loop.
  const fallenBackRef = useRef(false)
  // Timestamp of the most recent startListening() — used to scope the
  // 4 s fallback window so we don't auto-fall-back days later when an
  // unrelated network blip happens to mention "WebSocket".
  const startedAtRef = useRef(0)
  // Holds the latest stableProcessCallback so the fallback path can
  // re-arm browser.startListening with the same transcript handler.
  const lastCallbackRef = useRef<((text: string) => void) | null>(null)
  // One-shot guard so the "switched to browser" toast only fires once
  // per session.
  const announcedFallbackRef = useRef(false)

  const engine = activeEngine === 'deepgram' ? dgEngine : brEngine
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
        '[SpeechProvider] dual-engine: deepgramSupported =',
        dgEngine.isSupported,
        '  browserSupported =',
        brEngine.isSupported,
        '  active =',
        activeEngine,
      )
    }
  }, [dgEngine.isSupported, brEngine.isSupported, activeEngine, setSpeechSupported])

  // ── Auto-fallback: Deepgram WS failure → browser engine ────────────
  // We watch the Deepgram engine's error stream while the active
  // engine is still Deepgram. If, within 4 s of starting, the error
  // mentions WebSocket / 1006 / "connection failed" / "could not be
  // established", we treat that as a structural environment failure
  // (no WS upgrade, blocked port, etc.) and silently swap to the
  // browser engine. The operator sees a single toast + a console log
  // explaining the swap so this is never invisible.
  useEffect(() => {
    if (activeEngine !== 'deepgram') return
    if (fallenBackRef.current) return
    if (!dgEngine.error) return
    const since = Date.now() - startedAtRef.current
    if (startedAtRef.current === 0 || since > 8_000) return

    const err = dgEngine.error.toLowerCase()
    const isStructural =
      err.includes('websocket') ||
      err.includes('1006') ||
      err.includes('connection failed') ||
      err.includes('could not be established') ||
      err.includes('disconnected')
    if (!isStructural) return

    if (!brEngine.isSupported) {
      // No fallback available — leave the Deepgram error visible
      // so the operator knows what to fix.
      // eslint-disable-next-line no-console
      console.error('[SpeechProvider] Deepgram failed AND browser engine unavailable:', dgEngine.error)
      return
    }

    fallenBackRef.current = true
    // eslint-disable-next-line no-console
    console.warn(
      '[SpeechProvider] Deepgram failed (',
      dgEngine.error,
      ') — switching to browser engine and restarting.',
    )

    // Tear down Deepgram's audio graph + WS so the OS mic indicator
    // goes off and the dead engine stops re-emitting errors.
    try { dgEngine.stopListening() } catch { /* ignore */ }

    setActiveEngine('browser')

    // Re-arm the browser engine with the same callback the operator
    // last requested. We defer one tick so React commits the engine
    // swap before we fire startListening on the new instance.
    const cb = lastCallbackRef.current
    setTimeout(() => {
      try {
        // eslint-disable-next-line no-console
        console.log('[SpeechProvider] -> brEngine.startListening() (fallback)')
        brEngine.startListening(cb ?? undefined)
        startedAtRef.current = Date.now()
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[SpeechProvider] browser fallback start failed:', e)
      }
    }, 0)

    if (!announcedFallbackRef.current) {
      announcedFallbackRef.current = true
      toast.message('Live transcription switched to browser engine', {
        description:
          'Deepgram streaming is unreachable in this environment, so we automatically fell back to the browser speech engine. Detection and auto-go-live still work.',
        duration: 6000,
      })
    }
  }, [activeEngine, dgEngine, brEngine])

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
