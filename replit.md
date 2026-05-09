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
-   **Ghanaian Twerɛ Kronkron (Asante Twi) + Ewe Bibles — Online + Offline (v0.7.137)**: Operator request: "add Ghanaian Twere Kronkron version and EWE bible version" (after pivoting away from Ga, which has no free public JSON dataset on wldeh / bolls / ebible / getbible / wordproject — see v0.7.137 search audit in conversation history). **Fix** spans five files: (a) `src/lib/bibles/twi-bible.ts` generalised — old `TWI_BOOK_SLUG` + `fetchTwiChapterRaw` collapsed into a `WLDEH_TRANSLATIONS` registry of three entries — `TWI` (`tw-wakna`, Akuapem, unchanged), `TWIASANTE` (`tw-wasna`, Asante Twi 2020 — surfaced as "Twerɛ Kronkron (Asante Twi)" because that's the colloquial name for any Asante Holy Scripture and `tw-wasna` is the only Asante dataset upstream), `EWE` (`ee-oal`, Biblica Open Agbenya La 2020). The cache key now includes the translation prefix so the three datasets cannot collide. New generic exports `fetchWldehVerse(parsed, ref, translation)` and `fetchWldehChapter(book, chapter, translation)`; legacy `fetchTwiVerse`/`fetchTwiChapter`/`isTwiBookSupported` kept as Akuapem-default shims for backward compatibility. (b) `src/lib/bible-api.ts` — added `TWIASANTE` + `EWE` to `TRANSLATIONS_INFO` (both `source: 'wldeh'`); the two `info?.source === 'wldeh'` branches now call the generic helpers and pass the translation key through, so any future wldeh translation needs only a registry entry. (c) `src/lib/bibles/local-bible.ts` — switch extended with `case 'twi'` / `case 'twiasante'` / `case 'ewe'` requiring `@/data/bibles/{twi,twiasante,ewe}.json`. (d) `scripts/bundle-bibles.mjs` — same three-translation `WLDEH` registry mirrored at script scope (kept duplicated rather than imported because the mjs runs outside the Next webpack/`@/` alias resolver); new `fetchWldehChapter()` parallel to the existing bolls `fetchChapter()`; `bundleTranslation()` now branches on `translation in WLDEH`. The default-args list became `['kjv','niv','esv','twi','twiasante','ewe']` so `BUILD.bat`'s plain `node scripts/bundle-bibles.mjs` call automatically produces all six bundled JSONs. The skip-if-exists check now requires >1024 B so an empty `{}` stub is always re-downloaded on first explicit run. **Note for the Pentateuch slugs**: Twi uses PREFIX `1mose…5mose`, Ewe inverts that to POSTFIX `mose1…mose5` (matches the Akan vs Ewe word-order convention) — keeping these correct in BOTH `twi-bible.ts` and `bundle-bibles.mjs` is the single most common source of 404s if one of the maps drifts. Ewe's Judges slug is `ʋɔnudrɔ̃lawo` (literally "judges") with U+028B Ʋ and U+0303 combining tilde — `encodeURIComponent` handles it cleanly, but if the URL ever shows up double-encoded the verse will silently 404 → look here first. (e) `src/lib/voice/commands.ts` — voice aliases added: TWIASANTE picks up "twere kronkron / kronkron / asante / ashanti (twi/version/bible)", EWE picks up "ewe / agbenya la / agbenya / volta version". Stub files `src/data/bibles/{twi,twiasante,ewe}.json` (each `{}`) are committed so `next build` resolves the static `require()`s before the operator runs the bundle step. **Tests: 553/553 pass** (no new tests; the wldeh path is exercised end-to-end via the existing TWI test fixtures, which now run through the same generic code).
-   **Bible Lookup Verse Preview Now Mirrors Live Output (v0.7.136)**: Operator screenshot https://imgur.com/a/0EOFpjI — image 1 (the Settings → Display & Output preview / live projector) painted the verse with the operator's chosen typography / theme / customBackground / lower-third / reference styling; image 2 (the Bible Lookup tab's verse Card) painted it with completely different fonts (`text-xl md:text-2xl lg:text-3xl`), padding (`p-8 md:p-12`), reference styling (`mt-6 text-sm md:text-base text-primary`), customBackground handling (raw `<img>` at opacity-30 + a `bg-black/50` veil — wrong overlay), and shadow defaults. Same product, two surfaces, two completely different layouts. **Root cause**: identical to the v0.7.124/v0.7.127 problem — a parallel React mirror that drifted from the live renderer the moment a render-affecting setting was added. **Fix** in `src/components/views/bible-lookup.tsx`: removed the entire custom `<Card>` block (~45 lines including the unused `Card`/`CardContent` imports) and dropped in `<OutputPreview mode="auto" sample={…}>` — the same iframe-based renderer that powers the Settings preview and the live `/api/output/congregation` route. Splits are passed via the `sample.text` prop (joined with `\n`) so the operator's 2-Line / 4-Line buttons keep working; the synthetic-slide branch in OutputPreview honours the `sample` prop and reuses the broadcaster's `settings`/`audio` blocks verbatim, so every typography / theme / ratio / lower-third / customBackground / showReferenceOnOutput / textShadow knob now flows through automatically. Future render-affecting fields are picked up for free in this view too — there is no second renderer to maintain. Tests: 553/553 still pass (no new tests; the OutputPreview surface is already covered).
-   **Symmetric Cross-Pipeline 0.58 Floor — 100% EXPLICIT No Longer Blocks 58% SEMANTIC (v0.7.135)**: Operator escalation, second pass on the v0.7.131/v0.7.133 saga. Spec verbatim: "ANY Bible Reference DETECTED [AS LOW AS] 58% SHOULD AUTO GO LIVE, THE 100% THING WITH Auto Verse Match IS BLOCKING ANY ACCURATE VERSES DETECTED FROM Paraphrased quotations EVEN WHEN IT ACCURATE 58% DOSE NOT AUTO SEND LIVE. SOLVE AND MAKE THE 100% UNBLOCK ITSELF WHEN NEW VERSE IS DETECTED IN Bible Reference Quoted WHEN IT 58% GOING." Operator's UI labels mapped to internal pipelines per the replit.md gotcha: "Auto Verse Match" = EXPLICIT (regex), "Bible Reference Quoted" = SEMANTIC (paraphrase). So the bug is: a 100% EXPLICIT live verse blocking a 58% SEMANTIC detection from going live. **Root cause**: v0.7.133 only opened the EXPLICIT-cand-vs-SEMANTIC-live direction at 0.58 — the reverse direction (SEMANTIC cand vs EXPLICIT live) was deliberately gated at the asymmetric `CROSS_PIPELINE_SEMANTIC_VS_EXPLICIT_MIN = 0.70` to "preserve operator-loaded chapter protection." That asymmetry is the exact thing the operator just hit. **Fix** in `src/lib/verse-auto-live.ts`: `CROSS_PIPELINE_SEMANTIC_VS_EXPLICIT_MIN` 0.70 → **0.58**. The cross-pipeline escape in `passesReadLock()` is now uniformly 0.58 in BOTH directions: an auto-live-eligible detection from EITHER pipeline can break a high-conf lock from the OTHER pipeline. v0.7.120 operator-loaded-chapter protection is preserved for SAME-pipeline near-misses (the same-pipeline branch still requires `LIVE_HIGH_CONF_LOCK = 0.85`) and for cross-pipeline noise BELOW 0.58 (also below the column auto-live floor — won't surface in the UI). The `CROSS_PIPELINE_SEMANTIC_VS_EXPLICIT_MIN` constant is kept (rather than collapsing to one) so the two directions can be retuned independently if the operator changes their mind. Test changes: rewrote the `v0.7.133 ASYMMETRIC` test (which asserted a 0.65 SEMANTIC cannot break a 1.00 EXPLICIT lock) into `v0.7.135 SYMMETRIC` — now asserts a **0.58 SEMANTIC at exactly the operator's floor DOES displace a 1.00 EXPLICIT lock**; added boundary test `v0.7.135 SYMMETRIC boundary` — 0.57 SEMANTIC against 1.00 EXPLICIT is STILL blocked (sub-floor noise can't sneak through). **Tests: 553/553 pass** (was 552; +2 new tests, –1 rewritten).
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
