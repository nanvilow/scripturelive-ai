'use client'

import { useEffect, useCallback, useRef } from 'react'
import { useSpeechRecognition } from '@/hooks/use-speech-recognition'
import { useAppStore } from '@/lib/store'
import { detectVersesInTextWithScore, fetchBibleVerse } from '@/lib/bible-api'
import type { BibleSearchHit } from '@/lib/bible-api'
import type { DetectedVerse } from '@/lib/store'
import { toast } from 'sonner'

/**
 * SpeechProvider - Persistent speech recognition that survives view navigation.
 *
 * This component wraps the entire app and manages the Web Speech API lifecycle.
 * It syncs transcript/state to the Zustand store so any view can access it.
 * Verse detection and auto go-live processing happen here, ensuring they work
 * even when the user is on a different page/tab.
 */
export function SpeechProvider({ children }: { children: React.ReactNode }) {
  const {
    transcript: hookTranscript,
    interimTranscript: hookInterim,
    isListening: hookListening,
    isSupported: hookSupported,
    error: hookError,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition()

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
    const tokenize = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9\s']/g, ' ').split(/\s+/)
        .filter((w) => w.length > 2 && !STOP.has(w))
    const verseWords = tokenize(verse)
    if (!verseWords.length) return 0
    const spokenSet = new Set(tokenize(spoken))
    let hit = 0
    for (const w of verseWords) if (spokenSet.has(w)) hit++
    return hit / verseWords.length
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
      const tailWords = allWords.slice(-14)
      const keywords = tailWords.filter((w) => !STOPWORDS.has(w) && w.length > 2).slice(-6)
      const tail = keywords.join(' ')
      const now = Date.now()
      if (
        references.length === 0 &&
        allWords.length >= 4 &&
        keywords.length >= 3 &&
        now - lastTextSearchAtRef.current > 800
      ) {
        lastTextSearchAtRef.current = now
        try {
          const params = new URLSearchParams({ search: tail, translation: state.selectedTranslation })
          const r = await fetch(`/api/bible?${params.toString()}`)
          if (r.ok) {
            const { hits } = (await r.json()) as { hits: BibleSearchHit[] }
            const top = hits?.[0]
            if (top && !processedTextHitsRef.current.has(top.reference)) {
              // Verify the keyword hit by measuring how much of the
              // matched verse text actually appears in the recently
              // spoken transcript. This is the gate that turns a fuzzy
              // search into a confirmed quotation.
              const recentSpoken = allWords.slice(-40).join(' ')
              const sim = verseTextSimilarity(recentSpoken, top.text)
              // Only surface the match at all if the speaker quoted at
              // least ~40% of the verse's distinctive content words.
              // Below that the search hit is almost always a false
              // positive (a stray "God", "love", etc.) and would
              // clutter the Detected Verses panel with junk.
              if (sim < 0.4) {
                /* not a real quotation — drop silently */
              } else {
                processedTextHitsRef.current = new Set(processedTextHitsRef.current).add(top.reference)
                const detected: DetectedVerse = {
                  id: `det-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                  reference: top.reference,
                  text: top.text,
                  translation: top.translation,
                  detectedAt: new Date(),
                  // Map similarity (0.4..1.0) to confidence (0.5..1.0)
                  // so the accuracy bar reflects how cleanly the
                  // spoken phrase matched the underlying verse.
                  confidence: Math.min(1, 0.5 + (sim - 0.4) * 0.83),
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
        if (processedRefsRef.current.has(ref)) continue
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

  // ── Handle speech commands from store (start / stop / reset) ───────
  useEffect(() => {
    if (speechCommand === 'start') {
      processedRefsRef.current = new Set()
      // If the user picked a specific mic, claim it via getUserMedia first.
      // Browsers' Web Speech API doesn't expose deviceId directly, but
      // acquiring the chosen input device prompts the OS / browser to route
      // recognition through it. We then immediately release the stream so we
      // don't hold the mic open in parallel.
      const chosenId = useAppStore.getState().selectedMicrophoneId
      const beginRecognition = () => {
        startListening(stableProcessCallback)
        setSpeechCommand(null)
      }
      if (chosenId && typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
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
