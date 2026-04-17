"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NdiService = void 0;
const node_events_1 = require("node:events");
const FOURCC_BGRA = 0x41524742; // 'BGRA' little-endian
const FOURCC_BGRX = 0x58524742; // 'BGRX'
const FRAME_FORMAT_PROGRESSIVE = 1;
class NdiService extends node_events_1.EventEmitter {
    grandiose = null;
    loadError = null;
    sender = null;
    status = { running: false, frameCount: 0 };
    fourCC = FOURCC_BGRA;
    startedAt = 0;
    constructor() {
        super();
        this.tryLoad();
    }
    tryLoad() {
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            this.grandiose = require('grandiose');
            if (this.grandiose?.FourCC?.BGRA)
                this.fourCC = this.grandiose.FourCC.BGRA;
        }
        catch (err) {
            this.grandiose = null;
            this.loadError = err instanceof Error ? err.message : String(err);
        }
    }
    isAvailable() {
        return !!this.grandiose;
    }
    unavailableReason() {
        return this.grandiose ? undefined : (this.loadError || 'grandiose native module not installed');
    }
    getStatus() {
        return { ...this.status };
    }
    async start(opts) {
        if (!this.grandiose) {
            throw new Error(this.unavailableReason() || 'NDI not available');
        }
        if (this.sender)
            await this.stop();
        const sender = this.grandiose.send({
            name: opts.name || 'ScriptureLive',
            clockVideo: true,
            clockAudio: false,
        });
        this.sender = sender;
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
        if (this.sender) {
            try {
                await this.sender.destroy();
            }
            catch { /* ignore */ }
            this.sender = null;
        }
        this.status = { running: false, frameCount: this.status.frameCount };
    }
    sendFrame(bgraBuffer, width, height) {
        if (!this.sender || !this.grandiose)
            return;
        try {
            const fps = this.status.fps || 30;
            const frame = {
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
            };
            const result = this.sender.video(frame);
            if (result && typeof result.then === 'function') {
                ;
                result.catch((err) => {
                    this.emit('error', err instanceof Error ? err.message : String(err));
                });
            }
            this.status.frameCount += 1;
            if (this.status.frameCount % 30 === 0) {
                this.emit('frame', this.status.frameCount);
            }
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