'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cleanTranscriptText } from '@/lib/transcript-cleaner'
import { useAppStore } from '@/lib/store'

/**
 * Cloud-only Deepgram streaming speech recognition for the desktop
 * (Electron) build. Replaces the chunked Whisper hook in v0.5.35.
 *
 * ─── Why this exists ─────────────────────────────────────────────────
 * The v0.5.34-and-earlier `useWhisperSpeechRecognition` POSTed a fresh
 * 2.5-second webm/opus blob to /api/transcribe every cycle. That gave
 * a baseline 2.5 s of operator-perceived latency before any verse
 * could surface, plus Whisper's well-known silence hallucinations
 * ("you", "thanks for watching") that we kept blocklisting. Worse,
 * mid-utterance verses ("…three" / "sixteen…") were split across
 * chunk boundaries and never recognised.
 *
 * Deepgram Nova-3 streaming returns interim partials ~200 ms after
 * the speaker says a word and a final transcript ~300 ms after each
 * sentence boundary, with Bible book names pre-boosted via keyterm
 * prompting on the proxy. The api-server (`/api/transcribe-stream`)
 * holds the shared Deepgram key and forwards audio one direction +
 * JSON the other.
 *
 * ─── Public interface ────────────────────────────────────────────────
 * Identical shape to the previous Whisper hook so `speech-provider`
 * could swap engines with a single import rename.
 *
 * ─── Audio plumbing ──────────────────────────────────────────────────
 *   getUserMedia → AudioContext → MediaStreamSource → GainNode
 *                → ScriptProcessor (downsample to 16 kHz Int16)
 *                → WebSocket frames (binary)
 *
 * ScriptProcessorNode is deprecated in the spec but is the simplest
 * way to grab raw PCM that works in every Chromium build we care
 * about (recent Electron, dev preview, packaged Windows install).
 * The AudioWorklet alternative needs a separate module file which
 * complicates the Next.js + Electron bundle without buying us
 * meaningfully better latency.
 */

interface UseDeepgramStreamingReturn {
  isListening: boolean
  transcript: string
  interimTranscript: string
  isSupported: boolean
  error: string | null
  startListening: (onResult?: (text: string) => void) => void
  stopListening: () => void
  resetTranscript: () => void
}

interface DeepgramAlternative {
  transcript: string
  confidence?: number
  words?: unknown[]
}
interface DeepgramChannel {
  alternatives: DeepgramAlternative[]
}
interface DeepgramTranscriptMessage {
  type?: string
  is_final?: boolean
  speech_final?: boolean
  channel?: DeepgramChannel
}
interface ProxyControlMessage {
  type: 'ready' | 'error'
  source?: string
  message?: string
}

const TARGET_SAMPLE_RATE = 16000
// 4096-frame ScriptProcessor blocks at 48 kHz are ~85 ms each — small
// enough that Deepgram receives audio promptly, large enough that we
// don't drown the renderer thread in postMessage traffic.
const SCRIPT_PROCESSOR_BUFFER = 4096

function downsampleAndConvertToInt16(
  input: Float32Array,
  inputSampleRate: number,
  outputSampleRate: number,
): Int16Array {
  if (outputSampleRate === inputSampleRate) {
    const out = new Int16Array(input.length)
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]!))
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }
    return out
  }
  // Simple linear-interpolation resample. Good enough for speech;
  // anything more expensive (FIR low-pass + decimate) costs CPU we
  // don't have on a low-end church PC running OBS + NDI alongside.
  const ratio = inputSampleRate / outputSampleRate
  const outLen = Math.floor(input.length / ratio)
  const out = new Int16Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const idx = i * ratio
    const lo = Math.floor(idx)
    const hi = Math.min(lo + 1, input.length - 1)
    const frac = idx - lo
    const sample = input[lo]! * (1 - frac) + input[hi]! * frac
    const clamped = Math.max(-1, Math.min(1, sample))
    out[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
  }
  return out
}

export function useDeepgramStreaming(): UseDeepgramStreamingReturn {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)

  const onResultRef = useRef<((text: string) => void) | undefined>(undefined)
  const transcriptRef = useRef('')
  const sessionRef = useRef(0)
  const stopRequestedRef = useRef(false)

  const wsRef = useRef<WebSocket | null>(null)
  const wsReadyRef = useRef(false)
  const audioBacklogRef = useRef<ArrayBuffer[]>([])

  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)

  // Mirror live store values into refs so the long-lived audio-process
  // closure sees the latest operator settings without rebuilding the
  // graph on every change.
  const micPausedRef = useRef(false)
  const micGainRef = useRef(1)
  const micGainStore = useAppStore((s) => s.micGain)
  const micPausedStore = useAppStore((s) => s.micPaused)
  useEffect(() => {
    micGainRef.current = micGainStore
    const g = gainNodeRef.current
    if (g) {
      try {
        g.gain.value = micGainStore
      } catch {
        /* graph torn down */
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
    typeof WebSocket !== 'undefined' &&
    typeof AudioContext !== 'undefined'

  const resetTranscript = useCallback(() => {
    sessionRef.current += 1
    transcriptRef.current = ''
    setTranscript('')
    setInterimTranscript('')
  }, [])

  const teardown = useCallback(() => {
    stopRequestedRef.current = true
    sessionRef.current += 1
    onResultRef.current = undefined
    setIsListening(false)
    setInterimTranscript('')

    // 1. Disconnect the audio graph FIRST so no more audio is queued.
    const proc = processorRef.current
    processorRef.current = null
    if (proc) {
      try { proc.disconnect() } catch { /* ignore */ }
      proc.onaudioprocess = null
    }
    const src = sourceNodeRef.current
    sourceNodeRef.current = null
    if (src) {
      try { src.disconnect() } catch { /* ignore */ }
    }
    gainNodeRef.current = null
    if (audioCtxRef.current) {
      const ctx = audioCtxRef.current
      audioCtxRef.current = null
      try { ctx.close() } catch { /* already closed */ }
    }

    // 2. Stop the captured tracks so the OS mic indicator turns off.
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try { t.stop() } catch { /* ignore */ }
      })
      streamRef.current = null
    }

    // 3. Close the WebSocket politely. Send "CLOSE" so the server
    //    can flush Deepgram's final results before tearing down.
    const ws = wsRef.current
    wsRef.current = null
    wsReadyRef.current = false
    audioBacklogRef.current = []
    if (ws) {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send('CLOSE')
        }
      } catch { /* ignore */ }
      try { ws.close(1000, 'client stop') } catch { /* ignore */ }
    }
  }, [])

  const stopListening = useCallback(() => {
    teardown()
  }, [teardown])

  const handleDeepgramJson = useCallback(
    (raw: string, sessionAtCapture: number) => {
      if (sessionRef.current !== sessionAtCapture) return
      let msg: DeepgramTranscriptMessage | ProxyControlMessage
      try {
        msg = JSON.parse(raw) as DeepgramTranscriptMessage | ProxyControlMessage
      } catch {
        return
      }
      // Proxy control message? (ready / error)
      if ((msg as ProxyControlMessage).type === 'ready') {
        return
      }
      if ((msg as ProxyControlMessage).type === 'error') {
        const m = msg as ProxyControlMessage
        setError(`Transcription error: ${m.message || 'unknown'}`)
        return
      }
      // Deepgram transcript message?
      const dg = msg as DeepgramTranscriptMessage
      if (dg.type && dg.type !== 'Results' && dg.type !== 'SpeechStarted' && dg.type !== 'UtteranceEnd') {
        // Metadata / other — ignore.
        return
      }
      const alt = dg.channel?.alternatives?.[0]
      const text = (alt?.transcript || '').trim()
      if (!text) {
        // Empty interim — clear the live preview so the operator
        // doesn't see stale words after a pause.
        if (dg.is_final) setInterimTranscript('')
        return
      }
      const cleaned = cleanTranscriptText(text)
      if (!cleaned) {
        if (dg.is_final) setInterimTranscript('')
        return
      }
      if (dg.is_final) {
        // Final result — accumulate into the persistent transcript
        // and notify the verse-detector callback.
        transcriptRef.current = (transcriptRef.current + ' ' + cleaned).trim()
        setTranscript(transcriptRef.current)
        setInterimTranscript('')
        const cb = onResultRef.current
        if (cb) cb(cleaned)
      } else {
        // Interim — only update the live preview field.
        setInterimTranscript(cleaned)
      }
    },
    [],
  )

  const openWebSocket = useCallback(
    async (sessionAtStart: number): Promise<WebSocket> => {
      // Discover the WSS URL via the local /api/transcribe-stream/info
      // route. The Next.js server reads TRANSCRIBE_PROXY_URL (set by
      // Electron main on every spawn) and derives the wss URL.
      const r = await fetch('/api/transcribe-stream/info', { cache: 'no-store' })
      if (!r.ok) {
        let detail = `HTTP ${r.status}`
        try {
          const j = (await r.json()) as { error?: string }
          if (j?.error) detail = j.error
        } catch { /* not JSON */ }
        throw new Error(detail)
      }
      const j = (await r.json()) as { wssUrl?: string; error?: string }
      if (!j.wssUrl) throw new Error(j.error || 'No wssUrl returned by /api/transcribe-stream/info')

      const ws = new WebSocket(j.wssUrl)
      ws.binaryType = 'arraybuffer'
      ws.onopen = () => {
        if (sessionRef.current !== sessionAtStart) {
          try { ws.close(1000, 'session stale') } catch { /* ignore */ }
          return
        }
        wsReadyRef.current = true
        // Flush any audio captured while the socket was connecting.
        const backlog = audioBacklogRef.current
        audioBacklogRef.current = []
        for (const buf of backlog) {
          try { ws.send(buf) } catch { /* ignore */ }
        }
      }
      ws.onmessage = (ev) => {
        if (typeof ev.data === 'string') {
          handleDeepgramJson(ev.data, sessionAtStart)
        }
      }
      ws.onerror = () => {
        if (sessionRef.current !== sessionAtStart) return
        setError('Live transcription connection failed.')
      }
      ws.onclose = () => {
        if (sessionRef.current !== sessionAtStart) return
        wsReadyRef.current = false
      }
      return ws
    },
    [handleDeepgramJson],
  )

  const startListening = useCallback(
    (onResult?: (text: string) => void) => {
      if (!isSupported) {
        setError('Audio recording is not available in this environment.')
        return
      }
      // If we're already running, stop cleanly first.
      if (
        wsRef.current ||
        streamRef.current ||
        processorRef.current ||
        audioCtxRef.current
      ) {
        teardown()
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

      // Open WS + capture mic in parallel — they're independent and
      // the audio backlog buffers any frames captured before WS opens.
      const wsPromise = openWebSocket(sessionAtStart).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        if (sessionRef.current === sessionAtStart) {
          setError(`Live transcription unavailable: ${msg}`)
          teardown()
        }
        return null
      })

      navigator.mediaDevices.getUserMedia(constraints)
        .then((stream) => {
          if (stopRequestedRef.current || sessionRef.current !== sessionAtStart) {
            stream.getTracks().forEach((t) => { try { t.stop() } catch { /* ignore */ } })
            return
          }
          streamRef.current = stream

          let ctx: AudioContext
          try {
            const Ctor = (window as unknown as {
              AudioContext?: typeof AudioContext
              webkitAudioContext?: typeof AudioContext
            }).AudioContext ||
              (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
            if (!Ctor) throw new Error('AudioContext unavailable')
            ctx = new Ctor()
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            setError(`Audio engine failed to start: ${msg}`)
            teardown()
            return
          }
          audioCtxRef.current = ctx

          const source = ctx.createMediaStreamSource(stream)
          sourceNodeRef.current = source
          const gain = ctx.createGain()
          gain.gain.value = micGainRef.current
          gainNodeRef.current = gain
          // ScriptProcessorNode: 1 input ch, 1 output ch, 4096 frames.
          // Output is required to keep the node alive; we don't connect
          // it to ctx.destination so the operator never hears feedback.
          const processor = ctx.createScriptProcessor(SCRIPT_PROCESSOR_BUFFER, 1, 1)
          processorRef.current = processor
          source.connect(gain)
          gain.connect(processor)
          // Per the spec, ScriptProcessorNode fires onaudioprocess only
          // while connected to a destination. Connect to a muted gain
          // sink so we don't add monitoring to the operator's output.
          const mute = ctx.createGain()
          mute.gain.value = 0
          processor.connect(mute)
          mute.connect(ctx.destination)

          const inputSampleRate = ctx.sampleRate
          processor.onaudioprocess = (ev) => {
            if (sessionRef.current !== sessionAtStart) return
            if (micPausedRef.current) return
            const ws = wsRef.current
            const inputData = ev.inputBuffer.getChannelData(0)
            const pcm = downsampleAndConvertToInt16(inputData, inputSampleRate, TARGET_SAMPLE_RATE)
            // pcm.buffer may be larger than the actual byte length when
            // the underlying ArrayBuffer was over-allocated; slice to
            // the exact byte range we want to send. The cast is safe
            // because `downsampleAndConvertToInt16` always allocates a
            // fresh Int16Array on a regular (not SharedArrayBuffer)
            // ArrayBuffer; TS only widens the union because Int16Array
            // could theoretically be backed by either.
            const buf = pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength) as ArrayBuffer
            if (ws && wsReadyRef.current && ws.readyState === WebSocket.OPEN) {
              try { ws.send(buf) } catch { /* ignore */ }
            } else {
              // Cap backlog at ~2 MB so a wedged WS can't blow memory.
              const total = audioBacklogRef.current.reduce((n, b) => n + b.byteLength, 0)
              if (total < 2 * 1024 * 1024) {
                audioBacklogRef.current.push(buf)
              }
            }
          }

          // Stash the WS once it resolves.
          wsPromise.then((ws) => {
            if (!ws) return
            if (sessionRef.current !== sessionAtStart) {
              try { ws.close(1000, 'session stale') } catch { /* ignore */ }
              return
            }
            wsRef.current = ws
          })

          setIsListening(true)
        })
        .catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : String(e)
          if (/Permission|denied|NotAllowed/i.test(msg)) {
            setError('Microphone access denied. Please allow microphone permissions.')
          } else if (/NotFound|DevicesNotFound/i.test(msg)) {
            setError('No microphone found. Please connect a microphone.')
          } else {
            setError(`Failed to start microphone: ${msg}`)
          }
          teardown()
        })
    },
    [isSupported, teardown, openWebSocket],
  )

  useEffect(() => {
    return () => { teardown() }
  }, [teardown])

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
