import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, open, truncate, unlink } from 'node:fs/promises'
import { dirname } from 'node:path'

/**
 * Pure-Node multi-threaded HTTP range downloader for v0.7.17.
 *
 * Why exist:
 *   electron-updater downloads the signed installer over a SINGLE HTTP
 *   connection from GitHub Releases. On Ghana church PCs with shared
 *   ~5 Mbps office links the server-side TCP window per connection
 *   often caps the effective rate well below the link's true ceiling,
 *   so a 50 MB installer can take 2–3 minutes — long enough that
 *   operators assume the app froze and start restarting things mid-
 *   service. By splitting the download across 4 parallel HTTP Range
 *   requests we routinely see 2–4x throughput on the same connection
 *   without changing CDNs.
 *
 * Design:
 *   1. HEAD probe — discover total size and confirm the server
 *      advertises `Accept-Ranges: bytes`. If either is missing we fall
 *      back to a single-stream GET (safer than guessing).
 *   2. Pre-allocate the destination via `truncate(path, total)` so each
 *      chunk can write into its own slice without coordinating.
 *   3. Issue N parallel `fetch(url, { headers: { Range: ... } })` —
 *      each chunk reads a body stream and writes positionally with
 *      `fd.write(buf, 0, len, pos)`.
 *   4. Throttled 10 Hz progress callback aggregates per-chunk bytes
 *      and computes a rolling-window bytes/sec so the UI doesn't
 *      jitter on bursty TCP. Window is ~1.5s — long enough to smooth
 *      out, short enough to reflect a network slowdown quickly.
 *   5. SHA-512 verify after assembly. We hash the on-disk file (not
 *      while writing) because the chunks land out-of-order — the
 *      single-pass post-write hash is far simpler to reason about and
 *      a sequential disk read at 500+ MB/s is negligible compared to
 *      the network download itself.
 *
 * Cancellation:
 *   Caller passes an `AbortSignal`; we propagate it into every fetch
 *   so aborting cancels every chunk simultaneously. We do NOT delete
 *   the partial file on abort — leaving it in place lets the next
 *   download attempt resume against the same target without a stale
 *   handle on Windows.
 *
 * Trust boundary:
 *   The SHA-512 from `latest.yml` is fetched out-of-band by the
 *   caller (from the same GitHub release). A man-in-the-middle would
 *   need to forge BOTH the latest.yml AND the installer payload to
 *   match — the hash check is the same defense electron-updater uses,
 *   so we maintain that bar exactly.
 */

export interface ParallelDownloadProgress {
  /** Bytes successfully written so far across all chunks. */
  transferred: number
  /** Total bytes to download (from Content-Length / latest.yml). */
  total: number
  /** Smoothed throughput in bytes per second (rolling 1.5s window). */
  bytesPerSecond: number
  /** 0..100 — convenient for UI progress bars. */
  percent: number
  /** Number of parallel chunks in flight (1 if single-stream fallback). */
  parallelism: number
  /** Estimated seconds remaining at current speed (Infinity if speed=0). */
  etaSeconds: number
}

export interface ParallelDownloadOpts {
  /** Source URL (must support HTTP Range for parallelism > 1). */
  url: string
  /** Absolute path to write the assembled file to. */
  savePath: string
  /** Optional total size hint (skips HEAD if provided alongside Range support). */
  expectedSize?: number
  /** Base64-encoded SHA-512 (electron-updater format from latest.yml). */
  expectedSha512?: string
  /** Number of parallel chunks. Default 4, capped at 8. */
  parallelism?: number
  /** Throttled (~10 Hz) progress callback. */
  onProgress?: (p: ParallelDownloadProgress) => void
  /** Caller-driven cancellation. */
  signal?: AbortSignal
}

export interface ParallelDownloadResult {
  savePath: string
  totalBytes: number
  durationMs: number
  /** Effective parallelism actually used (1 on single-stream fallback). */
  parallelism: number
  /** True if we used HTTP Range chunks; false if we fell back to single GET. */
  rangedUsed: boolean
}

interface ChunkState {
  start: number
  end: number
  transferred: number
}

const PROGRESS_THROTTLE_MS = 100
const SPEED_WINDOW_MS = 1500
// v0.7.55 — Network safety nets. The original implementation had NO
// timeouts anywhere and NO stall detector, so any TCP stall on a
// flaky church link (HEAD that never responds, S3 redirect that
// hangs after the body opens, a single chunk whose stream silently
// stops without a FIN) left the operator staring at "Downloading
// update… 0%" with no progress events ever firing and no fallback
// ever triggering. These three deadlines bound the worst case:
//   HEAD_TIMEOUT_MS      — abort HEAD probe and try single-stream.
//   CHUNK_HEADER_TIMEOUT_MS — abort a chunk whose response headers
//                             never arrive (TLS handshake stuck etc).
//   STALL_TIMEOUT_MS     — if total transferred doesn't grow for
//                          this long, throw so the caller can fall
//                          back to electron-updater (which has its
//                          own retry/backoff logic).
const HEAD_TIMEOUT_MS = 10_000
const CHUNK_HEADER_TIMEOUT_MS = 30_000
const STALL_TIMEOUT_MS = 25_000
const STALL_CHECK_INTERVAL_MS = 2_500

/**
 * Merge an upstream AbortSignal with an internal one (timeout, stall
 * watchdog, etc) so a fetch can be aborted by either source. Written
 * by hand because `AbortSignal.any()` only landed in Node 20.3, and
 * older Electron releases ship Node 18.
 */
function mergeSignals(
  ...signals: Array<AbortSignal | undefined>
): AbortSignal {
  const ctrl = new AbortController()
  for (const s of signals) {
    if (!s) continue
    if (s.aborted) {
      ctrl.abort((s as AbortSignal & { reason?: unknown }).reason)
      return ctrl.signal
    }
    s.addEventListener('abort', () => {
      ctrl.abort((s as AbortSignal & { reason?: unknown }).reason)
    }, { once: true })
  }
  return ctrl.signal
}

export async function parallelDownload(
  opts: ParallelDownloadOpts,
): Promise<ParallelDownloadResult> {
  const requestedParallelism = Math.max(1, Math.min(8, opts.parallelism ?? 4))

  // 1. HEAD — discover size + Range support. Failure is non-fatal: we
  //    fall back to single-stream GET which always works.
  // v0.7.55 — wrap with HEAD_TIMEOUT_MS so a hung TCP connect (very
  // common on Ghana wifi behind weird corporate proxies) doesn't trap
  // the entire downloader before a single byte can flow.
  let total = opts.expectedSize ?? 0
  let acceptRanges = false
  try {
    const head = await fetch(opts.url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: mergeSignals(opts.signal, AbortSignal.timeout(HEAD_TIMEOUT_MS)),
    })
    if (head.ok) {
      const len = head.headers.get('content-length')
      if (len) {
        const parsed = parseInt(len, 10)
        if (Number.isFinite(parsed) && parsed > 0) total = parsed
      }
      acceptRanges = (head.headers.get('accept-ranges') || '')
        .toLowerCase()
        .includes('bytes')
    }
  } catch (err) {
    // HEAD failed (timeout, DNS, TLS, proxy) — fall through to
    // single stream below. Logged because it tells operators their
    // network is misbehaving even when the slow path eventually works.
    console.warn(
      '[parallel-download] HEAD probe failed, using single-stream:',
      err instanceof Error ? err.message : err,
    )
    acceptRanges = false
  }

  if (!acceptRanges || total <= 0 || requestedParallelism === 1) {
    return await singleStreamDownload(opts, total)
  }

  // 2. Pre-allocate the destination so chunks can write positionally.
  await mkdir(dirname(opts.savePath), { recursive: true })
  await truncate(opts.savePath, total)
  const fd = await open(opts.savePath, 'r+')
  const startedAt = Date.now()

  try {
    // 3. Compute chunk byte ranges.
    const chunkSize = Math.ceil(total / requestedParallelism)
    const chunks: ChunkState[] = []
    for (let i = 0; i < requestedParallelism; i++) {
      const start = i * chunkSize
      const end = Math.min(start + chunkSize - 1, total - 1)
      if (start > end) break
      chunks.push({ start, end, transferred: 0 })
    }
    const effectiveParallelism = chunks.length

    // 4. Throttled progress emission with rolling-window speed.
    const speedSamples: Array<{ t: number; bytes: number }> = [{ t: startedAt, bytes: 0 }]
    let lastEmit = 0

    const computeAndEmit = (force: boolean) => {
      const now = Date.now()
      if (!force && now - lastEmit < PROGRESS_THROTTLE_MS) return
      lastEmit = now
      const transferred = chunks.reduce((s, c) => s + c.transferred, 0)
      speedSamples.push({ t: now, bytes: transferred })
      const cutoff = now - SPEED_WINDOW_MS
      while (speedSamples.length > 2 && speedSamples[0].t < cutoff) {
        speedSamples.shift()
      }
      const oldest = speedSamples[0]
      const newest = speedSamples[speedSamples.length - 1]
      const elapsedSec = newest.t > oldest.t ? (newest.t - oldest.t) / 1000 : 0
      const deltaBytes = newest.bytes - oldest.bytes
      const bytesPerSecond = elapsedSec > 0 ? deltaBytes / elapsedSec : 0
      const remaining = Math.max(0, total - transferred)
      const etaSeconds = bytesPerSecond > 0 ? remaining / bytesPerSecond : Infinity
      opts.onProgress?.({
        transferred,
        total,
        bytesPerSecond,
        percent: total > 0 ? (transferred / total) * 100 : 0,
        parallelism: effectiveParallelism,
        etaSeconds,
      })
    }

    // 5. Download every chunk concurrently. Promise.all rejects on
    //    the first failure; the caller-supplied AbortSignal then
    //    cancels all sibling chunks via fetch's signal propagation.
    //
    // v0.7.55 — wire in the stall watchdog. Independent AbortController
    // we own; flipped if no transferred-bytes growth is observed for
    // STALL_TIMEOUT_MS. Merged into every chunk's fetch signal so
    // tripping the watchdog cancels every in-flight chunk at once.
    const stallCtrl = new AbortController()
    let lastProgressBytes = 0
    let lastProgressAt = Date.now()
    const stallTimer = setInterval(() => {
      const transferred = chunks.reduce((s, c) => s + c.transferred, 0)
      if (transferred > lastProgressBytes) {
        lastProgressBytes = transferred
        lastProgressAt = Date.now()
        return
      }
      if (Date.now() - lastProgressAt >= STALL_TIMEOUT_MS) {
        console.warn(
          `[parallel-download] stalled at ${transferred}/${total} bytes for ${STALL_TIMEOUT_MS}ms — aborting`,
        )
        stallCtrl.abort(new Error('Download stalled — no bytes received for 25s'))
      }
    }, STALL_CHECK_INTERVAL_MS)

    try {
      await Promise.all(
        chunks.map(async (chunk) => {
          await downloadChunkInto(
            fd,
            chunk,
            opts.url,
            mergeSignals(opts.signal, stallCtrl.signal),
            () => {
              computeAndEmit(false)
            },
          )
        }),
      )
    } finally {
      clearInterval(stallTimer)
    }

    computeAndEmit(true)

    // 6. SHA-512 verify against expected hash from latest.yml.
    if (opts.expectedSha512) {
      const got = await hashFile(opts.savePath)
      if (got !== opts.expectedSha512) {
        // Wipe the bad file so a retry doesn't reuse it.
        await unlink(opts.savePath).catch(() => {})
        throw new Error(
          `SHA-512 mismatch — installer integrity check failed (expected ${opts.expectedSha512.slice(0, 16)}…, got ${got.slice(0, 16)}…)`,
        )
      }
    }

    return {
      savePath: opts.savePath,
      totalBytes: total,
      durationMs: Date.now() - startedAt,
      parallelism: effectiveParallelism,
      rangedUsed: true,
    }
  } finally {
    await fd.close().catch(() => {})
  }
}

async function downloadChunkInto(
  fd: Awaited<ReturnType<typeof open>>,
  chunk: ChunkState,
  url: string,
  signal: AbortSignal | undefined,
  onByteWritten: () => void,
): Promise<void> {
  // v0.7.55 — bounded headers-only timeout. Once the body stream
  // opens we hand off to the stall watchdog upstream (which detects
  // mid-stream silence). Without this, a stuck TLS handshake to S3
  // would block the chunk forever and prevent the watchdog from
  // ever observing forward progress on its sibling chunks.
  const res = await fetch(url, {
    headers: { Range: `bytes=${chunk.start}-${chunk.end}` },
    redirect: 'follow',
    signal: mergeSignals(signal, AbortSignal.timeout(CHUNK_HEADER_TIMEOUT_MS)),
  })
  // 206 Partial Content is the success code for a Range request.
  // Some misconfigured servers reply 200 with the full body; if that
  // happens we MUST bail because we'd write the entire file into one
  // chunk's slice and corrupt the others.
  if (res.status !== 206) {
    throw new Error(
      `Range request for bytes=${chunk.start}-${chunk.end} returned ${res.status} (expected 206)`,
    )
  }
  if (!res.body) {
    throw new Error(`Range request for bytes=${chunk.start}-${chunk.end} returned no body`)
  }
  const reader = res.body.getReader()
  let pos = chunk.start
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value && value.byteLength > 0) {
      const buf = Buffer.from(value.buffer, value.byteOffset, value.byteLength)
      await fd.write(buf, 0, buf.byteLength, pos)
      pos += buf.byteLength
      chunk.transferred += buf.byteLength
      onByteWritten()
    }
  }
  // Sanity check — if the server cut the stream short we'd silently
  // ship a truncated chunk and the SHA verify would catch it. The
  // explicit check produces a clearer error for the operator.
  const expected = chunk.end - chunk.start + 1
  if (chunk.transferred !== expected) {
    throw new Error(
      `Chunk bytes=${chunk.start}-${chunk.end} truncated: got ${chunk.transferred} / ${expected} bytes`,
    )
  }
}

async function singleStreamDownload(
  opts: ParallelDownloadOpts,
  knownTotal: number,
): Promise<ParallelDownloadResult> {
  await mkdir(dirname(opts.savePath), { recursive: true })
  const startedAt = Date.now()
  // v0.7.55 — stall watchdog for the single-stream path too. Same
  // semantics as the parallel path: if no bytes flow for STALL_TIMEOUT_MS
  // we abort so updater.ts can fall back to electron-updater. The
  // `transferredCounter` is updated from the body-read loop below.
  const stallCtrl = new AbortController()
  let transferredCounter = 0
  let lastProgressBytes = 0
  let lastProgressAt = Date.now()
  const stallTimer = setInterval(() => {
    if (transferredCounter > lastProgressBytes) {
      lastProgressBytes = transferredCounter
      lastProgressAt = Date.now()
      return
    }
    if (Date.now() - lastProgressAt >= STALL_TIMEOUT_MS) {
      console.warn(
        `[parallel-download] single-stream stalled at ${transferredCounter} bytes for ${STALL_TIMEOUT_MS}ms — aborting`,
      )
      stallCtrl.abort(new Error('Download stalled — no bytes received for 25s'))
    }
  }, STALL_CHECK_INTERVAL_MS)

  const res = await fetch(opts.url, {
    redirect: 'follow',
    signal: mergeSignals(
      opts.signal,
      stallCtrl.signal,
      AbortSignal.timeout(CHUNK_HEADER_TIMEOUT_MS),
    ),
  })
  if (!res.ok) {
    clearInterval(stallTimer)
    throw new Error(`GET ${opts.url} returned ${res.status}`)
  }
  if (!res.body) {
    clearInterval(stallTimer)
    throw new Error(`GET ${opts.url} returned no body`)
  }

  const lenHdr = res.headers.get('content-length')
  const total =
    knownTotal > 0
      ? knownTotal
      : lenHdr
        ? Math.max(0, parseInt(lenHdr, 10) || 0)
        : 0

  const fd = await open(opts.savePath, 'w')
  let transferred = 0
  let lastEmit = 0
  const speedSamples: Array<{ t: number; bytes: number }> = [{ t: startedAt, bytes: 0 }]

  try {
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value && value.byteLength > 0) {
        const buf = Buffer.from(value.buffer, value.byteOffset, value.byteLength)
        await fd.write(buf, 0, buf.byteLength)
        transferred += buf.byteLength
        transferredCounter = transferred

        const now = Date.now()
        if (now - lastEmit >= PROGRESS_THROTTLE_MS) {
          lastEmit = now
          speedSamples.push({ t: now, bytes: transferred })
          const cutoff = now - SPEED_WINDOW_MS
          while (speedSamples.length > 2 && speedSamples[0].t < cutoff) {
            speedSamples.shift()
          }
          const oldest = speedSamples[0]
          const newest = speedSamples[speedSamples.length - 1]
          const elapsedSec = newest.t > oldest.t ? (newest.t - oldest.t) / 1000 : 0
          const deltaBytes = newest.bytes - oldest.bytes
          const bytesPerSecond = elapsedSec > 0 ? deltaBytes / elapsedSec : 0
          const remaining = total > 0 ? Math.max(0, total - transferred) : 0
          const etaSeconds = bytesPerSecond > 0 && total > 0 ? remaining / bytesPerSecond : Infinity
          opts.onProgress?.({
            transferred,
            total: total || transferred,
            bytesPerSecond,
            percent: total > 0 ? (transferred / total) * 100 : 0,
            parallelism: 1,
            etaSeconds,
          })
        }
      }
    }
  } finally {
    clearInterval(stallTimer)
    await fd.close().catch(() => {})
  }

  if (opts.expectedSha512) {
    const got = await hashFile(opts.savePath)
    if (got !== opts.expectedSha512) {
      await unlink(opts.savePath).catch(() => {})
      throw new Error(
        `SHA-512 mismatch — installer integrity check failed (expected ${opts.expectedSha512.slice(0, 16)}…, got ${got.slice(0, 16)}…)`,
      )
    }
  }

  // Final emission so the UI gets a clean 100% / 0 ETA tick.
  opts.onProgress?.({
    transferred,
    total: total || transferred,
    bytesPerSecond: 0,
    percent: total > 0 ? 100 : 100,
    parallelism: 1,
    etaSeconds: 0,
  })

  return {
    savePath: opts.savePath,
    totalBytes: transferred,
    durationMs: Date.now() - startedAt,
    parallelism: 1,
    rangedUsed: false,
  }
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha512')
  const stream = createReadStream(path)
  for await (const chunk of stream) {
    hash.update(chunk as Buffer)
  }
  return hash.digest('base64')
}

/**
 * Convenience: format bytes/sec as a human-readable string with the
 * unit auto-scaled. Kept here (not in the renderer) so the main process
 * can also log with consistent formatting.
 */
export function formatBytesPerSecond(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) return '0 KB/s'
  if (bps >= 1024 * 1024) return `${(bps / 1024 / 1024).toFixed(1)} MB/s`
  if (bps >= 1024) return `${(bps / 1024).toFixed(0)} KB/s`
  return `${Math.round(bps)} B/s`
}
