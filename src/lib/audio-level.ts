// Real-signal audio meter — attaches a Web Audio analyser to a
// <video> element and reads the current RMS level. The operator's
// audio meter in logos-shell pulls from this so the bar tracks the
// actual sound coming out of the source instead of bouncing
// randomly. Singletons keyed by element so we never double-attach
// (browsers throw on a second createMediaElementSource for the
// same element).

let ctx: AudioContext | null = null
const analysers = new WeakMap<HTMLMediaElement, AnalyserNode>()
let resumeWired = false

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (ctx) return ctx
  const Ctor =
    (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  try {
    ctx = new Ctor()
  } catch {
    return null
  }
  // First user gesture anywhere on the page resumes the context.
  if (!resumeWired) {
    resumeWired = true
    const wake = () => {
      ctx?.resume().catch(() => {})
    }
    window.addEventListener('pointerdown', wake, { once: false, passive: true })
    window.addEventListener('keydown', wake, { once: false, passive: true })
  }
  return ctx
}

export function attachAnalyser(el: HTMLMediaElement): AnalyserNode | null {
  const existing = analysers.get(el)
  if (existing) return existing
  const c = getCtx()
  if (!c) return null
  try {
    if (c.state === 'suspended') c.resume().catch(() => {})
    const src = c.createMediaElementSource(el)
    const an = c.createAnalyser()
    an.fftSize = 512
    an.smoothingTimeConstant = 0.6
    src.connect(an)
    // Pipe back to speakers — once an element is routed through a
    // MediaElementSource its native audio path is replaced by the
    // graph, so we have to reconnect to destination or audio goes
    // silent.
    an.connect(c.destination)
    analysers.set(el, an)
    return an
  } catch {
    return null
  }
}

const buf = typeof window === 'undefined' ? null : new Uint8Array(512)

export function readLevel(an: AnalyserNode): number {
  if (!buf) return 0
  const view = buf.subarray(0, an.fftSize)
  an.getByteTimeDomainData(view)
  let sum = 0
  for (let i = 0; i < view.length; i++) {
    const v = (view[i] - 128) / 128
    sum += v * v
  }
  const rms = Math.sqrt(sum / view.length)
  // Most program audio sits well below 1.0; scale + clamp so the
  // meter has visible travel for normal speech / music levels.
  return Math.min(1, rms * 3.2)
}
