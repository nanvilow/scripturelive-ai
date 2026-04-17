'use client'

import { useEffect, useCallback, useRef } from 'react'
import { useSpeechRecognition } from '@/hooks/use-speech-recognition'
import { useAppStore } from '@/lib/store'
import { detectVersesInText, fetchBibleVerse } from '@/lib/bible-api'
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

  // Update the ref in an effect (not during render) to satisfy ESLint react-hooks/refs
  useEffect(() => {
    processCallbackRef.current = async (text: string) => {
      if (!text.trim()) return

      const references = detectVersesInText(text)
      const state = useAppStore.getState()

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
      startListening(stableProcessCallback)
      setSpeechCommand(null)
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
