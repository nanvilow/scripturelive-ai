# Overview

This project is a pnpm workspace monorepo building a Next.js application, "Imported App," for scripture-related services, targeting both web and desktop (Electron) environments. It offers features like dynamic downloads, real-time slide updates, live congregation output, NDI broadcasting, advanced speech recognition with AI semantic matching, and a comprehensive admin dashboard for managing activations and user licenses. The core ambition is a streamlined, cloud-powered Whisper transcription service. The project aims to provide a robust, operator-friendly system for presenting scripture, enhancing live service experiences, and streamlining administrative tasks related to licensing and user management.

# User Preferences

- After EVERY fix / version bump, build and present a fresh ZIP of `artifacts/imported-app/` so the user can download it and run `BUILD.bat` on their Windows PC. Naming convention: `exports/ScriptureLive-AI-v<version>-source.zip`. Exclude `node_modules`, `.next`, `dist-electron`, `release`, `.turbo`, `.git`, `*.tsbuildinfo`, `build-log.txt`. Always use the `present_asset` tool to surface the zip — never assume the user will find it on their own.
- Bump the `BUILD.bat` banner version string to match the current `package.json` version on every release.

# System Architecture

The project is a pnpm monorepo using Node.js 24 and TypeScript 5.9, structured around an Express 5 API server, PostgreSQL with Drizzle ORM, and Zod for validation. The "Imported App" is a Next.js 16 application utilizing Prisma and SQLite. API codegen uses Orval from an OpenAPI spec, and esbuild is used for bundling.

**Core Architectural Decisions:**

-   **Monorepo Structure**: Uses pnpm workspaces.
-   **Hybrid Deployment**: Supports both web and desktop (Electron) environments.
-   **API Routing**: The monorepo's API server is routed to `/__api-server` to prevent conflicts with Next.js routes.
-   **NDI Integration**: Features browser-only NDI output and a native NDI sender via an Electron wrapper using `grandiose`. Supports transparent overlays and configurable display modes (lower-third, full-screen). The offscreen capture `BrowserWindow` pins its zoom factor to 1 to ensure pixel parity regardless of host display scaling.
-   **Dynamic Downloads**: A `/download` page provides OS-detecting downloads, streaming files from `/api/download/<platform>` based on a `public/downloads/manifest.json`. Includes file-hashing and multi-threaded downloads with speed indicators.
-   **Speech Recognition Chain**: Implements a multi-tiered speech recognition system (Deepgram → Whisper → Browser speech engine) with auto-fallback for resilience. Includes Voice Activity Detection (VAD) and a hallucination guard. AI voice intent fallback is now ON by default, relying on an LLM for complex phrasing. v0.7.93 hotfix: AUTO_LIVE_MIN_CONFIDENCE 0.40 → 0.55 and transcriptLiveThreshold 0.50 → 0.65 so weak detections no longer auto-promote to live; LLM gate + classifier prompt + regex aliases all teach Twi mishearings ("tree", "tweet", "chwee", "twee", "akan", "akuapem") so "Twi version" / "tree version please" / "chwee bible" all switch to TWI; LLM timeouts trimmed (1500 → 800 ms internal, 2000 → 1000 ms outer) so the AI fallback never blocks the operator for more than a second. v0.7.94 hotfix: Detected Verses panel was hiding non-winning ≥55% siblings of the auto-live pick (operator reported "9 detected verses, but only 1 in there"). `alternativesFor` now returns every detection ≥20% except the live winner, sorted newest-on-top, so the badge count and visible rows always match.
-   **AI Semantic Verse Matching**: Employs OpenAI `text-embedding-3-small` for semantic matching of spoken phrases to scripture, complementing regex-based detection. Includes confidence tiers and a curated seed-verse corpus. Preambles like "here's a verse about" are stripped before embedding for better accuracy.
-   **Licensing and Activation**: Features a self-hosted, MoMo-based subscription system with a comprehensive admin dashboard. Uses an atomic-write JSON file for local license persistence. Includes a 30-minute usage-based free trial, lossless deactivation, and license transfer functionality.
-   **Telemetry**: Centralized telemetry backend with `REPLIT_DB` backing, collecting install pings, heartbeats, and errors. An admin Records dashboard provides real-time analytics including active users, total installs, sessions today, and errors.
-   **Persistence Strategy**: Next.js port is fixed to 47330 in Electron builds for `localStorage` origin consistency.
-   **UI/UX and Theming**:
    -   Branding uses `public/logo.png` and a new global dark/light theme driven by `next-themes` and CSS variables.
    -   Live Display and Preview stages are visually symmetrical with static text rendering.
    -   Output renderer prevents solid black screens by default, showing a splash watermark.
    -   Live Transcription is Bible-only by default with a toggle.
    -   Mic icon in Live-Display footer offers Start/Pause-Resume/Stop transport and a Mic Gain slider.
    -   Installer downloads support cancellation and smooth quit-and-install.
    -   Output/NDI rendering correctly handles Strong's markup and HTML-escapes content.
    -   Media autoplay with sound is enabled by default for Preview and Live stages in Electron.
    -   Critical SSE bug fix in `/api/output/congregation` ensures real-time updates and processes `event:'state'` payloads correctly.
    -   Speaker-Follow uses token-trigram Jaccard for verse ranking with hysteresis.
    -   Auto-Scroll + Highlight renders multi-verse passages with per-verse highlighting and smooth scrolling.
    -   Theme Designer in Settings allows custom themes and presets.
    -   Admin panel buttons fire reliably with in-modal `AlertDialog` replacements.
    -   Multi-select bulk actions for admin payments, activations, and codes.
    -   NDI lower-third features a fixed frame with scripture auto-fitting, using CSS line-clamp for long verses.
    -   Settings previews bind to the selected verse for real-time display.
    -   Instant activation and SMS overhaul with asynchronous notifications and parallel SMS to customer and admin.
    -   Mobile entry point for Admin Panel via URL parameter (`?admin=1`).
    -   New voice commands: "next chapter," "previous chapter," and "the bible says <ref>" (to standby only).
    -   Live transcription confidence tiers gate the auto-fire pipeline.
    -   Speaker-Follow polish includes anti-rewind and tighter delta for highlight stability.
    -   Admin password changes now trigger session invalidation and re-prompt.
    -   Bin retention for soft-deleted codes increased to 90 days, payment TTL to 30 minutes.
    -   Geo-IP lookup falls back to server public IP for desktop Electron builds.
    -   SMTP transport includes retry-with-backoff for transient failures, port-fallback, and TLS 1.2 floor.
    -   Email deliverability hardening with multipart text+HTML and anti-spam headers.
    -   Arkesel SMS API integration for customer activation receipts.
    -   Automatic SMTP self-test on server startup.
    -   Report Issue button is always visible in the TopToolbar and on the lock overlay for direct customer feedback.

# External Dependencies

-   **Monorepo tool**: pnpm workspaces
-   **Node.js**: 24
-   **TypeScript**: 5.9
-   **API Framework**: Express 5
-   **Database**: PostgreSQL (main API), SQLite (`artifacts/imported-app/db/custom.db`), Replit DB (telemetry)
-   **ORM**: Drizzle ORM, Prisma
-   **Validation**: Zod (`zod/v4`), `drizzle-zod`
-   **API Codegen**: Orval
-   **Build Tool**: esbuild
-   **Frontend Framework**: Next.js 16
-   **Speech Recognition**: OpenAI `gpt-4o-mini-transcribe`, Deepgram Nova-3 (streaming)
-   **AI SDK**: OpenAI SDK
-   **NDI Integration**: `grandiose` binding (Electron)
-   **Image Processing**: `sharp`
-   **Desktop Packaging**: Electron Builder
-   **File Upload Handling**: Multer
-   **Hashing**: `hash-wasm`
-   **Email Service**: Custom SMTP setup (requires `MAIL_HOST`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM` environment variables)
-   **SMS Gateway**: Arkesel (requires `SMS_API_KEY`, `SMS_SENDER` environment variables)
-   **Geo-IP Lookup**: ip-api.com