'use client'

import { useEffect, useCallback, useRef } from 'react'
import { useSpeechRecognition } from '@/hooks/use-speech-recognition'
// v0.5.35 — Whisper hook replaced by Deepgram streaming. The
// public hook interface is unchanged; only the underlying engine
// switched from chunked OpenAI Whisper to real-time Deepgram
// Nova-3 streaming via the api-server WebSocket proxy. The old
// `use-whisper-speech-recognition.ts` file is intentionally kept
// in the repo as a fallback we can wire back in via env if needed.
import { useDeepgramStreaming as useWhisperSpeechRecognition } from '@/hooks/use-deepgram-streaming'
import { useAppStore } from '@/lib/store'

// Detected once at module load — userAgent is stable for the session,
// so React's Rules of Hooks are satisfied (we always call BOTH engine
// hooks in the same order; we just only drive ONE of them).
const IS_ELECTRON =
  typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent)

// v0.5.41 — pick the Deepgram streaming engine whenever the deployment
// has a streaming endpoint configured (which now includes the Replit
// dev workspace via REPLIT_DEV_FALLBACK in /api/transcribe-stream/info).
// Browsers' Web Speech API was the only choice in v0.5.40 for non-
// Electron contexts, but it silently fails in sandboxed iframes (the
// Replit preview pane is one) — operators saw "no transcription, no
// detection" with no log. Deepgram works in both Electron AND the dev
// preview because the proxy is server-hosted and reachable via wss
// from any origin. NEXT_PUBLIC_FORCE_BROWSER_SPEECH=1 escapes back to
// the legacy Web Speech path if you ever need it.
const FORCE_BROWSER_SPEECH =
  typeof process !== 'undefined' &&
  process.env?.NEXT_PUBLIC_FORCE_BROWSER_SPEECH === '1'
import { detectVersesInTextWithScore, fetchBibleVerse, PREACHER_ATTRIBUTION } from '@/lib/bible-api'
import type { BibleSearchHit } from '@/lib/bible-api'
import type { DetectedVerse } from '@/lib/store'

/**
 * SpeechProvider - Persistent speech recognition that survives view navigation.
 *
 * This component wraps the entire app and manages the Web Speech API lifecycle.
 * It syncs transcript/state to the Zustand store so any view can access it.
 * Verse detection and auto go-live processing happen here, ensuring they work
 * even when the user is on a different page/tab.
 */
export function SpeechProvider({ children }: { children: React.ReactNode }) {
  // Always call BOTH hooks in the same order — Rules of Hooks. We
  // pick which one drives the store based on IS_ELECTRON, which is
  // computed once at module load and never changes during a session.
  const browserEngine = useSpeechRecognition()
  const whisperEngine = useWhisperSpeechRecognition()
  // v0.5.41 — Deepgram is the primary engine in BOTH Electron and the
  // browser dev preview. Web Speech only kicks in when the operator
  // explicitly opts back in via NEXT_PUBLIC_FORCE_BROWSER_SPEECH=1.
  const active = FORCE_BROWSER_SPEECH ? browserEngine : whisperEngine
  void IS_ELECTRON // retained for future Electron-only branches
  const {
    transcript: hookTranscript,
    interimTranscript: hookInterim,
    isListening: hookListening,
    isSupported: hookSupported,
    error: hookError,
    startListening,
    stopListening,
    resetTranscript,
  } = active

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

  useEffect(() => {
    setSpeechSupported(hookSupported)
  }, [hookSupported, setSpeechSupported])

  useEffect(() => {
    setSpeechError(hookError)
  }, [hookError, setSpeechError])

  useEffect(() => {
    setIsListening(hookListening)
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
      // Bug #1B — drop the `references.length === 0` gate so we ALSO
      // run the fuzzy text-search snap when whisper *did* parse a
      // reference. This rescues the common pattern where the speaker
      // says the reference clearly ("Romans 8:2") but whisper garbles
      // the body ("Chri t Je u… law of in and death") — without this
      // the operator's congregation sees the noisy raw body, but with
      // it we substitute the canonical Bible text from the matched hit.
      //
      // Cross-path dedupe (architect feedback): we now seed the
      // text-search dedupe set with any references the explicit-
      // reference path will process below in the same chunk. That
      // way if whisper extracted "Romans 8:2" AND text-search finds
      // the same canonical "Romans 8:2", only one path commits — the
      // explicit-reference loop, which has the better confidence.
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
            // Pick the candidate that the spoken text most closely
            // matches — not just the first keyword hit. Bolls returns
            // hits in keyword-frequency order, but for paraphrases the
            // best lexical match isn't always #1. Re-rank by content-
            // word overlap with the recent transcript.
            const recentSpoken = recentText
            type Ranked = { hit: BibleSearchHit; sim: number }
            const ranked: Ranked[] = (hits || [])
              .map((h) => ({ hit: h, sim: verseTextSimilarity(recentSpoken, h.text) }))
              .sort((a, b) => b.sim - a.sim)
            const best = ranked[0]
            const top = best?.hit
            const sim = best?.sim ?? 0
            // Cross-path dedupe: if the explicit-reference loop
            // below is already going to handle this same reference
            // (e.g., whisper got the citation right but the body
            // was garbled), skip the text-search commit so we don't
            // double-add to Detected Verses / Verse History or
            // potentially auto-live twice.
            const willHandleBelow = top
              ? references.includes(top.reference) ||
                processedRefsRef.current.has(top.reference)
              : false
            if (top && !willHandleBelow && !processedTextHitsRef.current.has(top.reference)) {
              // Threshold is relaxed to 0.32 when an attribution
              // phrase preceded the candidate — paraphrasing styles
              // ("the Word of God tells us that we are more than
              // conquerors" vs Romans 8:37) often only share 35-40%
              // of content words but the attribution makes it a
              // confident match. Cold matches still need 0.4 to
              // avoid flooding the panel with junk.
              const minSim = hasAttribution ? 0.32 : 0.4
              if (sim < minSim) {
                /* not a real quotation — drop silently */
              } else {
                processedTextHitsRef.current = new Set(processedTextHitsRef.current).add(top.reference)
                // Attribution phrases give a small confidence bonus
                // since the speaker explicitly framed the line as
                // scripture — that's strong evidence even when the
                // word-overlap is moderate.
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
                // Auto-live a text-search hit ONLY when the speaker
                // quoted the verse very closely (≥85% of content words).
                // Example: "In the beginning God created heaven and
                // earth" vs Genesis 1:1 — passes. A passing keyword
                // collision will not.
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
        // Architect feedback (round 2) — also dedupe against the
        // text-search committed set, otherwise an earlier text-search
        // hit for R followed by a later invocation that explicitly
        // parses R would commit R twice (once per path). Keeping the
        // sets separate is fine for diagnostics but the skip clause
        // here treats them as a unified "already handled this session"
        // membership check.
        if (processedRefsRef.current.has(ref) || processedTextHitsRef.current.has(ref)) continue
        processedRefsRef.current = new Set(processedRefsRef.current).add(ref)

        try {
          const verse = await fetchBibleVerse(ref, state.selectedTranslation)
          if (verse) {
            // Mark the current transcript length as a paragraph break.
            // Each detected scripture pushes a break point so the Live
            // Transcription pane visually starts a new paragraph for
            // every detection. We don't mutate the transcript string
            // itself because the speech hook re-emits the full text on
            // every audio chunk and would clobber any inline markers.
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
            // Suppressed per FRS — Detected Verses panel is the source of truth.

            // Auto go-live ONLY when ALL of these hold:
            //   1. Operator has AUTO enabled
            //   2. Confidence ≥ threshold (default 90%)
            //   3. The speaker actually said an explicit verse number
            //      ("John 3:16" / "John chapter 3 verse 16"), not just
            //      a book + chapter.
            // Bare book-and-chapter references (e.g. "John 3") still
            // land in the Detected Verses panel as a suggestion but
            // never auto-display, so the congregation never sees a
            // partial reference that might not match the speaker's
            // intent.
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
              // Suppressed per FRS — live pill is the source of truth.
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

  // Keep the global mic-id mirror in sync so the Whisper engine can
  // see it (it's hookless and reads window.__selectedMicrophoneId).
  const selectedMicId = useAppStore((s) => s.selectedMicrophoneId)
  useEffect(() => {
    if (typeof window === 'undefined') return
    ;(window as unknown as { __selectedMicrophoneId?: string | null }).__selectedMicrophoneId = selectedMicId
  }, [selectedMicId])

  // ── Handle speech commands from store (start / stop / reset) ───────
  useEffect(() => {
    if (speechCommand === 'start') {
      processedRefsRef.current = new Set()
      // If the user picked a specific mic, claim it via getUserMedia first.
      // Browsers' Web Speech API doesn't expose deviceId directly, but
      // acquiring the chosen input device prompts the OS / browser to route
      // recognition through it. We then immediately release the stream so we
      // don't hold the mic open in parallel. The Whisper engine reads the
      // device id from window.__selectedMicrophoneId itself.
      const chosenId = useAppStore.getState().selectedMicrophoneId
      const beginRecognition = () => {
        startListening(stableProcessCallback)
        setSpeechCommand(null)
      }
      if (!IS_ELECTRON && chosenId && typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
        navigator.mediaDevices
          .getUserMedia({ audio: { deviceId: { exact: chosenId } } })
          .then((stream) => {
            stream.getTracks().forEach((t) => t.stop())
            beginRecognition()
          })
          .catch(() => {
            // Fall back to system default if the chosen mic is unavailable.
            beginRecognition()
          })
      } else {
        beginRecognition()
      }
    } else if (speechCommand === 'stop') {
      stopListening()
      setSpeechCommand(null)
    } else if (speechCommand === 'reset') {
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
