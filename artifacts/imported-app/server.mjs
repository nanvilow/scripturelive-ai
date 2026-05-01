// ─────────────────────────────────────────────────────────────────────
// server.mjs — production HTTP server for the imported-app (v0.5.40)
//
// Replaces `next start` so we own the underlying http.Server and can
// attach the Deepgram streaming WebSocket upgrade handler to it. One
// Reserved-VM deployment now serves both:
//   • All Next.js HTTP routes (UI + REST API + SSE)
//   • wss://<host>/api/transcribe-stream (real-time transcription)
//
// Customers' Windows Electron builds therefore hit
//   https://scripturelive.replit.app/api/transcribe        (HTTP)
//   wss://scripturelive.replit.app/api/transcribe-stream   (WS)
// at the same origin, with no second deployment required.
//
// IMPORTANT: This file is a Node ESM module (not bundled by Next).
// Keep all imports limited to "next" + "node:" + the local
// server-transcribe-stream.mjs so it runs from any cwd as
// `node server.mjs`.
// ─────────────────────────────────────────────────────────────────────

import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import next from "next";
import { attachTranscribeStream } from "./server-transcribe-stream.mjs";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 25650);

// Pin Next's project dir to wherever this file lives, so it works whether
// we're running from the artifact root in dev (`node server.mjs`) or from
// the standalone bundle in production
// (`node .next/standalone/artifacts/imported-app/server.mjs`).
const __dirname = dirname(fileURLToPath(import.meta.url));

const app = next({ dev, hostname, port, dir: __dirname });
const handle = app.getRequestHandler();

await app.prepare();

const server = createServer((req, res) => {
  // Defer all HTTP to Next's request handler — it parses the URL itself
  // and routes to pages, route handlers, static assets, etc.
  handle(req, res).catch((err) => {
    console.error("[server.mjs] next handler error:", err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end("Internal server error");
    }
  });
});

// Attach the Deepgram streaming WS upgrade handler. Returns its own
// WebSocketServer (in noServer mode) — we don't need to retain it
// because it's wired via the http server's 'upgrade' event.
attachTranscribeStream(server);

server.on("error", (err) => {
  console.error("[server.mjs] listen error:", err);
  process.exit(1);
});

server.listen(port, hostname, () => {
  const dgConfigured = !!process.env.DEEPGRAM_API_KEY;
  console.log(
    `[server.mjs] ready  http://${hostname}:${port}  ` +
      `(NODE_ENV=${process.env.NODE_ENV || "development"}, ` +
      `transcribe-stream=${dgConfigured ? "ENABLED" : "DISABLED — set DEEPGRAM_API_KEY"})`,
  );
});

// Graceful shutdown so `pnpm run start` ↔ workflow restarts don't leak
// the WebSocket server or in-flight Deepgram sockets.
function shutdown(signal) {
  console.log(`[server.mjs] received ${signal}, closing…`);
  server.close(() => {
    app.close().finally(() => process.exit(0));
  });
  // Hard exit if shutdown stalls (Deepgram sockets shouldn't, but be safe)
  setTimeout(() => process.exit(1), 5000).unref();
}
process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
