import { BrowserWindow } from 'electron'

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

    this.window = new BrowserWindow({
      show: false,
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

    this.window.webContents.beginFrameSubscription(false, (image, dirty) => {
      try {
        const size = image.getSize()
        const bitmap = image.getBitmap() // BGRA
        if (size.width === 0 || size.height === 0) return
        if (bitmap.length !== size.width * size.height * 4) return
        this.deps.onFrame(bitmap, size.width, size.height)
      } catch (err) {
        this.deps.onStatus(`frame error: ${err instanceof Error ? err.message : String(err)}`)
      }
    })
    this.subscribed = true
    this.deps.onStatus(`capturing ${opts.width}x${opts.height}@${opts.fps}`)
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
