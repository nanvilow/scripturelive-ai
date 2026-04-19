'use client'

import { useEffect, useCallback, useRef } from 'react'
import { useSpeechRecognition } from '@/hooks/use-speech-recognition'
import { useAppStore } from '@/lib/store'
import { detectVersesInText, fetchBibleVerse } from '@/lib/bible-api'
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

  // Update the ref in an effect (not during render) to satisfy ESLint react-hooks/refs
  useEffect(() => {
    processCallbackRef.current = async (text: string) => {
      if (!text.trim()) return

      const references = detectVersesInText(text)
      const state = useAppStore.getState()

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
              processedTextHitsRef.current = new Set(processedTextHitsRef.current).add(top.reference)
              const detected: DetectedVerse = {
                id: `det-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                reference: top.reference,
                text: top.text,
                translation: top.translation,
                detectedAt: new Date(),
                confidence: 0.75,
              }
              useAppStore.getState().addDetectedVerse(detected)
              useAppStore.getState().addToVerseHistory({
                reference: top.reference,
                text: top.text,
                translation: top.translation,
                book: top.book,
                chapter: top.chapter,
                verseStart: top.verse,
              })
              toast.success(`Heard passage: ${top.reference}`)
              if (state.settings.autoGoLiveOnDetection) {
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
        } catch {
          /* ignore search failures */
        }
      }

      for (const ref of references) {
        if (processedRefsRef.current.has(ref)) continue
        processedRefsRef.current = new Set(processedRefsRef.current).add(ref)

        try {
          const verse = await fetchBibleVerse(ref, state.selectedTranslation)
          if (verse) {
            const detected: DetectedVerse = {
              id: `det-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              reference: ref,
              text: verse.text,
              translation: state.selectedTranslation,
              detectedAt: new Date(),
              confidence: 0.9,
            }

            useAppStore.getState().addDetectedVerse(detected)
            useAppStore.getState().setLiveVerse(verse)
            useAppStore.getState().addToVerseHistory(verse)
            toast.success(`Detected: ${ref}`)

            // Auto go-live if enabled (read latest state to avoid stale closures)
            const latestState = useAppStore.getState()
            if (latestState.settings.autoGoLiveOnDetection) {
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
              toast.success('Auto-detected verse sent to Live Presenter')
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
