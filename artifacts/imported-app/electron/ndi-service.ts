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
  // v0.7.121 — true while the operator clicked Stop but the sender is
  // being held alive on the wire (linger window) so OBS/vMix don't
  // drop the source. The Stop button in the UI must flip to "Start"
  // immediately when this is true, even though `running` may still be
  // true on the wire-protocol side. main.ts's broadcast normalises
  // running=false whenever lingering=true so the renderer never has
  // to know about the distinction.
  lingering?: boolean
  lingerRemainingMs?: number
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

  const dllName = 'Processing.NDI.Lib.x64.dll'
  const candidates: string[] = []

  // 2. v0.7.146 — BUNDLED DLL (the "just works" path).
  // electron-builder ships build-resources/ndi/Processing.NDI.Lib.x64.dll
  // as extraResources to `<resources>/ndi/`, which is process.resourcesPath
  // in packaged builds. This is what makes NDI work on every customer PC
  // worldwide WITHOUT a separate NDI Tools install — same approach
  // vMix / Wirecast / OBS Studio / Resolume use under the NDI SDK
  // redistribution license (the SDK explicitly allows the runtime DLL
  // to ship inside an integrated application).
  // We check this FIRST so even if the customer happens to also have
  // NDI Tools installed, we pin to OUR known-good copy.
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'ndi', dllName))
  }
  // Dev-mode fallback (electron . from artifacts/imported-app) — load
  // straight out of the source build-resources/ndi/ folder. __dirname
  // when running compiled main.cjs in dist-electron/ resolves to that
  // dist-electron path, so we walk up to the artifact root.
  candidates.push(
    path.join(__dirname, '..', 'build-resources', 'ndi', dllName),
    path.join(__dirname, '..', '..', 'build-resources', 'ndi', dllName),
  )

  // 3. Standard NDI install locations (kept as a safety net so a
  //    corrupted/missing bundled DLL still finds a system copy).
  for (const v of ['NDI_RUNTIME_DIR_V6', 'NDI_RUNTIME_DIR_V5', 'NDI_RUNTIME_DIR_V4']) {
    const dir = process.env[v]
    if (dir) candidates.push(path.join(dir, dllName))
  }
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
  // v0.7.220 — Async video send. NDI SDK contract: the call returns
  // immediately; the NDI worker thread reads from the supplied buffer
  // in the background. The buffer MUST remain valid until the NEXT
  // call to send_send_video_async_v2 (which signals "I'm done with
  // the previous one"). We honour this via a 2-slot pre-allocated
  // buffer pool (see videoBufferPool below).
  send_send_video_async_v2: (instance: unknown, frame: unknown) => void
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
  // ─── v0.7.12 — Persistent-source state ──────────────────────────────
  // The four fields below implement a "the receiver never sees a gap"
  // contract for downstream NDI consumers (OBS, vMix, Wirecast, NDI
  // Studio Monitor, etc.). Operator escalation: when the SLAI renderer
  // stalled for any reason (page nav, GC pause, heavy AI inference,
  // operator toggling on-air off briefly) the receiver would lose the
  // source from its list, and the operator had to close/reopen OBS to
  // get it back. The fix is sender-side: cache the last frame and
  // re-emit it on a tick whenever fresh frames stop arriving.
  //
  //   lastFrame              Most recent BGRA buffer + dimensions +
  //                          timestamp. Re-sent by the keep-alive
  //                          tick when the renderer is silent.
  //   keepAliveTimer         setInterval handle that fires at the
  //                          configured FPS. Cleared on stop().
  //   sendBusy               Mutex flag — clock_video=true makes
  //                          send_send_video_v2 BLOCK until the next
  //                          frame slot, so we must not let the timer
  //                          re-enter the native call while sendFrame
  //                          is mid-flight (and vice versa). Frames
  //                          delivered while busy are dropped (the
  //                          newest one wins anyway via lastFrame).
  //   lastDestroyAt          Timestamp of the most recent send_destroy
  //                          call. Used by start() to wait at least
  //                          DESTROY_COOLDOWN_MS before recreating a
  //                          sender with the same name, so mDNS gets
  //                          time to retract the old advertisement
  //                          before we re-publish.
  private lastFrame: { buffer: Buffer; width: number; height: number; ts: number } | null = null
  private keepAliveTimer: NodeJS.Timeout | null = null
  // v0.7.194-hotfix.11 Item #3 — frame-bridge state (see armBridge).
  private bridgeTimer: NodeJS.Timeout | null = null
  private bridgeDeadline = 0
  private sendBusy = false
  private lastDestroyAt = 0
  // v0.7.220 — 2-slot pre-allocated buffer pool for async NDI video
  // send. send_send_video_async_v2 returns immediately but the NDI
  // worker thread reads from the supplied buffer asynchronously. The
  // buffer MUST remain valid until the NEXT async send call. With 2
  // slots and a `sendBusy` mutex ensuring at most ONE outstanding
  // async send at a time, the slot NDI is currently reading is never
  // the slot we are writing into. This eliminates the per-frame
  // Buffer.allocUnsafe + Buffer.copy that v0.7.219 was paying ~8MB
  // x 30fps = ~240MB/s of allocator + GC pressure on the main
  // process — a known stutter source on long-running sessions.
  // Pool re-allocates lazily on first frame and on any resolution
  // change (rare). Capacity is recorded so resolution changes
  // trigger a fresh allocation rather than a buffer-too-small write.
  private videoBufferPool: Buffer[] = []
  private videoBufferIndex = 0
  private videoBufferCapacity = 0
  // v0.7.56 — Tracks whether NDIlib_initialize() is currently active.
  // The operator-initiated stop() path now calls NDIlib_destroy() to
  // fully recycle the NDI runtime — killing the mDNS responder and
  // releasing every cached sender identity. The next start() must
  // re-initialize before any send_create call. Without this recycle,
  // vMix / OBS / Wirecast receivers that cached the OLD sender's
  // IP:port refuse to reattach to a new sender with the same name
  // until the receiver itself is restarted, which was the operator's
  // exact complaint. Distinct from `bindings != null` because the
  // FFI function pointers stay loaded across runtime recycles —
  // only the live runtime state goes away.
  private runtimeAlive = false
  // v0.7.103 — "Linger" mode tear-down. When the operator hits
  // Disconnect, we used to call gracefulStop() which immediately
  // ran send_destroy + NDIlib_destroy, retracting the mDNS
  // advertisement and forcing OBS / vMix / Wirecast / Studio
  // Monitor to drop our source from their lists. If the operator
  // then hit Reconnect, OBS/vMix had already torn down the
  // connection — they had to either re-add the source or restart.
  //
  // Linger mode keeps the NDI sender ALIVE on the wire for a
  // grace window (default 60s) after operator-initiated stop:
  //   • Fade-to-black is still emitted so receivers see the
  //     source go off-air visually.
  //   • The cached last frame is REPLACED with black so the
  //     keep-alive ticker keeps pumping black at the configured
  //     fps. To OBS/vMix the source is "live, just black".
  //   • A timer is armed for `lingerSeconds`. If start() is called
  //     before it fires, the timer is cancelled and the existing
  //     sender is reused — receivers see fresh frames replace the
  //     black with NO source-acquire flicker, NO mDNS round-trip,
  //     NO OBS/vMix reconnect dance.
  //   • If the timer fires (operator never came back), full
  //     stop() runs and the sender is torn down for real.
  private lingerTimer: NodeJS.Timeout | null = null
  private lingerStartedAt = 0
  private lingerExpectedMs = 0

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
      // v0.7.220 — Async video send. Returns immediately after queueing
      // the frame onto NDI's internal worker thread. This eliminates the
      // main-process event-loop blocking that send_send_video_v2 +
      // clock_video=true imposed (visible to NDI receivers as random
      // micro-stutters whenever the main process was busy with IPC, GC,
      // or disk I/O). Buffer lifetime contract: the NDI runtime reads
      // from `p_data` asynchronously; the caller MUST keep the buffer
      // valid until the next call to this function (NDI signals "done
      // with the previous one" by accepting a new submission). We
      // honour this via a 2-slot pre-allocated buffer pool — see
      // sendFrame + videoBufferPool.
      const send_send_video_async_v2 = lib.func(
        'void NDIlib_send_send_video_async_v2(void *p_instance, const NDIlib_video_frame_v2_t *p_video_data)',
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
      this.runtimeAlive = true

      this.bindings = {
        initialize,
        destroy,
        send_create,
        send_destroy,
        send_send_video_v2,
        send_send_video_async_v2,
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
    // v0.7.121 — surface linger state to callers so main.ts can
    // normalise the wire-side `running:true` into a renderer-facing
    // `running:false` while the linger window holds the sender alive.
    // Without this, the Stop NDI button in the panel never visibly
    // toggles off (operator escalation: "When i tried turning off the
    // NDI when it on, it dosent want to go off").
    const lingering = this.lingerTimer !== null
    return {
      ...this.status,
      lingering,
      lingerRemainingMs: lingering ? this.lingerRemainingMs() : 0,
    }
  }

  async start(opts: NdiStartOptions): Promise<void> {
    if (!this.bindings) {
      throw new Error(this.unavailableReason() || 'NDI not available')
    }
    // v0.7.103 — Cancel any pending linger tear-down BEFORE the
    // persistent-source short-circuit below. The operator is bringing
    // the source back on-air; we must not let the linger timer fire
    // mid-broadcast and kill the sender we just resumed. Cancellation
    // is unconditional — even if the start() call ends up rebuilding
    // the sender from scratch (rename / resolution change), the linger
    // timer would only race with the rebuild.
    if (this.lingerTimer) {
      clearTimeout(this.lingerTimer)
      this.lingerTimer = null
      this.lingerStartedAt = 0
      this.lingerExpectedMs = 0
      this.emit('linger-cancelled')
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

    // v0.7.12 — mDNS-flush cooldown. When start() is called shortly
    // after a stop() (e.g. operator changed resolution, on-air toggle
    // bounce, fps switch, or the explicit Disconnect→Reconnect flow)
    // we MUST give downstream receivers time to NOTICE the old
    // sender is gone before we publish a new one with the same name.
    // Without enough silence in between, vMix in particular caches
    // the dead sender's IP:port and tries to TCP-connect to it for
    // 10–30s, ignoring the fresh mDNS announcement entirely — which
    // forces the operator to restart vMix to recover.
    //
    // v0.7.56 — Bumped 200 → 1500ms after operator escalation. vMix's
    // NDI Receiver fires its "no signal" detector at roughly 1s of
    // silence; only after that does it accept a new sender at the
    // same name. 1.5s adds margin for slow LAN links. Combined with
    // the full NDIlib_destroy() runtime recycle that stop() now
    // performs (which retracts the mDNS advertisement immediately
    // instead of letting it age out passively), this is enough to
    // make Disconnect→Reconnect work reliably without any operator
    // intervention on the receiver side.
    const sinceDestroy = Date.now() - this.lastDestroyAt
    const DESTROY_COOLDOWN_MS = 1500
    if (this.lastDestroyAt > 0 && sinceDestroy < DESTROY_COOLDOWN_MS) {
      await new Promise((res) => setTimeout(res, DESTROY_COOLDOWN_MS - sinceDestroy))
    }

    // v0.7.56 — Re-initialize the NDI runtime if the previous stop()
    // destroyed it. NDIlib_initialize() is idempotent and cheap (it
    // re-spawns the mDNS responder + the internal worker pool), so
    // calling it on every start that follows a recycle is safe. We
    // do NOT call it pre-emptively when runtime is already alive —
    // some NDI versions return false when re-initialised over a live
    // runtime, which would falsely look like a hardware-incompatible
    // CPU error to the user.
    if (this.bindings && !this.runtimeAlive) {
      if (!this.bindings.initialize()) {
        throw new Error(
          'NDIlib_initialize() returned false on reconnect. Try fully restarting ScriptureLive AI.',
        )
      }
      this.runtimeAlive = true
      console.log('[ndi] runtime re-initialised after operator stop')
    }

    const settings = {
      p_ndi_name: wantedName,
      p_groups: null as unknown as string,
      // v0.7.220 — clock_video MUST be false now that we use
      // send_send_video_async_v2. With async send, the NDI worker
      // thread handles outbound pacing internally; setting clock_video
      // would queue an additional pacing layer that fights the async
      // queue and re-introduces the main-thread blocking that v0.7.220
      // is specifically eliminating. Frame cadence is now driven by
      // the offscreen BrowserWindow's webContents.setFrameRate(fps)
      // (frame-capture.ts L93) which gives Chromium-paced, jitter-
      // free delivery into our send pipeline.
      clock_video: false,
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
    // v0.7.12 — Reset last-frame cache on every fresh start. If the
    // operator changed resolution, the cached frame's dimensions no
    // longer match — re-sending it would crash the native send call.
    this.lastFrame = null
    // Boot the keep-alive ticker so the receiver sees a continuous
    // source even before the first real frame arrives.
    this.startKeepAlive()
  }

  /**
   * v0.7.12 — Keep-alive ticker. Runs at the configured FPS while the
   * sender is alive. On each tick:
   *
   *   • If a real frame arrived within the last interval (i.e. the
   *     renderer is happily delivering frames), do nothing — sendFrame
   *     already pushed it.
   *
   *   • If no fresh frame has arrived (renderer stalled, page is
   *     navigating, on-air paused, GC pause, AI inference spike), re-
   *     emit the cached last frame. The receiver sees a continuous
   *     stream and never drops the source.
   *
   * This is the single biggest stability win for downstream OBS/vMix
   * users. Without it, any sub-second renderer hiccup can make the
   * receiver decide our source is dead and require manual reconnect.
   */
  private startKeepAlive(): void {
    this.stopKeepAlive()
    const fps = this.status.fps || 30
    const intervalMs = Math.max(16, Math.floor(1000 / fps))
    // v0.7.91 — Tighten the stale window from 1.5 frames to 1.05 frames
    // so even a SINGLE skipped renderer frame triggers re-emit. With
    // the previous 1.5x window, OBS/vMix would occasionally see a
    // sub-100ms gap on top of inherent network jitter and decide our
    // source was momentarily dead — they'd hold the last frame on
    // their end (looks fine) but their internal "source healthy" flag
    // would flip false and the operator's NDI tally would blink red.
    // Tightening to 1.05x means we re-emit aggressively whenever the
    // renderer is even one frame behind, so OBS/vMix's source-health
    // probes never see a gap longer than ~33 ms (one frame at 30 fps).
    const staleThresholdMs = Math.max(20, Math.floor(intervalMs * 1.05))
    this.keepAliveTimer = setInterval(() => {
      if (!this.senderInstance || !this.bindings) return
      if (this.sendBusy) return
      const last = this.lastFrame
      if (!last) return
      if (Date.now() - last.ts < staleThresholdMs) return
      // Re-emit cached frame. We deliberately do NOT touch lastFrame.ts
      // here — only real renderer frames update it, so successive
      // stalls keep firing the keep-alive. This is the contract OBS
      // and vMix rely on: "if the source is alive, frames keep coming
      // at the advertised cadence". Drop the cadence and they tear
      // down the connection; maintain it through hiccups and they
      // hold the connection across renderer crashes, GC pauses,
      // alt-tab, and Wi-Fi blips.
      this.nativeSendFrame(last.buffer, last.width, last.height)
    }, intervalMs)
    // setInterval keeps the event loop alive in Node — fine, the
    // sender being alive IS the whole point. unref() would let the
    // process exit while we're still publishing, which is wrong.
  }

  private stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer)
      this.keepAliveTimer = null
    }
  }

  /**
   * v0.7.12 — Internal frame push. Shared by sendFrame (renderer-driven)
   * and the keep-alive ticker. Guards against concurrent native calls
   * via sendBusy: clock_video=true makes send_send_video_v2 BLOCK until
   * the next frame slot, so re-entering would queue a frame behind the
   * blocked one and drift our pacing. When busy, the caller drops —
   * dropping is correct because (a) for sendFrame the next renderer
   * frame is ~33ms away, (b) for keep-alive we'll get another tick.
   */
  private nativeSendFrame(bgraBuffer: Buffer, width: number, height: number): void {
    if (!this.senderInstance || !this.bindings) return
    if (this.sendBusy) return
    this.sendBusy = true
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
      // v0.7.220 — Async send. Returns immediately; NDI worker thread
      // reads from `bgraBuffer` until the next async_v2 call. Buffer
      // lifetime is guaranteed by the 2-slot videoBufferPool in
      // sendFrame and the keep-alive ticker re-using lastFrame.buffer
      // (re-submitting the same pointer is explicitly allowed by the
      // NDI SDK and is how the keep-alive contract has always worked).
      this.bindings.send_send_video_async_v2(this.senderInstance, frame)
      this.status.frameCount += 1
      if (this.status.frameCount % 30 === 0) {
        this.emit('frame', this.status.frameCount)
      }
    } catch (err) {
      this.emit('error', err instanceof Error ? err.message : String(err))
    } finally {
      this.sendBusy = false
    }
  }

  async stop(): Promise<void> {
    // v0.7.103 — Clear any pending linger timer so it can't double-
    // fire after we've already torn the sender down. Safe to call
    // even when no linger is active (no-op).
    if (this.lingerTimer) {
      clearTimeout(this.lingerTimer)
      this.lingerTimer = null
      this.lingerStartedAt = 0
      this.lingerExpectedMs = 0
    }
    // v0.7.12 — Always stop the keep-alive ticker first so it can't
    // race with send_destroy and crash the native runtime by writing
    // into a freed sender pointer.
    this.stopKeepAlive()
    // v0.7.194-hotfix.11 Item #3 — Same race applies to the bridge
    // timer; disarm before sender teardown.
    this.disarmBridge()
    if (this.senderInstance && this.bindings) {
      try {
        this.bindings.send_destroy(this.senderInstance)
      } catch {
        /* ignore */
      }
      this.senderInstance = null
      this.lastDestroyAt = Date.now()
    }
    this.lastFrame = null
    // v0.7.220 — Release the 2-slot video buffer pool (~16MB at 1080p)
    // on sender teardown. Next start() will lazy-allocate fresh slots
    // on the first frame at whatever resolution is active. Without
    // this, an operator who switches projector resolution between
    // sessions would keep the old-resolution pool alive in memory
    // (small leak, but adds up across many resolution changes during
    // a long event day).
    this.videoBufferPool = []
    this.videoBufferIndex = 0
    this.videoBufferCapacity = 0
    this.status = { running: false, frameCount: this.status.frameCount }

    // v0.7.56 — Full NDI runtime recycle on operator-initiated stop.
    // Calling NDIlib_destroy() right after send_destroy() does three
    // things no amount of waiting alone can:
    //   1. Tears down the mDNS responder thread, which RETRACTS our
    //      sender's advertisement immediately (broadcasting goodbye
    //      records) instead of letting it passively age out of
    //      receivers' caches over many seconds.
    //   2. Releases every internal sender identity NDI was holding,
    //      so when we publish a new sender at the same name on the
    //      next start() it is treated as a fundamentally fresh
    //      identity at the protocol layer.
    //   3. Frees the worker pool / connection sockets that vMix and
    //      friends were holding open to OUR side, prompting them to
    //      drop their cached endpoint state for our source.
    // Combined with the 1.5s cooldown in start(), this is what
    // actually fixes the "vMix won't reconnect after Disconnect
    // unless I restart vMix" complaint. The trade-off is a tiny
    // delay (~50–150ms) on each Disconnect — invisible to operators.
    if (this.bindings && this.runtimeAlive) {
      try {
        this.bindings.destroy()
      } catch (e) {
        console.warn(
          '[ndi] runtime destroy on stop threw (non-fatal):',
          e instanceof Error ? e.message : e,
        )
      }
      this.runtimeAlive = false
    }
  }

  /**
   * v0.7.12 — Graceful stop. Emits a short black-frame fadeout (~200ms
   * by default) before tearing the sender down. This gives downstream
   * receivers a clean "fade to black" event on the wire instead of a
   * frozen last-frame, which is what NDI Studio Monitor / vMix /
   * Wirecast prefer to see when a source intentionally goes off-air.
   *
   * Used by ipcMain ndi:stop (operator-initiated). Emergency shutdown
   * paths (before-quit, crash) still call plain stop() because we may
   * have only milliseconds before the process exits and the fadeout
   * would add user-perceptible latency.
   */
  /**
   * v0.7.103 — Linger stop. The operator-initiated Disconnect path
   * (renderer ndi:stop). Behaves like gracefulStop in that we emit
   * a brief fade-to-black, but instead of then running send_destroy
   * + NDIlib_destroy (which would retract the mDNS advertisement
   * and drop the source from OBS / vMix / Wirecast / Studio Monitor)
   * we leave the NDI sender ALIVE on the wire for `lingerSeconds`,
   * with the keep-alive ticker pumping the cached black frame at the
   * configured fps. To downstream receivers the source remains
   * "live, currently black" — they keep the connection open, keep
   * the source listed, and never need a manual re-add.
   *
   * If start() is called inside the linger window with a matching
   * source name + geometry + fps, we cancel the timer and reuse
   * the existing sender — fresh real frames replace the black with
   * zero source-acquire flicker.
   *
   * If the timer fires (operator never came back), full stop() runs
   * and the sender is torn down for real.
   *
   * Trade-offs vs. the previous gracefulStop-everywhere policy:
   *   + Reconnect within ~60s is instant and seamless to receivers.
   *   + OBS/vMix never need to be touched on the operator's
   *     downstream machine.
   *   + The Disconnect button still gives a clean fade-to-black
   *     event on the wire so operators downstream visually see
   *     "they went off-air".
   *   – ~60s of NDI runtime + worker threads + mDNS responder are
   *     held alive after Disconnect. No CPU impact (keep-alive
   *     pumps ~33ms BGRA copies of a single black buffer); ~8 MB
   *     RAM at 1080p (one black BGRA buffer + sender state).
   */
  async lingerStop(blackFrameMs = 200, lingerSeconds = 60): Promise<void> {
    if (!this.senderInstance || !this.bindings) {
      return this.stop()
    }
    // Cancel any in-flight linger first (e.g., operator double-clicked
    // Disconnect, or hit Disconnect→Reconnect→Disconnect rapidly).
    if (this.lingerTimer) {
      clearTimeout(this.lingerTimer)
      this.lingerTimer = null
    }
    const w = this.status.width ?? 1280
    const h = this.status.height ?? 720
    const fps = this.status.fps || 30
    const frameMs = Math.max(1, Math.floor(1000 / fps))
    const totalFrames = Math.max(1, Math.ceil(blackFrameMs / frameMs))
    // BGRA opaque black: B=0,G=0,R=0,A=255. Held for the duration of
    // the linger window via keep-alive re-emission.
    const black = Buffer.alloc(w * h * 4)
    for (let i = 3; i < black.length; i += 4) black[i] = 255
    // Stream the fade-to-black at the configured frame cadence so
    // receivers see a clean, paced go-dark transition rather than a
    // single-tick burst.
    // v0.7.220 — Pre-fix this was a tight `for` loop relying on
    // clock_video=true to BLOCK each send_video_v2 for ~frameMs.
    // Under async_v2 + clock_video=false the FFI returns instantly,
    // so the same tight loop would dump every fade frame into NDI's
    // async queue in one tick — receivers might coalesce them down
    // to a single black flash instead of a paced fade. We pace
    // explicitly via setTimeout-await between sends.
    for (let i = 0; i < totalFrames; i++) {
      this.nativeSendFrame(black, w, h)
      if (i < totalFrames - 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, frameMs))
      }
    }
    // Pin the cached frame to BLACK so the keep-alive ticker keeps
    // emitting black at the configured fps for the linger window —
    // the source stays "alive but black" to receivers, the mDNS
    // advertisement stays published, and OBS/vMix retain their
    // open connection.
    this.lastFrame = { buffer: black, width: w, height: h, ts: Date.now() }
    // Schedule the real tear-down. clamp to [1s, 10min] for safety.
    const lingerMs = Math.max(1000, Math.min(600_000, Math.floor(lingerSeconds * 1000)))
    this.lingerStartedAt = Date.now()
    this.lingerExpectedMs = lingerMs
    this.lingerTimer = setTimeout(() => {
      this.lingerTimer = null
      const heldMs = Date.now() - this.lingerStartedAt
      this.lingerStartedAt = 0
      this.lingerExpectedMs = 0
      console.log(`[ndi] linger window expired after ${heldMs}ms — running full stop()`)
      void this.stop().catch(() => undefined)
      this.emit('linger-expired')
    }, lingerMs)
    console.log(`[ndi] linger started — sender held alive for ${lingerMs}ms`)
    this.emit('linger-started', { lingerMs })
    // NOTE: do NOT change this.status.running here. From the
    // wire/protocol perspective the sender IS still running; only
    // the visual content is now black. main.ts will emit its own
    // ndi:status with running=true so the renderer UI can show
    // an appropriate "off-air (holding source)" indicator if it
    // wants to (it doesn't have to — the existing UI just sees
    // the source still listed in Studio Monitor and is happy).
  }

  /**
   * v0.7.103 — Cancel an in-flight linger window without calling
   * start(). Useful for shutdown paths where we want to skip the
   * linger entirely and tear down immediately. Returns true if
   * a linger was actually cancelled.
   */
  cancelLinger(): boolean {
    if (this.lingerTimer) {
      clearTimeout(this.lingerTimer)
      this.lingerTimer = null
      this.lingerStartedAt = 0
      this.lingerExpectedMs = 0
      this.emit('linger-cancelled')
      return true
    }
    return false
  }

  /** v0.7.103 — Whether the sender is currently in linger mode. */
  isLingering(): boolean {
    return this.lingerTimer !== null
  }

  /**
   * v0.7.103 — Diagnostic: how much of the linger window remains.
   * Returns 0 when not lingering. Useful for surfacing a countdown
   * to operators in the future ("source held for OBS/vMix — 47s
   * left until full disconnect").
   */
  lingerRemainingMs(): number {
    if (!this.lingerTimer) return 0
    const elapsed = Date.now() - this.lingerStartedAt
    return Math.max(0, this.lingerExpectedMs - elapsed)
  }

  async gracefulStop(blackFrameMs = 500): Promise<void> {
    if (!this.senderInstance || !this.bindings) {
      return this.stop()
    }
    this.stopKeepAlive()
    const w = this.status.width ?? 1280
    const h = this.status.height ?? 720
    const fps = this.status.fps || 30
    const frameMs = Math.max(1, Math.floor(1000 / fps))
    const totalFrames = Math.max(1, Math.ceil(blackFrameMs / frameMs))
    // BGRA opaque black: B=0,G=0,R=0,A=255. Allocating once is fine
    // (1080p = ~8MB, lives only for the fadeout). We reuse the same
    // buffer across all the fadeout sends — NDI's async send accepts
    // the same buffer pointer repeatedly (each submission means
    // "process again"); the buffer stays valid for the lifetime of
    // gracefulStop's stack frame which outlives every send.
    // v0.7.220 — Same pacing rationale as lingerStop above: under
    // async_v2 + clock_video=false we MUST pace fade frames via
    // setTimeout-await; tight loop would coalesce into a single
    // black flash on the receiver instead of a visible fade.
    const black = Buffer.alloc(w * h * 4)
    for (let i = 3; i < black.length; i += 4) black[i] = 255
    for (let i = 0; i < totalFrames; i++) {
      this.nativeSendFrame(black, w, h)
      if (i < totalFrames - 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, frameMs))
      }
    }
    return this.stop()
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
      // v0.7.56 — only call destroy() if runtime is still alive.
      // stop() may have already recycled it — calling destroy() twice
      // crashes some NDI runtime builds.
      if (this.runtimeAlive) {
        try {
          this.bindings.destroy()
        } catch {
          /* ignore — we're tearing down anyway */
        }
        this.runtimeAlive = false
      }
      this.bindings = null
    }
  }

  /**
   * v0.7.194-hotfix.11 Item #3 — Frame bridge for Wirecast/OBS/vMix
   * continuity across FrameCapture rebuilds.
   *
   * Called by main.ts BEFORE the await chain that destroys the old
   * BrowserWindow and constructs a new one (Full↔LT flip, transparent
   * toggle, etc.). During that window, no fresh frames arrive at
   * sendFrame() so receivers normally see the cached lastFrame held
   * by the keep-alive ticker — BUT clock_video=true blocks
   * send_send_video_v2 to the wire cadence, and any sub-second event-
   * loop hiccup during BrowserWindow.destroy() / create / loadURL
   * can stretch the gap past Wirecast's 1s "no signal" detector. The
   * bridge spawns a SEPARATE tight setInterval (16 ms) that re-emits
   * lastFrame ignoring the keep-alive's stale-window check, so even
   * if the keep-alive timer is starved by GC or sync work, the bridge
   * timer keeps the wire alive. Self-disarms after armBridge's ms
   * window OR on disarmBridge(), whichever comes first.
   *
   * Safe to call when no sender exists: no-op. Safe to call when
   * already armed: extends the window to the new deadline.
   */
  armBridge(ms = 3000): void {
    if (!this.senderInstance || !this.bindings) return
    const deadline = Date.now() + Math.max(100, Math.min(10_000, ms))
    if (deadline > this.bridgeDeadline) this.bridgeDeadline = deadline
    if (this.bridgeTimer) return
    this.bridgeTimer = setInterval(() => {
      if (!this.senderInstance || !this.bindings) {
        this.disarmBridge()
        return
      }
      if (Date.now() >= this.bridgeDeadline) {
        this.disarmBridge()
        return
      }
      if (this.sendBusy) return
      const last = this.lastFrame
      if (!last) return
      this.nativeSendFrame(last.buffer, last.width, last.height)
      // v0.7.220 — Bridge tick interval MUST be paced to configured
      // fps. Pre-fix it was 16ms (62fps) which was implicitly capped
      // by the SYNC send_video_v2 blocking under clock_video=true.
      // Under async_v2 + clock_video=false the FFI returns instantly,
      // so a 16ms ticker would burst-send duplicate frames at 62fps
      // — wasting NDI worker thread cycles and confusing receiver
      // jitter buffers. Cap at fps (33ms @ 30fps, 16ms @ 60fps).
    }, Math.max(16, Math.floor(1000 / (this.status.fps || 30))))
  }

  disarmBridge(): void {
    if (this.bridgeTimer) {
      clearInterval(this.bridgeTimer)
      this.bridgeTimer = null
    }
    this.bridgeDeadline = 0
  }

  sendFrame(bgraBuffer: Buffer, width: number, height: number): void {
    if (!this.senderInstance || !this.bindings) return
    // v0.7.12 — Cache the frame BEFORE pushing so even if a native
    // send is currently in flight (sendBusy), the keep-alive ticker
    // has a fresh frame to emit on its next tick. We must COPY because
    // the BrowserWindow frame subscription's bitmap is owned by
    // Chromium's compositor — it is reused for the next capture
    // immediately after our callback returns, so retaining a
    // reference would race against Chromium overwriting it.
    //
    // v0.7.220 — The copy now lands in a 2-slot pre-allocated buffer
    // pool instead of a fresh Buffer.allocUnsafe per frame. Rationale:
    //   • Allocator + GC pressure: 1080p BGRA = ~8.3MB/frame. At 30fps
    //     that is ~250MB/s of allocate-then-discard churn on the main
    //     process. Empirically this is one of the top main-thread
    //     stutter sources on long-running sessions (V8 young-gen GC
    //     pauses scale with allocation rate, not live set).
    //   • Async send buffer-lifetime contract: send_send_video_async_v2
    //     requires the buffer to stay valid until the NEXT async send.
    //     With 2 slots and a sendBusy mutex (at most ONE outstanding
    //     async send at a time), the slot NDI is currently reading is
    //     never the slot we are about to write into next.
    // The pool is lazy-allocated on first frame and re-allocated only
    // on a resolution change (rare; e.g. operator switches projector
    // from 1080p to 4K).
    const needed = bgraBuffer.length
    if (this.videoBufferCapacity !== needed || this.videoBufferPool.length !== 2) {
      this.videoBufferPool = [Buffer.allocUnsafe(needed), Buffer.allocUnsafe(needed)]
      this.videoBufferCapacity = needed
      this.videoBufferIndex = 0
    }
    const slot = this.videoBufferPool[this.videoBufferIndex]!
    bgraBuffer.copy(slot)
    this.lastFrame = { buffer: slot, width, height, ts: Date.now() }
    this.nativeSendFrame(slot, width, height)
    // Advance index AFTER submit. Next sendFrame writes into the OTHER
    // slot, which is the one NDI is NOT currently reading from.
    this.videoBufferIndex = (this.videoBufferIndex + 1) % 2
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
