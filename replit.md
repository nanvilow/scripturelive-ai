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
-   **NDI Integration**: `koffi` FFI binding to bundled `Processing.NDI.Lib.x64.dll` (NDI 6 runtime ships inside installer as of v0.7.146 — no separate NDI Tools install required)

## Where things live

-   `apps/nextjs-app`: Next.js frontend and Electron wrapper.
-   `apps/api-server`: Express API backend.
-   `packages/`: Shared utilities and components.
-   `artifacts/imported-app/db/custom.db`: SQLite database for the desktop app.
-   `artifacts/imported-app/build-resources/ndi/Processing.NDI.Lib.x64.dll`: bundled NDI runtime (v0.7.146).
-   `public/downloads/manifest.json`: Manifest for dynamic downloads.
-   `openapi.yaml`: API contracts (source of truth for Orval codegen).
-   `drizzle/schema.ts`: Drizzle ORM database schema.
-   `styles/theme/`: Theme-related files.

## Architecture decisions

> Detailed historical entries live in `artifacts/imported-app/CHANGELOG.md`. The list below keeps only the **last three releases in full detail** plus tight one-line guard-rails for older patterns we still want future agents to respect.

### Recent (full detail)

-   **v0.7.155 — Video Files Allowed As App Background**: Operator request + screenshot https://ibb.co/8DSHn4Fy — Settings → Background previously accepted images only; operators wanted to drop in `.mp4` / `.webm` / `.mov` / `.mkv` clips for animated worship backgrounds. New `isVideoBackground(url)` helper in `src/lib/utils.ts` (extension sniff on `.mp4|.webm|.mov|.mkv|.m4v|.ogv` + `data:video/*` URI prefix) — mirrored as inline `isVideoBg()` in the giant template-literal HTML string of `src/app/api/output/congregation/route.ts` because that surface can't import from the bundle. Six render surfaces switched to a `<video autoPlay loop muted playsInline>` branch when the helper returns true: (1) Settings preview, (2) library-compact chip — also dropped the image-only guard that was hiding video URLs entirely, (3) slide-renderer, (4) logos-shell full-screen preview, (5) logos-shell lower-third preview, (6) congregation route — three separate inline-HTML chunks (initial render + two SSE update branches). Settings file `<input accept>` extended to `image/*,video/mp4,video/webm,video/quicktime,video/x-matroska`. **Security hardening (architect-review)**: added `escAttr()` (HTML-attribute escape for `&<>"'`) + `safeBgUrl()` (allowlist of `http://`, `https://`, `data:image/`, `data:video/`, and root-relative `/`) to all three `customBackground` interpolation sites in the injected client JS — closes pre-existing XSS in the unauthenticated `/api/output/congregation` state-push (any value previously went straight into `style="background-image:url('…')"` and `<video src="…">`). **Caveat**: when adding inline comments inside the giant template-literal in `route.ts`, ALWAYS use `/* … */` — never `//` — and never put an unescaped backtick inside any comment, or it terminates the string and breaks the build. Tests: 568/568 vitest pass; tsc --noEmit clean. `package.json` + `BUILD.bat` banner bumped to 0.7.155.

-   **v0.7.154 — 3-Letter Book Aliases + Space-Separated Reference In Bottom Search Bar**: Operator wanted to type `joh 3 16`, `mat 5 9`, `est 4 14` (i.e. lowercase 3-letter book code + space-separated chapter/verse, no colon) into the bottom search bar and have it resolve. Pre-v0.7.154 the `parseReference()` regex in `src/lib/bible-api.ts` only matched the canonical `John 3:16` / `Joh 3.16` shapes. **Fix**: extended the book-name table in `src/lib/bible-api.ts` with a hand-curated 3-letter alias for ALL 66 books (`gen|exo|lev|num|deu|jos|jdg|rut|1sa|2sa|1ki|2ki|1ch|2ch|ezr|neh|est|job|psa|pro|ecc|sng|isa|jer|lam|ezk|dan|hos|jol|amo|oba|jon|mic|nam|hab|zep|hag|zec|mal|mat|mrk|luk|jhn|act|rom|1co|2co|gal|eph|php|col|1th|2th|1ti|2ti|tit|phm|heb|jas|1pe|2pe|1jn|2jn|3jn|jud|rev`) plus operator-friendly variants like `joh` (vs canonical `jhn`), `mar`, `psm`. Regex relaxed to also accept `<book>\s+<chapter>\s+<verse>` (whitespace separator, no colon required). Direction-aware — Esther alias `est` no longer collides with "Estonian" because the lookup is gated by case-insensitive book table. **Single-Enter Live-Display Bonus** (separate commit `d5fdc1a`): `src/components/layout/library-compact.tsx` bottom search bar `onKeyDown` now sends the resolved verse to live with one Enter press (was Enter→preview, second Enter→live).

-   **v0.7.153 — Cross-Device Admin-Panel Sync**: Operator escalation after v0.7.145 — admin codes generated on PC A still showed up on PC A's local admin dashboard only; admin opened the panel from PC B and saw an empty list / stale config / wrong recent-activations. v0.7.145 had cross-device claim/payment cloud sync but the admin VIEW itself was still reading purely-local `~/.scripturelive/license.json`. **Fix**: two new cloud-side routes — `src/app/api/license/cloud/admin-snapshot/route.ts` (GET — cloud streams its full admin state: codes + config + recent activations) and `src/app/api/license/cloud/admin-merge/route.ts` (POST — cloud accepts an admin's local snapshot and merges newer entries by `updatedAt`). Three local admin routes (`/api/license/admin/codes`, `/admin/config`, `/admin/list`) now (a) hydrate from cloud snapshot on read when `SCRIPTURELIVE_CLOUD_BASE` is reachable AND `REPLIT_DEPLOYMENT_ID` is unset, and (b) fire-and-forget mirror local writes to `/admin-merge` after every mutation. Same SCRIPTURELIVE_CLOUD_BASE / REPLIT_DEPLOYMENT_ID guards as v0.7.145. New helpers in `src/lib/licensing/cloud-sync.ts` (`cloudFetchAdminSnapshot`, `cloudMirrorAdminSnapshot`) + `storage.ts` `mergeAdminSnapshot()` (idempotent `updatedAt`-comparing merge — never downgrades a row). Test file `src/lib/licensing/cloud-admin-sync.test.ts`. **Cloud MUST be redeployed from each release BEFORE customers update or admin-snapshot 404s** (same constraint as v0.7.145). NOT shipped in any installer until v0.7.155 carried it forward to operators.

### Older releases — guard-rails only (full text in `artifacts/imported-app/CHANGELOG.md` and git history)

-   **v0.7.152 — SEMANTIC (BRQ) preempts EXPLICIT (AVM)**: Direction inverted from v0.7.150/v0.7.151 (which had column→source mapping backwards). `src/lib/verse-auto-live.ts`: cross-pipeline preempt is `if (candSource === 'semantic' && liveSource === 'explicit') return true`; reverse direction keeps the v0.7.135 0.58 floor. Latch fields renamed `semanticOwnsLive` / `frozenExplicitId` — arms only when SEMANTIC fires AND prior live was EXPLICIT. Tiebreak: SEMANTIC wins. Operator's verbatim spec: "always display Bible Reference Quoted column detected over Auto Verse Match".
-   **v0.7.151 — Latch v2 narrow arming + "until AVM detects again" release**: Superseded by v0.7.152 (direction was wrong). Kept the latch-arming pattern (only on cross-source-transition fires, never on first-fire) and the two-condition release (`currentLiveId == null` OR opposite-column shows a different verse) — both patterns survive in v0.7.152 with field names flipped.
-   **v0.7.150 — Explicit-Owns-Live latch (initial direction, REVERSED in v0.7.152)**: Original v0.7.150 implementation latched the wrong direction (EXPLICIT preempt SEMANTIC + freeze SEMANTIC). The unconditional cross-pipeline preempt pattern itself is preserved in v0.7.152 — only the direction flipped. The 0.58 reverse-direction floor (`CROSS_PIPELINE_SEMANTIC_VS_EXPLICIT_MIN`) is still load-bearing protection for operator-loaded chapters.
-   **v0.7.149 — Boot Splash Polish**: Splash window in `electron/main.ts` is `alwaysOnTop: false`, `skipTaskbar: false`, `minimizable: true`, `SPLASH_MIN_DWELL_MS: 0` (closes synchronously when main window DOM ready). Real logo via `loadLogoDataUrl()` (candidate order: packaged `process.resourcesPath/app/.next/standalone/.../public/icon-512.png` → dev `public/icon-512.png` → `build-resources/icon.png` fallback). Main-window `minimize`/`restore`/`hide` mirrored onto splash (guarded `!splashWindow.isDestroyed()`). v0.7.79 `--hidden` auto-launch path still suppresses splash entirely.
-   **v0.7.148 — Exhaustive paraphrase coverage**: Three additions to `RAW_CATALOGUE` in `src/lib/bibles/preacher-phrases.ts` — Matthew 4:19 expanded to 53 entries (verbatim translations + punchlines + narrative summaries + sermon callbacks), Psalm 124:7 cluster (26 entries), and operator-curated 399-paraphrase pulpit corpus. **FALSE-POSITIVE GUARDS**: bare "out of the snare" omitted (collides with 2 Tim 2:26); generic "follow me" / "come after me" / "come with me" / "come and follow me" deliberately omitted from Matt 4:19 (collide with Matt 9:9, John 1:43, Luke 9:59, John 21:19, Matt 16:24 / Luke 9:23). Every Matt 4:19 entry contains a distinctive signature ("fishers" / "fish for men/people" / "left their nets" / "Peter and Andrew" / "casting a net into the sea"). Hand-curated EXACT entries fire at conf 0.95, source `'semantic'`.
-   **v0.7.147 — Matt 4:19 paraphrase detection (initial)**: Superseded by v0.7.148 (53-entry expansion); v0.7.147's `come after me` / `come ye after me` removed by v0.7.148 (collide with Matt 16:24 / Luke 9:23).
-   **v0.7.146 — Bundled NDI Runtime ("just works" like vMix/Wirecast)**: `build-resources/ndi/Processing.NDI.Lib.x64.dll` (NDI 6, 28 MB) shipped via `electron-builder.yml` `extraResources`. `electron/ndi-service.ts` `findNdiDll()` order: explicit `NDI_DLL_PATH` env → BUNDLED `process.resourcesPath/ndi/` → dev-mode `__dirname` walks → legacy Program Files / `NDI_RUNTIME_DIR_V*` (safety net only). Bundled wins over any system NDI Tools install. `src/components/views/ndi-output-panel.tsx` no longer renders the "NDI runtime not detected" amber card; `available` only used to disable Start/Stop in pathological corrupted-DLL case. NDI SDK redistribution license permits bundling.
-   **v0.7.145 — Cross-Machine Activation + Payment Cloud Sync**: `src/lib/licensing/cloud-sync.ts` (`cloudClaimActivation` + `cloudMirrorPayment`, both no-op when `REPLIT_DEPLOYMENT_ID` set, both respect `SCRIPTURELIVE_CLOUD_BASE` defaulting to `https://scripturelive.replit.app`). Cloud routes `/api/license/cloud/{claim-activation,mirror-payment}` — atomic claim locks code to `installId` via `CLOUD-CLAIMED:<installId>` prefix in `lastSeenLocation`. `activate/route.ts` falls back to cloud ONLY when local throws `/not recognis|not found|unknown|invalid/i` AND code isn't a master code. **Cloud MUST be redeployed from each release BEFORE customers update or activation 404s.** Sub-ms race in `claimActivationForCustomer` (in-memory cache before fire-and-forget persist) — acceptable, add `async-mutex` if traffic grows.
-   **v0.7.144 — Live-Mic Pulsing Dot Restored**: `src/components/layout/logos-shell.tsx` Card `badge={…}` slot renders a single `<span>` with the pulsing emerald/amber `engineDotColor` (no text, no dropdown). `engineDotColor` / `engineLabel` / `engineTitle` / `preferredEngine` / `setPreferredEngine` / `DropdownMenu*` / `Check` imports intentionally retained — speech-provider chain still consumes `preferredEngine`; never delete to avoid cascade.
-   **v0.7.143 — Finish-Page Run-Checkbox**: `MUI_FINISHPAGE_RUN_NOTCHECKED` defined in `customFinishPage` macro of `installer.nsh`. Run-checkbox is the BACKUP launch path; v0.7.142 `customInstall` MessageBox is primary.
-   **v0.7.142 — Post-Install MessageBox**: `!macro customInstall` in `installer.nsh` fires `MessageBox MB_YESNO` after file copy. `IfSilent skipLaunchPrompt` skips on auto-updater runs (the in-app `<UpdateAvailableDialog>` handles relaunch). Launch via `Exec '"$INSTDIR\ScriptureLive AI.exe"'` (quoted path; `Exec` not `ExecShell`).
-   **v0.7.141 — DG Pill Hidden**: Superseded by v0.7.144 — current badge is just the pulsing dot. DropdownMenu / engineLabel / engineTitle still defined but unused; keep as escalation lever.
-   **v0.7.140 — Single Update Modal + HTML Strip**: Canonical update-modal mount = `src/app/layout.tsx`. Do NOT re-introduce `<UpdateAvailableDialog>` in `src/app/page.tsx`. `cleanReleaseNotes()` in `src/lib/release-notes.ts` strips raw HTML; `rehype-raw` deliberately NOT enabled (security + closes github.com link surface).
-   **v0.7.139 — Installer Polish**: `customFinishPage` macro defines `MUI_FINISHPAGE_TITLE="Installation Complete"`. `installerHeader.bmp` MUST be BMP3 24-bit 150×57 (only format MUI2 reliably reads). `license.txt` section 3 uses `(a)…(f)` ASCII enumeration (UTF-8 bullets render as mojibake in NSIS).
-   **v0.7.138 — Admin Recent-Activations**: `RecentActivation` interface in `src/app/api/license/admin/recent-activations/route.ts` does NOT carry `installId` (lives on `LicenseFile` only); `paymentRef` is read off `row.generatedFor?.paymentRef`, NOT `row.paymentRef`.
-   **v0.7.137 — Twi/Asante/Ewe Bibles**: `WLDEH_TRANSLATIONS` registry in `src/lib/bibles/twi-bible.ts` (TWI=`tw-wakna`, TWIASANTE=`tw-wasna`, EWE=`ee-oal`) + mirror in `scripts/bundle-bibles.mjs`. Pentateuch slugs differ by language — Twi PREFIX `1mose…5mose`, Ewe POSTFIX `mose1…mose5`. Ewe Judges slug `ʋɔnudrɔ̃lawo` is double-encoded-safe via `encodeURIComponent`. Stub `{}` JSONs at `src/data/bibles/{twi,twiasante,ewe}.json` committed for `next build`.
-   **v0.7.136 — Bible Lookup Preview**: Bible Lookup tab uses `<OutputPreview mode="auto" sample={…}>` (same iframe renderer as Settings preview + live `/api/output/congregation`). Never re-introduce a parallel React mirror in any verse-display surface.
-   **v0.7.134 — Domain Flip**: "Visit website" default is `https://scriptureliveai.com/` (NOT Replit-app domain) in BOTH `src/lib/website-url.ts` and `electron/main.ts` Help menu — keep them in lockstep. Replit-app domain remains the transcribe / telemetry / auto-update API HOST. `clearDetectedVersesBySource(source)` in `src/lib/store.ts` powers per-column "Clear · <count>" header buttons.
-   **v0.7.135 + v0.7.133 + v0.7.131 — Auto-live thresholds**: `CROSS_PIPELINE_SEMANTIC_VS_EXPLICIT_MIN = 0.58` in `src/lib/verse-auto-live.ts` (both directions uniform). SAME-pipeline near-misses still require `LIVE_HIGH_CONF_LOCK = 0.85` (operator-loaded-chapter protection). Manual operator click in Detected Verses card always overrides — that path doesn't go through this gate.
-   **v0.7.132 — GitHub Sweep**: `<UpdateBanner>` reads per-version `localStorage["sl.update-popup-dismissed.<version>"]` flag written by `<UpdateAvailableDialog>` to coordinate which surface owns the screen. NDI on-air guard suppresses both surfaces. `cleanReleaseNotes()` strips github.com URLs / `by @user in <url>` attributions. `src/lib/github-repo.ts` kept for electron-updater feed URL parsing only — zero UI consumers. 56 Ezekiel preacher-phrase entries (Ezekiel 37 dry bones, 36:25-27 new-heart, ch.1 vision, ch.33 watchman) live in `RAW_CATALOGUE` of `src/lib/bibles/preacher-phrases.ts`.
-   **v0.7.129 — Update Modal Dismissal**: Per-version `localStorage["sl.update-popup-dismissed.<version>"]` flag is the SHARED dismissal contract between `<UpdateAvailableDialog>` (writer) and `<UpdateBanner>` (reader). Mounted at root in `src/app/layout.tsx` INSIDE `<ConfirmDialogProvider>`.
-   **v0.7.128 + v0.7.120 — Read-Lock**: 8 s read-lock window blocks SAME-pipeline near-misses (noise, not corroboration). v0.7.131 cross-pipeline check runs FIRST — high-conf cross-pipeline corroboration still escapes the lock.
-   **v0.7.127 — Single-Renderer Output**: `<OutputPreview>` is a thin `<iframe src="/api/output/congregation?preview=1">`; `src/lib/output-payload.ts` `buildOutputPayload()` is the SHARED helper used by both SSE broadcaster and preview iframe — never re-introduce a parallel React mirror. Suggested-Verses 50–54% band: `SEMANTIC_AUTO_LIVE_MIN=0.50`; `suggestionsFor()` enforces the 10–49% band STRICTLY for ALL sources (the `source==="suggestion"` bypass was removed — upstream taggers must keep suggestion-tagged confidence inside `0.10–0.499` or the verse is dropped).
-   **v0.7.126 — Branded MUI2 Wizard**: `electron-builder.yml` runs full MUI2 wizard (`nsis.oneClick: false`). `customInit`/`customUnInit` task-kill macros (v0.7.85/v0.7.88/v0.7.122) live alongside `customHeader`/`customWelcomePage`/`customFinishPage` branding macros in `installer.nsh` — different lifecycle hooks, never collapse them. `perMachine: false`, `differentialPackage: true`, `deleteAppDataOnUninstall: false` all preserved.
-   **v0.7.125 — Styled Confirm/Alert**: Every destructive prompt in License & Bible flows uses `useConfirm()` from `src/components/ui/confirm-dialog.tsx` (Radix `<AlertDialog>`-backed) instead of `window.confirm()`/`window.alert()`. Post-transfer code receipt delivered via `localStorage["sl.lastTransferCode"]` + `<TransferSuccessDialog>` mounted in `<LicenseProvider>` — never re-introduce a same-render React Dialog after deactivation (v0.7.102 chrome-error race).
-   **v0.7.124 — Full-Screen Font Clamp**: `fullScreenClamp()` in `src/lib/fonts.ts` is the canonical font-size formula consumed by `fitFont()`; v0.7.127 collapsed the preview onto the live renderer so `fullScreenClamp()` is no longer load-bearing for the preview path but kept for any future surface that needs the same envelope.

### Cross-cutting patterns (no specific version)

-   **Hybrid Deployment**: Single codebase ships both the web (`scripturelive.replit.app`) and the Windows desktop app (Electron wrapping the same Next.js).
-   **API Routing**: API server is routed to `/__api-server` to avoid conflicts with Next.js routes.
-   **NDI Integration**: Browser-only NDI output and native NDI sender via Electron, supporting transparent overlays and configurable display modes, with pixel parity via pinned zoom. As of v0.7.146 the runtime DLL ships bundled — see entry above.
-   **Multi-tiered Speech Recognition**: Deepgram + Whisper + browser engines with auto-fallback, VAD, and hallucination guard, complemented by AI semantic matching.
-   **Atomic License Persistence**: Atomic-write JSON file for local license persistence, ensuring data integrity during deactivation/transfer.
-   **Hard Reset for License State Changes**: Critical license state changes (activate/deactivate/transfer) trigger hard `window.location.assign('/')` reload to prevent renderer crashes from stale React contexts. v0.7.107 extended the same recovery to UNCAUGHT renderer exceptions via `app/global-error.tsx` + `app/error.tsx` — any thrown React error hard-reloads to `/` instead of letting Chromium paint chrome-error://chromewebdata.

### Capabilities

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

-   After EVERY fix / version bump, build and present a fresh ZIP of `artifacts/imported-app/` so the user can download it and run `BUILD.bat` on their Windows PC. Naming convention: `exports/ScriptureLive-AI-v<version>-source.zip`. Exclude `node_modules`, `.next`, `dist-electron`, `dist-electron-ui`, `release`, `exports`, `uploads`, `upload`, `.turbo`, `.git`, `*.tsbuildinfo`, `build-log.txt`. Always use the `present_asset` tool to surface the zip — never assume the user will find it on their own.
-   Bump the `BUILD.bat` banner version string to match the current `package.json` version on every release.
-   Push to GitHub via REST API after each release: OWNER=`nanvilow`, REPO=`scripturelive-ai`, BRANCH=`main`, token from `GH_PAT` env. Tag every release `v<version>`.
-   When `replit.md` gets long, archive older Architecture-decisions entries to `artifacts/imported-app/CHANGELOG.md` and leave one-line guard-rails behind.

## Gotchas

-   `persist()` operations are fire-and-forget async writes to prevent UI freezes, with retries for disk contention.
-   License state changes trigger hard page reloads; avoid complex UI interactions immediately after them.
-   NDI sender has a 60-second "linger mode" after disconnect to maintain OBS/vMix connections.
-   Renderer crashes are handled by a crash mask that attempts recovery and logs full history.
-   Auto-live confidence thresholds (current as of **v0.7.127**): explicit ≥0.60, semantic ≥0.50, suggestions 0.10–0.499, **1.25 s anti-flicker dwell**, newest-first ordering. The `source==='suggestion'` bypass in `suggestionsFor()` was REMOVED — upstream taggers must keep suggestion-tagged confidence inside the 0.10–0.499 band or the verse is dropped from the UI entirely.
-   The "Detected Verses" card separates explicit / semantic / suggested verses into three columns, each with independent auto-live decisions.
-   The cloud at `scripturelive.replit.app` MUST be redeployed from the same commit BEFORE customers update; otherwise v0.7.145+ activation cloud-fallback hits 404.

## Pointers

-   **Next.js Docs**: [https://nextjs.org/docs](https://nextjs.org/docs)
-   **Express Docs**: [https://expressjs.com/](https://expressjs.com/)
-   **Drizzle ORM Docs**: [https://orm.drizzle.team/](https://orm.drizzle.team/)
-   **Zod Docs**: [https://zod.dev/](https://zod.dev/)
-   **pnpm Workspaces**: [https://pnpm.io/workspaces](https://pnpm.io/workspaces)
-   **Electron Docs**: [https://www.electronjs.org/docs](https://www.electronjs.org/docs)
-   **OpenAPI/Orval**: [https://openapi-generator.tech/](https://openapi-generator.tech/), [https://orval.dev/](https://orval.dev/)
-   **NDI SDK**: [https://ndi.video/sdk/](https://ndi.video/sdk/) (redistribution license permits bundling the runtime DLL inside integrated apps — that's what we do as of v0.7.146).
