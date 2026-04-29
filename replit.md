# Overview

This project is a pnpm workspace monorepo building a Next.js application, "Imported App," for scripture-related services. It targets both web and desktop (Electron) environments, offering features like dynamic downloads and real-time slide updates. The core ambition is a streamlined, cloud-powered Whisper transcription service. Key capabilities include live congregation output, NDI broadcasting, advanced speech recognition with AI semantic matching, and a comprehensive admin dashboard for managing activations and user licenses.

The project aims to provide a robust, operator-friendly system for presenting scripture, enhancing live service experiences, and streamlining administrative tasks related to licensing and user management.

# User Preferences

- After EVERY fix / version bump, build and present a fresh ZIP of `artifacts/imported-app/` so the user can download it and run `BUILD.bat` on their Windows PC. Naming convention: `exports/ScriptureLive-AI-v<version>-source.zip`. Exclude `node_modules`, `.next`, `dist-electron`, `release`, `.turbo`, `.git`, `*.tsbuildinfo`, `build-log.txt`. Always use the `present_asset` tool to surface the zip — never assume the user will find it on their own.
- Bump the `BUILD.bat` banner version string to match the current `package.json` version on every release.

# System Architecture

The project is a pnpm monorepo using Node.js 24 and TypeScript 5.9, structured around an Express 5 API server, PostgreSQL with Drizzle ORM, and Zod for validation. The "Imported App" is a Next.js 16 application utilizing Prisma and SQLite for its database. API codegen uses Orval from an OpenAPI spec, and esbuild is used for bundling.

**Core Architectural Decisions:**

-   **Monorepo Structure**: Uses pnpm workspaces to manage multiple packages, including the main Next.js application and an Express API server.
-   **Hybrid Deployment**: Supports both web and desktop (Electron) environments, ensuring consistent functionality across platforms.
-   **API Routing**: The monorepo's API server is routed to `/__api-server` to prevent conflicts with Next.js routes.
-   **NDI Integration**: Features browser-only NDI output and a native NDI sender via an Electron wrapper using `grandiose` for desktop builds, supporting transparent overlays and configurable display modes (lower-third, full-screen).
-   **Dynamic Downloads**: A `/download` page provides OS-detecting downloads, streaming files from `/api/download/<platform>` based on a `public/downloads/manifest.json`. Includes file-hashing for installer verification.
-   **Speech Recognition Chain**: Implements a multi-tiered speech recognition system (Deepgram → Whisper → Browser speech engine) with auto-fallback for resilience. Includes Voice Activity Detection (VAD) to filter silent chunks and a hallucination guard for Whisper.
-   **AI Semantic Verse Matching**: Employs OpenAI `text-embedding-3-small` for semantic matching of spoken phrases to scripture, complementing regex-based detection. Includes confidence tiers (high, medium, ignore) and a curated seed-verse corpus.
-   **Licensing and Activation**: Features a self-hosted, MoMo-based subscription system with a comprehensive admin dashboard for managing activation codes, payments, and notifications. Uses an atomic-write JSON file for local license persistence.
-   **Persistence Strategy**: Next.js port is fixed to 47330 in Electron builds for `localStorage` origin consistency.
-   **UI/UX and Theming**:
    -   Branding uses `public/logo.png` and a new global dark/light theme driven by `next-themes` and CSS variables.
    -   `NdiToggleButton` for simplified NDI control.
    -   Live Display and Preview stages are visually symmetrical with static text rendering to prevent jiggling during resizing.
    -   Redundant UI elements removed for clarity.
    -   Master volume control integrated into Live Output panel.
    -   Output renderer prevents solid black screens by default, showing a splash watermark until content is broadcast.
    -   Live Transcription is Bible-only by default with a toggle for "Bible / All" transcription.
    -   Mic icon in Live-Display footer offers Start/Pause-Resume/Stop transport and a Mic Gain slider.
    -   Installer downloads support cancellation and smooth quit-and-install.
    -   Output/NDI rendering correctly handles Strong's markup and HTML-escapes content.
    -   Faster verse detection via reduced `CHUNK_MS` and adjusted silence-drop thresholds.
    -   Media autoplay with sound is enabled by default for Preview and Live stages in Electron.
    -   Critical SSE bug fix in `/api/output/congregation` ensures real-time updates and processes `event:'state'` payloads correctly, including `wakeAndPoll()` for visibility/focus/connectivity changes.
    -   `</S>` escaping in inlined kiosk script now uses `<\/S>` to prevent script tag termination issues.
    -   Deepgram streaming fix automatically derives WSS URL for Replit deployments.
    -   Speaker-Follow uses token-trigram Jaccard for verse ranking with hysteresis for stable highlighting.
    -   Auto-Scroll + Highlight renders multi-verse passages with per-verse highlighting and smooth scrolling.
    -   Theme Designer in Settings allows custom themes and presets with highlight color picking.
    -   Admin panel buttons fire reliably with in-modal `AlertDialog` replacements for native dialogs.
    -   Multi-select bulk actions for admin payments, activations, and codes.
    -   Free trial is usage-based (mic-on time) rather than calendar-based.
    -   NDI lower-third features a fixed frame with scripture auto-fitting, using CSS line-clamp for long verses.
    -   Settings previews bind to the selected verse for real-time display.
    -   Instant activation and SMS overhaul with asynchronous notifications and parallel SMS to customer and admin.
    -   Mobile entry point for Admin Panel via URL parameter (`?admin=1`).
    -   New voice commands: "next chapter," "previous chapter," and "the bible says <ref>" (to standby only).
    -   Live transcription confidence tiers gate the auto-fire pipeline.
    -   Speaker-Follow polish includes anti-rewind and tighter delta for highlight stability.
    -   Admin password changes now trigger session invalidation and re-prompt.
    -   Bin retention for soft-deleted codes increased to 90 days, payment TTL to 7 days.
    -   Geo-IP lookup falls back to server public IP for desktop Electron builds.
    -   SMTP transport includes retry-with-backoff for transient failures.
    -   Email deliverability hardening with multipart text+HTML, Reply-To, X-Entity-Ref-ID, List-Unsubscribe, and queue-id logging.
    -   Arkesel SMS API integration for customer activation receipts.
    -   Automatic SMTP self-test on server startup.

# External Dependencies

-   **Monorepo tool**: pnpm workspaces
-   **Node.js**: 24
-   **TypeScript**: 5.9
-   **API Framework**: Express 5
-   **Database**: PostgreSQL (main API), SQLite (`artifacts/imported-app/db/custom.db`)
-   **ORM**: Drizzle ORM, Prisma (Imported App)
-   **Validation**: Zod (`zod/v4`), `drizzle-zod`
-   **API Codegen**: Orval
-   **Build Tool**: esbuild
-   **Frontend Framework**: Next.js 16
-   **Speech Recognition**: OpenAI `gpt-4o-mini-transcribe`, Deepgram Nova-3 (streaming)
-   **NDI Integration**: `grandiose` binding (Electron)
-   **Image Processing**: `sharp`
-   **Desktop Packaging**: Electron Builder
-   **File Upload Handling**: Multer
-   **AI SDK**: OpenAI SDK
-   **Hashing**: `hash-wasm`
-   **Email Service**: Custom SMTP setup (requires `MAIL_HOST`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM` environment variables)
-   **SMS Gateway**: mNotify (previously Arkesel) (requires `SMS_API_KEY`, `SMS_SENDER` environment variables)
-   **Geo-IP Lookup**: ip-api.com