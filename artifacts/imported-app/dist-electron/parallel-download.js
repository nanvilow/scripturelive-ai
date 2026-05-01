"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parallelDownload = parallelDownload;
exports.formatBytesPerSecond = formatBytesPerSecond;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const PROGRESS_THROTTLE_MS = 100;
const SPEED_WINDOW_MS = 1500;
async function parallelDownload(opts) {
    const requestedParallelism = Math.max(1, Math.min(8, opts.parallelism ?? 4));
    // 1. HEAD — discover size + Range support. Failure is non-fatal: we
    //    fall back to single-stream GET which always works.
    let total = opts.expectedSize ?? 0;
    let acceptRanges = false;
    try {
        const head = await fetch(opts.url, {
            method: 'HEAD',
            redirect: 'follow',
            signal: opts.signal,
        });
        if (head.ok) {
            const len = head.headers.get('content-length');
            if (len) {
                const parsed = parseInt(len, 10);
                if (Number.isFinite(parsed) && parsed > 0)
                    total = parsed;
            }
            acceptRanges = (head.headers.get('accept-ranges') || '')
                .toLowerCase()
                .includes('bytes');
        }
    }
    catch {
        // HEAD failed — fall through to single stream below.
        acceptRanges = false;
    }
    if (!acceptRanges || total <= 0 || requestedParallelism === 1) {
        return await singleStreamDownload(opts, total);
    }
    // 2. Pre-allocate the destination so chunks can write positionally.
    await (0, promises_1.mkdir)((0, node_path_1.dirname)(opts.savePath), { recursive: true });
    await (0, promises_1.truncate)(opts.savePath, total);
    const fd = await (0, promises_1.open)(opts.savePath, 'r+');
    const startedAt = Date.now();
    try {
        // 3. Compute chunk byte ranges.
        const chunkSize = Math.ceil(total / requestedParallelism);
        const chunks = [];
        for (let i = 0; i < requestedParallelism; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize - 1, total - 1);
            if (start > end)
                break;
            chunks.push({ start, end, transferred: 0 });
        }
        const effectiveParallelism = chunks.length;
        // 4. Throttled progress emission with rolling-window speed.
        const speedSamples = [{ t: startedAt, bytes: 0 }];
        let lastEmit = 0;
        const computeAndEmit = (force) => {
            const now = Date.now();
            if (!force && now - lastEmit < PROGRESS_THROTTLE_MS)
                return;
            lastEmit = now;
            const transferred = chunks.reduce((s, c) => s + c.transferred, 0);
            speedSamples.push({ t: now, bytes: transferred });
            const cutoff = now - SPEED_WINDOW_MS;
            while (speedSamples.length > 2 && speedSamples[0].t < cutoff) {
                speedSamples.shift();
            }
            const oldest = speedSamples[0];
            const newest = speedSamples[speedSamples.length - 1];
            const elapsedSec = newest.t > oldest.t ? (newest.t - oldest.t) / 1000 : 0;
            const deltaBytes = newest.bytes - oldest.bytes;
            const bytesPerSecond = elapsedSec > 0 ? deltaBytes / elapsedSec : 0;
            const remaining = Math.max(0, total - transferred);
            const etaSeconds = bytesPerSecond > 0 ? remaining / bytesPerSecond : Infinity;
            opts.onProgress?.({
                transferred,
                total,
                bytesPerSecond,
                percent: total > 0 ? (transferred / total) * 100 : 0,
                parallelism: effectiveParallelism,
                etaSeconds,
            });
        };
        // 5. Download every chunk concurrently. Promise.all rejects on
        //    the first failure; the caller-supplied AbortSignal then
        //    cancels all sibling chunks via fetch's signal propagation.
        await Promise.all(chunks.map(async (chunk) => {
            await downloadChunkInto(fd, chunk, opts.url, opts.signal, () => {
                computeAndEmit(false);
            });
        }));
        computeAndEmit(true);
        // 6. SHA-512 verify against expected hash from latest.yml.
        if (opts.expectedSha512) {
            const got = await hashFile(opts.savePath);
            if (got !== opts.expectedSha512) {
                // Wipe the bad file so a retry doesn't reuse it.
                await (0, promises_1.unlink)(opts.savePath).catch(() => { });
                throw new Error(`SHA-512 mismatch — installer integrity check failed (expected ${opts.expectedSha512.slice(0, 16)}…, got ${got.slice(0, 16)}…)`);
            }
        }
        return {
            savePath: opts.savePath,
            totalBytes: total,
            durationMs: Date.now() - startedAt,
            parallelism: effectiveParallelism,
            rangedUsed: true,
        };
    }
    finally {
        await fd.close().catch(() => { });
    }
}
async function downloadChunkInto(fd, chunk, url, signal, onByteWritten) {
    const res = await fetch(url, {
        headers: { Range: `bytes=${chunk.start}-${chunk.end}` },
        redirect: 'follow',
        signal,
    });
    // 206 Partial Content is the success code for a Range request.
    // Some misconfigured servers reply 200 with the full body; if that
    // happens we MUST bail because we'd write the entire file into one
    // chunk's slice and corrupt the others.
    if (res.status !== 206) {
        throw new Error(`Range request for bytes=${chunk.start}-${chunk.end} returned ${res.status} (expected 206)`);
    }
    if (!res.body) {
        throw new Error(`Range request for bytes=${chunk.start}-${chunk.end} returned no body`);
    }
    const reader = res.body.getReader();
    let pos = chunk.start;
    for (;;) {
        const { done, value } = await reader.read();
        if (done)
            break;
        if (value && value.byteLength > 0) {
            const buf = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
            await fd.write(buf, 0, buf.byteLength, pos);
            pos += buf.byteLength;
            chunk.transferred += buf.byteLength;
            onByteWritten();
        }
    }
    // Sanity check — if the server cut the stream short we'd silently
    // ship a truncated chunk and the SHA verify would catch it. The
    // explicit check produces a clearer error for the operator.
    const expected = chunk.end - chunk.start + 1;
    if (chunk.transferred !== expected) {
        throw new Error(`Chunk bytes=${chunk.start}-${chunk.end} truncated: got ${chunk.transferred} / ${expected} bytes`);
    }
}
async function singleStreamDownload(opts, knownTotal) {
    await (0, promises_1.mkdir)((0, node_path_1.dirname)(opts.savePath), { recursive: true });
    const startedAt = Date.now();
    const res = await fetch(opts.url, { redirect: 'follow', signal: opts.signal });
    if (!res.ok)
        throw new Error(`GET ${opts.url} returned ${res.status}`);
    if (!res.body)
        throw new Error(`GET ${opts.url} returned no body`);
    const lenHdr = res.headers.get('content-length');
    const total = knownTotal > 0
        ? knownTotal
        : lenHdr
            ? Math.max(0, parseInt(lenHdr, 10) || 0)
            : 0;
    const fd = await (0, promises_1.open)(opts.savePath, 'w');
    let transferred = 0;
    let lastEmit = 0;
    const speedSamples = [{ t: startedAt, bytes: 0 }];
    try {
        const reader = res.body.getReader();
        for (;;) {
            const { done, value } = await reader.read();
            if (done)
                break;
            if (value && value.byteLength > 0) {
                const buf = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
                await fd.write(buf, 0, buf.byteLength);
                transferred += buf.byteLength;
                const now = Date.now();
                if (now - lastEmit >= PROGRESS_THROTTLE_MS) {
                    lastEmit = now;
                    speedSamples.push({ t: now, bytes: transferred });
                    const cutoff = now - SPEED_WINDOW_MS;
                    while (speedSamples.length > 2 && speedSamples[0].t < cutoff) {
                        speedSamples.shift();
                    }
                    const oldest = speedSamples[0];
                    const newest = speedSamples[speedSamples.length - 1];
                    const elapsedSec = newest.t > oldest.t ? (newest.t - oldest.t) / 1000 : 0;
                    const deltaBytes = newest.bytes - oldest.bytes;
                    const bytesPerSecond = elapsedSec > 0 ? deltaBytes / elapsedSec : 0;
                    const remaining = total > 0 ? Math.max(0, total - transferred) : 0;
                    const etaSeconds = bytesPerSecond > 0 && total > 0 ? remaining / bytesPerSecond : Infinity;
                    opts.onProgress?.({
                        transferred,
                        total: total || transferred,
                        bytesPerSecond,
                        percent: total > 0 ? (transferred / total) * 100 : 0,
                        parallelism: 1,
                        etaSeconds,
                    });
                }
            }
        }
    }
    finally {
        await fd.close().catch(() => { });
    }
    if (opts.expectedSha512) {
        const got = await hashFile(opts.savePath);
        if (got !== opts.expectedSha512) {
            await (0, promises_1.unlink)(opts.savePath).catch(() => { });
            throw new Error(`SHA-512 mismatch — installer integrity check failed (expected ${opts.expectedSha512.slice(0, 16)}…, got ${got.slice(0, 16)}…)`);
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
    });
    return {
        savePath: opts.savePath,
        totalBytes: transferred,
        durationMs: Date.now() - startedAt,
        parallelism: 1,
        rangedUsed: false,
    };
}
async function hashFile(path) {
    const hash = (0, node_crypto_1.createHash)('sha512');
    const stream = (0, node_fs_1.createReadStream)(path);
    for await (const chunk of stream) {
        hash.update(chunk);
    }
    return hash.digest('base64');
}
/**
 * Convenience: format bytes/sec as a human-readable string with the
 * unit auto-scaled. Kept here (not in the renderer) so the main process
 * can also log with consistent formatting.
 */
function formatBytesPerSecond(bps) {
    if (!Number.isFinite(bps) || bps <= 0)
        return '0 KB/s';
    if (bps >= 1024 * 1024)
        return `${(bps / 1024 / 1024).toFixed(1)} MB/s`;
    if (bps >= 1024)
        return `${(bps / 1024).toFixed(0)} KB/s`;
    return `${Math.round(bps)} B/s`;
}
//# sourceMappingURL=parallel-download.js.map