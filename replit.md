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
-   **Hide "DG" Engine Badge from Live Transcription Card (v0.7.141)**: Operator screenshot https://imgur.com/a/elWJh5G pointed out the small `• DG` pill rendering next to the LIVE TRANSCRIPTION header. That pill is the engine-picker `<DropdownMenu>` trigger in `src/components/layout/logos-shell.tsx` (Card `badge={…}` slot at L449). Since v0.7.19 consolidated to Deepgram-only (the only two picker options "Auto" and "Deepgram" both route to the same engine), the badge is purely vestigial UI noise that confused operators. **Fix**: wrapped the entire `<DropdownMenu>` in `<div hidden aria-hidden="true">` so it's removed from the visual tree but the DOM / state wiring stays intact. We deliberately did NOT delete the picker or the `engineLabel` / `engineDotColor` / `engineTitle` derived values — `preferredEngine` and `setPreferredEngine` are still consumed by the speech-provider chain and removing them risks an avoidable cascade. Flipping `hidden` → `''` re-surfaces the picker instantly if we ever re-introduce a second engine. No behavioural change beyond visibility — engine selection is unchanged (still Deepgram).
-   **Single Update-Available Modal + HTML Strip in "What's new" (v0.7.140)**: Operator screenshot https://imgur.com/a/8MmmIPI showed TWO update modals stacking on launch, and the top one's "What's new" panel painting raw HTML — `<h2>Download</h2> <h3><a href="https://github.com/nanvilow/scripturelive-ai/releases/download/v0.7.131/...">Download ScriptureLive AI v0.7.131 Setup for Windows</a></h3> <p><strong>This is the only file you need.</strong>...` — as literal text instead of rendered prose. **Two root causes**: (1) `<UpdateAvailableDialog>` was mounted twice — the v0.7.129 one in `src/app/layout.tsx` AND a leftover v0.6.6 one in `src/app/page.tsx` imported from `@/components/providers/update-dialog`. The two dialogs subscribe to the same `desktop.updater.onState()` channel and both auto-open on the first `available` push, so operators got a stack. (2) GitHub release notes for some recent releases were authored as raw HTML, not Markdown. The v0.7.129 dialog renders cleaned notes through `react-markdown`, which by design does NOT execute embedded HTML (security default), so `<h2>...<a href=...>` leaks through as literal text. **Fix**: deleted `src/components/providers/update-dialog.tsx` entirely + dropped its import / `<UpdateAvailableDialog />` mount from `src/app/page.tsx` (replaced with a load-bearing comment so a future agent does not re-import it). Then in `src/lib/release-notes.ts` extended `cleanReleaseNotes()` with a three-pass HTML strip: anchors collapse to label first (`<a href="...">Download X</a>` → `Download X`), block tags (h1-h6, p, div, ul, ol, li, br, hr, blockquote, pre, table, tr, td, th, thead, tbody) collapse to `\n` so paragraphs still break, then any remaining tag is dropped. We deliberately did NOT enable `rehype-raw` — the popup is a small at-a-glance preview, and arbitrary HTML would also reopen the github.com link surface that v0.7.132 explicitly closed. Both new behaviours covered by 2 added vitest cases in `src/lib/release-notes.test.ts` (28/28 pass). The persistent `<UpdateBanner>` in `src/components/update-banner.tsx` was already calling `cleanReleaseNotes` so it inherits the HTML strip for free; same for the v0.7.129 startup modal in `src/components/update-available-dialog.tsx`. Single canonical update-modal mount point going forward = `src/app/layout.tsx`.
-   **Installer Polish — Finish Page, Header Logo, Rewritten "You agree NOT to" (v0.7.139)**: Operator screenshots https://imgur.com/a/sQZHsBC. Three issues, all in `artifacts/imported-app/build-resources/`. **(1) Finish page** in `installer.nsh` `customFinishPage`: title flipped from "ScriptureLive AI is ready" → "Installation Complete" so it explicitly confirms install succeeded; body text now spells out the two-way choice — leave the run-checkbox ticked + Finish to launch immediately, OR untick it + Finish to just close the installer (operator can launch later from desktop / Start menu shortcut, both already created by `createDesktopShortcut: true` / `createStartMenuShortcut: true`). The checkbox itself is auto-injected by electron-builder when `runAfterFinish` is true (default) and stays ticked because we deliberately do NOT define `MUI_FINISHPAGE_RUN_NOTCHECKED`. Checkbox label shortened to "Open ScriptureLive AI now" so it fits without wrap. **(2) Header BMP** `installerHeader.bmp` regenerated with ImageMagick — the previous 14pt "ScriptureLive AI" wordmark overflowed the 150×57 canvas and got clipped to "ScriptureLive Al" (operator complaint). New build: book-icon shrunk 48→40px and shifted to x=2 left edge; wordmark dropped 14pt → 11pt DejaVu Bold starting at x=46; subtitle "AI Worship Presentation" at 7pt below. The whole block now fits cleanly with ~8px right margin. ImageMagick command lives in v0.7.139 commit history; if you regen, keep BMP3 24-bit (the only format MUI2 reliably reads). **(3) license.txt section 3 ("You agree NOT to")**: rewritten and de-mojibaked. The previous version used UTF-8 bullets `•` (U+2022) which NSIS read as Windows-1252 and rendered as `â€¢` (operator screenshot). New version uses `(a)…(f)` lettered enumeration (pure ASCII — encoding-safe in every NSIS locale) and expands the four old bullets to six clearer clauses: copy/reverse-engineer, resell/sublicense activation codes, strip branding/trademarks, broadcast unlawful/infringing content, violate local laws or venue rules, and bypass licensing/telemetry/anti-piracy mechanisms. The "no resale" clause is new and explicit because the operator's main piracy vector is shared activation codes. No behavioural code change — installer-only.
-   **Admin Recent-Activations Route TS Cleanup (v0.7.138)** — archived to `artifacts/imported-app/CHANGELOG.md`. Still relevant: `RecentActivation` interface in `src/app/api/license/admin/recent-activations/route.ts` does NOT carry `installId` (no admin-side source — `installId` lives on `LicenseFile`); `paymentRef` is read off `row.generatedFor?.paymentRef` (per `ActivationCodeRecord` shape in `src/lib/licensing/storage.ts` L43-127), NOT `row.paymentRef` directly.
-   **Ghanaian Twerɛ Kronkron (Asante Twi) + Ewe Bibles — Online + Offline (v0.7.137)** — archived to `artifacts/imported-app/CHANGELOG.md`. Still relevant: `WLDEH_TRANSLATIONS` registry in `src/lib/bibles/twi-bible.ts` (TWI=`tw-wakna` Akuapem, TWIASANTE=`tw-wasna` Asante, EWE=`ee-oal` Biblica) + mirror in `scripts/bundle-bibles.mjs`; cache key includes translation prefix so datasets cannot collide. `bundleTranslation()` defaults are `['kjv','niv','esv','twi','twiasante','ewe']`. Voice aliases for "twere kronkron / kronkron / asante / ashanti" and "ewe / agbenya la / volta version" live in `src/lib/voice/commands.ts`. Pentateuch slug convention differs by language: Twi PREFIX `1mose…5mose`, Ewe POSTFIX `mose1…mose5`; Ewe Judges slug `ʋɔnudrɔ̃lawo` is double-encoded-safe via `encodeURIComponent`. Stub `{}` JSONs at `src/data/bibles/{twi,twiasante,ewe}.json` are committed so `next build` resolves before bundling.
-   **Bible Lookup Verse Preview Now Mirrors Live Output (v0.7.136)** — archived to `artifacts/imported-app/CHANGELOG.md`. Still relevant: Bible Lookup tab uses `<OutputPreview mode="auto" sample={…}>` (same iframe renderer as Settings preview + live `/api/output/congregation`); never re-introduce a parallel React mirror in any verse-display surface. Splits joined with `\n` and passed via `sample.text`. Original entry: Operator screenshot https://imgur.com/a/0EOFpjI — see CHANGELOG.md for full text.
-   **Symmetric Cross-Pipeline 0.58 Floor (v0.7.135)** — archived to `artifacts/imported-app/CHANGELOG.md`. Still relevant: `CROSS_PIPELINE_SEMANTIC_VS_EXPLICIT_MIN = 0.58` in `src/lib/verse-auto-live.ts` — both cross-pipeline directions in `passesReadLock()` are now uniformly at 0.58. SAME-pipeline near-misses still require `LIVE_HIGH_CONF_LOCK = 0.85` (v0.7.120 operator-loaded-chapter protection). Constant kept (rather than collapsed) so the two directions can be retuned independently.

-   **Per-Column Clear Buttons + scriptureliveai.com Domain Flip (v0.7.134)** — archived to `artifacts/imported-app/CHANGELOG.md`. Still relevant: `clearDetectedVersesBySource(source)` in `src/lib/store.ts` + per-column "Clear · <count>" header buttons in `src/components/layout/logos-shell.tsx`; "Visit website" default is `https://scriptureliveai.com/` (NOT the Replit-app domain) in BOTH `src/lib/website-url.ts` and `electron/main.ts` Help menu — keep them in lockstep. Replit-app domain remains the transcribe / telemetry / auto-update API HOST.
-   **Cross-Pipeline Floor Drop to 58% + Asymmetric Operator-Loaded Chapter Protection (v0.7.133)** — archived to `artifacts/imported-app/CHANGELOG.md`. Superseded by v0.7.135 which dropped `CROSS_PIPELINE_SEMANTIC_VS_EXPLICIT_MIN` 0.70 → 0.58 — both cross-pipeline directions are now uniformly 0.58. v0.7.133's `EXPLICIT_AUTO_LIVE_MIN = 0.58` and `CROSS_PIPELINE_CORROBORATION_MIN = 0.58` constants remain in `src/lib/verse-auto-live.ts`.
-   **Sweep GitHub From Every User-Facing Surface + Coordinated Update Surfaces + Ezekiel/Dry-Bones Phrase Coverage (v0.7.132)** — archived to `artifacts/imported-app/CHANGELOG.md`. Still relevant: `<UpdateBanner>` reads the per-version `localStorage["sl.update-popup-dismissed.<version>"]` flag written by `<UpdateAvailableDialog>` to coordinate which surface owns the screen. `cleanReleaseNotes()` strips GitHub markdown links / `by @user in <url>` attributions / bare github.com URLs from "What's new" copy. `src/lib/github-repo.ts` is kept for electron-updater/electron-builder feed URL parsing but has zero UI consumers. 56 Ezekiel preacher-phrase entries (Ezekiel 37 dry bones × 40, Ezekiel 36:25-27 new-heart × 8, Ezekiel 1 vision × 5, Ezekiel 33 watchman × 5) live in `RAW_CATALOGUE` of `src/lib/bibles/preacher-phrases.ts`.
-   **Update Popup — Drop External GitHub Link (v0.7.130)** — archived to `artifacts/imported-app/CHANGELOG.md`. Still relevant: `<UpdateAvailableDialog>` no longer imports `releaseTagUrl` from `@/lib/github-repo`; v0.7.132 extended the same removal to `<UpdateBanner>` and every other UI surface per "Do not show GitHub anywhere in the app again."
-   **Cross-Pipeline Corroboration Escape (v0.7.131)** — archived to `artifacts/imported-app/CHANGELOG.md`. Superseded by v0.7.133's 0.70 → 0.58 drop and asymmetric `CROSS_PIPELINE_SEMANTIC_VS_EXPLICIT_MIN = 0.70`.
-   **Startup "Update Available" Modal Popup (v0.7.129)** — archived to `artifacts/imported-app/CHANGELOG.md`. Still relevant: per-version `localStorage["sl.update-popup-dismissed.<version>"]` flag is the SHARED dismissal contract — `<UpdateAvailableDialog>` writes it, `<UpdateBanner>` reads it (v0.7.132) to coordinate which surface owns the screen. Mounted at root in `src/app/layout.tsx` INSIDE `<ConfirmDialogProvider>`. NDI on-air guard suppresses both surfaces.
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
