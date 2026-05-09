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
-   **Installer Polish — Finish Page, Header Logo, Rewritten "You agree NOT to" (v0.7.139)**: Operator screenshots https://imgur.com/a/sQZHsBC. Three issues, all in `artifacts/imported-app/build-resources/`. **(1) Finish page** in `installer.nsh` `customFinishPage`: title flipped from "ScriptureLive AI is ready" → "Installation Complete" so it explicitly confirms install succeeded; body text now spells out the two-way choice — leave the run-checkbox ticked + Finish to launch immediately, OR untick it + Finish to just close the installer (operator can launch later from desktop / Start menu shortcut, both already created by `createDesktopShortcut: true` / `createStartMenuShortcut: true`). The checkbox itself is auto-injected by electron-builder when `runAfterFinish` is true (default) and stays ticked because we deliberately do NOT define `MUI_FINISHPAGE_RUN_NOTCHECKED`. Checkbox label shortened to "Open ScriptureLive AI now" so it fits without wrap. **(2) Header BMP** `installerHeader.bmp` regenerated with ImageMagick — the previous 14pt "ScriptureLive AI" wordmark overflowed the 150×57 canvas and got clipped to "ScriptureLive Al" (operator complaint). New build: book-icon shrunk 48→40px and shifted to x=2 left edge; wordmark dropped 14pt → 11pt DejaVu Bold starting at x=46; subtitle "AI Worship Presentation" at 7pt below. The whole block now fits cleanly with ~8px right margin. ImageMagick command lives in v0.7.139 commit history; if you regen, keep BMP3 24-bit (the only format MUI2 reliably reads). **(3) license.txt section 3 ("You agree NOT to")**: rewritten and de-mojibaked. The previous version used UTF-8 bullets `•` (U+2022) which NSIS read as Windows-1252 and rendered as `â€¢` (operator screenshot). New version uses `(a)…(f)` lettered enumeration (pure ASCII — encoding-safe in every NSIS locale) and expands the four old bullets to six clearer clauses: copy/reverse-engineer, resell/sublicense activation codes, strip branding/trademarks, broadcast unlawful/infringing content, violate local laws or venue rules, and bypass licensing/telemetry/anti-piracy mechanisms. The "no resale" clause is new and explicit because the operator's main piracy vector is shared activation codes. No behavioural code change — installer-only.
-   **Admin Recent-Activations Route TS Cleanup (v0.7.138)**: Pre-existing tsc errors in `src/app/api/license/admin/recent-activations/route.ts` — the route was reading `row.installId` and `row.paymentRef` directly off `AdminCodeRow`, but neither field exists on that type. `installId` lives on `LicenseFile` (one per install — there is no per-code install tracking on the admin side), and `paymentRef` lives at `row.generatedFor.paymentRef` (the `generatedFor` blob is `{ email?, whatsapp?, paymentRef?, note? }` — see `ActivationCodeRecord` in `src/lib/licensing/storage.ts` L43-127). **Fix**: dropped the bogus `installId` field from the `RecentActivation` interface entirely (no admin-side source for it), and rewrote `paymentRef: row.paymentRef` → `paymentRef: row.generatedFor?.paymentRef`. Comment explains why installId is intentionally absent so a future agent doesn't try to re-add it from the wrong source. No behavioural change — the previous bogus reads were always `undefined → null` anyway. Tests: 553/553 still pass (route is read-only, exercised by integration tests).
-   **Ghanaian Twerɛ Kronkron (Asante Twi) + Ewe Bibles — Online + Offline (v0.7.137)**: Operator request: "add Ghanaian Twere Kronkron version and EWE bible version" (after pivoting away from Ga, which has no free public JSON dataset on wldeh / bolls / ebible / getbible / wordproject — see v0.7.137 search audit in conversation history). **Fix** spans five files: (a) `src/lib/bibles/twi-bible.ts` generalised — old `TWI_BOOK_SLUG` + `fetchTwiChapterRaw` collapsed into a `WLDEH_TRANSLATIONS` registry of three entries — `TWI` (`tw-wakna`, Akuapem, unchanged), `TWIASANTE` (`tw-wasna`, Asante Twi 2020 — surfaced as "Twerɛ Kronkron (Asante Twi)" because that's the colloquial name for any Asante Holy Scripture and `tw-wasna` is the only Asante dataset upstream), `EWE` (`ee-oal`, Biblica Open Agbenya La 2020). The cache key now includes the translation prefix so the three datasets cannot collide. New generic exports `fetchWldehVerse(parsed, ref, translation)` and `fetchWldehChapter(book, chapter, translation)`; legacy `fetchTwiVerse`/`fetchTwiChapter`/`isTwiBookSupported` kept as Akuapem-default shims for backward compatibility. (b) `src/lib/bible-api.ts` — added `TWIASANTE` + `EWE` to `TRANSLATIONS_INFO` (both `source: 'wldeh'`); the two `info?.source === 'wldeh'` branches now call the generic helpers and pass the translation key through, so any future wldeh translation needs only a registry entry. (c) `src/lib/bibles/local-bible.ts` — switch extended with `case 'twi'` / `case 'twiasante'` / `case 'ewe'` requiring `@/data/bibles/{twi,twiasante,ewe}.json`. (d) `scripts/bundle-bibles.mjs` — same three-translation `WLDEH` registry mirrored at script scope (kept duplicated rather than imported because the mjs runs outside the Next webpack/`@/` alias resolver); new `fetchWldehChapter()` parallel to the existing bolls `fetchChapter()`; `bundleTranslation()` now branches on `translation in WLDEH`. The default-args list became `['kjv','niv','esv','twi','twiasante','ewe']` so `BUILD.bat`'s plain `node scripts/bundle-bibles.mjs` call automatically produces all six bundled JSONs. The skip-if-exists check now requires >1024 B so an empty `{}` stub is always re-downloaded on first explicit run. **Note for the Pentateuch slugs**: Twi uses PREFIX `1mose…5mose`, Ewe inverts that to POSTFIX `mose1…mose5` (matches the Akan vs Ewe word-order convention) — keeping these correct in BOTH `twi-bible.ts` and `bundle-bibles.mjs` is the single most common source of 404s if one of the maps drifts. Ewe's Judges slug is `ʋɔnudrɔ̃lawo` (literally "judges") with U+028B Ʋ and U+0303 combining tilde — `encodeURIComponent` handles it cleanly, but if the URL ever shows up double-encoded the verse will silently 404 → look here first. (e) `src/lib/voice/commands.ts` — voice aliases added: TWIASANTE picks up "twere kronkron / kronkron / asante / ashanti (twi/version/bible)", EWE picks up "ewe / agbenya la / agbenya / volta version". Stub files `src/data/bibles/{twi,twiasante,ewe}.json` (each `{}`) are committed so `next build` resolves the static `require()`s before the operator runs the bundle step. **Tests: 553/553 pass** (no new tests; the wldeh path is exercised end-to-end via the existing TWI test fixtures, which now run through the same generic code).
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
