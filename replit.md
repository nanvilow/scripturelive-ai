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
-   **Cross-Pipeline Floor Drop to 58% + Asymmetric Operator-Loaded Chapter Protection (v0.7.133)**: Operator escalation after v0.7.131 — same screenshot https://imgur.com/a/8MmmIPI was reported as STILL broken in production. Spec verbatim: "ANY Bible Reference DETECTED [AS LOW AS] 58% SHOULD AUTO GO LIVE … MAKE THE 100% UNBLOCK ITSELF WHEN NEW VERSE IS DETECTED IN Bible Reference Quoted." **Root-cause hypothesis**: v0.7.131 set `CROSS_PIPELINE_CORROBORATION_MIN = 0.70` exactly matching the operator's reported 0.70 explicit hit — a floating-point boundary case PLUS any upstream `source`-tag inconsistency (if the live verse is missing its `source` field, `sourceOf()` defaults to `'explicit'`, the cross-pipeline check `candSource !== liveSource` returns false, and the v0.7.120 high-conf lock blocks instead) made the escape unreliable in real audio. **Fix** in `src/lib/verse-auto-live.ts`: (a) `EXPLICIT_AUTO_LIVE_MIN` 0.60 → **0.58** so the column floor itself matches the operator's directive; (b) `CROSS_PIPELINE_CORROBORATION_MIN` 0.70 → **0.58** so any auto-live-eligible explicit detection is, by construction, allowed to break a same-instant semantic lock — no second stricter gate to trip over; (c) NEW `CROSS_PIPELINE_SEMANTIC_VS_EXPLICIT_MIN = 0.70` enforced asymmetrically in `passesReadLock()` — when `candSource === 'explicit'` against a semantic live verse it uses the 0.58 floor (the operator bug); when `candSource === 'semantic'` against an explicit live verse it uses the 0.70 floor (preserves v0.7.120 protection — a soft preacher-phrase paraphrase shouldn't be able to hijack an operator-loaded chapter). 3 new regression tests + 4 boundary tests retargeted (0.59→0.57, 0.60→0.58 column-floor cases): the operator screenshot reproduction now passes at 0.58/0.60/0.65/0.70 (loop), a 0.55 cross-pipeline explicit still cannot break a semantic lock (still has a floor), and a 0.65 cross-pipeline semantic still cannot break a 1.00 explicit operator-loaded chapter (asymmetric mitigation works). **Tests: 552/552 pass** (was 549).
-   **Sweep GitHub From Every User-Facing Surface + Coordinated Update Surfaces + Ezekiel/Dry-Bones Phrase Coverage (v0.7.132)**: Four operator complaints from one screenshot session (https://imgur.com/a/8MmmIPI) and a follow-up "Do not show GitHub anywhere in the app again." **Issue 1 — two popups stacked**: `<UpdateAvailableDialog>` (v0.7.129 foreground modal) AND `<UpdateBanner>` (v0.5.x bottom-centre toast) were both painting for the same `available`/`downloaded` state, looking like "two different popups". **Fix** in `src/components/update-banner.tsx`: new `isDialogDismissedForVersion(version)` reads `localStorage["sl.update-popup-dismissed.<version>"]` (the EXACT key the dialog writes on Later/Esc/overlay-click in `update-available-dialog.tsx`); when state is `available`/`downloaded` AND the dialog hasn't been dismissed for this version, the banner returns null. Net effect: dialog owns the first impression; banner owns ACTIVE download progress + cancel + the post-Later fallback. Failure mode is safe — `localStorage` throw → treat as not-dismissed → suppress banner → operator sees modal alone, never a stacked pair. **Issue 2 — "What's new" wrong + GitHub showing in it**: removed the `import { releaseTagUrl } from '@/lib/github-repo'` import + `getReleaseUrl()` helper + both "View full release notes on GitHub →" anchors at the bottom of `<UpdateBanner>` (mirroring v0.7.130's removal from `<UpdateAvailableDialog>` — same rationale, two surfaces). Strengthened `cleanReleaseNotes()` in `src/lib/release-notes.ts`: new `GITHUB_MARKDOWN_LINK` regex collapses `[label](https://github.com/...)` to just `label`; `BY_AUTHOR_IN_URL` regex (`\s+by\s+@user\s+in\s+<url>`) drops GitHub's auto-attribution that sits at the end of every "Generate release notes" bullet; `GITHUB_BARE_URL` regex strips any remaining bare `github.com` URLs; trailing-empty-bullet sweep removes `* ` lines left by the strips. **Issue 3 — sweep GitHub from EVERYWHERE in the app** (operator follow-up): scrubbed `src/components/views/settings.tsx` — removed the 3-link Quick Start / Troubleshooting / Report a Bug grid (all three resolved to `https://github.com/...` via `quickStartUrl()`/`troubleshootingUrl()`/`newIssueUrl()`); the white-label Visit Website link directly above replaces all three. Auto-update status copy: "Checking GitHub Releases…" → "Checking for updates…", "Click Check Now to query GitHub Releases" → "Click Check Now to check for updates". `src/app/download/page.tsx`: "GitHub Actions pipeline at .github/workflows/release-desktop.yml builds this when you push a v* tag" → "First cloud build pending — installer will appear here once it's been built and published"; "GitHub Release" / "GitHub README" mentions in the minisign verify section → "release feed" / "this site" / "the project's website". `src/lib/github-repo.ts` is kept (electron-updater + electron-builder still need it for the auto-update feed URL parsed from `package.json` `repository.url`) but it has zero remaining UI consumers — only tests import it. **Issue 4 — Ezekiel detection + dry-bones paraphrasing**: address-parse path was already complete (regex in `bible-api.ts` `BOOK_NAMES_PATTERN` + alias map in `book-mapping.ts` covers `Ezekiel`/`Eze`/`Ezk`/`Ezekial`/`Ezekel`/`Ezechial`). Gap was the SEMANTIC/PHRASE path: zero Ezekiel entries in `RAW_CATALOGUE` of `src/lib/bibles/preacher-phrases.ts` meant un-addressed preaching ("can these bones live", "valley of dry bones", "a new heart will I give you", "wheel in the middle of a wheel") never surfaced. Added 56 new entries: heaviest coverage on Ezekiel 37 dry bones per operator request (40 paraphrases — every verse in 37:1–14 is now reachable from multiple natural-speech entry points: "valley of dry bones", "son of man can these bones live", "prophesy upon these bones", "o ye dry bones hear the word of the lord", "i will cause breath to enter into you", "bone to his bone", "an exceeding great army", "our bones are dried", "i shall put my spirit in you", etc); plus Ezekiel 36:25-27 new-heart promise (8 paraphrases — "a new heart will i give you", "stony heart out of your flesh", "an heart of flesh"); Ezekiel 1 vision (5 — "a wheel in the middle of a wheel", "four living creatures", "the likeness of the glory of the lord"); Ezekiel 33 watchman (5 — "i have set thee a watchman", "his blood will i require at thine hand", "turn ye turn ye from your evil ways"). Tests: 549/549 pass (was 543).
-   **Update Popup — Drop External GitHub Link (v0.7.130)** — archived to `artifacts/imported-app/CHANGELOG.md`. Still relevant: `<UpdateAvailableDialog>` no longer imports `releaseTagUrl` from `@/lib/github-repo`; v0.7.132 extended the same removal to `<UpdateBanner>` and every other UI surface per "Do not show GitHub anywhere in the app again."
-   **Cross-Pipeline Corroboration Escape (v0.7.131)**: Operator screenshot https://imgur.com/a/8MmmIPI — preacher said "Paul and Silas were locked up in prison"; COL 1 "Auto Verse Match" (semantic pipeline) had latched onto a phrase-only false-positive at 1.00 confidence and gone live; COL 2 "Bible Reference Quoted" (explicit pipeline) correctly detected Acts 16 at 0.70 — but the v0.7.128 high-conf-vs-high-conf escape required BOTH detections ≥0.85, so a high-conf SEMANTIC false-positive could permanently lock out a moderate-conf EXPLICIT correction. **Root cause**: `passesReadLock` only differentiated by raw confidence — it had no concept that a detection from a *different pipeline* (regex address-parser vs semantic phrase-matcher) is independent corroboration. Two causally-independent matchers DIS-agreeing about the current reference is itself a strong signal that the live verse is wrong (typically a phrase-match latching onto a generic phrase like "in prison"). **Fix** in `src/lib/verse-auto-live.ts` `passesReadLock()`: added a CROSS-PIPELINE escape that runs FIRST, before the same-pipeline v0.7.120/v0.7.128 logic — when `candSource !== liveSource` AND `candConf >= CROSS_PIPELINE_CORROBORATION_MIN` (0.70), the lock yields. 0.70 sits comfortably above both column auto-live floors (explicit 0.60, semantic 0.50) so noise can't break through, but reachable for a confident regex address parse (typical 0.70-0.95) or a strong preacher-phrase match. Same-pipeline near-misses still go through the v0.7.120/v0.7.128 path (a same-column near-miss is noise, not corroboration — must stay blocked, e.g. semantic 0.95 verbatim quote NOT displaced by a same-column 0.70 near-miss). Same-reference no-flicker guard runs FIRST so a 0.95 explicit echo of a live 0.95 semantic on the SAME reference still blocks (no visible re-paint). 3 new regression tests: (a) operator screenshot — semantic 1.00 false-positive correctly displaced by explicit 0.70 cross-pipeline; (b) cross-pipeline 0.65 BELOW the 0.70 floor still cannot break the lock; (c) same-reference cross-pipeline 0.95 still blocked. 66/66 pass.
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
