# Overview

This project is a pnpm workspace monorepo utilizing TypeScript, designed to build a Next.js application called "Imported App" which is integrated into the workspace. The primary goal is to provide a robust platform for scripture-related services, including live congregation output, NDI integration for broadcasting, and advanced speech recognition capabilities. The system is designed for both web and desktop environments (via Electron), offering features like dynamic downloads for desktop clients and real-time slide updates. A key ambition is to offer a streamlined, cloud-powered Whisper transcription service for enhanced user experience and reduced operational complexity.

# User Preferences

- **After EVERY fix / version bump, build and present a fresh ZIP** of `artifacts/imported-app/` so the user can download it and run `BUILD.bat` on their Windows PC. Naming convention: `exports/ScriptureLive-AI-v<version>-source.zip`. Exclude `node_modules`, `.next`, `dist-electron`, `release`, `.turbo`, `.git`, `*.tsbuildinfo`, `build-log.txt`. Always use the `present_asset` tool to surface the zip — never assume the user will find it on their own.
- Bump the `BUILD.bat` banner version string to match the current `package.json` version on every release.

# System Architecture

The project is structured as a pnpm monorepo using Node.js 24 and TypeScript 5.9. It features an Express 5 API server, PostgreSQL with Drizzle ORM, and Zod for validation. API codegen is handled by Orval from an OpenAPI spec, and bundling uses esbuild.

The core application, "Imported App," is a Next.js 16 application using Prisma and SQLite. It handles `/` and `/api` routes, while the workspace's API server is routed to `/__api-server` to prevent conflicts.

Key features and architectural decisions include:

- **NDI Integration:** The application supports browser-only NDI output and a native NDI sender via an Electron wrapper using the `grandiose` binding for desktop builds.
- **Dynamic Downloads:** A `/download` page provides OS-detecting downloads, streaming files from `/api/download/<platform>` based on `public/downloads/manifest.json`.
- **Speech Recognition:**
    - The system previously supported both a local Base engine (whisper.cpp) and OpenAI Whisper.
    - The current architecture has consolidated to a **single cloud-only Whisper path**. The `api-server` now hosts a `/api/transcribe` route using `gpt-4o-mini-transcribe` with `OPENAI_API_KEY` from Replit Deployment Secrets.
    - The Next.js `/api/transcribe` acts as a thin proxy, forwarding requests to the `api-server` if local OpenAI keys are not configured.
    - The renderer uses a single `MediaRecorder` loop for 4500 ms chunks, uploading only chunks ≥6 KB.
- **Persistence:** Next.js port is pinned to 47330 to ensure consistent `localStorage` origin for Electron builds, preventing loss of persisted settings across restarts.
- **UI/UX:**
    - Branding uses `public/logo.png` (1664x928) for various icons.
    - `NdiToggleButton` provides one-click NDI control, with advanced settings moved to a dedicated settings panel.
    - The Live Display and Preview stages are visually symmetrical, with height-matched empty strips for consistent sizing.
    - Redundant UI elements like "Clear Schedule" button and the bottom-bar hint strip have been removed.
    - Master volume control is integrated into the Live Output panel header.
    - The "Live Display SIZE" slider has been removed to prevent accidental adjustments.

# External Dependencies

- **Monorepo tool**: pnpm workspaces
- **Node.js**: 24
- **TypeScript**: 5.9
- **API Framework**: Express 5
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API Codegen**: Orval (from OpenAPI spec)
- **Build Tool**: esbuild
- **Frontend Framework**: Next.js 16 (for "Imported App")
- **Database (Imported App)**: Prisma, SQLite (`artifacts/imported-app/db/custom.db`)
- **Speech Recognition**: OpenAI `gpt-4o-mini-transcribe` (via Replit AI Integrations proxy and `api-server`)
- **NDI Integration**: `grandiose` binding (for Electron desktop app)
- **Image Processing**: `sharp` (for icon generation)
- **Electron Builder**: Used for packaging desktop applications.
- **Multer**: For handling multipart form data in the `api-server`'s `/api/transcribe` route.
- **OpenAI SDK**: Used in the `api-server` for transcription.