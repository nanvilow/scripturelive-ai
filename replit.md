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