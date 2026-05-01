"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.NdiService = void 0;
const node_events_1 = require("node:events");
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
// ─── NDI native types ──────────────────────────────────────────────
//
// Layout matches Processing.NDI.Lib.h from the NDI 6 SDK, x64 ABI.
// Field order MUST be preserved or the DLL will read garbage.
const FOURCC_BGRA = 0x41524742; // 'BGRA' little-endian
const FRAME_FORMAT_PROGRESSIVE = 1;
// ─── DLL discovery ─────────────────────────────────────────────────
function findNdiDll() {
    // 1. Explicit override
    const envOverride = process.env.NDI_DLL_PATH;
    if (envOverride && fs.existsSync(envOverride))
        return envOverride;
    // 2. Standard NDI install locations (NDI Tools sets these env vars)
    const dllName = 'Processing.NDI.Lib.x64.dll';
    const candidates = [];
    for (const v of ['NDI_RUNTIME_DIR_V6', 'NDI_RUNTIME_DIR_V5', 'NDI_RUNTIME_DIR_V4']) {
        const dir = process.env[v];
        if (dir)
            candidates.push(path.join(dir, dllName));
    }
    // Common install paths if env vars are missing
    candidates.push('C:\\Program Files\\NDI\\NDI 6 Tools\\Runtime\\' + dllName, 'C:\\Program Files\\NDI\\NDI 5 Tools\\Runtime\\' + dllName, 'C:\\Program Files\\NDI\\NDI 6 SDK\\Bin\\x64\\' + dllName, 'C:\\Program Files\\NDI\\NDI 5 SDK\\Bin\\x64\\' + dllName);
    for (const candidate of candidates) {
        if (fs.existsSync(candidate))
            return candidate;
    }
    return null;
}
class NdiService extends node_events_1.EventEmitter {
    bindings = null;
    senderInstance = null;
    loadError = null;
    status = { running: false, frameCount: 0 };
    startedAt = 0;
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
    lastFrame = null;
    keepAliveTimer = null;
    sendBusy = false;
    lastDestroyAt = 0;
    constructor() {
        super();
        this.tryLoad();
    }
    tryLoad() {
        const dllPath = findNdiDll();
        if (!dllPath) {
            this.loadError =
                'NDI runtime DLL not found. Install "NDI Tools" or "NDI Runtime" from ' +
                    'https://ndi.video/tools/ — the installer drops Processing.NDI.Lib.x64.dll ' +
                    'into C:\\Program Files\\NDI\\NDI 6 Tools\\Runtime\\.';
            console.error('[ndi]', this.loadError);
            return;
        }
        let koffi;
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            koffi = require('koffi');
        }
        catch (e) {
            this.loadError = 'koffi (FFI library) failed to load: ' + (e instanceof Error ? e.message : String(e));
            console.error('[ndi]', this.loadError);
            return;
        }
        try {
            const lib = koffi.load(dllPath);
            // ─── Struct types ────────────────────────────────────────
            const NDIlib_send_create_t = koffi.struct('NDIlib_send_create_t', {
                p_ndi_name: 'string',
                p_groups: 'string',
                clock_video: 'bool',
                clock_audio: 'bool',
            });
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
            });
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
            });
            // ─── Function bindings ───────────────────────────────────
            // The NDI runtime DLL exports these symbols directly (v3.5+).
            const initialize = lib.func('bool NDIlib_initialize()');
            const destroy = lib.func('void NDIlib_destroy()');
            const send_create = lib.func('void *NDIlib_send_create(const NDIlib_send_create_t *p_create_settings)');
            const send_destroy = lib.func('void NDIlib_send_destroy(void *p_instance)');
            const send_send_video_v2 = lib.func('void NDIlib_send_send_video_v2(void *p_instance, const NDIlib_video_frame_v2_t *p_video_data)');
            const send_send_audio_v3 = lib.func('void NDIlib_send_send_audio_v3(void *p_instance, const NDIlib_audio_frame_v3_t *p_audio_data)');
            // Boot the NDI runtime once. This call is cheap and idempotent.
            if (!initialize()) {
                this.loadError = 'NDIlib_initialize() returned false. The host CPU may not be supported by NDI.';
                console.error('[ndi]', this.loadError);
                return;
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
            };
            console.log('[ndi] FFI bindings loaded from', dllPath);
        }
        catch (e) {
            this.loadError = 'NDI FFI binding setup failed: ' + (e instanceof Error ? e.message : String(e));
            console.error('[ndi]', this.loadError);
        }
    }
    isAvailable() {
        return !!this.bindings;
    }
    unavailableReason() {
        return this.bindings ? undefined : this.loadError || 'NDI not available';
    }
    getStatus() {
        return { ...this.status };
    }
    async start(opts) {
        if (!this.bindings) {
            throw new Error(this.unavailableReason() || 'NDI not available');
        }
        // Persistent-stream rule: vMix / Wirecast / OBS / Studio Monitor
        // re-acquire a source when our send instance disappears, which
        // shows up on the receiver as a one-frame black flash and a brief
        // "no signal" hold — exactly the flicker operators complained
        // about. So if a sender is already running with the SAME name and
        // declared format, keep it. The receiver never sees an interruption.
        // Only when something materially changes (rename, resolution, fps)
        // do we tear down and rebuild.
        const wantedName = opts.name || 'ScriptureLive';
        if (this.senderInstance &&
            this.status.running &&
            this.status.source === wantedName &&
            this.status.width === opts.width &&
            this.status.height === opts.height &&
            this.status.fps === opts.fps) {
            return;
        }
        if (this.senderInstance)
            await this.stop();
        // v0.7.12 — mDNS-flush cooldown. When start() is called shortly
        // after a stop() (e.g. operator changed resolution, on-air toggle
        // bounce, fps switch) we MUST give the NDI runtime time to retract
        // the old mDNS advertisement before publishing a new one with the
        // same source name. Without this, downstream receivers occasionally
        // see TWO sources momentarily — one dead, one live — and may
        // latch onto the dead one until the operator restarts the receiver.
        // 200ms is enough for the runtime's mDNS goodbye packets to fan
        // out on a typical LAN; longer would just delay first-frame.
        const sinceDestroy = Date.now() - this.lastDestroyAt;
        const DESTROY_COOLDOWN_MS = 200;
        if (this.lastDestroyAt > 0 && sinceDestroy < DESTROY_COOLDOWN_MS) {
            await new Promise((res) => setTimeout(res, DESTROY_COOLDOWN_MS - sinceDestroy));
        }
        const settings = {
            p_ndi_name: wantedName,
            p_groups: null,
            // clock_video = true makes NDIlib_send_send_video_v2 block to pace
            // frames at the declared frame rate. This is what gives NDI its
            // famously stable, low-jitter output even when our compositor
            // delivers frames slightly early or late.
            clock_video: true,
            clock_audio: false,
        };
        const instance = this.bindings.send_create(settings);
        if (!instance)
            throw new Error('NDIlib_send_create returned null');
        this.senderInstance = instance;
        this.status = {
            running: true,
            source: wantedName,
            width: opts.width,
            height: opts.height,
            fps: opts.fps,
            frameCount: 0,
        };
        this.startedAt = Date.now();
        // v0.7.12 — Reset last-frame cache on every fresh start. If the
        // operator changed resolution, the cached frame's dimensions no
        // longer match — re-sending it would crash the native send call.
        this.lastFrame = null;
        // Boot the keep-alive ticker so the receiver sees a continuous
        // source even before the first real frame arrives.
        this.startKeepAlive();
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
    startKeepAlive() {
        this.stopKeepAlive();
        const fps = this.status.fps || 30;
        const intervalMs = Math.max(16, Math.floor(1000 / fps));
        // Threshold for "stale enough to re-emit". 1.5 frame intervals
        // means a single missed frame triggers re-emit, but two back-to-
        // back real frames don't double-up.
        const staleThresholdMs = Math.floor(intervalMs * 1.5);
        this.keepAliveTimer = setInterval(() => {
            if (!this.senderInstance || !this.bindings)
                return;
            if (this.sendBusy)
                return;
            const last = this.lastFrame;
            if (!last)
                return;
            if (Date.now() - last.ts < staleThresholdMs)
                return;
            // Re-emit cached frame. We deliberately do NOT touch lastFrame.ts
            // here — only real renderer frames update it, so successive
            // stalls keep firing the keep-alive.
            this.nativeSendFrame(last.buffer, last.width, last.height);
        }, intervalMs);
        // setInterval keeps the event loop alive in Node — fine, the
        // sender being alive IS the whole point. unref() would let the
        // process exit while we're still publishing, which is wrong.
    }
    stopKeepAlive() {
        if (this.keepAliveTimer) {
            clearInterval(this.keepAliveTimer);
            this.keepAliveTimer = null;
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
    nativeSendFrame(bgraBuffer, width, height) {
        if (!this.senderInstance || !this.bindings)
            return;
        if (this.sendBusy)
            return;
        this.sendBusy = true;
        try {
            const fps = this.status.fps || 30;
            const frame = {
                xres: width,
                yres: height,
                FourCC: FOURCC_BGRA,
                frame_rate_N: fps * 1000,
                frame_rate_D: 1000,
                picture_aspect_ratio: width / height,
                frame_format_type: FRAME_FORMAT_PROGRESSIVE,
                timecode: BigInt(0),
                p_data: bgraBuffer,
                line_stride_in_bytes: width * 4,
                p_metadata: null,
                timestamp: BigInt(0),
            };
            this.bindings.send_send_video_v2(this.senderInstance, frame);
            this.status.frameCount += 1;
            if (this.status.frameCount % 30 === 0) {
                this.emit('frame', this.status.frameCount);
            }
        }
        catch (err) {
            this.emit('error', err instanceof Error ? err.message : String(err));
        }
        finally {
            this.sendBusy = false;
        }
    }
    async stop() {
        // v0.7.12 — Always stop the keep-alive ticker first so it can't
        // race with send_destroy and crash the native runtime by writing
        // into a freed sender pointer.
        this.stopKeepAlive();
        if (this.senderInstance && this.bindings) {
            try {
                this.bindings.send_destroy(this.senderInstance);
            }
            catch {
                /* ignore */
            }
            this.senderInstance = null;
            this.lastDestroyAt = Date.now();
        }
        this.lastFrame = null;
        this.status = { running: false, frameCount: this.status.frameCount };
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
    async gracefulStop(blackFrameMs = 200) {
        if (!this.senderInstance || !this.bindings) {
            return this.stop();
        }
        this.stopKeepAlive();
        const w = this.status.width ?? 1280;
        const h = this.status.height ?? 720;
        const fps = this.status.fps || 30;
        const frameMs = Math.max(1, Math.floor(1000 / fps));
        const totalFrames = Math.max(1, Math.ceil(blackFrameMs / frameMs));
        // BGRA opaque black: B=0,G=0,R=0,A=255. Allocating once is fine
        // (1080p = ~8MB, lives only for the fadeout). We reuse the same
        // buffer across all the fadeout sends — NDI copies it internally
        // before send_send_video_v2 returns (clock_video=true blocks
        // until the slot is consumed).
        const black = Buffer.alloc(w * h * 4);
        for (let i = 3; i < black.length; i += 4)
            black[i] = 255;
        for (let i = 0; i < totalFrames; i++) {
            this.nativeSendFrame(black, w, h);
        }
        return this.stop();
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
    destroy() {
        if (this.bindings) {
            try {
                this.bindings.destroy();
            }
            catch {
                /* ignore — we're tearing down anyway */
            }
            this.bindings = null;
        }
    }
    sendFrame(bgraBuffer, width, height) {
        if (!this.senderInstance || !this.bindings)
            return;
        // v0.7.12 — Cache the frame BEFORE pushing so even if the native
        // call is currently blocked (sendBusy), the keep-alive ticker has
        // a fresh frame to emit on its next tick. We make a defensive
        // COPY because the BrowserWindow frame subscription's bitmap is
        // owned by Chromium's compositor — it's reused for the next
        // capture immediately after our callback returns, so retaining a
        // reference for keep-alive re-emit would race against Chromium
        // overwriting it. Copy is cheap (1080p = ~8MB / 30fps) compared
        // to the alternative of dropping frames or showing tearing.
        const copy = Buffer.allocUnsafe(bgraBuffer.length);
        bgraBuffer.copy(copy);
        this.lastFrame = { buffer: copy, width, height, ts: Date.now() };
        this.nativeSendFrame(copy, width, height);
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
    sendAudio(planar, sampleRate, numChannels, samplesPerChannel) {
        if (!this.senderInstance || !this.bindings)
            return;
        try {
            const FOURCC_FLTP = 0x50544c46; // 'FLTP' little-endian = Float32 planar
            const buf = Buffer.from(planar.buffer, planar.byteOffset, planar.byteLength);
            const frame = {
                sample_rate: sampleRate,
                no_channels: numChannels,
                no_samples: samplesPerChannel,
                timecode: BigInt(0),
                FourCC: FOURCC_FLTP,
                p_data: buf,
                channel_stride_in_bytes: samplesPerChannel * 4, // 4 bytes per float
                p_metadata: null,
                timestamp: BigInt(0),
            };
            this.bindings.send_send_audio_v3(this.senderInstance, frame);
        }
        catch (err) {
            this.emit('error', err instanceof Error ? err.message : String(err));
        }
    }
    uptimeMs() {
        return this.status.running ? Date.now() - this.startedAt : 0;
    }
}
exports.NdiService = NdiService;
//# sourceMappingURL=ndi-service.js.map