'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cleanTranscriptText } from '@/lib/transcript-cleaner'

/**
 * Cloud-only Whisper speech recognition for the desktop (Electron) build.
 *
 * Records short audio chunks via MediaRecorder (webm/opus) and POSTs each
 * chunk to /api/transcribe. The bundled Next.js standalone server in the
 * Electron app forwards every request to the Replit-hosted api-server
 * proxy (see `electron/main.ts` → `TRANSCRIBE_PROXY_URL`). The OpenAI
 * key never lives on the customer's machine.
 *
 * The previous dual-engine implementation (local whisper.cpp Base Model +
 * cloud OpenAI Mode) shipped letter-dropping Base output to the live feed
 * and forced operators through an "AI Detection Mode" picker. Both are
 * gone — there is one engine now, locked to English, biased toward
 * Bible vocabulary by the proxy's prompt.
 */

// Operator-perceived latency = CHUNK_MS + RTT to the proxy. We used to
// roll a fresh chunk every 4.5 s which felt sluggish — preachers were
// already two sentences ahead by the time the verse appeared. 2.5 s
// keeps OpenAI happy (it does its own VAD across the chunk) while
// nearly halving the wait between speech and detection.
const CHUNK_MS = 2500
// Roll the FIRST chunk early so a click on "Detect Verses Now"
// produces a transcription request inside ~1.5 s instead of the full
// chunk window. After the first roll we settle into CHUNK_MS cadence.
const FIRST_CHUNK_MS = 1500
// Compressed Opus chunks for ~2-3 s of speech average ~3 KB; treat
// anything smaller as silence so we don't bill OpenAI for empty audio.
// Reduced from 6 KB to match the new shorter chunk size — 6 KB at
// 2.5 s would suppress real but quiet speech.
const MIN_CHUNK_BYTES = 3 * 1024

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
  const segmentSeqRef = useRef(0)
  const nextEmitSeqRef = useRef(0)
  const pendingByIdRef = useRef<Map<number, string>>(new Map())
  const stopRequestedRef = useRef(false)
  const sessionRef = useRef(0)

  const isSupported =
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'

  const resetTranscript = useCallback(() => {
    sessionRef.current += 1
    transcriptRef.current = ''
    setTranscript('')
    pendingByIdRef.current.clear()
    nextEmitSeqRef.current = segmentSeqRef.current
  }, [])

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

  const upload = useCallback(async (blob: Blob, id: number, sessionAtCapture: number) => {
    const stillCurrent = () => sessionRef.current === sessionAtCapture
    if (blob.size < MIN_CHUNK_BYTES) {
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
      pendingByIdRef.current.set(id, cleanTranscriptText(j.text || ''))
      drainOrdered()
    } catch (e) {
      if (!stillCurrent()) return
      pendingByIdRef.current.set(id, '')
      drainOrdered()
      const msg = e instanceof Error ? e.message : String(e)
      console.warn('[whisper] segment failed:', msg)
      setError(`Transcription chunk failed: ${msg}`)
    }
  }, [drainOrdered])

  const stopListening = useCallback(() => {
    stopRequestedRef.current = true
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
    if (recorderRef.current || streamRef.current || chunkTimerRef.current) {
      stopListening()
    }
    sessionRef.current += 1
    const sessionAtStart = sessionRef.current
    onResultRef.current = onResult
    stopRequestedRef.current = false
    setError(null)

    const win = window as unknown as { __selectedMicrophoneId?: string | null }
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
          stream.getTracks().forEach((t) => { try { t.stop() } catch { /* ignore */ } })
          streamRef.current = null
          setIsListening(false)
          return
        }
        recorderRef.current = recorder
        recorder.ondataavailable = (ev) => {
          if (!ev.data || ev.data.size === 0) return
          const id = segmentSeqRef.current++
          upload(ev.data, id, sessionAtStart)
        }
        recorder.onerror = (ev) => {
          const e = (ev as unknown as { error?: { message?: string } }).error
          setError(`Recorder error: ${e?.message || 'unknown'}`)
        }
        recorder.start()
        setIsListening(true)

        // Shared chunk-rotate routine. Pulled out of the setInterval
        // closure so the very first roll (FIRST_CHUNK_MS) and the
        // cadence rolls (CHUNK_MS) all share one path and one error
        // handler.
        const rotateChunk = () => {
          const r = recorderRef.current
          if (!r || stopRequestedRef.current) return
          if (r.state === 'recording') {
            try { r.stop() } catch { /* ignore */ }
            let fresh: MediaRecorder
            try {
              fresh = mimeType
                ? new MediaRecorder(stream, { mimeType })
                : new MediaRecorder(stream)
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'MediaRecorder unavailable'
              console.warn('[whisper] chunk-rotate failed, stopping session:', msg)
              setError(`Recorder restart failed: ${msg}`)
              stopListening()
              return
            }
            fresh.ondataavailable = recorder.ondataavailable
            fresh.onerror = recorder.onerror
            recorderRef.current = fresh
            try { fresh.start() } catch { /* ignore */ }
          }
        }

        // First chunk fires fast (FIRST_CHUNK_MS) so the operator
        // sees a transcription within ~1.5 s of clicking Detect
        // Verses Now. After that we settle into CHUNK_MS cadence.
        // Guard the interval setup: rotateChunk() may call
        // stopListening() on MediaRecorder restart failure — if it
        // did, do NOT spin up a useless repeating timer.
        const firstRoll = setTimeout(() => {
          rotateChunk()
          if (stopRequestedRef.current || !recorderRef.current) return
          chunkTimerRef.current = setInterval(rotateChunk, CHUNK_MS)
        }, FIRST_CHUNK_MS)
        // Track the first-roll timer so stopListening can clear it.
        chunkTimerRef.current = firstRoll as unknown as ReturnType<typeof setInterval>
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
  }, [isSupported, upload, stopListening])

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
