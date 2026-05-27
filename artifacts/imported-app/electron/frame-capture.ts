import { BrowserWindow, screen } from 'electron'

export type FrameCaptureOptions = {
  width: number
  height: number
  fps: number
  /** Path on the local Next server to load (defaults to /api/output/congregation). */
  path?: string
  /** Render the source page on a transparent surface so NDI receives an alpha matte. */
  transparent?: boolean
}

export type FrameCaptureDeps = {
  baseUrl: string
  onFrame: (bgra: Buffer, width: number, height: number) => void
  onStatus: (message: string) => void
}

export class FrameCapture {
  private window: BrowserWindow | null = null
  private subscribed = false
  private current: FrameCaptureOptions = { width: 1280, height: 720, fps: 30 }

  constructor(private deps: FrameCaptureDeps) {}

  async start(opts: FrameCaptureOptions): Promise<void> {
    if (this.window && !this.window.isDestroyed()) {
      if (
        opts.width === this.current.width &&
        opts.height === this.current.height &&
        opts.fps === this.current.fps &&
        (opts.path || '/api/output/congregation') === (this.current.path || '/api/output/congregation') &&
        !!opts.transparent === !!this.current.transparent
      ) return
      await this.stop()
    }
    this.current = opts

    // v0.7.121 — Pin the offscreen capture BrowserWindow to the
    // PRIMARY display's origin. Operator escalation: "anytime i
    // disconnect output display from the other screen from the app,
    // the app output, and NDI becomes Blank." Root cause: with no
    // explicit x/y, Electron places the offscreen window on the cursor
    // / last-active display. If that's the secondary monitor and the
    // operator unplugs it mid-service, Windows' GPU compositor can
    // stall offscreen rendering on the now-orphaned BrowserWindow —
    // beginFrameSubscription stops firing, NDI's keep-alive ticker
    // pumps the last (frozen / black) frame forever, and vMix / OBS
    // see a black source. Pinning to primary display origin guarantees
    // the capture surface stays on a display that is always present.
    let primaryOrigin: { x: number; y: number } = { x: 0, y: 0 }
    try {
      const p = screen.getPrimaryDisplay()
      primaryOrigin = { x: p.workArea.x, y: p.workArea.y }
    } catch { /* no display API available — fall back to (0,0) */ }
    this.window = new BrowserWindow({
      show: false,
      x: primaryOrigin.x,
      y: primaryOrigin.y,
      width: opts.width,
      height: opts.height,
      useContentSize: true,
      frame: false,
      transparent: !!opts.transparent,
      backgroundColor: opts.transparent ? '#00000000' : '#000000',
      webPreferences: {
        offscreen: true,
        backgroundThrottling: false,
        contextIsolation: true,
        nodeIntegration: false,
        // v0.7.17 — Pin the offscreen capture window to a 1.0 zoom
        // factor. Without this, Electron inherits the host display's
        // device-pixel ratio (e.g. 1.25 on a Windows laptop set to
        // 125 % UI scaling). The BrowserWindow's CSS viewport then
        // ends up at width/DPR = 1536 instead of 1920, which collapses
        // every cqw/cqh value used by the lower-third bar — text
        // shrinks, the bar looks roughly half its expected width, and
        // the NDI receiver in vMix / OBS / Wirecast no longer matches
        // the in-app NDI Output Preview iframe (which IS forced to
        // a 1:1 viewport because we set its parent div to 1920x1080
        // CSS pixels). Pinning zoomFactor:1 here guarantees the
        // captured page sees an exact 1920x1080 CSS viewport so the
        // single congregation renderer produces byte-identical layout
        // on both surfaces. Operator screenshot v0.7.16 — preview bar
        // ~95 % wide / large text, NDI receiver bar ~50 % wide / tiny
        // text — was the bug this fixes. Pairs with the post-load
        // setZoomFactor(1) + setVisualZoomLevelLimits(1, 1) calls
        // below (defensive double-pin since some Electron builds
        // reset zoomFactor on first navigation).
        zoomFactor: 1,
      },
    })
    this.window.webContents.setFrameRate(opts.fps)

    const path = opts.path || '/api/output/congregation'
    const url = `${this.deps.baseUrl}${path.startsWith('/') ? path : '/' + path}`
    await this.window.loadURL(url)
    // v0.7.17 — Defensive re-pin after navigation (see webPreferences
    // .zoomFactor comment above for full rationale). setZoomFactor()
    // overrides the inherited per-display DPR; setVisualZoomLevelLimits
    // blocks any future programmatic / pinch zoom from drifting the
    // capture surface. Failures are non-fatal — log via onStatus and
    // continue capturing rather than aborting the NDI broadcast.
    try {
      this.window.webContents.setZoomFactor(1)
      await this.window.webContents.setVisualZoomLevelLimits(1, 1)
    } catch (err) {
      this.deps.onStatus(
        `zoom pin warning: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    // v0.7.198 — Frame-flow diagnostics. Operator reported "NDI source
    // appears in OBS dropdown but feed is BLACK" with no clear repro
    // and "not sure when it broke." Per the v0.7.196 PROCESS GR
    // ("early-warning canary"), instrumenting the frame producer so
    // the NEXT launch.log immediately answers three questions:
    //   1. Are frames flowing at all? (subscription firing?)
    //   2. If yes, are they all-black pixels? (renderer broken vs
    //      ndi.sendFrame broken?)
    //   3. What's the frame rate actually achieved?
    // Rate-limited to ~once per 2s @ 30fps (every 60th frame) so log
    // volume is negligible — 30 lines per minute even at 30fps. The
    // blackness check samples 8 evenly-spaced pixels (covers corners
    // + centre) and reads only the BGR triplet (skips alpha) — cheap
    // O(1) work per sampled frame, not per pixel.
    let __frameIdx = 0
    let __nonBlackFrames = 0
    let __lastLogAt = Date.now()
    // v0.7.221 — Per-frame inter-frame delta jitter telemetry. Operator
    // escalation: "What makes EasyWorship NDI output play smoothly?
    // Implement that here." Pre-fix telemetry only reported avg fps
    // over 60-frame windows (~2s) — too coarse to see the sub-frame
    // jitter that causes receiver-side stutter even when the average
    // rate looks correct. EW-class smoothness requires the wire-side
    // inter-frame interval to stay tight (target = 33.33ms @ 30fps,
    // p95 should be < 40ms). We now record min / max / p95 delta in
    // each 60-frame window so the next launch.log immediately shows
    // whether jitter originates at the producer (CPU readback /
    // beginFrameSubscription) or the wire (ndi-service async send).
    // Cost: one Date.now() + one push to a 60-entry array per frame =
    // negligible on the hot path.
    let __lastFrameAt = 0
    let __frameDeltas: number[] = []
    const __isAllBlack = (buf: Buffer, w: number, h: number): boolean => {
      // Sample 8 pixels: 4 corners + 4 mid-edges. If ANY sample shows
      // non-trivial brightness (R+G+B > 24 = roughly hex #080808), the
      // frame is not all-black. Mid-edges catch lower-third bars that
      // might leave corners black even when content is rendering.
      const samples = [
        [0, 0],
        [w - 1, 0],
        [0, h - 1],
        [w - 1, h - 1],
        [(w / 2) | 0, 0],
        [(w / 2) | 0, h - 1],
        [0, (h / 2) | 0],
        [w - 1, (h / 2) | 0],
      ]
      for (const [x, y] of samples) {
        const i = (y * w + x) * 4
        // BGRA layout: buf[i]=B, buf[i+1]=G, buf[i+2]=R, buf[i+3]=A
        if (buf[i] + buf[i + 1] + buf[i + 2] > 24) return false
      }
      return true
    }
    this.window.webContents.beginFrameSubscription(false, (image, dirty) => {
      try {
        const size = image.getSize()
        const bitmap = image.getBitmap() // BGRA
        if (size.width === 0 || size.height === 0) return
        if (bitmap.length !== size.width * size.height * 4) return
        __frameIdx++
        if (!__isAllBlack(bitmap, size.width, size.height)) __nonBlackFrames++
        // v0.7.221 — Record inter-frame delta for jitter telemetry.
        const __now = Date.now()
        if (__lastFrameAt > 0) __frameDeltas.push(__now - __lastFrameAt)
        __lastFrameAt = __now
        // Once per 60 frames (~2s @ 30fps), summarize: total frames,
        // non-black ratio, effective fps since last log, AND
        // min/max/p95 inter-frame delta (jitter). This produces a
        // single greppable line per ~2s in launch.log so operator +
        // future agent can immediately see WHERE smoothness is lost.
        if (__frameIdx % 60 === 0) {
          const dtSec = Math.max(0.001, (__now - __lastLogAt) / 1000)
          const fps = (60 / dtSec).toFixed(1)
          const blackPct = __frameIdx > 0
            ? (100 * (1 - __nonBlackFrames / __frameIdx)).toFixed(1)
            : '0.0'
          let jitter = 'jitter=n/a'
          if (__frameDeltas.length >= 5) {
            const sorted = __frameDeltas.slice().sort((a, b) => a - b)
            const p95Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))
            const min = sorted[0]
            const max = sorted[sorted.length - 1]
            const p95 = sorted[p95Idx]
            jitter = `dt_min=${min}ms dt_p95=${p95}ms dt_max=${max}ms`
          }
          console.log(
            `[frame-capture] frames=${__frameIdx} fps=${fps} black=${blackPct}% ${jitter} size=${size.width}x${size.height}`,
          )
          __lastLogAt = __now
          __frameDeltas = []
        }
        this.deps.onFrame(bitmap, size.width, size.height)
      } catch (err) {
        this.deps.onStatus(`frame error: ${err instanceof Error ? err.message : String(err)}`)
      }
    })
    this.subscribed = true
    this.deps.onStatus(`capturing ${opts.width}x${opts.height}@${opts.fps}`)
    console.log(
      `[frame-capture] subscription started: ${opts.width}x${opts.height}@${opts.fps} url=${url}`,
    )
  }

  async stop(): Promise<void> {
    if (this.window && !this.window.isDestroyed()) {
      try {
        if (this.subscribed) this.window.webContents.endFrameSubscription()
      } catch { /* ignore */ }
      this.subscribed = false
      this.window.destroy()
    }
    this.window = null
  }
}
