import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { attachTranscribeStream } from "./routes/transcribe-stream";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// v0.5.35 — explicit http.Server so we can attach the Deepgram
// WebSocket proxy at /api/transcribe-stream alongside the Express
// REST routes. `app.listen()` returns the same server but capturing
// it via http.createServer() makes the upgrade-event wiring obvious
// and is what the `ws` package documents.
const server = http.createServer(app);

// Attach the Deepgram streaming proxy. Logs internally.
attachTranscribeStream(server);

server.listen(port, () => {
  logger.info({ port }, "Server listening");
});

server.on("error", (err) => {
  logger.error({ err }, "Server error");
  process.exit(1);
});
