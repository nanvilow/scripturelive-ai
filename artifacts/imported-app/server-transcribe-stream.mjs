// ─────────────────────────────────────────────────────────────────────
// server-transcribe-stream.mjs (v0.5.40)
//
// Embeds the Deepgram streaming WebSocket proxy directly into the
// imported-app's production HTTP server. Same logic as
// `artifacts/api-server/src/routes/transcribe-stream.ts`, inlined here
// so a single Reserved-VM deployment of the imported-app serves both
// the Next.js app AND the streaming transcription endpoint at the
// same origin (e.g. wss://scripturelive.replit.app/api/transcribe-stream).
//
// Why a server-side proxy: the shared DEEPGRAM_API_KEY lives only on
// the deployment and is never shipped to customer Windows installs.
// Customers' desktops authenticate to the proxy by virtue of reaching
// this server's URL.
// ─────────────────────────────────────────────────────────────────────

import { WebSocketServer, WebSocket } from "ws";

const DEEPGRAM_HOST = "api.deepgram.com";

// Bible book names + preaching vocabulary fed to Deepgram as
// `keyterm` query params. Mirror of api-server/src/lib/deepgram-keyterms.
const BIBLE_KEYTERMS = Object.freeze([
  // ─── Old Testament ───────────────────────────────────────────────
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
  "Joshua", "Judges", "Ruth",
  "1 Samuel", "2 Samuel", "First Samuel", "Second Samuel",
  "1 Kings", "2 Kings", "First Kings", "Second Kings",
  "1 Chronicles", "2 Chronicles", "First Chronicles", "Second Chronicles",
  "Ezra", "Nehemiah", "Esther",
  "Job", "Psalms", "Psalm", "Proverbs", "Ecclesiastes", "Song of Solomon",
  "Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel",
  "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah",
  "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi",
  // ─── New Testament ───────────────────────────────────────────────
  "Matthew", "Mark", "Luke", "John", "Acts", "Romans",
  "1 Corinthians", "2 Corinthians", "First Corinthians", "Second Corinthians",
  "Galatians", "Ephesians", "Philippians", "Colossians",
  "1 Thessalonians", "2 Thessalonians", "First Thessalonians", "Second Thessalonians",
  "1 Timothy", "2 Timothy", "First Timothy", "Second Timothy",
  "Titus", "Philemon", "Hebrews", "James",
  "1 Peter", "2 Peter", "First Peter", "Second Peter",
  "1 John", "2 John", "3 John", "First John", "Second John", "Third John",
  "Jude", "Revelation",
  // ─── Reference vocabulary ────────────────────────────────────────
  "chapter", "verse", "verses",
  "the Bible says", "scripture says", "according to scripture",
  "turn to", "let us read", "open your Bibles",
  // ─── Christian vocabulary ────────────────────────────────────────
  "Jesus", "Christ", "Lord", "God", "Holy Spirit",
  "gospel", "salvation", "righteousness", "kingdom",
  "covenant", "prophet", "apostle", "disciple",
  "faith", "grace", "mercy", "repentance", "amen", "hallelujah",
]);

function buildDeepgramUrl() {
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
  for (const term of BIBLE_KEYTERMS) params.append("keyterm", term);
  return `wss://${DEEPGRAM_HOST}/v1/listen?${params.toString()}`;
}

function safeSend(ws, data) {
  if (ws.readyState !== WebSocket.OPEN) return;
  try { ws.send(data); } catch { /* ignore */ }
}

/**
 * Attach the /api/transcribe-stream WebSocket upgrade handler to an
 * existing Node http(s).Server. Idempotent: registers exactly one
 * 'upgrade' listener per call, so calling twice on the same server
 * will register twice — only call once at server boot.
 */
export function attachTranscribeStream(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    let url = req.url || "";
    // Replit workspace-preview proxy preserves the /__api-server prefix
    // when forwarding api-server upgrades. The production deployment
    // serves at the root and never sees that prefix, but stripping it
    // here means the same code works in dev mode (when this module is
    // also wired into the dev server).
    if (url.startsWith("/__api-server/")) {
      url = url.slice("/__api-server".length);
    }
    if (!url.startsWith("/api/transcribe-stream")) return;

    const apiKey = process.env.DEEPGRAM_API_KEY;
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

  wss.on("connection", (client, req) => {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    const remote = req.socket?.remoteAddress || "unknown";
    const sessionId = Math.random().toString(36).slice(2, 10);
    const log = (lvl, obj, msg) => {
      const tag = `[deepgram-proxy ${sessionId} ${remote}]`;
      try {
        console[lvl === "warn" ? "warn" : "log"](
          tag,
          msg,
          obj && Object.keys(obj).length ? JSON.stringify(obj) : "",
        );
      } catch { /* ignore */ }
    };
    log("info", null, "client connected");

    const dg = new WebSocket(buildDeepgramUrl(), {
      headers: { Authorization: `Token ${apiKey}` },
    });

    let dgReady = false;
    const audioBacklog = [];
    let totalAudioBytes = 0;
    let totalDgMessages = 0;
    let drainTimer = null;
    const DEEPGRAM_DRAIN_MS = 2000;

    const closeClient = (code = 1000, reason = "") => {
      if (drainTimer) { clearTimeout(drainTimer); drainTimer = null; }
      try {
        if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) {
          client.close(code, reason);
        }
      } catch { /* ignore */ }
    };

    const drainAndClose = (reason) => {
      if (dg.readyState === WebSocket.OPEN) {
        try { dg.send(JSON.stringify({ type: "CloseStream" })); } catch { /* ignore */ }
      } else if (dg.readyState === WebSocket.CONNECTING) {
        try { dg.close(1000, reason); } catch { /* ignore */ }
      }
      if (!drainTimer) {
        drainTimer = setTimeout(() => {
          log("warn", null, "deepgram drain timeout — forcing close");
          try { dg.terminate(); } catch { /* ignore */ }
          closeClient(1000, reason);
        }, DEEPGRAM_DRAIN_MS);
      }
    };

    const closeBoth = (code = 1011, reason = "") => {
      if (drainTimer) { clearTimeout(drainTimer); drainTimer = null; }
      try {
        if (dg.readyState === WebSocket.OPEN || dg.readyState === WebSocket.CONNECTING) {
          dg.close(code, reason);
        }
      } catch { /* ignore */ }
      closeClient(code, reason);
    };

    dg.on("open", () => {
      dgReady = true;
      log("info", null, "deepgram socket open");
      safeSend(client, JSON.stringify({ type: "ready" }));
      while (audioBacklog.length) {
        const buf = audioBacklog.shift();
        try { dg.send(buf); } catch { /* ignore */ }
      }
    });
    dg.on("message", (data, isBinary) => {
      totalDgMessages += 1;
      if (isBinary) return;
      safeSend(client, data.toString());
    });
    dg.on("error", (err) => {
      log("warn", { err: err.message }, "deepgram socket error");
      safeSend(
        client,
        JSON.stringify({ type: "error", source: "deepgram", message: err.message }),
      );
      closeBoth(1011, "deepgram error");
    });
    dg.on("close", (code, reason) => {
      log("info", { code, reason: String(reason || ""), totalAudioBytes, totalDgMessages }, "deepgram socket closed");
      closeClient(1000, "deepgram closed");
    });

    client.on("message", (data, isBinary) => {
      if (!isBinary) {
        const text = data.toString().trim();
        if (text === "CLOSE") { drainAndClose("client close"); return; }
        return;
      }
      const buf = Buffer.isBuffer(data)
        ? data
        : Array.isArray(data)
          ? Buffer.concat(data)
          : Buffer.from(data);
      totalAudioBytes += buf.length;
      if (!dgReady) {
        if (audioBacklog.reduce((n, b) => n + b.length, 0) < 2 * 1024 * 1024) {
          audioBacklog.push(buf);
        }
        return;
      }
      try { dg.send(buf); } catch { /* ignore */ }
    });
    client.on("error", (err) => {
      log("warn", { err: err.message }, "client socket error");
      closeBoth(1011, "client error");
    });
    client.on("close", (code, reason) => {
      log("info", { code, reason: String(reason || ""), totalAudioBytes, totalDgMessages }, "client socket closed");
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
