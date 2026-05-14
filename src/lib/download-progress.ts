// Helpers powering the live "speed" and "time-left" readouts on the
// verified-download card. Extracted from `app/download/page.tsx` so the
// formatters and the rolling-window math can be exercised by unit tests.

// Wide enough that a transient stall doesn't tank the displayed rate,
// narrow enough that the number still moves quickly when conditions
// actually change.
export const DEFAULT_SPEED_WINDOW_MS = 1500

type SpeedSample = { time: number; bytes: number }

// Returns null when the rate isn't usable yet (no samples, or the
// rolling window measured ~0 bytes) so the caller can hide the readout
// instead of showing "0 B/s". Bucket boundaries are binary (1 MiB etc).
export function formatSpeed(bps: number | null): string | null {
  if (bps === null || !Number.isFinite(bps) || bps <= 0) return null
  if (bps >= 1024 * 1024) return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`
  if (bps >= 1024) return `${Math.round(bps / 1024)} KB/s`
  return `${Math.round(bps)} B/s`
}

// Compact "time left" string. Cap the smallest bucket at 1s so values
// don't flicker to "0s left" in the final stretch. Round total seconds
// *first* so we never produce rollover strings like "1m 60s left".
export function formatEta(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return null
  if (seconds < 1) return '~1s left'
  const total = Math.round(seconds)
  if (total < 60) return `~${total}s left`
  const totalMinutes = Math.floor(total / 60)
  const remSec = total % 60
  if (totalMinutes < 60) {
    return remSec > 0 ? `~${totalMinutes}m ${remSec}s left` : `~${totalMinutes}m left`
  }
  const hours = Math.floor(totalMinutes / 60)
  const mins = totalMinutes % 60
  return mins > 0 ? `~${hours}h ${mins}m left` : `~${hours}h left`
}

// Rolling-window speed tracker for an in-flight byte stream. Records
// (time, bytes) samples and reports averaged bytes/sec over the last
// `windowMs` of history, plus a derived ETA when total size is known.
// Seeded with `(startTime, 0)` so the very first chunk has a baseline.
export class RollingSpeedWindow {
  private samples: SpeedSample[]

  constructor(
    startTime: number,
    private readonly windowMs: number = DEFAULT_SPEED_WINDOW_MS,
  ) {
    this.samples = [{ time: startTime, bytes: 0 }]
  }

  // Always keep at least one anchor sample so we can still measure rate
  // when chunks arrive slowly.
  record(time: number, bytes: number): void {
    this.samples.push({ time, bytes })
    while (this.samples.length > 1 && this.samples[0].time < time - this.windowMs) {
      this.samples.shift()
    }
  }

  speedBps(): number | null {
    if (this.samples.length < 2) return null
    const oldest = this.samples[0]
    const newest = this.samples[this.samples.length - 1]
    const dtSec = (newest.time - oldest.time) / 1000
    if (dtSec <= 0) return null
    return (newest.bytes - oldest.bytes) / dtSec
  }

  // Floors at 0 so a tiny overshoot at the very end doesn't surface as
  // a negative ETA on the card.
  etaSeconds(total: number | null): number | null {
    const bps = this.speedBps()
    if (total === null || bps === null || bps <= 0) return null
    const newest = this.samples[this.samples.length - 1]
    return Math.max(0, (total - newest.bytes) / bps)
  }

  sampleCount(): number {
    return this.samples.length
  }
}
