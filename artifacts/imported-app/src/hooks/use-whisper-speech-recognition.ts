'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cleanTranscriptText } from '@/lib/transcript-cleaner'
import { useAppStore } from '@/lib/store'
import { bootstrapRuntimeKeys, getOpenAIKey } from '@/lib/runtime-keys'

// v0.5.52 — OpenAI Whisper now called DIRECTLY from the renderer.
// No proxy through /api/transcribe; the baked NEXT_PUBLIC_*_OPENAI_KEY
// is used (admin override wins). This removes a network hop and the
// dependency on the local Next.js server being able to forward to a
// Replit-hosted proxy.
const WHISPER_ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions'
const BIBLE_PROMPT =
  'The speaker is delivering a Christian sermon and may quote the Bible. ' +
  'Common Bible book names: Genesis, Exodus, Leviticus, Numbers, Deuteronomy, ' +
  'Joshua, Judges, Ruth, Samuel, Kings, Chronicles, Ezra, Nehemiah, Esther, ' +
  'Job, Psalms, Proverbs, Ecclesiastes, Song of Solomon, Isaiah, Jeremiah, ' +
  'Lamentations, Ezekiel, Daniel, Hosea, Joel, Amos, Obadiah, Jonah, Micah, ' +
  'Nahum, Habakkuk, Zephaniah, Haggai, Zechariah, Malachi, Matthew, Mark, ' +
  'Luke, John, Acts, Romans, Corinthians, Galatians, Ephesians, Philippians, ' +
  'Colossians, Thessalonians, Timothy, Titus, Philemon, Hebrews, James, Peter, ' +
  'Jude, Revelation.'

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
// v0.5.50 — Voice activity detection (VAD) silence floor, LOOSENED.
// v0.5.49 used 0.008 (≈ -42 dB FS RMS) which was too aggressive on
// low-gain condenser mics — operators reported the Live Transcription
// column showed nothing because every chunk was being dropped by the
// VAD before reaching Whisper. v0.5.50 drops the floor to 0.004
// (≈ -48 dB FS RMS) AND adds a "consecutive silent chunks" rule
// (VAD_SILENT_RUN_TO_DROP) so a single quiet syllable between two
// loud ones is uploaded — only sustained silence is suppressed.
const VAD_RMS_THRESHOLD = 0.004
// v0.5.50 — number of CONSECUTIVE chunks below VAD_RMS_THRESHOLD
// before we start dropping. The first quiet chunk in a run is always
// uploaded (it might be a soft-spoken word or the trailing silence at
// the end of a sentence); only chunks 2+ in a sustained quiet run are
// suppressed. Resets the moment any chunk crosses the threshold.
const VAD_SILENT_RUN_TO_DROP = 2
// VAD analyser sample interval. Cheap getFloatTimeDomainData read +
// RMS calc; running it every 50 ms gives 50 RMS samples per 2.5 s
// chunk, plenty of resolution to catch a brief utterance.
const VAD_SAMPLE_MS = 50

// v0.5.50 — Whisper hallucination guard. Even with VAD active, the
// occasional almost-silent chunk slips through and Whisper emits
// canned YouTube-caption phrases that pollute the running paragraph.
// Each pattern below has been observed in the wild (Replit issue
// trail v0.5.45→v0.5.49). Match is case-insensitive and tested
// against the cleaned transcript text — when it matches we drop the
// chunk to an empty placeholder and log a [whisper-hallucination]
// diagnostic so the operator can see in DevTools that the filter
// fired (rather than wondering why a transcript "disappeared").
const HALLUCINATION_PATTERNS: RegExp[] = [
  /thanks?\s+for\s+watching/i,
  /thank\s+you\s+for\s+watching/i,
  /subtitles?\s+by/i,
  /translated\s+by/i,
  /please\s+(like|subscribe|share)/i,
  /^\s*\[?\s*music\s*\]?\s*$/i,
  /^\s*\[?\s*applause\s*\]?\s*$/i,
  /^\s*\[?\s*silence\s*\]?\s*$/i,
  /^\s*\(?\s*music\s+playing\s*\)?\s*$/i,
  /captions?\s+by/i,
  /amara\.org/i,
]
function isHallucination(text: string): boolean {
  if (!text) return false
  const t = text.trim()
  if (t.length === 0) return false
  // Very-short outputs from a near-silent chunk are almost always
  // hallucinations (Whisper inventing one or two filler words). Real
  // speech in a 2.5 s window comes back as ≥3 words on average.
  return HALLUCINATION_PATTERNS.some((rx) => rx.test(t))
}

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
  // v0.5.49 — VAD analyser. The Source node is fanned out to BOTH the
  // gain → MediaStreamDestination (which feeds MediaRecorder) AND this
  // analyser, so the recorder is unaffected. A 50 ms interval polls
  // getFloatTimeDomainData and updates `maxRmsInWindowRef` (peak RMS
  // since the last chunk rotation). `chunkIdToMaxRmsRef` snapshots
  // that peak per chunk-id at the moment of `ondataavailable`, so
  // `upload(id)` can decide post-facto whether to drop the chunk as
  // silence regardless of which session/timing it arrives in.
  const analyserRef = useRef<AnalyserNode | null>(null)
  const vadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const maxRmsInWindowRef = useRef(0)
  const chunkIdToMaxRmsRef = useRef<Map<number, number>>(new Map())
  // v0.5.50 — running count of consecutive chunks below the VAD floor.
  // First quiet chunk in a run is always uploaded; only chunks 2+ in
  // a sustained quiet run get suppressed. Resets on any loud chunk.
  const silentRunCountRef = useRef(0)

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
    // v0.5.50 — VAD silence gate (loosened from v0.5.49). The peak
    // RMS captured during this chunk's window must exceed
    // VAD_RMS_THRESHOLD; if it doesn't, we INCREMENT silentRunCountRef
    // and only drop the chunk once the count reaches
    // VAD_SILENT_RUN_TO_DROP. The first quiet chunk in a run is always
    // uploaded — it might be a soft-spoken word or the trailing
    // silence at the end of a sentence. Real loud audio resets the
    // counter immediately. Falls open (uploads anyway) when no VAD
    // reading was captured — happens when the AudioContext is
    // unavailable in the host environment, in which case we revert to
    // the v0.5.48 behaviour and rely on MIN_CHUNK_BYTES alone.
    const peakRms = chunkIdToMaxRmsRef.current.get(id)
    chunkIdToMaxRmsRef.current.delete(id)
    if (peakRms !== undefined) {
      if (peakRms < VAD_RMS_THRESHOLD) {
        silentRunCountRef.current += 1
        if (silentRunCountRef.current >= VAD_SILENT_RUN_TO_DROP) {
          if (!stillCurrent()) return
          pendingByIdRef.current.set(id, '')
          drainOrdered()
          return
        }
      } else {
        silentRunCountRef.current = 0
      }
    }
    try {
      // v0.5.52 — direct call to OpenAI Whisper from the renderer.
      await bootstrapRuntimeKeys()
      const apiKey = getOpenAIKey()
      if (!apiKey) {
        throw new Error(
          'Cloud transcription is temporarily unavailable. Please contact your administrator.',
        )
      }
      const fd = new FormData()
      fd.append('file', blob, 'chunk.webm')
      fd.append('model', 'whisper-1')
      fd.append('language', 'en')
      fd.append('response_format', 'json')
      fd.append('temperature', '0')
      fd.append('prompt', BIBLE_PROMPT)
      const r = await fetch(WHISPER_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: fd,
      })
      if (!stillCurrent()) return
      if (!r.ok) {
        let detail = `HTTP ${r.status}`
        try {
          const j = (await r.json()) as { error?: { message?: string } | string }
          if (typeof j?.error === 'string') detail = j.error
          else if (j?.error?.message) detail = j.error.message
        } catch { /* not JSON */ }
        throw new Error(detail)
      }
      const j = (await r.json()) as { text?: string }
      if (!stillCurrent()) return
      const cleaned = cleanTranscriptText(j.text || '')
      // v0.5.50 — Hallucination guard. Whisper occasionally emits
      // canned YouTube-caption phrases ("Thanks for watching",
      // "Subtitles by …", "[Music]") on near-silent or non-speech
      // audio that slips past the VAD floor. Drop those to an empty
      // placeholder and surface a console diagnostic so the operator
      // can see in DevTools that the filter fired (rather than
      // wondering why a transcript "disappeared").
      if (isHallucination(cleaned)) {
        console.warn('[whisper-hallucination] dropped:', JSON.stringify(cleaned))
        pendingByIdRef.current.set(id, '')
      } else {
        pendingByIdRef.current.set(id, cleaned)
      }
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
    // v0.5.49 — tear down the VAD analyser interval alongside the
    // chunk timer so we don't leak setIntervals across stop/start
    // cycles. The AnalyserNode itself is GC'd with the AudioContext
    // close() below.
    if (vadTimerRef.current) {
      clearInterval(vadTimerRef.current)
      vadTimerRef.current = null
    }
    analyserRef.current = null
    maxRmsInWindowRef.current = 0
    chunkIdToMaxRmsRef.current.clear()
    silentRunCountRef.current = 0
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
            // v0.5.49 — Fan the source out to a VAD analyser as well.
            // It runs in parallel with the gain → recorder pipeline,
            // so it doesn't affect the captured audio at all. We pin
            // fftSize to 2048 (~46 ms of samples at 44.1 kHz) — small
            // enough that getFloatTimeDomainData every 50 ms reads a
            // fresh window each time.
            const analyser = ctx.createAnalyser()
            analyser.fftSize = 2048
            source.connect(analyser)
            analyserRef.current = analyser
            // Reset the rolling peak so a fresh session starts clean.
            maxRmsInWindowRef.current = 0
            const tdata = new Float32Array(analyser.fftSize)
            vadTimerRef.current = setInterval(() => {
              const a = analyserRef.current
              if (!a) return
              try {
                a.getFloatTimeDomainData(tdata)
              } catch {
                return // analyser disposed mid-tick
              }
              let sumSq = 0
              for (let i = 0; i < tdata.length; i++) sumSq += tdata[i] * tdata[i]
              const rms = Math.sqrt(sumSq / tdata.length)
              if (rms > maxRmsInWindowRef.current) maxRmsInWindowRef.current = rms
            }, VAD_SAMPLE_MS)
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
          // v0.5.49 — Snapshot the peak RMS captured during this chunk's
          // recording window so `upload()` can apply the VAD threshold.
          // We only record a value when the analyser actually ran in
          // this environment; missing => upload() falls open.
          if (analyserRef.current) {
            chunkIdToMaxRmsRef.current.set(id, maxRmsInWindowRef.current)
          }
          // Reset the rolling peak for the NEXT chunk window. The
          // recorder.stop() in rotateChunk() fires this ondataavailable
          // synchronously before recorder.start() on the new instance,
          // so resetting here cleanly partitions samples between chunks.
          maxRmsInWindowRef.current = 0
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
