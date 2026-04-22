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
        if (this.senderInstance)
            await this.stop();
        const settings = {
            p_ndi_name: opts.name || 'ScriptureLive',
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
            source: opts.name,
            width: opts.width,
            height: opts.height,
            fps: opts.fps,
            frameCount: 0,
        };
        this.startedAt = Date.now();
    }
    async stop() {
        if (this.senderInstance && this.bindings) {
            try {
                this.bindings.send_destroy(this.senderInstance);
            }
            catch {
                /* ignore */
            }
            this.senderInstance = null;
        }
        this.status = { running: false, frameCount: this.status.frameCount };
    }
    sendFrame(bgraBuffer, width, height) {
        if (!this.senderInstance || !this.bindings)
            return;
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