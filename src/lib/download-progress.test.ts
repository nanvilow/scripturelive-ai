import { describe, it, expect } from 'vitest'
import {
  DEFAULT_SPEED_WINDOW_MS,
  RollingSpeedWindow,
  formatEta,
  formatSpeed,
} from './download-progress'

describe('formatSpeed', () => {
  it('returns null for null / non-finite / non-positive inputs', () => {
    expect(formatSpeed(null)).toBeNull()
    expect(formatSpeed(0)).toBeNull()
    expect(formatSpeed(-1)).toBeNull()
    expect(formatSpeed(-1024)).toBeNull()
    expect(formatSpeed(Number.NaN)).toBeNull()
    expect(formatSpeed(Number.POSITIVE_INFINITY)).toBeNull()
    expect(formatSpeed(Number.NEGATIVE_INFINITY)).toBeNull()
  })

  it('renders sub-1 KiB rates as B/s with whole-byte rounding', () => {
    expect(formatSpeed(1)).toBe('1 B/s')
    expect(formatSpeed(123)).toBe('123 B/s')
    expect(formatSpeed(999.4)).toBe('999 B/s')
    expect(formatSpeed(999.6)).toBe('1000 B/s')
    expect(formatSpeed(1023)).toBe('1023 B/s')
  })

  it('renders KiB rates as KB/s with whole-KB rounding', () => {
    expect(formatSpeed(1024)).toBe('1 KB/s')
    expect(formatSpeed(2.4 * 1024)).toBe('2 KB/s')
    expect(formatSpeed(2.6 * 1024)).toBe('3 KB/s')
    expect(formatSpeed(512 * 1024)).toBe('512 KB/s')
    expect(formatSpeed(1024 * 1024 - 1)).toBe('1024 KB/s')
  })

  it('renders MiB rates as MB/s with one decimal place', () => {
    expect(formatSpeed(1024 * 1024)).toBe('1.0 MB/s')
    expect(formatSpeed(2.4 * 1024 * 1024)).toBe('2.4 MB/s')
    expect(formatSpeed(2.45 * 1024 * 1024)).toBe('2.5 MB/s')
    expect(formatSpeed(125 * 1024 * 1024)).toBe('125.0 MB/s')
  })

  it('does not flip units backwards across the KB→MB boundary', () => {
    // At exactly 1 MiB we render MB, never KB — prevents jitter when
    // the speed crosses back and forth across the threshold.
    expect(formatSpeed(1024 * 1024 - 1)).toMatch(/KB\/s$/)
    expect(formatSpeed(1024 * 1024)).toMatch(/MB\/s$/)
    expect(formatSpeed(1024 * 1024 + 1)).toMatch(/MB\/s$/)
  })
})

describe('formatEta', () => {
  it('returns null for null / negative / non-finite inputs', () => {
    expect(formatEta(null)).toBeNull()
    expect(formatEta(-1)).toBeNull()
    expect(formatEta(-0.1)).toBeNull()
    expect(formatEta(Number.NaN)).toBeNull()
    expect(formatEta(Number.POSITIVE_INFINITY)).toBeNull()
    expect(formatEta(Number.NEGATIVE_INFINITY)).toBeNull()
  })

  it('floors sub-second values at "~1s left" so the readout never flickers to 0s', () => {
    expect(formatEta(0)).toBe('~1s left')
    expect(formatEta(0.1)).toBe('~1s left')
    expect(formatEta(0.49)).toBe('~1s left')
    expect(formatEta(0.99)).toBe('~1s left')
  })

  it('renders whole-second values in the seconds bucket', () => {
    expect(formatEta(1)).toBe('~1s left')
    expect(formatEta(1.4)).toBe('~1s left')
    expect(formatEta(1.6)).toBe('~2s left')
    expect(formatEta(30)).toBe('~30s left')
    expect(formatEta(59)).toBe('~59s left')
    expect(formatEta(59.4)).toBe('~59s left')
  })

  it('rolls 59.5s up into the minutes bucket without producing "60s"', () => {
    expect(formatEta(59.5)).toBe('~1m left')
    expect(formatEta(60)).toBe('~1m left')
  })

  it('renders minutes with and without a remaining-seconds tail', () => {
    expect(formatEta(61)).toBe('~1m 1s left')
    expect(formatEta(90)).toBe('~1m 30s left')
    expect(formatEta(120)).toBe('~2m left')
    expect(formatEta(125)).toBe('~2m 5s left')
    expect(formatEta(59 * 60 + 59)).toBe('~59m 59s left')
  })

  it('rolls 59m 59.5s up into the hours bucket without producing "60m"', () => {
    expect(formatEta(59 * 60 + 59.5)).toBe('~1h left')
    expect(formatEta(3600)).toBe('~1h left')
  })

  it('renders hours with and without a remaining-minutes tail', () => {
    expect(formatEta(3600 + 60)).toBe('~1h 1m left')
    expect(formatEta(3600 + 30 * 60)).toBe('~1h 30m left')
    expect(formatEta(2 * 3600)).toBe('~2h left')
    expect(formatEta(2 * 3600 + 5 * 60)).toBe('~2h 5m left')
    // Sub-minute remainder under the hour bucket is dropped.
    expect(formatEta(3600 + 30)).toBe('~1h left')
    expect(formatEta(3600 + 59)).toBe('~1h left')
  })
})

describe('RollingSpeedWindow', () => {
  it('returns null speed/ETA before any chunks have been recorded', () => {
    const w = new RollingSpeedWindow(0)
    expect(w.speedBps()).toBeNull()
    expect(w.etaSeconds(1_000_000)).toBeNull()
    expect(w.sampleCount()).toBe(1)
  })

  it('uses the seed anchor so the first chunk already has a baseline', () => {
    const w = new RollingSpeedWindow(0)
    w.record(1000, 100_000)
    expect(w.speedBps()).toBeCloseTo(100_000, 5)
    expect(w.sampleCount()).toBe(2)
  })

  it('averages bytes/sec across the retained window', () => {
    const w = new RollingSpeedWindow(0)
    let bytes = 0
    for (let t = 250; t <= 1500; t += 250) {
      bytes += 250_000
      w.record(t, bytes)
    }
    // 1,500,000 bytes / 1.5s = 1,000,000 B/s.
    expect(w.speedBps()).toBeCloseTo(1_000_000, 5)
  })

  it('returns null speed when retained samples have zero time delta', () => {
    const w = new RollingSpeedWindow(1000)
    w.record(1000, 50_000)
    expect(w.speedBps()).toBeNull()
    expect(w.etaSeconds(1_000_000)).toBeNull()
  })

  it('drops samples older than the window but always keeps at least one anchor', () => {
    const w = new RollingSpeedWindow(0, 1500)
    let bytes = 0
    for (let t = 200; t <= 4000; t += 200) {
      bytes += 200_000
      w.record(t, bytes)
    }
    expect(w.sampleCount()).toBeGreaterThanOrEqual(2)
    expect(w.speedBps()).toBeCloseTo(1_000_000, 0)
  })

  it("a transient stall mid-stream doesn't tank the displayed rate", () => {
    // Steady ~2 MB/s for ~1.5s, then a UI tick with no fresh bytes.
    // The rolling window should still report MB/s, not collapse to 0.
    const w = new RollingSpeedWindow(0, 1500)
    let bytes = 0
    for (let t = 100; t <= 1500; t += 100) {
      bytes += 200_000
      w.record(t, bytes)
    }
    const steady = w.speedBps()!
    expect(steady).toBeGreaterThan(1_500_000)

    w.record(1800, bytes)
    const stalled = w.speedBps()!
    expect(stalled).toBeGreaterThan(1_000_000)
    expect(stalled).toBeLessThanOrEqual(steady)
  })

  it("a hard stall longer than the window collapses speed to null without going negative", () => {
    // Every prior sample evicted, leaving just the latest zero-progress
    // entry as a single anchor. The window can't measure with one sample,
    // so speed/ETA both go null — the UI hides the rate cell in that case.
    const w = new RollingSpeedWindow(0, 1500)
    let bytes = 0
    for (let t = 100; t <= 1500; t += 100) {
      bytes += 200_000
      w.record(t, bytes)
    }
    w.record(5000, bytes)
    expect(w.sampleCount()).toBe(1)
    expect(w.speedBps()).toBeNull()
    expect(w.etaSeconds(bytes + 10_000_000)).toBeNull()
  })

  it('etaSeconds is null when the total is unknown', () => {
    // Without Content-Length the reader passes total=null; the card
    // shows speed only.
    const w = new RollingSpeedWindow(0)
    w.record(1000, 1024 * 1024)
    expect(w.speedBps()).toBeCloseTo(1024 * 1024, 5)
    expect(w.etaSeconds(null)).toBeNull()
  })

  it('etaSeconds is null when speed is zero or unmeasurable', () => {
    const w = new RollingSpeedWindow(0)
    w.record(1000, 0)
    expect(w.speedBps()).toBe(0)
    expect(w.etaSeconds(1_000_000)).toBeNull()
  })

  it('etaSeconds floors at zero on a tiny overshoot at the end', () => {
    // Some servers send slightly more than the advertised Content-Length.
    const w = new RollingSpeedWindow(0)
    w.record(1000, 1_000_100)
    expect(w.etaSeconds(1_000_000)).toBe(0)
  })

  it('etaSeconds tracks a clean linear download down to ~0', () => {
    // Push two samples within the 1.5s window so the rate is measurable
    // (matching the throttled record cadence in the real reader loop).
    const total = 10_000_000
    const speedBps = 1_000_000

    const wMid = new RollingSpeedWindow(0)
    wMid.record(4500, Math.round(speedBps * 4.5))
    wMid.record(5000, Math.round(speedBps * 5))
    expect(wMid.speedBps()).toBeCloseTo(speedBps, 5)
    expect(wMid.etaSeconds(total)).toBeCloseTo(5, 5)

    const wEnd = new RollingSpeedWindow(0)
    wEnd.record(8500, Math.round(speedBps * 8.5))
    wEnd.record(9000, Math.round(speedBps * 9))
    expect(wEnd.etaSeconds(total)).toBeCloseTo(1, 5)
  })

  it('honors a custom window length', () => {
    const w = new RollingSpeedWindow(0, 500)
    w.record(100, 100_000)
    w.record(400, 400_000)
    w.record(700, 700_000) // evicts the t=100 anchor
    // Oldest retained is t=400; (700k-400k)/0.3s = 1 MB/s.
    expect(w.speedBps()).toBeCloseTo(1_000_000, 0)
  })

  it('exports the documented default window length', () => {
    expect(DEFAULT_SPEED_WINDOW_MS).toBe(1500)
  })
})
