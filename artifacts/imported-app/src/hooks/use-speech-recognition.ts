'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

interface UseSpeechRecognitionReturn {
  isListening: boolean
  transcript: string
  interimTranscript: string
  isSupported: boolean
  error: string | null
  startListening: (onResult?: (text: string) => void) => void
  stopListening: () => void
  resetTranscript: () => void
}

// Type for Web Speech Recognition
type SpeechRecognitionInstance = {
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  onstart: ((ev: Event) => void) | null
  onresult: ((ev: { results: { isFinal: boolean; 0: { transcript: string } }[]; resultIndex: number }) => void) | null
  onerror: ((ev: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance

export function useSpeechRecognition(): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const onResultCallbackRef = useRef<((text: string) => void) | undefined>(undefined)
  const shouldKeepListeningRef = useRef(false)
  const manualStopRef = useRef(false)
  const restartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fullTranscriptRef = useRef('')
  // Track the next index of `event.results` we still need to commit to the
  // running transcript. Web Speech keeps the same array across `onresult`
  // events with `continuous: true` + `interimResults: true`, so without this
  // guard the same finals get appended on every event — which is exactly
  // what produced the "John 6:6 John 6:6 John 6:6 …" tower bug.
  const processedFinalIndexRef = useRef(0)
  // Use a ref to hold the restart logic so we avoid circular callback references
  const scheduleRestartRef = useRef<() => void>(() => {})

  const getSpeechRecognition = useCallback((): SpeechRecognitionConstructor | null => {
    if (typeof window === 'undefined') return null
    const SR = (window as Record<string, unknown>).SpeechRecognition
      || (window as Record<string, unknown>).webkitSpeechRecognition
    return SR as SpeechRecognitionConstructor | null
  }, [])

  const isSupported = typeof window !== 'undefined' && !!getSpeechRecognition()

  const resetTranscript = useCallback(() => {
    setTranscript('')
    setInterimTranscript('')
    fullTranscriptRef.current = ''
    processedFinalIndexRef.current = 0
  }, [])

  // ── Shared event handlers (used by both startListening and the restart
  // path) — keeping them in one place avoids the bug where one branch was
  // patched and the other silently kept the old logic.
  const handleResult = useCallback((event: { results: { isFinal: boolean; 0: { transcript: string } }[]; resultIndex: number }) => {
    // Append only finals we haven't committed yet — fixes the "John 6:6
    // John 6:6 John 6:6 …" repeating-tower bug.
    while (
      processedFinalIndexRef.current < event.results.length &&
      event.results[processedFinalIndexRef.current].isFinal
    ) {
      const finalText = event.results[processedFinalIndexRef.current][0].transcript.trim()
      if (finalText) {
        fullTranscriptRef.current += finalText + ' '
        const cb = onResultCallbackRef.current
        if (cb) cb(finalText)
      }
      processedFinalIndexRef.current += 1
    }
    // Build the live interim from any results past the committed pointer
    // that haven't gone final yet.
    let interim = ''
    for (let i = processedFinalIndexRef.current; i < event.results.length; i++) {
      if (!event.results[i].isFinal) interim += event.results[i][0].transcript
    }
    setTranscript(fullTranscriptRef.current.trim())
    setInterimTranscript(interim.trim())
  }, [])

  const handleError = useCallback((event: { error: string }) => {
    const err = event.error
    if (err === 'no-speech' || err === 'aborted') return
    if (err === 'not-allowed') {
      setError('Microphone access denied. Please allow microphone permissions.')
      manualStopRef.current = true
      shouldKeepListeningRef.current = false
      setIsListening(false)
      return
    }
    if (err === 'audio-capture') {
      setError('No microphone found. Please connect a microphone.')
      manualStopRef.current = true
      setIsListening(false)
      return
    }
    console.warn(`Speech recognition error: ${err}, auto-restarting...`)
    setError(null)
  }, [])

  const handleEnd = useCallback(() => {
    setIsListening(false)
    if (shouldKeepListeningRef.current && !manualStopRef.current) {
      // A new recognition instance restarts with a fresh `event.results`
      // array, so reset our committed-finals pointer to 0.
      processedFinalIndexRef.current = 0
      scheduleRestartRef.current()
    }
  }, [])

  // Set up the schedule restart ref once
  useEffect(() => {
    scheduleRestartRef.current = () => {
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current)
      }
      restartTimeoutRef.current = setTimeout(() => {
        if (shouldKeepListeningRef.current && !manualStopRef.current) {
          const SR = getSpeechRecognition()
          if (SR) {
            try {
              const recognition = new SR()
              recognition.continuous = true
              recognition.interimResults = true
              recognition.lang = 'en-US'
              recognition.maxAlternatives = 1

              recognition.onstart = () => {
                setIsListening(true)
                setError(null)
              }

              recognition.onresult = handleResult
              recognition.onerror = handleError
              recognition.onend = handleEnd

              recognitionRef.current = recognition
              recognition.start()
            } catch (err) {
              console.error('Failed to restart speech recognition:', err)
            }
          }
        }
      }, 300)
    }
    return () => {
      if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current)
    }
  }, [getSpeechRecognition])

  const startListening = useCallback((onResult?: (text: string) => void) => {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setError('Speech recognition requires a secure connection (HTTPS). Try opening in a new browser tab.')
      return
    }

    const SpeechRecognition = getSpeechRecognition()
    if (!isSupported || !SpeechRecognition) {
      setError('Speech recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.')
      return
    }

    setError(null)
    manualStopRef.current = false
    shouldKeepListeningRef.current = true
    onResultCallbackRef.current = onResult
    processedFinalIndexRef.current = 0

    try {
      const recognition = new SpeechRecognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'en-US'
      recognition.maxAlternatives = 1

      recognition.onstart = () => {
        setIsListening(true)
        setError(null)
      }

      recognition.onresult = handleResult
      recognition.onerror = handleError
      recognition.onend = handleEnd

      recognitionRef.current = recognition
      recognition.start()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(`Failed to start speech recognition: ${msg}`)
      setIsListening(false)
    }
  }, [isSupported, getSpeechRecognition])

  const stopListening = useCallback(() => {
    manualStopRef.current = true
    shouldKeepListeningRef.current = false

    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current)
      restartTimeoutRef.current = null
    }

    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch { /* already stopped */ }
      recognitionRef.current = null
    }
    setIsListening(false)
  }, [])

  useEffect(() => {
    return () => {
      manualStopRef.current = true
      shouldKeepListeningRef.current = false
      if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current)
      if (recognitionRef.current) {
        try { recognitionRef.current.abort() } catch { /* cleanup */ }
      }
    }
  }, [])

  return {
    isListening,
    transcript,
    interimTranscript,
    isSupported,
    error,
    startListening,
    stopListening,
    resetTranscript,
  }
}
