/**
 * Regression test for the v0.7.57 NDI-while-minimised fix.
 *
 * The bug: OutputBroadcaster used requestAnimationFrame to coalesce
 * its POST /api/output flushes. Chromium SUSPENDS rAF callbacks on
 * minimised Electron BrowserWindows, so detected verses updated the
 * Zustand store but never reached the SSE channel feeding the
 * offscreen NDI capture window. vMix saw a frozen frame until the
 * operator restored the window.
 *
 * The fix: replaced rAF with a 16ms setTimeout. Timers are not
 * visibility-throttled to a stop the way rAF is.
 *
 * This test reproduces the exact scheduler shape (no React / no
 * Zustand needed -- the bug is in the scheduling primitive itself)
 * under a "minimised window" simulation where requestAnimationFrame
 * is a no-op (callbacks queued but never invoked, just like Chromium
 * does on a hidden BrowserWindow). It asserts the OLD pattern never
 * flushes while the NEW pattern does.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type Scheduler = (cb: () => void) => unknown
type Cancel = (handle: unknown) => void

/** Mirrors the OLD output-broadcaster scheduler (rAF-based). */
function makeOldScheduler(raf: Scheduler, _caf: Cancel) {
  let handle: unknown = null
  return (flush: () => void) => {
    if (handle !== null) return
    handle = raf(() => {
      handle = null
      flush()
    })
  }
}

/** Mirrors the NEW output-broadcaster scheduler (setTimeout-based). */
function makeNewScheduler() {
  let handle: ReturnType<typeof setTimeout> | null = null
  return (flush: () => void) => {
    if (handle !== null) return
    handle = setTimeout(() => {
      handle = null
      flush()
    }, 16)
  }
}

describe('OutputBroadcaster scheduler — minimised window behaviour', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('OLD rAF scheduler: stalls indefinitely when rAF is suspended (reproduces the bug)', () => {
    // Simulate Chromium's behaviour on a minimised BrowserWindow:
    // rAF accepts the callback but NEVER fires it.
    const suspendedRaf: Scheduler = vi.fn(() => 1)
    const noopCaf: Cancel = vi.fn()

    const flush = vi.fn()
    const schedule = makeOldScheduler(suspendedRaf, noopCaf)

    // Operator detects 5 verses while window is minimised.
    for (let i = 0; i < 5; i++) schedule(flush)

    // Advance a generous wall-clock window (5s) -- way longer than
    // any realistic verse-to-vMix latency expectation.
    vi.advanceTimersByTime(5000)

    // The bug: flush is NEVER called. The POST never happens. SSE
    // never broadcasts. The offscreen NDI capture page sees no
    // updates. vMix freezes on the last pre-minimise frame.
    expect(flush).not.toHaveBeenCalled()
    // rAF was queued exactly once (subsequent schedule() calls
    // coalesced behind the existing handle).
    expect(suspendedRaf).toHaveBeenCalledTimes(1)
  })

  it('NEW setTimeout scheduler: flushes within one frame even when rAF is suspended (the fix)', () => {
    const flush = vi.fn()
    const schedule = makeNewScheduler()

    // Same scenario: operator detects 5 verses while minimised.
    for (let i = 0; i < 5; i++) schedule(flush)

    // After ~16ms (one frame), the timer fires and the POST goes out.
    vi.advanceTimersByTime(20)

    expect(flush).toHaveBeenCalledTimes(1)
  })

  it('NEW setTimeout scheduler: still coalesces bursty updates into a single flush per frame', () => {
    const flush = vi.fn()
    const schedule = makeNewScheduler()

    // 100 rapid updates in a single tick (e.g. the operator drags a
    // settings slider, or Whisper emits a burst of partials).
    for (let i = 0; i < 100; i++) schedule(flush)

    vi.advanceTimersByTime(20)
    // Coalesced to ONE POST -- network cost identical to old rAF path
    // when the window IS visible.
    expect(flush).toHaveBeenCalledTimes(1)

    // A second burst after the first flush schedules a fresh flush.
    for (let i = 0; i < 100; i++) schedule(flush)
    vi.advanceTimersByTime(20)
    expect(flush).toHaveBeenCalledTimes(2)
  })

  it('NEW setTimeout scheduler: continuous detections deliver continuous flushes (real-time NDI)', () => {
    const flush = vi.fn()
    const schedule = makeNewScheduler()

    // Simulate 1 second of speech: a verse-detection update every
    // 100ms while the window is minimised.
    for (let t = 0; t < 1000; t += 100) {
      schedule(flush)
      vi.advanceTimersByTime(100)
    }

    // ~10 flushes -- one per detection, all delivered while
    // minimised. Old rAF path would have delivered ZERO.
    expect(flush.mock.calls.length).toBeGreaterThanOrEqual(9)
  })
})
