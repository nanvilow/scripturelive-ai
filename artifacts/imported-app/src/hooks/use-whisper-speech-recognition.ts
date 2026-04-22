'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Whisper-based speech recognition hook for the desktop (Electron) build.
 *
 * Mirrors the interface of `useSpeechRecognition` (the browser Web Speech
 * implementation) so `SpeechProvider` can pick between the two without
 * caring which engine is active.
 *
 * Strategy:
 *   - Open the user's chosen microphone via getUserMedia.
 *   - Record overlapping ~5 s audio chunks with MediaRecorder (webm/opus
 *     when available, mp4 on Safari).
 *   - POST each chunk to /api/transcribe (server-side OpenAI Whisper).
 *   - Stitch returned text into a running transcript and emit each
 *     newly-finalised chunk through the onResult callback so the
 *     SpeechProvider's verse-detection logic keeps working unchanged.
 *
 * This is the only path that actually transcribes inside the packaged
 * desktop app — Chromium's built-in webkitSpeechRecognition can never
 * reach Google's STT servers from Electron (no embedded API key).
 */

const CHUNK_MS = 4500 // length of each audio segment posted to Whisper
const MIN_BYTES = 6 * 1024 // skip near-silent segments (saves API calls)

interface UseWhisperSpeechRecognitionReturn {
  isListening: boolean
  transcript: string
  interimTranscript: string
  isSupported: boolean
  error: string | null
  startListening: (onResult?: (text: string) => void) => void
  stopListening: () => void
  resetTranscript: () => void
}

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ]
  for (const m of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m
    } catch {
      /* keep trying */
    }
  }
  return ''
}

export function useWhisperSpeechRecognition(): UseWhisperSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)

  const onResultRef = useRef<((text: string) => void) | undefined>(undefined)
  const transcriptRef = useRef('')
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Each segment is uploaded independently; keep them ordered so we
  // don't append a faster late response before an earlier one.
  const segmentSeqRef = useRef(0)
  const nextEmitSeqRef = useRef(0)
  const pendingByIdRef = useRef<Map<number, string>>(new Map())
  const stopRequestedRef = useRef(false)
  // Session generation token — bumped on every stop / reset. In-flight
  // upload promises captured at start time are checked against the
  // current sessionRef before mutating state, so a chunk that resolves
  // AFTER the operator hits stop or reset is silently dropped instead
  // of bleeding into the next session's transcript.
  const sessionRef = useRef(0)

  const isSupported =
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'

  const resetTranscript = useCallback(() => {
    // Bump the session token so any in-flight uploads from the previous
    // session resolve into a no-op instead of repopulating the transcript.
    sessionRef.current += 1
    transcriptRef.current = ''
    setTranscript('')
    pendingByIdRef.current.clear()
    nextEmitSeqRef.current = segmentSeqRef.current
  }, [])

  // Drain any in-order completed segments and append to the running
  // transcript + invoke onResult so verse detection runs.
  const drainOrdered = useCallback(() => {
    while (pendingByIdRef.current.has(nextEmitSeqRef.current)) {
      const id = nextEmitSeqRef.current
      const text = pendingByIdRef.current.get(id) || ''
      pendingByIdRef.current.delete(id)
      nextEmitSeqRef.current = id + 1
      if (text) {
        transcriptRef.current = (transcriptRef.current + ' ' + text).trim()
        setTranscript(transcriptRef.current)
        const cb = onResultRef.current
        if (cb) cb(text)
      }
    }
  }, [])

  const uploadSegment = useCallback(async (blob: Blob, id: number, sessionAtCapture: number) => {
    // Drop late responses from a previous session (operator already
    // hit stop or reset). Without this, a slow Whisper response can
    // append text into the next session's transcript.
    const stillCurrent = () => sessionRef.current === sessionAtCapture
    if (blob.size < MIN_BYTES) {
      if (!stillCurrent()) return
      pendingByIdRef.current.set(id, '')
      drainOrdered()
      return
    }
    try {
      const fd = new FormData()
      fd.append('audio', blob, 'chunk.webm')
      fd.append('language', 'en')
      const r = await fetch('/api/transcribe', { method: 'POST', body: fd })
      if (!stillCurrent()) return
      if (!r.ok) {
        // Try to surface the server's JSON error payload — operators
        // need actionable text ("missing API key", "rate limit") not
        // just the bare HTTP code.
        let detail = `HTTP ${r.status}`
        try {
          const j = (await r.json()) as { error?: string }
          if (j?.error) detail = j.error
        } catch { /* not JSON */ }
        throw new Error(detail)
      }
      const j = (await r.json()) as { text?: string; error?: string }
      if (!stillCurrent()) return
      if (j.error) throw new Error(j.error)
      pendingByIdRef.current.set(id, (j.text || '').trim())
      drainOrdered()
    } catch (e) {
      if (!stillCurrent()) return
      pendingByIdRef.current.set(id, '')
      drainOrdered()
      const msg = e instanceof Error ? e.message : String(e)
      console.warn('[whisper] segment failed:', msg)
      // Surface a soft error but keep listening — single chunk failures
      // shouldn't kill the whole session.
      setError(`Transcription chunk failed: ${msg}`)
    }
  }, [drainOrdered])

  const stopListening = useCallback(() => {
    stopRequestedRef.current = true
    // Bump session BEFORE tearing down state so any in-flight upload
    // promises see the new generation and bail out.
    sessionRef.current += 1
    onResultRef.current = undefined
    pendingByIdRef.current.clear()
    setIsListening(false)
    if (chunkTimerRef.current) {
      clearInterval(chunkTimerRef.current)
      chunkTimerRef.current = null
    }
    const rec = recorderRef.current
    recorderRef.current = null
    if (rec && rec.state !== 'inactive') {
      try { rec.stop() } catch { /* ignore */ }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => { try { t.stop() } catch { /* ignore */ } })
      streamRef.current = null
    }
  }, [])

  const startListening = useCallback((onResult?: (text: string) => void) => {
    if (!isSupported) {
      setError('Audio recording is not available in this environment.')
      return
    }
    // Re-entry guard: if a session is already running, fully tear it
    // down before starting a new one. Without this a double-click on
    // "Detect Verses Now" would open a second mic stream and a second
    // chunk timer while orphaning the first set of refs.
    if (recorderRef.current || streamRef.current || chunkTimerRef.current) {
      stopListening()
    }
    // Open a brand new session. Each upload promise captures this id
    // and ignores its own resolution if the operator stops/resets.
    sessionRef.current += 1
    const sessionAtStart = sessionRef.current
    onResultRef.current = onResult
    stopRequestedRef.current = false
    setError(null)

    // Pull mic preference from window-level store getter to avoid a
    // store dependency in this hook (kept symmetric with the browser
    // hook). SpeechProvider will have already requested permission.
    const win = window as unknown as {
      __selectedMicrophoneId?: string | null
    }
    const deviceId = win.__selectedMicrophoneId || undefined

    const constraints: MediaStreamConstraints = deviceId
      ? { audio: { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true } }
      : { audio: { echoCancellation: true, noiseSuppression: true } }

    navigator.mediaDevices.getUserMedia(constraints)
      .then((stream) => {
        if (stopRequestedRef.current) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const mimeType = pickMimeType()
        let recorder: MediaRecorder
        try {
          recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'MediaRecorder unavailable'
          setError(`Microphone capture failed: ${msg}`)
          return
        }
        recorderRef.current = recorder

        // The recorder fires `dataavailable` whenever we call
        // `requestData()` (and once more on `stop`). We rotate the
        // recorder every CHUNK_MS so each blob is a self-contained
        // webm fragment Whisper can decode without context.
        recorder.ondataavailable = (ev) => {
          if (!ev.data || ev.data.size === 0) return
          const id = segmentSeqRef.current++
          uploadSegment(ev.data, id, sessionAtStart)
        }
        recorder.onerror = (ev) => {
          const e = (ev as unknown as { error?: { message?: string } }).error
          setError(`Recorder error: ${e?.message || 'unknown'}`)
        }

        recorder.start()
        setIsListening(true)

        chunkTimerRef.current = setInterval(() => {
          const r = recorderRef.current
          if (!r || stopRequestedRef.current) return
          if (r.state === 'recording') {
            try {
              // Stop & restart so each blob is a complete container
              // (Whisper rejects mid-stream webm fragments).
              r.stop()
            } catch { /* ignore */ }
            const fresh = mimeType
              ? new MediaRecorder(stream, { mimeType })
              : new MediaRecorder(stream)
            fresh.ondataavailable = recorder.ondataavailable
            fresh.onerror = recorder.onerror
            recorderRef.current = fresh
            try { fresh.start() } catch { /* ignore */ }
          }
        }, CHUNK_MS)
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e)
        if (/Permission|denied|NotAllowed/i.test(msg)) {
          setError('Microphone access denied. Please allow microphone permissions.')
        } else if (/NotFound|DevicesNotFound/i.test(msg)) {
          setError('No microphone found. Please connect a microphone.')
        } else {
          setError(`Failed to start microphone: ${msg}`)
        }
        setIsListening(false)
      })
  }, [isSupported, uploadSegment])

  useEffect(() => {
    return () => { stopListening() }
  }, [stopListening])

  return {
    isListening,
    transcript,
    interimTranscript: '',
    isSupported,
    error,
    startListening,
    stopListening,
    resetTranscript,
  }
}
