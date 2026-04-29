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
    -   v0.7.6 NDI hotfix (originally tagged v0.7.5.1; renamed because electron-builder rejects 4-part versions): hidden FrameCapture BrowserWindow now bakes the operator's `lowerThirdHeight` (sm/md/lg) and `ndiLowerThirdScale` directly into the captured URL via `?lh=` / `?sc=` overrides, so vMix/OBS see the same slim lower-third frame as the in-app preview from frame 1 (previously the captured window first-painted with default `md` / `1.0×` before SSE state arrived, producing the oversized bar covering ~30% of the broadcast frame). Equality check in `ipcMain.handle('ndi:start')` was also extended to include `lowerThirdHeight` + `lowerThirdScale` so operator slider changes mid-broadcast force a true FrameCapture rebuild instead of short-circuiting.
    -   v0.7.6 Settings previews also fall back to the live/preview slide (not just `liveVerse`/`currentVerse`) so the Full / Lower-Third / Typography preview cards mirror whatever scripture is actually on stage, regardless of which navigator surface (voice detection, dashboard, recents rail) selected it.
    -   v0.7.8 Hotfix batch (Apr 29, 2026): (a) **NDI lower-third parity (WYSIWYG)** — vMix/OBS captures now match the in-app NDI Output Preview pixel-for-pixel. The previous build forced the captured frame into a "full-width" geometry (`.ndi-full` class: `max-width: none`, `padding: 0 2%`, `border-radius: 0.75rem`) while the operator's preview used the canonical `.lower-third` defaults (`max-width: 68rem`, `padding: 0 6%`, `border-radius: 1.25rem`), making the broadcast bar visibly oversized regardless of `lowerThirdHeight` (sm/md/lg) or `ndiLowerThirdScale`. `route.ts:942` `ndiFullClass` permanently set to empty string and the `.lower-third.ndi-full` / `.lt-box.ndi-full` CSS rules stripped to deprecation comments so old SSE state can't accidentally re-add the class. (b) **Reference Code activation channel** — new offline-validatable code system (`src/lib/licensing/reference-code.ts`) lets the operator mint a short-lived (≈30-min) HMAC-derived 8-char code (`XXXX-XXXX`, base32 without confusable I/L/O/0/1) the operator can read out to a customer over WhatsApp / phone. Customer types it into the lock overlay's new "Have a reference code?" inline form and AI Detection unlocks immediately. Validation is local: every install with the same baked `masterCode` derives the same valid codes from `HMAC-SHA256(masterCode, floor(Date.now() / 1800_000))` with ±1 bucket grace (best-case 30-min validity, worst-case ~60-min). Three new endpoints: `POST/GET /api/license/admin/reference-code` (admin-gated, idempotent within a bucket — same bucket → same code) and `POST /api/license/activate-reference` (public, 8/min/IP rate limit, source logged as `'reference'`, runs the same `activateCode(masterCode)` plumbing as a master-code redemption so the install gets the standard long-lived AI grant). Admin panel grew a new emerald "Reference Code" card in the Activation tab with Generate button, live mm:ss countdown, copy-to-clipboard button, and clipboard auto-copy on mint. Works on every already-installed v0.7.x copy — **no rebuild required**. (c) **Activation contact overrides** verified: `momoNumber`, `notifyEmail`, `whatsappNumber`, `adminPhone`, and `adminPassword` overrides were already exposed in the existing Settings tab (`license.json`-persisted, no rebuild needed for any change to take effect); confirmed end-to-end against `getEffectiveAdminPhone()` / `getEffectiveNotificationTargets()` / `getEffectiveMomoRecipient()` in `plans.ts`.
    -   v0.7.7 Operator UX batch (Apr 29, 2026): (a) every modal (Subscribe, Admin, Receipt, etc.) now renders against a `backdrop-blur-md` + `bg-black/60` overlay so the app behind is clearly out of focus while the operator is mid-payment or mid-admin; (b) Lock Overlay grew a second button — "Cancel Subscription" / "Cancel" — beside "Activate AI Detection Now" that posts to `/api/license/deactivate` after a confirm prompt, giving customers a discoverable way to stop a subscription without hunting through Settings; (c) the CODES tab stat tiles (Total / Active / Unused / Expired / Used / Cancelled / Bin) became clickable drill-down filters that select the matching status (or open the Bin view) and highlight the active tile; (d) Admin login screen got a "Forgot password?" link that hits `POST /api/license/admin/forgot-password` to mint a 6-digit OTP (15-min TTL, persisted in `license.json` as `pendingAdminReset`) and dispatches it via SMS to `ADMIN_NOTIFICATION_PHONE` (0246798526) and email to `nanvilow@gmail.com`; `passwordMatches()` in `admin-auth.ts` now accepts the OTP (one-shot) AND the master code as alternates to the operator-set adminPassword; (e) admin-modal `gen-whatsapp` placeholder swapped from `0530686367` to `0246798526` to match the active MoMo / WhatsApp recipient.

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