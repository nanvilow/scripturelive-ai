'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createWavRecorder, type WavRecorder } from '@/lib/whisper-recorder'
import { cleanTranscriptText, transcriptChunkConfidence } from '@/lib/transcript-cleaner'

/**
 * Whisper-based speech recognition hook for the desktop (Electron) build.
 *
 * Supports TWO engines, switchable at runtime via window.__aiMode:
 *   - 'openai': MediaRecorder → webm/opus → POST /api/transcribe with
 *               X-OpenAI-Key header. Fast (~1 s/chunk), higher accuracy,
 *               requires internet + paid key.
 *   - 'base'  : Web Audio PCM capture → WAV bytes → IPC to the bundled
 *               whisper.cpp (window.scriptureLive.whisper.transcribe).
 *               Offline, no key, ~2-4 s/chunk, slightly lower accuracy.
 *
 * The failsafe in SpeechProvider auto-switches 'openai' → 'base' when
 * the key is missing or the network refuses, so operators never get a
 * dead-silent detection panel after a WiFi blip.
 */

const CHUNK_MS = 4500 // length of each audio segment posted to Whisper
// Compressed Opus chunks (OpenAI path) average ~6 KB for ~5 s of speech,
// so 6 KB is a sane "is this just silence?" floor for the cloud engine.
const MIN_OPENAI_BYTES = 6 * 1024
// Raw 16 kHz × 16-bit × mono PCM is 32 000 bytes per second. A WAV under
// ~24 KB (= 0.75 s of audio + 44 B header) is the #1 cause of the
// dreaded "whisper-cli exited with code 1" — whisper.cpp's GGML loader
// will refuse near-empty audio and exit non-zero with no useful stderr.
// Filtering at this layer keeps Base Mode from ever sending one.
const MIN_BASE_PCM_BYTES = 24 * 1024

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

type AiMode = 'base' | 'openai'
function currentAiMode(): AiMode {
  const w = (typeof window !== 'undefined'
    ? (window as unknown as { __aiMode?: AiMode })
    : undefined)
  return w?.__aiMode === 'openai' ? 'openai' : 'base'
}

interface WhisperBridge {
  transcribe(buf: ArrayBuffer, language?: string): Promise<{ ok: boolean; text?: string; error?: string }>
}
function getWhisperBridge(): WhisperBridge | null {
  if (typeof window === 'undefined') return null
  const sl = (window as unknown as { scriptureLive?: { whisper?: WhisperBridge } }).scriptureLive
  return sl?.whisper || null
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
  const wavRecorderRef = useRef<WavRecorder | null>(null)
  const chunkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const segmentSeqRef = useRef(0)
  const nextEmitSeqRef = useRef(0)
  const pendingByIdRef = useRef<Map<number, string>>(new Map())
  const stopRequestedRef = useRef(false)
  const sessionRef = useRef(0)
  // Mode chosen at session start — if the operator flips modes mid-
  // session we finish transcribing the in-flight chunks through the
  // originally-chosen engine to avoid mixing.
  const modeRef = useRef<AiMode>('base')

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

  const uploadOpenAi = useCallback(async (blob: Blob, id: number, sessionAtCapture: number) => {
    const stillCurrent = () => sessionRef.current === sessionAtCapture
    if (blob.size < MIN_OPENAI_BYTES) {
      if (!stillCurrent()) return
      pendingByIdRef.current.set(id, '')
      drainOrdered()
      return
    }
    try {
      const fd = new FormData()
      fd.append('audio', blob, 'chunk.webm')
      fd.append('language', 'en')
      const win = window as unknown as { __userOpenaiKey?: string | null }
      const userKey = win.__userOpenaiKey || ''
      const headers: Record<string, string> = {}
      if (userKey) headers['X-OpenAI-Key'] = userKey
      const r = await fetch('/api/transcribe', { method: 'POST', body: fd, headers })
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
      // Bug #1A — clean the OpenAI text the same way as Base Mode so
      // both engines feed the same downstream detection pipeline.
      pendingByIdRef.current.set(id, cleanTranscriptText(j.text || ''))
      drainOrdered()
    } catch (e) {
      if (!stillCurrent()) return
      pendingByIdRef.current.set(id, '')
      drainOrdered()
      const msg = e instanceof Error ? e.message : String(e)
      console.warn('[whisper:openai] segment failed:', msg)
      setError(`Transcription chunk failed: ${msg}`)
    }
  }, [drainOrdered])

  const uploadBase = useCallback(async (wav: ArrayBuffer, id: number, sessionAtCapture: number) => {
    const stillCurrent = () => sessionRef.current === sessionAtCapture
    if (wav.byteLength < MIN_BASE_PCM_BYTES) {
      if (!stillCurrent()) return
      pendingByIdRef.current.set(id, '')
      drainOrdered()
      return
    }
    const bridge = getWhisperBridge()
    if (!bridge) {
      if (!stillCurrent()) return
      pendingByIdRef.current.set(id, '')
      drainOrdered()
      setError('Base Model is only available in the desktop app. Switch to OpenAI Mode to transcribe in this environment.')
      return
    }
    try {
      const r = await bridge.transcribe(wav, 'en')
      if (!stillCurrent()) return
      if (!r.ok) throw new Error(r.error || 'Local Whisper failed')
      // Bug #1A — pre-clean before downstream consumers.
      let text = cleanTranscriptText(r.text || '')

      // Bug #1C — auto-fallback to OpenAI on low-confidence chunks.
      // The whisper.cpp binary doesn't return a real confidence score,
      // so we use a surface-stat heuristic (fragment / no-vowel
      // ratios) defined in transcript-cleaner. When the operator has
      // an OpenAI key configured AND the auto-fallback toggle is on,
      // we re-send the same WAV bytes to /api/transcribe and use that
      // result instead. Skipped when the chunk is empty (no opinion)
      // or when the operator turned the toggle off in Settings.
      const winFb = window as unknown as {
        __userOpenaiKey?: string | null
        __whisperAutoFallback?: boolean
      }
      const fallbackOn = winFb.__whisperAutoFallback !== false
      const userKey = winFb.__userOpenaiKey || ''
      const conf = transcriptChunkConfidence(text)
      if (text && fallbackOn && userKey && conf < 0.55) {
        // Architect feedback — fallback fetch is awaited inside the
        // segment-ordering loop, so a hung request would freeze
        // transcript progression for downstream chunks. Cap the
        // fallback at 8 s with AbortController; on timeout we keep
        // the original base-mode text and move on.
        const ctrl = new AbortController()
        const fbTimer = setTimeout(() => ctrl.abort(), 8000)
        try {
          const fd = new FormData()
          // The /api/transcribe route now preserves the WAV MIME so
          // the OpenAI SDK gets the right file extension for sniffing.
          // Sending audio/wav + chunk.wav so the route's switch lands
          // in the WAV branch.
          fd.append('audio', new Blob([wav], { type: 'audio/wav' }), 'chunk.wav')
          fd.append('language', 'en')
          const headers: Record<string, string> = { 'X-OpenAI-Key': userKey }
          const resp = await fetch('/api/transcribe', {
            method: 'POST',
            body: fd,
            headers,
            signal: ctrl.signal,
          })
          if (resp.ok) {
            const j = (await resp.json()) as { text?: string }
            const cleaned = cleanTranscriptText(j.text || '')
            if (cleaned) {
              console.log(`[whisper:base→openai] low-confidence chunk (${conf.toFixed(2)}) re-transcribed`)
              text = cleaned
            }
          }
        } catch (e) {
          // Fallback failures are non-fatal — keep the base text. The
          // operator already has the noisy chunk in front of them and
          // a network blip during fallback shouldn't make it worse.
          const msg = e instanceof Error ? e.message : String(e)
          if (ctrl.signal.aborted) {
            console.warn('[whisper:base→openai] fallback timed out (kept base text)')
          } else {
            console.warn('[whisper:base→openai] fallback failed:', msg)
          }
        } finally {
          clearTimeout(fbTimer)
        }
      }

      pendingByIdRef.current.set(id, text)
      drainOrdered()
    } catch (e) {
      if (!stillCurrent()) return
      pendingByIdRef.current.set(id, '')
      drainOrdered()
      const msg = e instanceof Error ? e.message : String(e)
      console.warn('[whisper:base] segment failed:', msg)
      setError(`Base Model chunk failed: ${msg}`)
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
    const wav = wavRecorderRef.current
    wavRecorderRef.current = null
    if (wav) {
      try { wav.stop() } catch { /* ignore */ }
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
    if (recorderRef.current || wavRecorderRef.current || streamRef.current || chunkTimerRef.current) {
      stopListening()
    }
    sessionRef.current += 1
    const sessionAtStart = sessionRef.current
    modeRef.current = currentAiMode()
    onResultRef.current = onResult
    stopRequestedRef.current = false
    setError(null)

    const win = window as unknown as { __selectedMicrophoneId?: string | null }
    const deviceId = win.__selectedMicrophoneId || undefined

    const constraints: MediaStreamConstraints = deviceId
      ? { audio: { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true } }
      : { audio: { echoCancellation: true, noiseSuppression: true } }

    navigator.mediaDevices.getUserMedia(constraints)
      .then(async (stream) => {
        if (stopRequestedRef.current) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream

        if (modeRef.current === 'openai') {
          // Existing MediaRecorder path — produces webm/opus chunks
          // the /api/transcribe endpoint can hand straight to Whisper.
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
          recorder.ondataavailable = (ev) => {
            if (!ev.data || ev.data.size === 0) return
            const id = segmentSeqRef.current++
            uploadOpenAi(ev.data, id, sessionAtStart)
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
              try { r.stop() } catch { /* ignore */ }
              const fresh = mimeType
                ? new MediaRecorder(stream, { mimeType })
                : new MediaRecorder(stream)
              fresh.ondataavailable = recorder.ondataavailable
              fresh.onerror = recorder.onerror
              recorderRef.current = fresh
              try { fresh.start() } catch { /* ignore */ }
            }
          }, CHUNK_MS)
        } else {
          // Base Mode: raw PCM via Web Audio → 16 kHz mono WAV →
          // Electron IPC → bundled whisper.cpp.
          try {
            const wavRec = await createWavRecorder(stream)
            wavRecorderRef.current = wavRec
            setIsListening(true)
            chunkTimerRef.current = setInterval(async () => {
              const rec = wavRecorderRef.current
              if (!rec || stopRequestedRef.current) return
              try {
                const buf = await rec.flush()
                const id = segmentSeqRef.current++
                uploadBase(buf, id, sessionAtStart)
              } catch (e) {
                console.warn('[whisper:base] flush failed:', e)
              }
            }, CHUNK_MS)
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            setError(`Base Model capture failed: ${msg}`)
          }
        }
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
  }, [isSupported, uploadOpenAi, uploadBase, stopListening])

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
