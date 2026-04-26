# Overview

This project is a pnpm workspace monorepo building a Next.js application, "Imported App," for scripture-related services. It supports live congregation output, NDI broadcasting, and advanced speech recognition. The system targets both web and desktop (Electron) environments, offering features like dynamic downloads and real-time slide updates. The core ambition is a streamlined, cloud-powered Whisper transcription service.

# User Preferences

- **After EVERY fix / version bump, build and present a fresh ZIP** of `artifacts/imported-app/` so the user can download it and run `BUILD.bat` on their Windows PC. Naming convention: `exports/ScriptureLive-AI-v<version>-source.zip`. Exclude `node_modules`, `.next`, `dist-electron`, `release`, `.turbo`, `.git`, `*.tsbuildinfo`, `build-log.txt`. Always use the `present_asset` tool to surface the zip — never assume the user will find it on their own.
- Bump the `BUILD.bat` banner version string to match the current `package.json` version on every release.

# System Architecture

The project is a pnpm monorepo using Node.js 24 and TypeScript 5.9. It includes an Express 5 API server, PostgreSQL with Drizzle ORM, and Zod for validation. API codegen uses Orval from an OpenAPI spec, and esbuild is used for bundling.

The "Imported App" is a Next.js 16 application with Prisma and SQLite. It handles standard routes, with the monorepo's API server routed to `/__api-server` to avoid conflicts.

Key architectural features include:

-   **NDI Integration:** Supports browser-only NDI output and a native NDI sender via an Electron wrapper using `grandiose` for desktop builds.
-   **Dynamic Downloads:** A `/download` page offers OS-detecting downloads, streaming files from `/api/download/<platform>` based on `public/downloads/manifest.json`. It also includes a file-hashing feature for installer verification.
-   **Speech Recognition:** Utilizes a single cloud-only Whisper path. The `api-server` hosts a `/api/transcribe` route using `gpt-4o-mini-transcribe`. The Next.js `/api/transcribe` acts as a proxy to the `api-server`. The renderer uploads 4500 ms audio chunks (if ≥6 KB).
-   **Persistence:** The Next.js port is fixed to 47330 to maintain `localStorage` origin consistency for Electron builds.
-   **UI/UX:**
    -   Branding uses `public/logo.png`.
    -   `NdiToggleButton` provides simplified NDI control.
    -   Live Display and Preview stages are visually symmetrical.
    -   Redundant UI elements have been removed.
    -   Master volume control is integrated into the Live Output panel.
    -   The "Live Display SIZE" slider has been removed to prevent accidental adjustments.
    -   Output renderer prevents solid black screens by default, displaying a splash watermark until content is broadcast.
    -   Live Transcription is Bible-only by default, with a toggle for "Bible / All" transcription.
    -   Mic icon in the Live-Display footer provides Start / Pause-Resume / Stop transport and a Mic Gain slider.
    -   Installer downloads can be cancelled and automatically handle the quit-and-install process smoothly.
    -   Output / NDI rendering now correctly handles Strong's markup and HTML-escapes content to prevent letter-dropping issues.
    -   Faster verse detection achieved by reducing `CHUNK_MS` and adjusting silence-drop thresholds.
    -   Media autoplay with sound is enabled by default for both Preview and Live stages in Electron builds.
    -   Critical SSE bug fix implemented in `/api/output/congregation` to correctly process `event:'state'` payloads and ensure real-time updates, including `wakeAndPoll()` for visibility/focus/connectivity changes.
    -   v0.5.38 root-cause fix: regex literals containing `</S>` in the inlined kiosk script (`/api/output/congregation`) were escaping closing `</script>` tags. Served JS now uses `<\/S>` (and the source file `<\\/S>`) so the parser keeps the script intact and the kiosk no longer hangs on the splash watermark.
    -   v0.5.39 Deepgram streaming fix: `/api/transcribe-stream/info` now derives `wss://<host>/__api-server/api/transcribe-stream` automatically when running under `REPLIT_DEV_DOMAIN` (no env vars required), and the api-server's WS upgrade handler strips the `/__api-server` path prefix so the Replit workspace-preview proxy can deliver the upgrade to the right service. End-to-end proof: a 5.9 s TTS clip of "For God so loved the world… John three sixteen" was streamed through the proxy and Deepgram returned two final transcripts. The renderer now also surfaces a clear actionable message instead of a bare `1006: ` close code.
    -   v0.5.41 fixes two bugs reported by the operator after v0.5.40 shipped: (A) **Output / NDI text mangled** (e.g. "things"→"thing", "those"→"tho e", "His"→"Hi", "purpose"→"purpo e"). Root cause: line 657 of `artifacts/imported-app/src/app/api/output/congregation/route.ts` had `.replace(/\s+/g,' ')` inside a TS template literal. JavaScript string-parsing strips unrecognised escape sequences, so the served kiosk JS became `.replace(/s+/g,' ')` — a regex that replaces every lowercase 's' with a space. Fix: `\s+` → `\\s+` in the source so the served regex literal stays `/\s+/g`. Same hazard pattern as the `</S>` escape fix in v0.5.38; comment added at the call site to flag the rule. (B) **Live transcription / verse detection silently inactive in the Replit dev preview**. Root cause: `artifacts/imported-app/src/components/providers/speech-provider.tsx` chose the speech engine via `IS_ELECTRON ? deepgram : browserWebSpeech` — outside Electron the dev preview fell back to the browser's Web Speech API, which silently fails inside the Replit preview iframe sandbox. The Deepgram WS proxy added in v0.5.39 / v0.5.40 was never invoked from the preview. Fix: Deepgram is now the primary engine in BOTH Electron and the dev preview (proxy is reachable via `wss://...kirk.replit.dev/__api-server/api/transcribe-stream` from any origin). `NEXT_PUBLIC_FORCE_BROWSER_SPEECH=1` escape hatch retained for legacy fallback. Server-side WS proof recaptured in v0.5.41: handshake `OPEN 52 ms`, `{"type":"ready"}` received.
    -   v0.5.40 single-deployment topology for the desktop endpoint: a new Next.js custom server (`artifacts/imported-app/server.mjs` + `artifacts/imported-app/server-transcribe-stream.mjs`) replaces `next start` in production and embeds the Deepgram streaming WebSocket handler directly into the same HTTP server that serves the Next.js app. Effect: when the imported-app is published as a **Reserved VM** at `scripturelive.replit.app`, both `https://scripturelive.replit.app/...` (REST/UI) and `wss://scripturelive.replit.app/api/transcribe-stream` (real-time transcription) work at the same origin — no second deployment, no Electron URL change needed. The customer Windows build's existing `DEFAULT_TRANSCRIBE_PROXY_URL` (which the Electron main hands to its embedded Next.js as `TRANSCRIBE_PROXY_URL`) now resolves the correct WSS URL via the existing `/api/transcribe-stream/info` derivation. PROVEN locally: production-built imported-app booted on port 37123 served `HTTP 200` on `/`, accepted a WS upgrade on `/api/transcribe-stream`, opened the Deepgram backend socket, and returned `{"type":"ready"}` to the client. **Publish requirements:** (1) in the Publish UI choose **Reserved VM** (not Autoscale — autoscale terminates long-lived WebSockets); (2) `DEEPGRAM_API_KEY` must be present in the deployment's secrets (the same workspace secret already in use). The shared `pnpm` workspace dependency `ws@^8.18.0` was added to `@workspace/imported-app`.

# External Dependencies

-   **Monorepo tool**: pnpm workspaces
-   **Node.js**: 24
-   **TypeScript**: 5.9
-   **API Framework**: Express 5
-   **Database**: PostgreSQL
-   **ORM**: Drizzle ORM
-   **Validation**: Zod (`zod/v4`), `drizzle-zod`
-   **API Codegen**: Orval (from OpenAPI spec)
-   **Build Tool**: esbuild
-   **Frontend Framework**: Next.js 16 (for "Imported App")
-   **Database (Imported App)**: Prisma, SQLite (`artifacts/imported-app/db/custom.db`)
-   **Speech Recognition**: OpenAI `gpt-4o-mini-transcribe` (via Replit AI Integrations proxy and `api-server`), Deepgram Nova-3 (streaming for real-time transcription).
-   **NDI Integration**: `grandiose` binding (for Electron desktop app)
-   **Image Processing**: `sharp` (for icon generation)
-   **Desktop Packaging**: Electron Builder
-   **File Upload Handling**: Multer (for `api-server`'s `/api/transcribe` route)
-   **AI SDK**: OpenAI SDK (in `api-server`)
-   **Hashing**: `hash-wasm` (for incremental SHA-256 in dynamic downloads)