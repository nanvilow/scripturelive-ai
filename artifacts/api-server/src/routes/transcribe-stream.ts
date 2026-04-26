import type { Server as HttpServer, IncomingMessage } from "http";
import type { Socket } from "net";
import { WebSocketServer, WebSocket } from "ws";
import { logger } from "../lib/logger";
import { BIBLE_KEYTERMS } from "../lib/deepgram-keyterms";

/**
 * /api/transcribe-stream — Deepgram streaming proxy (v0.5.35).
 *
 * Replaces the per-chunk Whisper REST endpoint with a real-time
 * WebSocket bridge. The desktop app opens a WSS to this server and
 * streams raw 16-bit PCM @ 16 kHz; this server holds the shared
 * DEEPGRAM_API_KEY and proxies the audio to Deepgram, then forwards
 * Deepgram's interim + final transcripts back over the same socket.
 *
 * ─── Wire protocol ──────────────────────────────────────────────────
 *   client → server : binary frames containing PCM Int16 @ 16 kHz mono
 *                     (or the literal text "CLOSE" to gracefully close)
 *   server → client : JSON text frames passed through from Deepgram
 *                     (channel.alternatives[0].transcript + is_final +
 *                     speech_final + duration etc.) and our own
 *                     control messages: {type:'ready'|'error', ...}
 *
 * ─── Why a server-side proxy ────────────────────────────────────────
 * Per Option B in the v0.5.34 → v0.5.35 design discussion: a single
 * shared Deepgram key lives on Replit and is never shipped to
 * customer machines. Customers' desktops authenticate to the proxy
 * by virtue of reaching this server's URL (no per-customer auth
 * yet — abuse limiting is out of scope for this version).
 */

const DEEPGRAM_HOST = "api.deepgram.com";

function buildDeepgramUrl(): string {
  // Nova-3 + linear16 16 kHz + interim_results so the renderer can
  // show live word-by-word transcript while the speaker talks. The
  // BIBLE_KEYTERMS biases the model toward Bible book names + verse
  // vocabulary, which is the entire detection signal for our use.
  // endpointing=300 keeps each utterance ~natural sentence length.
  const params = new URLSearchParams({
    model: "nova-3",
    language: "en-US",
    encoding: "linear16",
    sample_rate: "16000",
    channels: "1",
    punctuate: "true",
    interim_results: "true",
    smart_format: "true",
    endpointing: "300",
    vad_events: "true",
  });
  // keyterm is a multi-value param; URLSearchParams handles repeats.
  for (const term of BIBLE_KEYTERMS) {
    params.append("keyterm", term);
  }
  return `wss://${DEEPGRAM_HOST}/v1/listen?${params.toString()}`;
}

function safeSend(ws: WebSocket, data: string | Buffer): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(data);
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[deepgram-proxy] safeSend failed");
  }
}

export function attachTranscribeStream(server: HttpServer): WebSocketServer {
  // noServer mode lets us hand-pick the upgrade path so other future
  // WebSocket endpoints (collab, multi-screen sync) can co-exist on
  // the same HTTP server without colliding.
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req: IncomingMessage, socket: Socket, head: Buffer) => {
    const url = req.url || "";
    if (!url.startsWith("/api/transcribe-stream")) return;

    const apiKey = process.env["DEEPGRAM_API_KEY"];
    if (!apiKey) {
      socket.write(
        "HTTP/1.1 503 Service Unavailable\r\n" +
          "Content-Type: text/plain\r\n" +
          "Connection: close\r\n\r\n" +
          "Streaming transcription unavailable: DEEPGRAM_API_KEY is not configured on the server.",
      );
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (client) => {
      wss.emit("connection", client, req);
    });
  });

  wss.on("connection", (client: WebSocket, req: IncomingMessage) => {
    const apiKey = process.env["DEEPGRAM_API_KEY"]!;
    const remote = req.socket.remoteAddress || "unknown";
    const sessionId = Math.random().toString(36).slice(2, 10);
    const log = logger.child({ component: "deepgram-proxy", session: sessionId, remote });
    log.info("client connected");

    const dgUrl = buildDeepgramUrl();
    const dg = new WebSocket(dgUrl, {
      headers: { Authorization: `Token ${apiKey}` },
    });

    let dgReady = false;
    const audioBacklog: Buffer[] = [];
    let totalAudioBytes = 0;
    let totalDgMessages = 0;
    // v0.5.36 — two-phase close. When the client signals end-of-stream
    // we send CloseStream to Deepgram and WAIT for Deepgram's own
    // close event before tearing down the client socket. This lets
    // any in-flight final results (typically ~200-500 ms of pending
    // transcript after the last audio frame) flow back through the
    // proxy. A safety timer guarantees the client socket closes even
    // if Deepgram never acknowledges.
    let drainTimer: NodeJS.Timeout | null = null;
    const DEEPGRAM_DRAIN_MS = 2000;

    const closeClient = (code = 1000, reason = "") => {
      if (drainTimer) { clearTimeout(drainTimer); drainTimer = null; }
      try {
        if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) {
          client.close(code, reason);
        }
      } catch { /* ignore */ }
    };

    const drainAndClose = (reason: string) => {
      // Tell Deepgram to flush, then wait for its close event in the
      // dg.on("close") handler below (which calls closeClient). If
      // Deepgram doesn't close within the drain window, force-close.
      if (dg.readyState === WebSocket.OPEN) {
        try { dg.send(JSON.stringify({ type: "CloseStream" })); } catch { /* ignore */ }
      } else if (dg.readyState === WebSocket.CONNECTING) {
        try { dg.close(1000, reason); } catch { /* ignore */ }
      }
      if (!drainTimer) {
        drainTimer = setTimeout(() => {
          log.warn("deepgram drain timeout — forcing close");
          try { dg.terminate(); } catch { /* ignore */ }
          closeClient(1000, reason);
        }, DEEPGRAM_DRAIN_MS);
      }
    };

    // Hard-close path used when Deepgram or client errors out — no
    // drain because there's nothing to drain.
    const closeBoth = (code = 1011, reason = "") => {
      if (drainTimer) { clearTimeout(drainTimer); drainTimer = null; }
      try {
        if (dg.readyState === WebSocket.OPEN || dg.readyState === WebSocket.CONNECTING) {
          dg.close(code, reason);
        }
      } catch { /* ignore */ }
      closeClient(code, reason);
    };

    // ─── Deepgram → client ──────────────────────────────────────────
    dg.on("open", () => {
      dgReady = true;
      log.info("deepgram socket open");
      safeSend(client, JSON.stringify({ type: "ready" }));
      // Flush anything captured while we were waiting for Deepgram.
      while (audioBacklog.length) {
        const buf = audioBacklog.shift()!;
        try { dg.send(buf); } catch { /* ignore */ }
      }
    });
    dg.on("message", (data, isBinary) => {
      totalDgMessages += 1;
      if (isBinary) return; // Deepgram only sends JSON text frames.
      safeSend(client, data.toString());
    });
    dg.on("error", (err) => {
      log.warn({ err: err.message }, "deepgram socket error");
      safeSend(
        client,
        JSON.stringify({ type: "error", source: "deepgram", message: err.message }),
      );
      closeBoth(1011, "deepgram error");
    });
    dg.on("close", (code, reason) => {
      log.info(
        { code, reason: reason.toString(), totalAudioBytes, totalDgMessages },
        "deepgram socket closed",
      );
      // Deepgram has flushed everything it had — pending JSON results
      // were already forwarded to the client by the message handler
      // above. Now it's safe to close the client socket.
      closeClient(1000, "deepgram closed");
    });

    // ─── client → Deepgram ──────────────────────────────────────────
    client.on("message", (data, isBinary) => {
      if (!isBinary) {
        // Tiny control protocol: client sends "CLOSE" to gracefully end.
        // We honor it via the two-phase drain so the operator sees the
        // tail of their final utterance instead of losing it.
        const text = data.toString().trim();
        if (text === "CLOSE") {
          drainAndClose("client close");
          return;
        }
        // Anything else as text is ignored — we expect binary audio.
        return;
      }
      const buf = Buffer.isBuffer(data)
        ? data
        : Array.isArray(data)
          ? Buffer.concat(data as Buffer[])
          : Buffer.from(data as ArrayBuffer);
      totalAudioBytes += buf.length;
      if (!dgReady) {
        // Buffer up to ~2 MB while Deepgram socket is still connecting
        // (typical handshake is 100-300 ms; cap protects memory).
        if (audioBacklog.reduce((n, b) => n + b.length, 0) < 2 * 1024 * 1024) {
          audioBacklog.push(buf);
        }
        return;
      }
      try {
        dg.send(buf);
      } catch (err) {
        log.warn({ err: err instanceof Error ? err.message : String(err) }, "forward to deepgram failed");
      }
    });
    client.on("error", (err) => {
      log.warn({ err: err.message }, "client socket error");
      closeBoth(1011, "client error");
    });
    client.on("close", (code, reason) => {
      log.info(
        { code, reason: reason.toString(), totalAudioBytes, totalDgMessages },
        "client socket closed",
      );
      // Client gone — close Deepgram immediately. No drain needed
      // because there's no one to deliver pending results to.
      if (drainTimer) { clearTimeout(drainTimer); drainTimer = null; }
      try {
        if (dg.readyState === WebSocket.OPEN || dg.readyState === WebSocket.CONNECTING) {
          dg.close(1000, "client closed");
        }
      } catch { /* ignore */ }
    });
  });

  return wss;
}
