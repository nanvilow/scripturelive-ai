'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cleanTranscriptText } from '@/lib/transcript-cleaner'
import { useAppStore } from '@/lib/store'

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
  // v0.5.30 — Web Audio graph for mic-gain control. The captured
  // MediaStream is routed Source → GainNode → MediaStreamDestination
  // and the destination's stream is what we hand to MediaRecorder, so
  // a slider drag adjusts loudness in real time without rebuilding
  // the recorder. micPausedRef is consulted in ondataavailable so a
  // paused mic silently drops chunks instead of stopping the recorder
  // (which would jolt the system mic indicator on every pause).
  const audioCtxRef = useRef<AudioContext | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const micPausedRef = useRef(false)
  const micGainRef = useRef(1)

  // Mirror the live store values into refs so the long-lived
  // ondataavailable closure and audio graph see the latest operator
  // settings without restarting the recorder.
  const micGainStore = useAppStore((s) => s.micGain)
  const micPausedStore = useAppStore((s) => s.micPaused)
  useEffect(() => {
    micGainRef.current = micGainStore
    const g = gainNodeRef.current
    if (g) {
      try {
        g.gain.value = micGainStore
      } catch {
        /* ignore — graph may be torn down */
      }
    }
  }, [micGainStore])
  useEffect(() => {
    micPausedRef.current = micPausedStore
  }, [micPausedStore])

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
    // v0.5.30 — when the operator has pressed Pause on the mic
    // popover, drop the chunk silently. We still slot a placeholder
    // so the in-order drainer doesn't stall waiting for this id.
    if (micPausedRef.current) {
      if (!stillCurrent()) return
      pendingByIdRef.current.set(id, '')
      drainOrdered()
      return
    }
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
    // v0.5.30 — tear down the Web Audio graph too. Without this each
    // start/stop cycle would leak an AudioContext + GainNode and over
    // the lifetime of a long service eventually exhaust the browser's
    // small per-page AudioContext limit.
    gainNodeRef.current = null
    if (audioCtxRef.current) {
      const ctx = audioCtxRef.current
      audioCtxRef.current = null
      try { ctx.close() } catch { /* already closed */ }
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

        // v0.5.30 — Build a Web Audio graph so the operator's mic-gain
        // slider can boost / attenuate the captured signal in real
        // time. Source → GainNode → MediaStreamDestination, then feed
        // THAT stream to MediaRecorder. We keep `gainNodeRef` so the
        // useEffect that mirrors `micGain` from the store can write
        // straight into `gain.value` without rebuilding the recorder.
        // Falls back gracefully to the raw stream if AudioContext
        // is unavailable (some embedded browsers).
        let recordingStream: MediaStream = stream
        try {
          const Ctor = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
            .AudioContext ||
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
          if (Ctor) {
            const ctx = new Ctor()
            const source = ctx.createMediaStreamSource(stream)
            const gain = ctx.createGain()
            gain.gain.value = micGainRef.current
            const dest = ctx.createMediaStreamDestination()
            source.connect(gain)
            gain.connect(dest)
            audioCtxRef.current = ctx
            gainNodeRef.current = gain
            recordingStream = dest.stream
          }
        } catch (e) {
          // Fall through with the raw stream — gain becomes a no-op
          // but the mic still records. Better than failing to start.
          console.warn('[whisper] Web Audio graph unavailable; mic-gain disabled:', e)
        }

        const mimeType = pickMimeType()
        let recorder: MediaRecorder
        try {
          recorder = mimeType ? new MediaRecorder(recordingStream, { mimeType }) : new MediaRecorder(recordingStream)
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'MediaRecorder unavailable'
          setError(`Microphone capture failed: ${msg}`)
          stream.getTracks().forEach((t) => { try { t.stop() } catch { /* ignore */ } })
          streamRef.current = null
          if (audioCtxRef.current) { try { audioCtxRef.current.close() } catch {} ; audioCtxRef.current = null }
          gainNodeRef.current = null
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
              // v0.5.30 — keep the gain-routed stream in the chain so
              // mic-gain still affects every chunk after a rotation.
              fresh = mimeType
                ? new MediaRecorder(recordingStream, { mimeType })
                : new MediaRecorder(recordingStream)
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
