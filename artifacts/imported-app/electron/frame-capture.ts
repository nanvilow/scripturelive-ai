import { BrowserWindow } from 'electron'

export type FrameCaptureOptions = {
  width: number
  height: number
  fps: number
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
        opts.fps === this.current.fps
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
      transparent: false,
      backgroundColor: '#000000',
      webPreferences: {
        offscreen: true,
        backgroundThrottling: false,
        contextIsolation: true,
        nodeIntegration: false,
      },
    })
    this.window.webContents.setFrameRate(opts.fps)

    const url = `${this.deps.baseUrl}/api/output/congregation`
    await this.window.loadURL(url)

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
