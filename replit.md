# Imported App

A Next.js application providing scripture-related services for web and desktop, enhancing live service experiences, and streamlining administrative tasks.

## Run & Operate

-   **Install dependencies**: `pnpm install`
-   **Run dev server**: `pnpm dev`
-   **Build app**: `pnpm build`
-   **Typecheck**: `pnpm typecheck`
-   **Codegen**: `pnpm codegen` (for API client)
-   **DB Push**: `pnpm db:push` (for Drizzle schema migrations)
-   **Required Env Vars**: `MAIL_HOST`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM`, `SMS_API_KEY`, `SMS_SENDER`

## Stack

-   **Monorepo**: pnpm workspaces
-   **Runtime**: Node.js 24
-   **Language**: TypeScript 5.9
-   **Frontend**: Next.js 16
-   **Backend**: Express 5
-   **Database**: PostgreSQL, SQLite, Replit DB
-   **ORM**: Drizzle ORM, Prisma
-   **Validation**: Zod
-   **Build Tool**: esbuild
-   **API Codegen**: Orval
-   **Speech Recognition**: OpenAI `gpt-4o-mini-transcribe`, Deepgram Nova-3
-   **AI SDK**: OpenAI SDK
-   **NDI Integration**: `grandiose`

## Where things live

-   `apps/nextjs-app`: Next.js frontend and Electron wrapper.
-   `apps/api-server`: Express API backend.
-   `packages/`: Shared utilities and components.
-   `artifacts/imported-app/db/custom.db`: SQLite database for the desktop app.
-   `public/downloads/manifest.json`: Manifest for dynamic downloads.
-   `openapi.yaml`: API contracts (source of truth for Orval codegen).
-   `drizzle/schema.ts`: Drizzle ORM database schema.
-   `styles/theme/`: Theme-related files.

## Architecture decisions

-   **Monorepo Structure**: Uses pnpm workspaces for managing multiple related packages.
-   **Faster Installer + Activation Notification + AI Health Probe + Low-Time Warning (v0.7.122)**: Four operator requests addressed. **(1) Installer perf** — operators reported install was "much longer than it should be" even after v0.7.66's compression:maximum + asar strips. Profiling showed ~3.3 s of dead time per install/upgrade was burned in defensive `Sleep` calls inside `build-resources/installer.nsh` (4×400 ms taskkill spacing + 1500 ms post-kill settle + 200 ms pre-kill at customInit/UnInit). Trimmed to 4×200 ms + 600 ms + zero pre-kill = 1.4 s of dead time, saving ~1.9 s on every install/upgrade. Windows handle release is sub-50 ms in practice; the old margins were 30× the actual need. If "file in use" regressions appear, restore the 1500 ms post-kill first — accounts for 64 % of savings. **(2) Real-time activation notification** — pre-v0.7.122 the operator saw NO confirmation when a paid code activated (the v0.7.101 hard-reload eliminated the receipt UI). Two new pieces: USER-side `<ActivationSuccessDialog>` (mounted globally inside `<LicenseProvider>`) detects a freshly-activated paid subscription on the FIRST page load after the activation modal's hard-reload — checks `activeSubscription.activatedAt` is within last 5 min AND `localStorage[sl-celebrated-activation] !== code` — pops a celebratory Radix dialog showing plan + days + code + expiry, then marks the code as celebrated so subsequent launches don't re-pop. ADMIN-side new `/api/license/admin/recent-activations` endpoint returns every activation row with `usedAt` within the last `windowHours` (default 24h, capped 30d), sorted newest-first; new `<RecentActivationsBanner>` inside admin-modal polls every 10 s, surfaces unseen rows as a green-bordered banner with a "Mark all seen" button, persists seen-set via `localStorage[sl-admin-seen-activations]`. **(3) AI Health probe** — operator request to verify LLM/AI Search/AI Detection performance. New `/api/ai/diagnostic` admin endpoint sequentially times: (a) text-embedding-3-small round-trip on a fixed warm-up phrase, (b) gpt-4o-mini chat.completions round-trip on a trivial OK prompt, (c) full `matchTranscriptToVerses()` call (warms cache + measures cosine compute). Each stage wrapped in try/catch with own `{ ok, ms, error, detail }`. New `<AiDiagnosticButton>` in Settings tab runs the probe and prints colour-coded per-stage ms + embedding dim + LLM reply + top semantic match + cache status. Lets the operator distinguish "OpenAI is slow today" from "my embedding cache hasn't built yet" without devtools. `resolveOpenAICreds()` exported from semantic-matcher to share the existing 4-tier credential resolver (proxy → env → admin config → baked). **(4) Low-time warning popup** — operator request: "display a popup to notify the user when their AI Detection time is almost finished before it actually expires." New `<LowTimeWarning>` Radix AlertDialog mounted inside `<LicenseProvider>`; ticks every 15 s from `activeSubscription.expiresAt`; fires at 24h (info / sky border), 6h (info), 1h (warn / amber), 15m (warn), 5m (critical / red border) bands; each band fires AT MOST ONCE per code via `localStorage[sl-low-time-fired:<code>:<band>]`; "Renew now" button opens the subscription modal directly; master codes (year-3000 expiry) excluded so the operator's admin device doesn't get spammed. Critically uses Radix AlertDialog NOT toast — Sonner has been globally silenced since v0.7.114 (path-aware-toaster returns null), so any toast-based warning would never paint.
-   **Activation Cross-Reject Cleanup + NDI Stop Visibility + Display-Unplug Recovery + Single-Click Code Mint (v0.7.121)**: Four operator complaints addressed. (a) "i tried activating an admin-generated code and it errored 'This is a generated (admin-issued) code, not a paid activation code. Use the bottom box ("Enter your generated and master code") to activate it.' but there is no bottom box anymore." Root cause: `src/app/api/license/activate/route.ts` still carried the v0.6.5 cross-rejection that fired when `src === 'standalone' && expectedRaw === 'activation'`. The two-box UI it was guarding against was retired in v0.7.75 in favour of a single unified activation input that auto-detects masters by SL-MASTER prefix and otherwise sends `expectedType:'activation'`. With one input, ALL non-master codes (paid + admin-issued/standalone) must activate from the same box. Removed the standalone+activation rejection block; master/paid cross-checks above are unchanged. (b) "When i tried turning off the NDI when it on, it dosent want to go off." Root cause: v0.7.103's `lingerStop()` keeps the NDI sender alive on the wire for 60 s after Stop (so OBS/vMix don't drop the source), with `status.running = true` left intact and the docstring noting "do NOT change this.status.running here." But `broadcastNdiStatus` then pushed `running:true` to the renderer too — so the panel button stayed "Stop NDI Output", clicking again hit `serializeNdi`'s persistent-source no-op, and the operator saw a dead button. Fix: `NdiStatus` gains optional `lingering` + `lingerRemainingMs` fields, `getStatus()` populates them from `lingerTimer !== null`, and `broadcastNdiStatus` in `electron/main.ts` normalises `running:false` whenever `lingering:true` for the renderer-facing push (and the on-air gate). Wire-side stays exactly as it was — Reconnect within 60 s still hits the persistent-source short-circuit because `start()` reads `this.status.running` directly. (c) "anytime i disconnect output display from the other screen from the app, the app output, and NDI becomes Blank." Two root causes worked together. **(c1)** `frame-capture.ts` created its offscreen BrowserWindow with no x/y, so Electron placed it on the cursor / last-active display. If that was the secondary monitor and the operator unplugged it mid-service, Windows' GPU compositor stalled offscreen rendering on the orphaned window — `beginFrameSubscription` stopped firing, the NDI keep-alive ticker pumped the last frozen frame forever, vMix/OBS saw black. Fix: bake `x:primary.workArea.x, y:primary.workArea.y` into the BrowserWindow constructor so the capture surface always lives on a display that can't disappear. **(c2)** Kiosk output windows (congregation, stage) created via `createKioskOutput()` were not tracked anywhere; when their host display vanished they stayed pinned to nonexistent coordinates and disappeared entirely. Fix: new module-level `kioskWindows: Set<BrowserWindow>` populated on creation + cleared on `closed`, plus a `screen.on('display-removed')` handler that re-homes every tracked kiosk to primary's full bounds with `setBounds + setKiosk(true) + setFullScreen(true) + show()`. The renderer inside is untouched so SSE state and slide content survive seamlessly. (d) "when i generate 1 code it generate multiple instead of 1." Root cause: the Generate Code form's `onSubmit` guard read `if (!genBusy) generateCode()` from the React render closure, so a rapid double-trigger (Enter-press + click, MouseEvent + synthetic click from the v0.7.120 pointer-events watchdog, etc.) both observed `genBusy === false` in the same React batch → two POSTs to `/api/license/admin/generate` → two activation rows minted from one operator click. `setGenBusy(true)` couldn't help because it was queued for the next render. Fix: new `genInFlightRef = useRef(false)` in `admin-modal.tsx` flips synchronously inside the same JS task and wins the race regardless of React batching. Form `onSubmit` now checks `!genInFlightRef.current`; `generateCode()` returns early if the ref is set, sets it on entry, and clears it on every validation-fail return path plus the `finally` block. The existing `setGenBusy` state and `disabled={genBusy}` UI feedback are preserved unchanged so the button still visually disables during the in-flight POST.
-   **Hybrid Deployment**: Supports both web and desktop (Electron) environments from a single codebase.
-   **API Routing**: API server is routed to `/__api-server` to avoid conflicts with Next.js routes.
-   **NDI Integration**: Browser-only NDI output and native NDI sender via Electron, supporting transparent overlays and configurable display modes, with pixel parity via pinned zoom.
-   **Multi-tiered Speech Recognition**: Employs Deepgram, Whisper, and browser speech engines with auto-fallback, VAD, and hallucination guard, complemented by AI semantic matching.
-   **Atomic License Persistence**: Uses an atomic-write JSON file for local license persistence, ensuring data integrity during critical operations like deactivation and transfer.
-   **Hard Reset for License State Changes**: Critical license state changes (activate, deactivate, transfer) trigger a hard `window.location.assign('/')` reload to prevent renderer crashes caused by stale React contexts. v0.7.107 extends the same recovery to UNCAUGHT renderer exceptions via `app/global-error.tsx` + `app/error.tsx` — any thrown React error hard-reloads to `/` instead of letting Chromium paint chrome-error://chromewebdata. Fixes the "This page couldn't load" page seen on cold boot when activation has just expired.
-   **High-Conf Read-Lock + Famous One-Liners + Pointer-Events Watchdog (v0.7.120)**: Three operator complaints addressed. (a) "A voice command was given, 'Suffer not a witch to live', the verse was detected and sent to Bible Reference Quoted, but on Live Display the Auto Verse Match countered the auto-live displayed from Bible Reference Quoted." Root cause: v0.7.117 read-lock only required `candConf >= liveConf + 0.10`, so an explicit COL 1 hit at 0.95 vs a hand-curated EXACT semantic at 0.85 = 0.10 delta exactly → override allowed. Fix: new `LIVE_HIGH_CONF_LOCK = 0.85` constant in `verse-auto-live.ts`. When the live verse came from a high-confidence source (≥ 0.85 — hand-curated EXACT 0.95, hand-curated FUZZY 0.85, explicit-regex 0.95), block ALL cross-ref auto swaps in the sticky window regardless of incoming candidate confidence; only manual operator click in the Detected Verses card overrides. Below 0.85 the older delta-based logic still applies. (b) "It still cant find Silver and Gold I have none." + general request for accurate paraphrased-quotation matching. Added ~80 famous pulpit one-liners to `RAW_CATALOGUE` covering Acts 3:6 (silver/gold/rise-up-and-walk in 7 phrasings), the full Beatitudes, John 3:16/14:6/11:25/15:5, Romans 8:28/8:31/10:13/12:1, the Ten Commandments (Exod 20:3-17 + 22:18 thou-shalt-not-suffer-a-witch in 4 phrasings), Hebrews 11:1, James 1:19/4:7, I Cor 13 (love chapter), II Cor 5:17, Galatians 5:22-23 (fruit of the spirit), Ephesians 2:8-10/6:11-17 (armour), Philippians 2:10/4:6-13/4:19, Isaiah 40:31/41:10/53:5/54:17, Jeremiah 29:11, Psalm 23 (every verse split), Psalm 46:10/119:105/121:1-2/127:1, Joshua 1:9/24:15, II Chron 7:14, the seven last words from the cross, etc. All hand-curated → dispatched as semantic 0.95 EXACT / 0.85 FUZZY (covered by the new high-conf lock above), so they auto-fire AND stick. (c) "Anytime I tried to click to write something on the app it doesn't work, applies to all the app" — STILL happening after v0.7.119 CSS fix. Root cause: Radix sets `pointer-events: none` as INLINE style on body; inline JS-set values beat stylesheet `!important`. v0.7.119 CSS rule won the cascade in most cases but not when Radix ran the inline mutation post-hydration. Fix: new `PointerEventsWatchdog` client component mounted at the top of layout.tsx. MutationObserver watches body's `style` attribute; any time `pointer-events: none` is set inline, strips it on the next microtask. Initial sweep on mount handles SSR-leftover cases. Scroll-lock still functions via Radix's separate `overflow: hidden` inline value — only the click-blocking portion is neutralised. Belt + suspenders to v0.7.119 CSS.
-   **Older releases (v0.7.117 and earlier)**: see [`artifacts/imported-app/CHANGELOG.md`](artifacts/imported-app/CHANGELOG.md) for full per-version architecture notes (voice/verse iteration v0.7.109 → v0.7.117, renewed-code re-activation v0.7.118, dead-input app-wide fix v0.7.119, plus all earlier entries).

## Product

-   Dynamic downloads for various OS, with file hashing and multi-threaded support.
-   Real-time slide updates and live congregation output.
-   NDI broadcasting with configurable display modes (lower-third, full-screen).
-   Advanced speech recognition with AI semantic matching for scripture verses.
-   Comprehensive admin dashboard for managing activations, user licenses, and telemetry.
-   Self-hosted, MoMo-based subscription system with free trial and license transfer.
-   Customizable UI/UX with dark/light themes and theme designer.
-   Voice commands for navigation and verse lookup.
-   Automated email and SMS notifications for activations.

## User preferences

-   After EVERY fix / version bump, build and present a fresh ZIP of `artifacts/imported-app/` so the user can download it and run `BUILD.bat` on their Windows PC. Naming convention: `exports/ScriptureLive-AI-v<version>-source.zip`. Exclude `node_modules`, `.next`, `dist-electron`, `release`, `.turbo`, `.git`, `*.tsbuildinfo`, `build-log.txt`. Always use the `present_asset` tool to surface the zip — never assume the user will find it on their own.
-   Bump the `BUILD.bat` banner version string to match the current `package.json` version on every release.

## Gotchas

-   `persist()` operations are fire-and-forget async writes to prevent UI freezes, with retries for disk contention.
-   License state changes (activate/deactivate/transfer) trigger hard page reloads; avoid complex UI interactions immediately after these operations.
-   NDI sender has a 60-second "linger mode" after disconnect to maintain OBS/vMix connections.
-   Renderer crashes are handled by a crash mask that attempts recovery and logs full history.
-   Auto-live confidence thresholds and stability gates are crucial for projection; consult `verse-auto-live.ts` for current logic. As of v0.7.109: explicit ≥0.60, semantic ≥0.55, suggestions 0.10-0.49, **1.25 s anti-flicker dwell** (previous verse stays live), newest-first ordering.
-   The "Detected Verses" card now separates explicit, semantic, and suggested verses into three distinct columns, each with independent auto-live decisions.

## Pointers

-   **Next.js Docs**: [https://nextjs.org/docs](https://nextjs.org/docs)
-   **Express Docs**: [https://expressjs.com/](https://expressjs.com/)
-   **Drizzle ORM Docs**: [https://orm.drizzle.team/](https://orm.drizzle.team/)
-   **Zod Docs**: [https://zod.dev/](https://zod.dev/)
-   **pnpm Workspaces**: [https://pnpm.io/workspaces](https://pnpm.io/workspaces)
-   **Electron Docs**: [https://www.electronjs.org/docs](https://www.electronjs.org/docs)
-   **OpenAPI/Orval**: [https://openapi-generator.tech/](https://openapi-generator.tech/), [https://orval.dev/](https://orval.dev/)
-   **NDI SDK**: _Populate as you build_
