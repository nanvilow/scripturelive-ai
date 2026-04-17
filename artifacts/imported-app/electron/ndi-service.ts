import { EventEmitter } from 'node:events'

export type NdiStartOptions = {
  name: string
  width: number
  height: number
  fps: number
}

export type NdiStatus = {
  running: boolean
  source?: string
  width?: number
  height?: number
  fps?: number
  frameCount: number
  error?: string
  captureMessage?: string
}

type GrandioseModule = {
  send: (opts: { name: string; clockVideo?: boolean; clockAudio?: boolean }) => GrandioseSender
  FourCC?: { BGRA?: number; BGRX?: number; UYVY?: number }
  send_video?: unknown
}

type GrandioseSender = {
  video: (frame: GrandioseVideoFrame) => Promise<void> | void
  destroy: () => Promise<void> | void
}

type GrandioseVideoFrame = {
  type: 'video'
  xres: number
  yres: number
  frameRateN: number
  frameRateD: number
  pictureAspectRatio: number
  timestamp: [number, number] | bigint
  frameFormatType: number
  lineStrideBytes: number
  fourCC: number
  data: Buffer
  timecode?: bigint
}

const FOURCC_BGRA = 0x41524742 // 'BGRA' little-endian
const FOURCC_BGRX = 0x58524742 // 'BGRX'
const FRAME_FORMAT_PROGRESSIVE = 1

export class NdiService extends EventEmitter {
  private grandiose: GrandioseModule | null = null
  private loadError: string | null = null
  private sender: GrandioseSender | null = null
  private status: NdiStatus = { running: false, frameCount: 0 }
  private fourCC = FOURCC_BGRA
  private startedAt = 0

  constructor() {
    super()
    this.tryLoad()
  }

  private tryLoad() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      this.grandiose = require('grandiose') as GrandioseModule
      if (this.grandiose?.FourCC?.BGRA) this.fourCC = this.grandiose.FourCC.BGRA
    } catch (err) {
      this.grandiose = null
      this.loadError = err instanceof Error ? err.message : String(err)
    }
  }

  isAvailable(): boolean {
    return !!this.grandiose
  }

  unavailableReason(): string | undefined {
    return this.grandiose ? undefined : (this.loadError || 'grandiose native module not installed')
  }

  getStatus(): NdiStatus {
    return { ...this.status }
  }

  async start(opts: NdiStartOptions): Promise<void> {
    if (!this.grandiose) {
      throw new Error(this.unavailableReason() || 'NDI not available')
    }
    if (this.sender) await this.stop()

    const sender = this.grandiose.send({
      name: opts.name || 'ScriptureLive',
      clockVideo: true,
      clockAudio: false,
    })
    this.sender = sender
    this.status = {
      running: true,
      source: opts.name,
      width: opts.width,
      height: opts.height,
      fps: opts.fps,
      frameCount: 0,
    }
    this.startedAt = Date.now()
  }

  async stop(): Promise<void> {
    if (this.sender) {
      try { await this.sender.destroy() } catch { /* ignore */ }
      this.sender = null
    }
    this.status = { running: false, frameCount: this.status.frameCount }
  }

  sendFrame(bgraBuffer: Buffer, width: number, height: number): void {
    if (!this.sender || !this.grandiose) return
    try {
      const fps = this.status.fps || 30
      const frame: GrandioseVideoFrame = {
        type: 'video',
        xres: width,
        yres: height,
        frameRateN: fps * 1000,
        frameRateD: 1000,
        pictureAspectRatio: width / height,
        timestamp: [0, 0],
        frameFormatType: FRAME_FORMAT_PROGRESSIVE,
        lineStrideBytes: width * 4,
        fourCC: this.fourCC,
        data: bgraBuffer,
      }
      const result = this.sender.video(frame)
      if (result && typeof (result as Promise<void>).then === 'function') {
        ;(result as Promise<void>).catch((err) => {
          this.emit('error', err instanceof Error ? err.message : String(err))
        })
      }
      this.status.frameCount += 1
      if (this.status.frameCount % 30 === 0) {
        this.emit('frame', this.status.frameCount)
      }
    } catch (err) {
      this.emit('error', err instanceof Error ? err.message : String(err))
    }
  }

  uptimeMs(): number {
    return this.status.running ? Date.now() - this.startedAt : 0
  }
}
