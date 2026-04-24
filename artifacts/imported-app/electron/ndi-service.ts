import { EventEmitter } from 'node:events'
import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * NDI sender service using direct FFI bindings (koffi) into the official
 * NDI runtime DLL. This replaces the previous grandiose-based binding
 * which required compiling a C++ Node addon with node-gyp + Visual Studio
 * Build Tools at install time. With koffi we ship a precompiled .node
 * binary that calls into Processing.NDI.Lib.x64.dll at runtime, so:
 *
 *   * No C++ toolchain on the user's machine
 *   * No node-gyp / electron-rebuild / VS toolset version dance
 *   * Works against any NDI 5/6 runtime install
 *
 * The sender broadcasts on the LAN via mDNS automatically (NDI does this
 * inside NDIlib_send_create) - any vMix / Wirecast / OBS / NDI Studio
 * Monitor instance on the same subnet will discover the source by name
 * with no manual configuration.
 */

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

// ─── NDI native types ──────────────────────────────────────────────
//
// Layout matches Processing.NDI.Lib.h from the NDI 6 SDK, x64 ABI.
// Field order MUST be preserved or the DLL will read garbage.

const FOURCC_BGRA = 0x41524742 // 'BGRA' little-endian
const FRAME_FORMAT_PROGRESSIVE = 1

// ─── DLL discovery ─────────────────────────────────────────────────

function findNdiDll(): string | null {
  // 1. Explicit override
  const envOverride = process.env.NDI_DLL_PATH
  if (envOverride && fs.existsSync(envOverride)) return envOverride

  // 2. Standard NDI install locations (NDI Tools sets these env vars)
  const dllName = 'Processing.NDI.Lib.x64.dll'
  const candidates: string[] = []

  for (const v of ['NDI_RUNTIME_DIR_V6', 'NDI_RUNTIME_DIR_V5', 'NDI_RUNTIME_DIR_V4']) {
    const dir = process.env[v]
    if (dir) candidates.push(path.join(dir, dllName))
  }
  // Common install paths if env vars are missing
  candidates.push(
    'C:\\Program Files\\NDI\\NDI 6 Tools\\Runtime\\' + dllName,
    'C:\\Program Files\\NDI\\NDI 5 Tools\\Runtime\\' + dllName,
    'C:\\Program Files\\NDI\\NDI 6 SDK\\Bin\\x64\\' + dllName,
    'C:\\Program Files\\NDI\\NDI 5 SDK\\Bin\\x64\\' + dllName,
  )

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

type KoffiLib = {
  func: (signature: string) => (...args: unknown[]) => unknown
  close?: () => void
}

type KoffiAPI = {
  load: (path: string) => KoffiLib
  struct: (name: string, fields: Record<string, string>) => unknown
}

type NdiBindings = {
  initialize: () => boolean
  destroy: () => void
  send_create: (settings: unknown) => unknown
  send_destroy: (instance: unknown) => void
  send_send_video_v2: (instance: unknown, frame: unknown) => void
  send_send_audio_v3: (instance: unknown, frame: unknown) => void
  videoFrameType: unknown
  audioFrameType: unknown
  sendCreateType: unknown
  koffi: KoffiAPI
}

export class NdiService extends EventEmitter {
  private bindings: NdiBindings | null = null
  private senderInstance: unknown = null
  private loadError: string | null = null
  private status: NdiStatus = { running: false, frameCount: 0 }
  private startedAt = 0

  constructor() {
    super()
    this.tryLoad()
  }

  private tryLoad() {
    const dllPath = findNdiDll()
    if (!dllPath) {
      this.loadError =
        'NDI runtime DLL not found. Install "NDI Tools" or "NDI Runtime" from ' +
        'https://ndi.video/tools/ — the installer drops Processing.NDI.Lib.x64.dll ' +
        'into C:\\Program Files\\NDI\\NDI 6 Tools\\Runtime\\.'
      console.error('[ndi]', this.loadError)
      return
    }

    let koffi: KoffiAPI
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      koffi = require('koffi') as KoffiAPI
    } catch (e) {
      this.loadError = 'koffi (FFI library) failed to load: ' + (e instanceof Error ? e.message : String(e))
      console.error('[ndi]', this.loadError)
      return
    }

    try {
      const lib = koffi.load(dllPath) as unknown as KoffiLib

      // ─── Struct types ────────────────────────────────────────
      const NDIlib_send_create_t = koffi.struct('NDIlib_send_create_t', {
        p_ndi_name: 'string',
        p_groups: 'string',
        clock_video: 'bool',
        clock_audio: 'bool',
      })

      const NDIlib_video_frame_v2_t = koffi.struct('NDIlib_video_frame_v2_t', {
        xres: 'int32',
        yres: 'int32',
        FourCC: 'uint32',
        frame_rate_N: 'int32',
        frame_rate_D: 'int32',
        picture_aspect_ratio: 'float',
        frame_format_type: 'int32',
        timecode: 'int64',
        p_data: 'void *',
        line_stride_in_bytes: 'int32',
        p_metadata: 'string',
        timestamp: 'int64',
      })

      // NDIlib_audio_frame_v3_t — float32 planar PCM (the only format the
      // NDI runtime accepts for v3 audio sends). 48kHz / 2ch is the
      // canonical NDI broadcast format.
      const NDIlib_audio_frame_v3_t = koffi.struct('NDIlib_audio_frame_v3_t', {
        sample_rate: 'int32',
        no_channels: 'int32',
        no_samples: 'int32',
        timecode: 'int64',
        FourCC: 'uint32', // NDIlib_FourCC_audio_type_FLTP = 'FLTP'
        p_data: 'void *',
        channel_stride_in_bytes: 'int32',
        p_metadata: 'string',
        timestamp: 'int64',
      })

      // ─── Function bindings ───────────────────────────────────
      // The NDI runtime DLL exports these symbols directly (v3.5+).
      const initialize = lib.func('bool NDIlib_initialize()') as () => boolean
      const destroy = lib.func('void NDIlib_destroy()') as () => void
      const send_create = lib.func(
        'void *NDIlib_send_create(const NDIlib_send_create_t *p_create_settings)',
      ) as (settings: unknown) => unknown
      const send_destroy = lib.func('void NDIlib_send_destroy(void *p_instance)') as (
        instance: unknown,
      ) => void
      const send_send_video_v2 = lib.func(
        'void NDIlib_send_send_video_v2(void *p_instance, const NDIlib_video_frame_v2_t *p_video_data)',
      ) as (instance: unknown, frame: unknown) => void
      const send_send_audio_v3 = lib.func(
        'void NDIlib_send_send_audio_v3(void *p_instance, const NDIlib_audio_frame_v3_t *p_audio_data)',
      ) as (instance: unknown, frame: unknown) => void

      // Boot the NDI runtime once. This call is cheap and idempotent.
      if (!initialize()) {
        this.loadError = 'NDIlib_initialize() returned false. The host CPU may not be supported by NDI.'
        console.error('[ndi]', this.loadError)
        return
      }

      this.bindings = {
        initialize,
        destroy,
        send_create,
        send_destroy,
        send_send_video_v2,
        send_send_audio_v3,
        videoFrameType: NDIlib_video_frame_v2_t,
        audioFrameType: NDIlib_audio_frame_v3_t,
        sendCreateType: NDIlib_send_create_t,
        koffi,
      }
      console.log('[ndi] FFI bindings loaded from', dllPath)
    } catch (e) {
      this.loadError = 'NDI FFI binding setup failed: ' + (e instanceof Error ? e.message : String(e))
      console.error('[ndi]', this.loadError)
    }
  }

  isAvailable(): boolean {
    return !!this.bindings
  }

  unavailableReason(): string | undefined {
    return this.bindings ? undefined : this.loadError || 'NDI not available'
  }

  getStatus(): NdiStatus {
    return { ...this.status }
  }

  async start(opts: NdiStartOptions): Promise<void> {
    if (!this.bindings) {
      throw new Error(this.unavailableReason() || 'NDI not available')
    }
    // Persistent-stream rule: vMix / Wirecast / OBS / Studio Monitor
    // re-acquire a source when our send instance disappears, which
    // shows up on the receiver as a one-frame black flash and a brief
    // "no signal" hold — exactly the flicker operators complained
    // about. So if a sender is already running with the SAME name and
    // declared format, keep it. The receiver never sees an interruption.
    // Only when something materially changes (rename, resolution, fps)
    // do we tear down and rebuild.
    const wantedName = opts.name || 'ScriptureLive'
    if (
      this.senderInstance &&
      this.status.running &&
      this.status.source === wantedName &&
      this.status.width === opts.width &&
      this.status.height === opts.height &&
      this.status.fps === opts.fps
    ) {
      return
    }
    if (this.senderInstance) await this.stop()

    const settings = {
      p_ndi_name: wantedName,
      p_groups: null as unknown as string,
      // clock_video = true makes NDIlib_send_send_video_v2 block to pace
      // frames at the declared frame rate. This is what gives NDI its
      // famously stable, low-jitter output even when our compositor
      // delivers frames slightly early or late.
      clock_video: true,
      clock_audio: false,
    }
    const instance = this.bindings.send_create(settings)
    if (!instance) throw new Error('NDIlib_send_create returned null')

    this.senderInstance = instance
    this.status = {
      running: true,
      source: wantedName,
      width: opts.width,
      height: opts.height,
      fps: opts.fps,
      frameCount: 0,
    }
    this.startedAt = Date.now()
  }

  async stop(): Promise<void> {
    if (this.senderInstance && this.bindings) {
      try {
        this.bindings.send_destroy(this.senderInstance)
      } catch {
        /* ignore */
      }
      this.senderInstance = null
    }
    this.status = { running: false, frameCount: this.status.frameCount }
  }

  /**
   * Library-level teardown — call NDIlib_destroy() once during app
   * shutdown to release the background threads / memory pools the NDI
   * runtime allocated at NDIlib_initialize() time. Without this the
   * koffi-loaded native lib can keep a worker thread alive past
   * Electron's window-all-closed, which contributes to the "still in
   * Task Manager" complaint we are fixing. Idempotent — clears the
   * bindings reference so subsequent calls are no-ops, and the per-
   * sender stop() above is implicitly called first by shutdown().
   */
  destroy(): void {
    if (this.bindings) {
      try {
        this.bindings.destroy()
      } catch {
        /* ignore — we're tearing down anyway */
      }
      this.bindings = null
    }
  }

  sendFrame(bgraBuffer: Buffer, width: number, height: number): void {
    if (!this.senderInstance || !this.bindings) return
    try {
      const fps = this.status.fps || 30
      const frame = {
        xres: width,
        yres: height,
        FourCC: FOURCC_BGRA,
        frame_rate_N: fps * 1000,
        frame_rate_D: 1000,
        picture_aspect_ratio: width / height,
        frame_format_type: FRAME_FORMAT_PROGRESSIVE,
        timecode: BigInt(0) as unknown as number,
        p_data: bgraBuffer,
        line_stride_in_bytes: width * 4,
        p_metadata: null as unknown as string,
        timestamp: BigInt(0) as unknown as number,
      }
      this.bindings.send_send_video_v2(this.senderInstance, frame)
      this.status.frameCount += 1
      if (this.status.frameCount % 30 === 0) {
        this.emit('frame', this.status.frameCount)
      }
    } catch (err) {
      this.emit('error', err instanceof Error ? err.message : String(err))
    }
  }

  /**
   * Push a Float32 PCM audio buffer to the NDI sender.
   *
   * @param planar - Float32Array of length `numChannels * samplesPerChannel`
   *                 in PLANAR layout: [...ch0, ...ch1]. NDI v3 audio is
   *                 always planar float32, never interleaved.
   * @param sampleRate - typically 48000
   * @param numChannels - typically 2 (stereo)
   * @param samplesPerChannel - frames per channel
   */
  sendAudio(planar: Float32Array, sampleRate: number, numChannels: number, samplesPerChannel: number): void {
    if (!this.senderInstance || !this.bindings) return
    try {
      const FOURCC_FLTP = 0x50544c46 // 'FLTP' little-endian = Float32 planar
      const buf = Buffer.from(planar.buffer, planar.byteOffset, planar.byteLength)
      const frame = {
        sample_rate: sampleRate,
        no_channels: numChannels,
        no_samples: samplesPerChannel,
        timecode: BigInt(0) as unknown as number,
        FourCC: FOURCC_FLTP,
        p_data: buf,
        channel_stride_in_bytes: samplesPerChannel * 4, // 4 bytes per float
        p_metadata: null as unknown as string,
        timestamp: BigInt(0) as unknown as number,
      }
      this.bindings.send_send_audio_v3(this.senderInstance, frame)
    } catch (err) {
      this.emit('error', err instanceof Error ? err.message : String(err))
    }
  }

  uptimeMs(): number {
    return this.status.running ? Date.now() - this.startedAt : 0
  }
}
