'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cleanTranscriptText } from '@/lib/transcript-cleaner'
import { useAppStore } from '@/lib/store'
import { bootstrapRuntimeKeys, getDeepgramKey } from '@/lib/runtime-keys'
import { shouldForceFinalize } from '@/lib/voice/force-finalize'

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
  /**
   * v0.7.4 — onResult signature now passes the per-chunk confidence
   * (0..1) reported by Deepgram. Callers gate the downstream pipeline
   * by this value (live / preview / drop tiers). Falls back to 1.0
   * when Deepgram doesn't report a confidence score so we never
   * suppress a transcript chunk by accident.
   */
  /**
   * v0.7.263 — `onResult` now fires on BOTH interim and final
   * transcripts. The third `isFinal` arg tells the consumer which it
   * is so the verse detector can run a cheap explicit-reference pass on
   * every interim (sub-second detection during fast / continuous
   * speech) while reserving the expensive command / semantic / text-
   * search pipeline for finals only. The arg is optional so the Whisper
   * engine (finals-only) keeps the identical structural signature
   * without change — an omitted value is treated as `true`.
   */
  startListening: (
    onResult?: (text: string, confidence: number, isFinal?: boolean) => void,
  ) => void
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
// v0.7.247 — Dropped ScriptProcessor buffer 4096 → 2048 frames after
// operator escalation: "live transcription doesn't transcribe fast at
// all; it is very slow detecting what the speaker is saying and
// delays to pick up the words". At the typical Chromium AudioContext
// sample rate of 48 kHz, 4096 frames = 85 ms per chunk dispatched to
// Deepgram; 2048 frames = 43 ms, cutting audio-arrival latency at
// Deepgram's edge roughly in half. Combined with Deepgram Nova-3's
// interim turnaround of ~200 ms, the operator sees the first
// interim partial appear ~40 ms sooner per chunk — perceptible
// even at the single-word level (the operator's "words showing up
// late" complaint).
//
// The original 4096 comment said "large enough that we don't drown
// the renderer thread in postMessage traffic." At 43 ms cadence we
// dispatch ~23 audio messages/sec — well below the 60 Hz rAF budget
// the renderer is already comfortable with for the broadcaster
// effect, and the message payload is a small Int16Array (~1.4 KB
// after downsample-to-16kHz), so postMessage overhead is trivial.
// Going smaller (1024 = 21 ms) buys diminishing returns AND starts
// to bump into ScriptProcessorNode's documented quirk of dropping
// frames when the main thread is busy — 2048 is the sweet spot.
//
// GUARD-RAIL: ScriptProcessorNode is the SOURCE of truth for audio
// dispatch cadence; reducing this number ALONE shaves latency.
// Touching `endpointing` (currently 300 ms — v0.7.165 invariant
// against syllable fragmentation) re-introduces garbled interim
// flicker per v0.7.165 — DO NOT lower it without the keyterm boost
// + smart_format combo also being re-verified against pulpit audio.
// Touching `echoCancellation` / `noiseSuppression` flips them off:
// shaves another ~20-30 ms but degrades accuracy on church PCs
// monitoring through speakers (echo) or running near HVAC (noise) —
// only consider if the buffer reduction alone proves insufficient.
const SCRIPT_PROCESSOR_BUFFER = 2048

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

// v0.7.265 — Fire-and-forget POST of streamed audio ms to the LOCAL
// forwarder route, which attributes it to the active activation code
// and forwards to the cloud usage accumulator. keepalive:true so a
// flush fired during teardown / page unload still goes out. Best-effort;
// never throws — a dropped report just undercounts a user's AI cost.
function reportDeepgramUsageMs(ms: number): void {
  if (!(ms > 250)) return
  try {
    void fetch('/api/telemetry/deepgram-usage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ms: Math.round(ms) }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* best-effort */
  }
}

export function useDeepgramStreaming(): UseDeepgramStreamingReturn {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)

  const onResultRef = useRef<
    ((text: string, confidence: number, isFinal?: boolean) => void) | undefined
  >(undefined)
  const transcriptRef = useRef('')
  const sessionRef = useRef(0)
  const stopRequestedRef = useRef(false)

  const wsRef = useRef<WebSocket | null>(null)
  const wsReadyRef = useRef(false)
  const audioBacklogRef = useRef<ArrayBuffer[]>([])

  // v0.7.263 — slow-internet resilience. A flaky / low-bandwidth
  // connection drops the Deepgram WS mid-service (code 1006 / 1011).
  // Pre-v0.7.263 that tore the whole engine down and surfaced a hard
  // "check your internet" error, ending the operator's session until
  // they manually pressed Detect again. We now silently auto-reconnect
  // (keeping the mic + audio graph alive and buffering audio into
  // audioBacklogRef) before giving up. Audio captured during the gap is
  // flushed on the new socket's onopen, so a brief blip loses at most a
  // word or two instead of the whole session.
  const keepAliveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Set in startListening so the reconnect path can rebuild the socket
  // for the SAME session without re-running mic capture.
  const reconnectRef = useRef<(() => void) | null>(null)
  // KeepAlive cadence (Deepgram closes an idle socket after ~10 s of no
  // audio with NET-0001; 7 s keeps us comfortably under that even when
  // the operator is silent or the uplink is briefly starved).
  const KEEPALIVE_MS = 7_000
  const MAX_RECONNECT_ATTEMPTS = 6

  // v0.7.267 — FORCE-FINALIZE during sustained continuous speech.
  // Deepgram only emits is_final at ~endpointing (300 ms) silence
  // boundaries. A preacher speaking fast with no pauses produces a
  // single ever-growing interim and NO finals, so the persistent
  // transcript stalls AND the heavy AI-detection pipeline (semantic /
  // preacher-phrase / paraphrase recovery) — which is gated on final in
  // speech-provider — never runs ("AI detects nothing when he speaks
  // fast"). We track the gap since the last final; when interims keep
  // arriving past FORCE_FINALIZE_MS with no final, we send Deepgram's
  // `Finalize` control message to flush the current segment into a real
  // final. That final flows through the normal pipeline (display + FULL
  // detection) and seeds the rolling buffer, so a verse buried
  // mid-monologue is detected without waiting for the speaker to pause.
  // lastFinalizeReqAtRef rate-limits the request so interims (which
  // arrive every ~100-300 ms) can't spam Finalize before the resulting
  // final returns.
  const FORCE_FINALIZE_MS = 2_500
  const lastFinalAtRef = useRef(0)
  const lastFinalizeReqAtRef = useRef(0)

  // v0.7.265 — Per-user Deepgram usage metering. Wall-clock time the
  // socket stays OPEN (audio flowing) is accumulated and reported to the
  // local /api/telemetry/deepgram-usage forwarder. We flush periodically
  // (so a crash mid-service still bills most of the session) and on
  // every close/teardown. Reconnect gaps are NOT billed because onclose
  // clears the open mark and the new onopen restarts it.
  const streamOpenAtRef = useRef<number | null>(null)
  const usageTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const USAGE_FLUSH_MS = 60_000

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
  // v0.7.265 — Flush the open-duration accrued since the last flush to
  // the usage forwarder, then reset the open mark to now so deltas are
  // disjoint (no double counting). No-ops when the socket isn't open.
  const flushUsage = useCallback(() => {
    const startedAt = streamOpenAtRef.current
    if (startedAt == null) return
    const now = Date.now()
    const delta = now - startedAt
    streamOpenAtRef.current = now
    if (delta > 250) reportDeepgramUsageMs(delta)
  }, [])

  useEffect(() => {
    micPausedRef.current = micPausedStore
    // v0.7.265 — meter only AUDIO-SENDING time, not raw socket-open
    // wall-clock. onaudioprocess suppresses frame sends while paused,
    // so paused intervals stream no audio and must not accrue usage.
    // On pause: bill the active segment so far, then stop the clock
    // (null mark). On resume: restart the clock ONLY if the socket is
    // actually open, so we don't resurrect a closed-stream mark.
    if (micPausedStore) {
      flushUsage()
      streamOpenAtRef.current = null
    } else {
      const ws = wsRef.current
      if (ws && wsReadyRef.current && ws.readyState === WebSocket.OPEN) {
        streamOpenAtRef.current = Date.now()
      }
    }
  }, [micPausedStore, flushUsage])

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

  // v0.5.36 — graceful WebSocket drain window. After we send "CLOSE"
  // to the proxy, the server forwards CloseStream to Deepgram and
  // waits for any in-flight final results (~200-500 ms of pending
  // transcript after the last audio frame) to flow back over our
  // socket. Closing the socket from the client immediately would
  // race that drain and lose the operator's last words. We defer
  // the actual ws.close() until after this grace window OR until
  // the server closes the socket itself, whichever comes first.
  const WS_DRAIN_GRACE_MS = 1500

  const teardown = useCallback(() => {
    stopRequestedRef.current = true
    sessionRef.current += 1
    onResultRef.current = undefined
    reconnectRef.current = null
    reconnectAttemptsRef.current = 0
    setIsListening(false)
    setInterimTranscript('')

    // v0.7.263 — stop the KeepAlive ping + any pending reconnect so a
    // torn-down session doesn't keep poking a dead socket or resurrect
    // itself after the operator pressed Stop.
    if (keepAliveTimerRef.current) {
      clearInterval(keepAliveTimerRef.current)
      keepAliveTimerRef.current = null
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }

    // v0.7.265 — stop the usage flush timer and bill the final open
    // segment before we tear the socket down.
    if (usageTimerRef.current) {
      clearInterval(usageTimerRef.current)
      usageTimerRef.current = null
    }
    flushUsage()
    streamOpenAtRef.current = null

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

    // 3. Drain + close the WebSocket. We capture the ws into a local
    //    variable so the deferred close still works after we null
    //    wsRef. The onmessage handler stays attached during the drain
    //    window so any tail-of-utterance final result still reaches
    //    the transcript via handleDeepgramJson (it ignores stale
    //    sessions automatically — but stopRequestedRef is true so
    //    onResult isn't fired anymore; the operator's transcript
    //    panel still updates with the final words via setTranscript).
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
      // If the socket is already closing/closed, no point waiting.
      if (ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED) {
        return
      }
      const forceClose = setTimeout(() => {
        try { ws.close(1000, 'client stop drain timeout') } catch { /* ignore */ }
      }, WS_DRAIN_GRACE_MS)
      // If the server initiates close first (the happy path after it
      // gets Deepgram's drain ack), cancel the safety timer.
      ws.addEventListener('close', () => clearTimeout(forceClose), { once: true })
    }
  }, [flushUsage])

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
      // v0.7.267 — any final (including an empty one or a from_finalize
      // flush) resets the force-finalize clock so we only intervene
      // during a genuinely unbroken interim run.
      if (dg.is_final) lastFinalAtRef.current = Date.now()
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
        if (cb) {
          // v0.7.4 — pass the chunk-level confidence so the
          // SpeechProvider can gate the live / preview / drop
          // pipeline tiers. Default to 1.0 when Deepgram omits the
          // field (rare; happens on some special message types).
          const conf = typeof alt?.confidence === 'number'
            ? Math.max(0, Math.min(1, alt!.confidence!))
            : 1
          cb(cleaned, conf, true)
        }
      } else {
        // Interim — update the live preview field AND fire the detector
        // with isFinal=false. v0.7.263: during fast / continuous speech
        // Deepgram cuts finals infrequently (it only finalises at
        // ~300 ms silence boundaries), so a reference spoken mid-stream
        // would sit undetected until the speaker paused. Firing on the
        // interim lets the consumer run a cheap explicit-reference pass
        // immediately; it throttles + dedupes its own work so this is
        // safe to call on every partial.
        setInterimTranscript(cleaned)
        const cb = onResultRef.current
        if (cb) {
          const conf = typeof alt?.confidence === 'number'
            ? Math.max(0, Math.min(1, alt!.confidence!))
            : 1
          cb(cleaned, conf, false)
        }
        // v0.7.267 — if this interim has been growing past
        // FORCE_FINALIZE_MS with no final (continuous fast speech, no
        // 300 ms pauses), ask Deepgram to finalize the current segment.
        // The resulting from_finalize final flows through the is_final
        // branch above → persists to the transcript + runs the full AI
        // detection pipeline, instead of the segment sitting undetected
        // until the speaker happens to pause.
        const nowF = Date.now()
        if (
          shouldForceFinalize(
            nowF,
            lastFinalAtRef.current,
            lastFinalizeReqAtRef.current,
            FORCE_FINALIZE_MS,
          )
        ) {
          const ws = wsRef.current
          if (ws && ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({ type: 'Finalize' }))
              // v0.7.267 — arm the rate-limit ONLY after a successful send
              // so a transient send failure retries on the next interim
              // instead of going quiet for the whole FORCE_FINALIZE_MS
              // window (architect nit).
              lastFinalizeReqAtRef.current = nowF
            } catch {
              /* send failed — leave the rate-limit unarmed so the next
                 interim retries immediately. */
            }
          }
        }
      }
    },
    [],
  )

  const openWebSocket = useCallback(
    async (sessionAtStart: number): Promise<WebSocket> => {
      // v0.5.52 — Direct connection to Deepgram from the renderer
      // using the baked NEXT_PUBLIC_SCRIPTURELIVE_DEEPGRAM_KEY (or
      // an admin override loaded from /api/license/admin/keys). We
      // wait for the bootstrap fetch to land so a freshly-saved
      // override key is honoured on the very next start.
      await bootstrapRuntimeKeys()
      const dgKey = getDeepgramKey()
      if (!dgKey) {
        throw new Error(
          'Cloud transcription is temporarily unavailable. Please contact your administrator.',
        )
      }
      // v0.7.165 — Bring the renderer's direct Deepgram URL in line
      // with the api-server proxy (artifacts/api-server/src/routes/
      // transcribe-stream.ts + lib/deepgram-keyterms.ts). Operator
      // complaint after v0.7.92's autoGainControl removal: "the LLM
      // and AI are not listening well, transcribing rubbish, was
      // good at first, now difficult to use." Three concrete
      // regressions vs the api-server proxy were:
      //
      //   (a) MISSING `endpointing`. Without this param Nova-3
      //       defaults to ~10 ms silence detection, which fragments
      //       natural speech into many short interim results that
      //       look garbled because half-formed words flicker on the
      //       Live Transcription panel before the final correction
      //       lands. `endpointing=300` groups syllables into proper
      //       sentence-length utterances — exactly what the api-server
      //       proxy uses and what Deepgram's own docs recommend for
      //       sermon / lecture audio.
      //
      //   (b) MISSING `vad_events`. Helps Nova-3 discriminate
      //       speech-vs-noise on quiet stretches, reducing the
      //       "phantom word" emissions that make the panel look like
      //       it's making things up.
      //
      //   (c) `language: 'en'` (generic) instead of `'en-US'`. The
      //       en-US model has a stronger acoustic prior for North
      //       American + West African pulpit accents than the generic
      //       multi-region 'en' bucket. Same string the proxy uses.
      //
      // Combined with v0.7.92's AGC-off (which is correct — the
      // operator's gain slider must win), these three params restore
      // the segmentation + acoustic-prior quality the operator
      // remembers as "good at first."
      //
      // Keyterms list expanded to match api-server's BIBLE_KEYTERMS
      // verbatim: numbered books in BOTH "1 Samuel" AND "First
      // Samuel" forms (Deepgram boosts the exact phrase, not the
      // substring), preacher trigger phrases ("the Bible says",
      // "open your Bibles"), and Christian vocabulary ("Holy Spirit",
      // "covenant", "grace", etc.). Without the multi-word numbered
      // forms, "First Samuel chapter 3" got transcribed as "First
      // Sample chapter 3" or "Versammeln chapter 3" because the
      // model wasn't biased toward the exact spoken phrase.
      const KEY_TERMS: readonly string[] = [
        // Old Testament
        'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy',
        'Joshua', 'Judges', 'Ruth',
        '1 Samuel', '2 Samuel', 'First Samuel', 'Second Samuel',
        '1 Kings', '2 Kings', 'First Kings', 'Second Kings',
        '1 Chronicles', '2 Chronicles', 'First Chronicles', 'Second Chronicles',
        'Ezra', 'Nehemiah', 'Esther',
        'Job', 'Psalms', 'Psalm', 'Proverbs', 'Ecclesiastes', 'Song of Solomon',
        'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel',
        'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah',
        'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi',
        // New Testament
        'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans',
        '1 Corinthians', '2 Corinthians', 'First Corinthians', 'Second Corinthians',
        'Galatians', 'Ephesians', 'Philippians', 'Colossians',
        '1 Thessalonians', '2 Thessalonians', 'First Thessalonians', 'Second Thessalonians',
        '1 Timothy', '2 Timothy', 'First Timothy', 'Second Timothy',
        'Titus', 'Philemon', 'Hebrews', 'James',
        '1 Peter', '2 Peter', 'First Peter', 'Second Peter',
        '1 John', '2 John', '3 John', 'First John', 'Second John', 'Third John',
        'Jude', 'Revelation',
        // Reference vocabulary — boosts the colon ("John 3:16") and
        // verbose ("chapter X verse Y") forms the bible-api parser
        // commits on.
        'chapter', 'verse', 'verses',
        'the Bible says', 'scripture says', 'according to scripture',
        'turn to', 'let us read', 'open your Bibles',
        // Christian vocabulary
        'Jesus', 'Christ', 'Lord', 'God', 'Holy Spirit',
        'gospel', 'salvation', 'righteousness', 'kingdom',
        'covenant', 'prophet', 'apostle', 'disciple',
        'faith', 'grace', 'mercy', 'repentance', 'amen', 'hallelujah',
        // v0.7.253 — African English pulpit vocabulary boost.
        // Operator: "apply african english tone for easy detections."
        // West-African (Ghanaian / Nigerian) pulpit cadence pronounces
        // these phrases with distinct vowel + stress patterns that the
        // generic en-US acoustic prior under-weights, leading to common
        // mis-transcriptions: "Holy Ghost" → "holy goat", "Jehovah" →
        // "Joe over", "brethren" → "Britain", "anointing" → "annoying",
        // "breakthrough" → "break the room", "favour" → "favorite",
        // "testimony" → "testify many", "El Shaddai" → "El Sunday".
        // Promoting the canonical spellings as keyterms biases Nova-3's
        // decoder toward the correct hypothesis when the acoustic prior
        // is ambiguous. Keyterms are weighted overlays — they raise
        // probability for the listed phrases without suppressing
        // anything else, so adding them is risk-free for non-African
        // operators. Ordered by observed misrecognition frequency in
        // operator-submitted clips.
        'Holy Ghost', 'Jehovah', 'Yahweh', 'Adonai', 'Elohim',
        'El Shaddai', 'Abba Father', 'Most High', 'Almighty',
        'brethren', 'saints', 'beloved', 'pastor', 'evangelist',
        'minister', 'deacon', 'elder', 'intercessor',
        'anointing', 'breakthrough', 'deliverance', 'restoration',
        'favour', 'blessings', 'miracle', 'testimony', 'altar',
        'intercession', 'consecration', 'sanctification',
        'tongues', 'fire', 'glory', 'manifestation',
        'praise the Lord', 'glory be to God', 'thank you Jesus',
        'in Jesus name', 'in the mighty name of Jesus',
        'God bless you', 'shall come to pass', 'it is well',
        // Hebrew / Aramaic worship terms commonly used in
        // African-English worship services.
        'Hosanna', 'Maranatha', 'Selah', 'Shalom', 'Emmanuel',
      ]
      const params = new URLSearchParams({
        model: 'nova-3',
        language: 'en-US',
        smart_format: 'true',
        interim_results: 'true',
        punctuate: 'true',
        encoding: 'linear16',
        sample_rate: String(TARGET_SAMPLE_RATE),
        channels: '1',
        endpointing: '300',
        vad_events: 'true',
      })
      // Deepgram Nova-3 streaming enforces a hard limit of ~140 keyterms
      // per WebSocket query (returns HTTP 400 "Bad Request" on handshake
      // above that). v0.7.253 added ~75 phrases bringing the total to 159
      // — silently breaking AI Detection on every install. Cap at 100 to
      // leave safe headroom for future additions and any Deepgram-side
      // limit tightening. Empirical bisect: 140 OK, 145 → 400.
      const KEY_TERMS_LIMIT = 100
      for (const k of KEY_TERMS.slice(0, KEY_TERMS_LIMIT)) params.append('keyterm', k)
      const wssUrl = `wss://api.deepgram.com/v1/listen?${params.toString()}`
      // eslint-disable-next-line no-console
      console.log('[deepgram-hook] direct WSS to api.deepgram.com')

      // Auth via Sec-WebSocket-Protocol per Deepgram's browser SDK
      // contract: ['token', '<KEY>']. Browsers don't allow custom
      // headers on WebSocket; this is the only supported channel.
      const ws = new WebSocket(wssUrl, ['token', dgKey])
      ws.binaryType = 'arraybuffer'
      ws.onopen = () => {
        // eslint-disable-next-line no-console
        console.log('[deepgram-hook] WS OPEN')
        if (sessionRef.current !== sessionAtStart) {
          try { ws.close(1000, 'session stale') } catch { /* ignore */ }
          return
        }
        wsReadyRef.current = true
        // v0.7.267 — seed the force-finalize clock so the first interim
        // measures its gap from connection time, not epoch 0 (which would
        // fire Finalize immediately and uselessly on the very first word).
        lastFinalAtRef.current = Date.now()
        lastFinalizeReqAtRef.current = 0
        // v0.7.265 — mark the audio-flowing window open + (re)start the
        // periodic usage flush. Reconnects re-enter here and restart the
        // mark, so time during a disconnect gap is never billed.
        streamOpenAtRef.current = Date.now()
        if (usageTimerRef.current) clearInterval(usageTimerRef.current)
        usageTimerRef.current = setInterval(() => {
          if (sessionRef.current !== sessionAtStart) return
          flushUsage()
        }, USAGE_FLUSH_MS)
        // A clean open means the link is healthy again — reset the
        // reconnect attempt counter so a LATER blip gets the full retry
        // budget, and clear any operator-facing reconnect error.
        reconnectAttemptsRef.current = 0
        setError(null)
        // Flush any audio captured while the socket was connecting OR
        // buffered during a reconnect gap. This is what makes a brief
        // slow-internet drop lose at most a word instead of the session.
        const backlog = audioBacklogRef.current
        audioBacklogRef.current = []
        for (const buf of backlog) {
          try { ws.send(buf) } catch { /* ignore */ }
        }
        if (backlog.length) {
          // eslint-disable-next-line no-console
          console.log('[deepgram-hook] flushed', backlog.length, 'backlog audio frames')
        }
        // v0.7.263 — KeepAlive ping. Deepgram closes an idle socket
        // (~10 s without audio) with NET-0001; on a starved uplink the
        // audio frames can stall long enough to trip that. A periodic
        // KeepAlive control message holds the socket open through the
        // gap so we reconnect far less often in the first place.
        if (keepAliveTimerRef.current) clearInterval(keepAliveTimerRef.current)
        keepAliveTimerRef.current = setInterval(() => {
          if (sessionRef.current !== sessionAtStart) return
          if (ws.readyState === WebSocket.OPEN) {
            try { ws.send(JSON.stringify({ type: 'KeepAlive' })) } catch { /* ignore */ }
          }
        }, KEEPALIVE_MS)
      }
      ws.onmessage = (ev) => {
        if (typeof ev.data === 'string') {
          // eslint-disable-next-line no-console
          console.log('[deepgram-hook] WS msg:', ev.data.slice(0, 200))
          handleDeepgramJson(ev.data, sessionAtStart)
        }
      }
      ws.onerror = () => {
        if (sessionRef.current !== sessionAtStart) return
        setError('Live transcription connection failed.')
      }
      ws.onclose = (ev) => {
        if (sessionRef.current !== sessionAtStart) return
        wsReadyRef.current = false
        // Stop pinging a closed socket.
        if (keepAliveTimerRef.current) {
          clearInterval(keepAliveTimerRef.current)
          keepAliveTimerRef.current = null
        }
        // v0.7.265 — bill the segment this socket was open, stop the
        // flush timer, and clear the open mark. A reconnect's onopen
        // restarts both; teardown's flush then no-ops (mark already null).
        if (usageTimerRef.current) {
          clearInterval(usageTimerRef.current)
          usageTimerRef.current = null
        }
        flushUsage()
        streamOpenAtRef.current = null
        // v0.5.36 — if the operator did NOT request stop, this is an
        // unexpected close (proxy crashed, network blip, Deepgram
        // sent us 1011, etc.).
        if (!stopRequestedRef.current) {
          const code = ev.code || 0
          // v0.7.263 — SLOW-INTERNET AUTO-RECONNECT. Rather than tear
          // the whole engine down on the first blip, transparently
          // rebuild the socket for the SAME session while keeping the
          // mic + audio graph alive. onaudioprocess keeps buffering PCM
          // into audioBacklogRef (capped at 2 MB) during the gap, and
          // the new socket's onopen flushes it. Only after the retry
          // budget is exhausted do we surface a hard error + teardown.
          // A normal 1000/1001 close that we didn't request (e.g. the
          // server cycled) is still worth one reconnect attempt.
          const reconnect = reconnectRef.current
          if (reconnect && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
            const attempt = ++reconnectAttemptsRef.current
            // Exponential backoff capped at 4 s: 0.4, 0.8, 1.6, 3.2, 4, 4.
            const delay = Math.min(4_000, 400 * 2 ** (attempt - 1))
            // eslint-disable-next-line no-console
            console.log(
              `[deepgram-hook] WS closed (${code}); reconnect attempt ${attempt}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`,
            )
            // Soft, non-alarming status while we retry — the operator
            // sees "Reconnecting…" rather than a crash-looking error.
            setError(`Reconnecting… (network was interrupted)`)
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
            reconnectTimerRef.current = setTimeout(() => {
              reconnectTimerRef.current = null
              if (sessionRef.current !== sessionAtStart) return
              if (stopRequestedRef.current) return
              reconnect()
            }, delay)
            return
          }
          // Retry budget exhausted — surface the error + tear down so
          // the OS mic indicator goes off and the UI doesn't keep
          // claiming we're "listening" to a dead socket.
          // 1006 is the browser's "abnormal closure" code — emitted
          // when the WebSocket handshake itself failed or the remote
          // host vanished without sending a close frame. The most
          // common cause in this app is the WSS endpoint not having
          // a WebSocket upgrade handler attached (e.g. pointing at
          // the imported-app's Next.js domain instead of the
          // api-server). Spell that out so the operator can fix it.
          // v0.7.81 — Operator-facing message. Pre-v0.7.81 we leaked
          // server-side terminology (WebSocket / DEEPGRAM_API_KEY /
          // /api/transcribe-stream) into the live transcription panel
          // for code 1006 — the operator complaint was that this
          // looked like a crash report mid-service. The overwhelmingly
          // common cause of 1006 in the field is the operator's PC
          // being offline (no Wi-Fi, captive portal, ISP blip), so we
          // now surface a plain "check your internet" message and
          // keep the technical reason only when the server actually
          // sent one.
          const reason =
            ev.reason ||
            (code === 1006
              ? 'Check your internet — connect to a network and try Detect again.'
              : 'connection closed')
          setError(
            code === 1006 && !ev.reason
              ? reason
              : `Live transcription disconnected (${code}: ${reason}).`,
          )
          teardown()
        }
      }
      return ws
    },
    [handleDeepgramJson, flushUsage],
  )

  const startListening = useCallback(
    (onResult?: (text: string, confidence: number, isFinal?: boolean) => void) => {
      // eslint-disable-next-line no-console
      console.log('[deepgram-hook] startListening() called. isSupported =', isSupported)
      if (!isSupported) {
        // eslint-disable-next-line no-console
        console.error('[deepgram-hook] env not supported:', {
          hasWindow: typeof window !== 'undefined',
          hasNavigator: typeof navigator !== 'undefined',
          hasGetUserMedia: !!navigator?.mediaDevices?.getUserMedia,
          hasWebSocket: typeof WebSocket !== 'undefined',
          hasAudioContext: typeof AudioContext !== 'undefined',
        })
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
      reconnectAttemptsRef.current = 0
      setError(null)

      // v0.7.263 — reconnect closure for the slow-internet path. The
      // onclose handler calls this (after a backoff) to rebuild ONLY the
      // socket, reusing the live mic + audio graph for this same
      // session. Audio captured during the gap is already queued in
      // audioBacklogRef and gets flushed by the new socket's onopen.
      reconnectRef.current = () => {
        if (sessionRef.current !== sessionAtStart || stopRequestedRef.current) return
        openWebSocket(sessionAtStart)
          .then((ws) => {
            if (!ws) return
            if (sessionRef.current !== sessionAtStart || stopRequestedRef.current) {
              try { ws.close(1000, 'session stale') } catch { /* ignore */ }
              return
            }
            wsRef.current = ws
          })
          .catch(() => {
            // Rebuild failed (key fetch / handshake). Schedule another
            // attempt within budget, else surface the hard error.
            if (sessionRef.current !== sessionAtStart || stopRequestedRef.current) return
            if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
              const attempt = ++reconnectAttemptsRef.current
              const delay = Math.min(4_000, 400 * 2 ** (attempt - 1))
              if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
              reconnectTimerRef.current = setTimeout(() => {
                reconnectTimerRef.current = null
                reconnectRef.current?.()
              }, delay)
            } else {
              setError('Live transcription disconnected. Please try Detect again.')
              teardown()
            }
          })
      }

      const win = window as unknown as { __selectedMicrophoneId?: string | null }
      const deviceId = win.__selectedMicrophoneId || undefined
      // v0.7.92 — autoGainControl:false is REQUIRED for two reasons:
      //   1. Without it, Chromium's AGC continuously renormalizes the
      //      input level, completely overriding the operator's mic-gain
      //      slider (the slider IS hooked up to a GainNode in the audio
      //      graph, but AGC sits upstream and undoes our scaling on
      //      every block). With AGC off, the GainNode actually moves
      //      the needle the operator sees.
      //   2. AGC writes to the OS mic-input volume slider, which is
      //      system-wide on Windows. Result: OBS / vMix / Zoom / Teams
      //      all suddenly see their mic level dropped the moment we
      //      capture audio. Disabling AGC keeps the OS slider where the
      //      operator put it.
      const constraints: MediaStreamConstraints = deviceId
        ? { audio: { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: false } }
        : { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } }

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
