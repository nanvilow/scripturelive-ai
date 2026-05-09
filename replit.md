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
-   **Preview ↔ Output Parity for Full-Screen Verses (v0.7.124)**: Operator screenshot diff — the "PREVIEW (FULL SCREEN)" thumbnail in `Settings → Display & Output` painted the verse as a small centred banner inside the preview card while the actual second-screen output painted the same verse as huge text filling the entire frame. Two surfaces, identical settings, completely different layouts → operators couldn't trust the preview before going live. Root cause was a triple mismatch in `src/components/settings/output-preview.tsx`: (1) **font-size formula** — preview body used an ad-hoc `clamp(${10·sizeMult}px, min(${4·sizeMult}cqw, ${8·sizeMult}cqh), ${28·sizeMult}px)` while the real `/api/output/congregation` `fitFont()` uses `clamp(1.1rem, ${bandText·scale}vw, 7rem)` with `bandText` = 4.0/4.6/**5.2**/6.0 per fontSize bucket and a `7rem` (112 px) cap. At `lg` + textScale 1, the real renderer paints at ~112 px on a 1920 px screen (~6 % of viewport width); the preview capped at ~31 px in a 320 px-wide card (~10 % of card but visually tiny). (2) **textScale default** — preview used `?? 0.9`, real renderer uses `?? 1` (route.ts line 653), so even fresh installs saw a ~10 % size discrepancy before the operator touched anything. (3) **wrapper padding** — preview used `padding: 6% 6%` while the real `#output` is `100vw × 100vh` with no padding, pushing preview text inward into a banner-inset look. **Fix**: new shared `fullScreenClamp({ totalChars, fontSize, textScale })` helper exported from `src/lib/fonts.ts` — mirrors `fitFont()` exactly (same bandText map, same totalChars shrink schedule, same `FS_MULT[fontSize] × textScale` double-count, same `clamp(1.1rem, …, 7rem)` envelope) but emits `cqw` instead of `vw` so it composes with the preview's `container-type: size` wrapper. Reference clamp also unified to `clamp(.85rem, 1.4cqw, 1.6rem)` matching the real `.slide-reference` rule. Default `textScale` flipped 0.9 → 1. Wrapper padding trimmed 6% → 3%. Lower-third path is untouched — it already shared `lowerThirdClamp()` from v0.7.x. Net result: identical proportions on both surfaces because `cqw` inside a container-typed box equals `vw` inside the viewport, so the same coefficient × scale produces the same fraction of the rendered surface. Long passages still progressively shrink on both renderers via the shared shrink schedule. Lower-third surfaces, NDI surface, and `fitFont()` itself are unchanged — risk-isolated to the preview component.
-   **Pricing Card Refresh (v0.7.123)**: Operator-supplied target mockup. Subscription modal pricing tiles in `src/components/license/subscription-modal.tsx` retitled and trimmed to match the cleaner three-column layout. **Starter** — price `Free` now carries suffix `forever` (was empty); features trimmed 5→3 (kept AI Verse Detection (Free Trial), Dual Screen Display, Up to 2 screens; removed Basic Typography Customization + Email Support — the latter was misleading as no support channel was wired). **Pro** — priceSuffix `/per month` → `per month` (lost the slash for cleaner typography); features trimmed 7→4 (kept NDI Output Integration, Full Typography & Styling, Priority Support, AI Verse Detection (OpenAI Mode); removed Unlimited Screens, Smart Chapter Navigator, All future updates which now belong exclusively to Church License). Featured-tier badge `MOST POPULAR` (uppercase, tracking-wider) → `Popular` with leading `<Star>` icon (lucide-react), normal-case, semibold — softer + more modern. **Church License** — blurb rewritten from "A permanent license for established ministries — pay once, own it forever." to "A long-term license for established ministries: pay once and own it for a year without interruptions." (removes the inaccurate "permanent / forever" framing — the 1Y plan is renewable annually, not perpetual). priceSuffix `/Year` → `Year` (matched Pro's slash removal). Features rebuilt 6→6 with different list (kept Everything in Pro + Dedicated WhatsApp support; added AI Verse Detection (OpenAI Mode), Unlimited Screens, All future updates, Full Typography & Styling — now the explicit superset over Pro; removed Lifetime license + Install on up to 5 machines + Setup & onboarding call + Custom branding options which were aspirational and not yet enforced anywhere in the activation/license codepath). Activation entry box at top of modal (v0.7.75 — "make sure when users open it, they should be able to see where to enter the activation code too") is unchanged. No backend / pricing-catalogue changes — `@workspace/pricing` GHS amounts and 1M / 1Y plan codes are untouched.
-   **Faster Installer + Activation Notification + AI Health Probe + Low-Time Warning (v0.7.122)**: Four operator requests addressed. **(1) Installer perf** — operators reported install was "much longer than it should be" even after v0.7.66's compression:maximum + asar strips. Profiling showed ~3.3 s of dead time per install/upgrade was burned in defensive `Sleep` calls inside `build-resources/installer.nsh` (4×400 ms taskkill spacing + 1500 ms post-kill settle + 200 ms pre-kill at customInit/UnInit). Trimmed to 4×200 ms + 600 ms + zero pre-kill = 1.4 s of dead time, saving ~1.9 s on every install/upgrade. Windows handle release is sub-50 ms in practice; the old margins were 30× the actual need. If "file in use" regressions appear, restore the 1500 ms post-kill first — accounts for 64 % of savings. **(2) Real-time activation notification** — pre-v0.7.122 the operator saw NO confirmation when a paid code activated (the v0.7.101 hard-reload eliminated the receipt UI). Two new pieces: USER-side `<ActivationSuccessDialog>` (mounted globally inside `<LicenseProvider>`) detects a freshly-activated paid subscription on the FIRST page load after the activation modal's hard-reload — checks `activeSubscription.activatedAt` is within last 5 min AND `localStorage[sl-celebrated-activation] !== code` — pops a celebratory Radix dialog showing plan + days + code + expiry, then marks the code as celebrated so subsequent launches don't re-pop. ADMIN-side new `/api/license/admin/recent-activations` endpoint returns every activation row with `usedAt` within the last `windowHours` (default 24h, capped 30d), sorted newest-first; new `<RecentActivationsBanner>` inside admin-modal polls every 10 s, surfaces unseen rows as a green-bordered banner with a "Mark all seen" button, persists seen-set via `localStorage[sl-admin-seen-activations]`. **(3) AI Health probe** — operator request to verify LLM/AI Search/AI Detection performance. New `/api/ai/diagnostic` admin endpoint sequentially times: (a) text-embedding-3-small round-trip on a fixed warm-up phrase, (b) gpt-4o-mini chat.completions round-trip on a trivial OK prompt, (c) full `matchTranscriptToVerses()` call (warms cache + measures cosine compute). Each stage wrapped in try/catch with own `{ ok, ms, error, detail }`. New `<AiDiagnosticButton>` in Settings tab runs the probe and prints colour-coded per-stage ms + embedding dim + LLM reply + top semantic match + cache status. Lets the operator distinguish "OpenAI is slow today" from "my embedding cache hasn't built yet" without devtools. `resolveOpenAICreds()` exported from semantic-matcher to share the existing 4-tier credential resolver (proxy → env → admin config → baked). **(4) Low-time warning popup** — operator request: "display a popup to notify the user when their AI Detection time is almost finished before it actually expires." New `<LowTimeWarning>` Radix AlertDialog mounted inside `<LicenseProvider>`; ticks every 15 s from `activeSubscription.expiresAt`; fires at 24h (info / sky border), 6h (info), 1h (warn / amber), 15m (warn), 5m (critical / red border) bands; each band fires AT MOST ONCE per code via `localStorage[sl-low-time-fired:<code>:<band>]`; "Renew now" button opens the subscription modal directly; master codes (year-3000 expiry) excluded so the operator's admin device doesn't get spammed. Critically uses Radix AlertDialog NOT toast — Sonner has been globally silenced since v0.7.114 (path-aware-toaster returns null), so any toast-based warning would never paint.
-   **Hybrid Deployment**: Supports both web and desktop (Electron) environments from a single codebase.
-   **API Routing**: API server is routed to `/__api-server` to avoid conflicts with Next.js routes.
-   **NDI Integration**: Browser-only NDI output and native NDI sender via Electron, supporting transparent overlays and configurable display modes, with pixel parity via pinned zoom.
-   **Multi-tiered Speech Recognition**: Employs Deepgram, Whisper, and browser speech engines with auto-fallback, VAD, and hallucination guard, complemented by AI semantic matching.
-   **Atomic License Persistence**: Uses an atomic-write JSON file for local license persistence, ensuring data integrity during critical operations like deactivation and transfer.
-   **Hard Reset for License State Changes**: Critical license state changes (activate, deactivate, transfer) trigger a hard `window.location.assign('/')` reload to prevent renderer crashes caused by stale React contexts. v0.7.107 extends the same recovery to UNCAUGHT renderer exceptions via `app/global-error.tsx` + `app/error.tsx` — any thrown React error hard-reloads to `/` instead of letting Chromium paint chrome-error://chromewebdata. Fixes the "This page couldn't load" page seen on cold boot when activation has just expired.

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
