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
-   **Update Popup — Drop External GitHub Link (v0.7.130)**: Operator follow-up to v0.7.129: "remove this; + a link to the full GitHub release notes". The truncated `previewNotes` rendered inside the popup is the only context an operator needs to decide whether to install — sending them off to a browser tab during the pre-service rush is the opposite of what the modal is for. **Fix** in `src/components/update-available-dialog.tsx`: removed the `import { releaseTagUrl } from '@/lib/github-repo'` import, the `const releaseUrl = releaseTagUrl(offer.version)` derivation, and the trailing `<a href={releaseUrl} target="_blank">View full release notes on GitHub →</a>` block under the markdown preview. Replaced with a comment block documenting the rationale so a future contributor doesn't try to "restore" the link. The bottom-right `<UpdateBanner>` (v0.5.x) still surfaces the same GitHub release link in its own collapsible "What's new" panel, so the full release notes are NOT lost — they're just no longer one tap away from the foreground modal that an operator sees while their congregation is filing in. Everything else from v0.7.129 stays: per-version `localStorage` dismissal, NDI on-air guard, install/download CTA shape-shift, `e.preventDefault()` spinner pattern.
-   **Startup "Update Available" Modal Popup (v0.7.129)**: Operator request: "I need you to make a popup available whenever there's an update. Anytime users open the app and there's a fresh update that should be the first popup that shows up with a little message about the new update and they should update to the new version now." Existing `<UpdateBanner>` (passive bottom-centre toast since v0.5.x) was being missed during the busy 5-minutes-before-service window — operators wanted something that hijacks the foreground on launch. **Fix**: new `src/components/update-available-dialog.tsx` ships `<UpdateAvailableDialog>` — a Radix `<AlertDialog>` (NOT `<Dialog>` — same intent-gesture rationale as the v0.7.125 confirm dialogs: focus trap + role=alertdialog + deliberate dismissal, exactly the trust contract for "should we quit and install a new build?"). Mounted at root in `src/app/layout.tsx` INSIDE `<ConfirmDialogProvider>` so it inherits the operator's dark/light theme, alongside (NOT replacing) `<UpdateBanner>` which stays as the passive download-progress + cancel surface. Subscribes to `desktop.updater.onState()` from v0.5.x's existing electron-updater wiring — opens IFF state is `available` or `downloaded` AND the operator hasn't already dismissed THIS specific version (per-version flag in `localStorage["sl.update-popup-dismissed.<version>"]`). Title + CTA shape-shift on readiness: `downloaded` → "Update ready to install — vX.Y.Z" + "Update now" (calls `desktop.updater.install()` → electron-updater quitAndInstall, app relaunches into new build), `available` → "New update available — vX.Y.Z" + "Download now" (calls `desktop.updater.download()` to kick off the multi-threaded HTTP-range download, then closes the modal so `<UpdateBanner>` takes over as the single source of truth for progress + cancel — operators don't get two competing progress UIs). Release notes preview rendered via the same `<ReactMarkdown>` + `cleanReleaseNotes()` pipeline as the banner (strips GitHub "Full Changelog" + "New Contributors" boilerplate), truncated at ~480 chars on a sentence boundary with a "View full release notes on GitHub →" link to the `releaseTagUrl()` from `src/lib/github-repo.ts`. **NDI on-air guard**: while `useNdi().status.running` is true the dialog suppresses itself entirely (mirrors `<UpdateBanner>`'s v0.6.x `onAir` guard) — accidentally clicking "Update now" mid-service tears the NDI source off the air in vMix/OBS, not a risk we let a foreground modal create; the operator gets the prompt the moment they Stop NDI. **Per-version dismissal contract**: "Later" / Esc / overlay click all flow through `handleDismiss()` which writes `localStorage["sl.update-popup-dismissed.<version>"] = "1"` so the modal never re-pops for the same release on subsequent launches — but EVERY new release re-engages it because each release is a fresh ask. Action button uses `e.preventDefault()` to override Radix's default close-on-action so the modal stays open with a "Restarting…" / "Starting…" spinner while the install IPC round-trips, giving the operator immediate visual feedback that their click registered. Storage swallows on `localStorage` throws (private mode / file://) — worst case the dialog re-pops on next launch, never destructive. SSR-inert (`useDesktop()` returns null in the browser-detection path so the component returns null on the server render).
-   **Cross-Pipeline Corroboration Escape (v0.7.131)**: Operator screenshot https://imgur.com/a/8MmmIPI — preacher said "Paul and Silas were locked up in prison"; COL 1 "Auto Verse Match" (semantic pipeline) had latched onto a phrase-only false-positive at 1.00 confidence and gone live; COL 2 "Bible Reference Quoted" (explicit pipeline) correctly detected Acts 16 at 0.70 — but the v0.7.128 high-conf-vs-high-conf escape required BOTH detections ≥0.85, so a high-conf SEMANTIC false-positive could permanently lock out a moderate-conf EXPLICIT correction. **Root cause**: `passesReadLock` only differentiated by raw confidence — it had no concept that a detection from a *different pipeline* (regex address-parser vs semantic phrase-matcher) is independent corroboration. Two causally-independent matchers DIS-agreeing about the current reference is itself a strong signal that the live verse is wrong (typically a phrase-match latching onto a generic phrase like "in prison"). **Fix** in `src/lib/verse-auto-live.ts` `passesReadLock()`: added a CROSS-PIPELINE escape that runs FIRST, before the same-pipeline v0.7.120/v0.7.128 logic — when `candSource !== liveSource` AND `candConf >= CROSS_PIPELINE_CORROBORATION_MIN` (0.70), the lock yields. 0.70 sits comfortably above both column auto-live floors (explicit 0.60, semantic 0.50) so noise can't break through, but reachable for a confident regex address parse (typical 0.70-0.95) or a strong preacher-phrase match. Same-pipeline near-misses still go through the v0.7.120/v0.7.128 path (a same-column near-miss is noise, not corroboration — must stay blocked, e.g. semantic 0.95 verbatim quote NOT displaced by a same-column 0.70 near-miss). Same-reference no-flicker guard runs FIRST so a 0.95 explicit echo of a live 0.95 semantic on the SAME reference still blocks (no visible re-paint). 3 new regression tests: (a) operator screenshot — semantic 1.00 false-positive correctly displaced by explicit 0.70 cross-pipeline; (b) cross-pipeline 0.65 BELOW the 0.70 floor still cannot break the lock; (c) same-reference cross-pipeline 0.95 still blocked. 66/66 pass.
-   **High-Conf VS High-Conf Read-Lock Escape Hatch (v0.7.128)** — archived to `artifacts/imported-app/CHANGELOG.md`. Still relevant: same-pipeline near-miss within an 8 s read-lock window remains BLOCKED (v0.7.120/128 logic in `passesReadLock` runs after the v0.7.131 cross-pipeline check); SAME-pipeline near-misses are noise, not corroboration. Manual operator click in the Detected Verses card always overrides because that path doesn't go through this gate.

-   **Single-Renderer Output Preview + Suggested-Verses Gap Closure (v0.7.127)** — archived to `artifacts/imported-app/CHANGELOG.md`. Still relevant: `<OutputPreview>` is a thin `<iframe src="/api/output/congregation?preview=1">`; `src/lib/output-payload.ts` `buildOutputPayload()` is the shared helper used by BOTH the SSE broadcaster and the preview iframe — never re-introduce a parallel React mirror. Suggested-Verses 50–54% band thresholds: `SEMANTIC_AUTO_LIVE_MIN=0.50`, suggestion-tag thresholds in `speech-provider.tsx` L1827 + L1984 ALSO at `< 0.50`, `suggestionsFor()` enforces the 10–49% band strictly for ALL sources (no `source==="suggestion"` bypass).

-   **Branded MUI2 Installer Wizard (v0.7.126)** — archived to `artifacts/imported-app/CHANGELOG.md`. Still relevant: `electron-builder.yml` runs full MUI2 wizard (`nsis.oneClick: false`) with branded sidebar/header BMP3 art in `build-resources/`; `customInit`/`customUnInit` task-kill macros from v0.7.85/v0.7.88/v0.7.122 live alongside the v0.7.126 `customHeader`/`customWelcomePage`/`customFinishPage` branding macros in `installer.nsh` (different lifecycle hooks — never collapse them). `perMachine: false`, `differentialPackage: true`, `deleteAppDataOnUninstall: false` all preserved.

-   **Styled Confirm/Alert Dialogs in License Flow (v0.7.125)** — archived to `artifacts/imported-app/CHANGELOG.md`. Still relevant: every destructive prompt in the License & Bible flows uses `useConfirm()` from `src/components/ui/confirm-dialog.tsx` (Radix `<AlertDialog>`-backed) instead of `window.confirm()`/`window.alert()`; the post-transfer code receipt is delivered via `localStorage["sl.lastTransferCode"]` + `<TransferSuccessDialog>` mounted in `<LicenseProvider>` (mirrors v0.7.122's activation pattern; never re-introduce a same-render React Dialog after deactivation — it triggers the v0.7.102 chrome-error race).
-   **Preview ↔ Output Parity for Full-Screen Verses (v0.7.124)**: Superseded by v0.7.127's single-renderer iframe — full entry archived to `artifacts/imported-app/CHANGELOG.md`. v0.7.127 collapses the preview onto the live renderer entirely, so the v0.7.124 `fullScreenClamp()` shared helper is no longer load-bearing for the preview path (the live renderer now paints the preview directly via postMessage); it remains in `src/lib/fonts.ts` as the canonical font-size formula consumed by `fitFont()` and any future surface that needs the same envelope.
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
-   Auto-live confidence thresholds and stability gates are crucial for projection; consult `verse-auto-live.ts` for current logic. As of **v0.7.127**: explicit ≥0.60, semantic ≥0.50 (lowered from 0.55 to close the 50–54% dead gap), suggestions 0.10–0.499, **1.25 s anti-flicker dwell** (previous verse stays live), newest-first ordering. The `source==='suggestion'` bypass in `suggestionsFor()` was REMOVED in v0.7.127 — the band is enforced strictly for all sources, so upstream taggers must keep their suggestion-tagged confidence inside the 0.10–0.499 band or the verse will be dropped from the UI entirely.
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
