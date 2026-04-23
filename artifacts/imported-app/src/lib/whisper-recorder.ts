/**
 * whisper-recorder — renderer-side raw-PCM WAV encoder.
 *
 * The base (local) Whisper engine runs whisper-cli.exe which only
 * accepts 16 kHz mono 16-bit PCM WAV. The browser's MediaRecorder
 * emits webm/opus (cannot produce raw WAV), so we tap the microphone
 * via Web Audio API, buffer the raw float samples, and write a
 * standards-compliant WAV on each chunk flush.
 *
 * This file is intentionally framework-agnostic — the speech hook
 * imports it for Base Mode only.
 */

export interface WavRecorder {
  stop(): void
  flush(): Promise<ArrayBuffer>
}

const TARGET_SR = 16000 // whisper.cpp requires 16 kHz

function encodeWav(float32: Float32Array, sampleRate: number): ArrayBuffer {
  // Downmix / resample is already done by the caller — here we just
  // encode PCM16 + RIFF header. Hand-rolled to avoid yet another npm
  // dep (every KB counts in an Electron app).
  const numSamples = float32.length
  const buffer = new ArrayBuffer(44 + numSamples * 2)
  const view = new DataView(buffer)

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }

  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + numSamples * 2, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)       // PCM chunk size
  view.setUint16(20, 1, true)        // PCM format
  view.setUint16(22, 1, true)        // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true)        // block align
  view.setUint16(34, 16, true)       // bits per sample
  writeStr(36, 'data')
  view.setUint32(40, numSamples * 2, true)

  let offset = 44
  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, float32[i]))
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
    offset += 2
  }
  return buffer
}

function resampleTo16k(input: Float32Array, inRate: number): Float32Array {
  if (inRate === TARGET_SR) return input
  const ratio = inRate / TARGET_SR
  const outLen = Math.floor(input.length / ratio)
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const srcIdx = i * ratio
    const lo = Math.floor(srcIdx)
    const hi = Math.min(lo + 1, input.length - 1)
    const t = srcIdx - lo
    out[i] = input[lo] * (1 - t) + input[hi] * t
  }
  return out
}

export async function createWavRecorder(stream: MediaStream): Promise<WavRecorder> {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new AudioCtx()
  const source = ctx.createMediaStreamSource(stream)

  // ScriptProcessorNode is deprecated but universally supported in
  // Electron's Chromium build; AudioWorklet is faster but requires a
  // separate module URL which is awkward to load inside a packaged
  // Next.js build. ScriptProcessor at 4096 frames is plenty for the
  // ~5 s chunks we flush here.
  const processor = ctx.createScriptProcessor(4096, 1, 1)
  const buffers: Float32Array[] = []

  processor.onaudioprocess = (ev) => {
    const input = ev.inputBuffer.getChannelData(0)
    // Copy — the input buffer is reused by the audio graph.
    buffers.push(new Float32Array(input))
  }

  source.connect(processor)
  // Connect to a muted GainNode so the processor actually pulls data
  // but the operator doesn't hear their own mic bleed through speakers.
  const sink = ctx.createGain()
  sink.gain.value = 0
  processor.connect(sink)
  sink.connect(ctx.destination)

  let stopped = false

  return {
    stop() {
      if (stopped) return
      stopped = true
      try { processor.disconnect() } catch { /* ignore */ }
      try { source.disconnect() } catch { /* ignore */ }
      try { sink.disconnect() } catch { /* ignore */ }
      try { void ctx.close() } catch { /* ignore */ }
    },
    async flush() {
      // Concat everything captured since the last flush, resample to
      // 16 kHz, then drop the working buffer so the next chunk starts
      // fresh.
      const totalLen = buffers.reduce((a, b) => a + b.length, 0)
      if (totalLen === 0) {
        return encodeWav(new Float32Array(0), TARGET_SR)
      }
      const joined = new Float32Array(totalLen)
      let offset = 0
      for (const b of buffers) {
        joined.set(b, offset)
        offset += b.length
      }
      buffers.length = 0
      const resampled = resampleTo16k(joined, ctx.sampleRate)
      return encodeWav(resampled, TARGET_SR)
    },
  }
}
