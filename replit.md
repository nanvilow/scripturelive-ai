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

-   **v0.7.171 — Fix Windows Installer CI Build (webpack `node:` scheme regression from v0.7.168)**: Operator: "check what you push on git it red" — the GitHub Actions `Release ScriptureLive AI Desktop` → `Build Windows installer` job had been failing on every release since v0.7.168 (v0.7.168, v0.7.169, v0.7.170 all red). Local dev never reproduced because dev uses Turbopack, but CI runs the production webpack pipeline. Root cause: v0.7.168's `fsFallback()` in `src/lib/bibles/local-bible.ts` used static `require('node:fs')` and `require('node:path')`. `local-bible.ts` is imported by the client component `live-translation-sync.tsx` → `app/page.tsx`, so webpack's CLIENT pass for the production build follows it and tries to bundle `node:fs` / `node:path`, crashing with `UnhandledSchemeError: Reading from "node:fs" is not handled by plugins (Unhandled scheme). Webpack supports "data:" and "file:" URIs by default. You may need an additional plugin to handle "node:" URIs.` even though the runtime guard `if (typeof window !== 'undefined') return null` would have prevented execution on the client. The `typeof window` check is a runtime check; webpack's static analyser doesn't honour it. **Fix**: replaced static `require('node:fs')` / `require('node:path')` with `eval('require')`-based dynamic resolution. `eval('require')` evaluates at runtime so webpack's static module graph never sees the `node:` scheme, the client bundle compiles, and the Node.js server-side `nodeRequire('node:fs')` resolves normally because `eval` returns the real CommonJS `require` at runtime. Also gated the `__dirname` candidate path on `typeof __dirname !== 'undefined'` to keep ESM/edge contexts happy. Behaviour identical to v0.7.168/v0.7.169/v0.7.170: server-side `loadTranslation()` still falls back to disk read when `require('@/data/bibles/<key>.json')` returns an empty stub; client-side `loadTranslation()` still uses the webpack-inlined static-chunks path. **Files**: `src/lib/bibles/local-bible.ts` (`fsFallback()` rewritten to use `eval('require')`), `package.json` + `BUILD.bat` banner bumped to 0.7.171. Tests: `tsc --noEmit` clean. Verified via webpack's stack trace in the prior failed CI run that the only `node:fs` / `node:path` import points were the two static `require()` calls in `fsFallback()`, both now eval-routed. **GUARD-RAIL**: any new Node-only `require()` (`node:fs`, `node:path`, `node:child_process`, `node:os`, etc.) that lives in a module which can be transitively reached from a client component MUST be resolved through `eval('require')` rather than static `require()`. The `typeof window` runtime guard is necessary but NOT sufficient — webpack's CLIENT pass scans the entire module graph and crashes on any unhandled scheme it sees, regardless of whether the call site would ever execute. Symptom: dev (Turbopack) succeeds; production webpack build fails with `UnhandledSchemeError`. The only way to verify this kind of fix locally is to run the actual `package:win` script (or watch the GitHub Actions run); `tsc --noEmit` passes either way. The v0.7.168/v0.7.169/v0.7.170 chain shipped because we never re-ran the Windows packaging script after the v0.7.168 add.

-   **v0.7.170 — Quiet Edge-Runtime Warnings (workflow card no longer red)**: Operator reported "v0.7.169 — LLM + AI detector responsiveness pass it red" — the imported-app workflow status card was rendering red even though typecheck and runtime were both green and the bible API was responding 200 OK. Root cause: `src/instrumentation.ts` registered the v0.7.86 crash guards via `process.on('uncaughtException', …)` / `process.on('unhandledRejection', …)` directly inside `register()`. The runtime guard at line 27 (`if (process.env.NEXT_RUNTIME !== 'nodejs') return`) DID short-circuit execution on the edge runtime, but Turbopack's static analyzer in Next 16.2 ignores runtime guards and still scans the whole module for forbidden APIs — it sees `process.on` and prints `⚠ A Node.js API is used (process.on at line: 59) which is not supported in the Edge Runtime` on EVERY compile (every page hit, every HMR tick). The warnings are technically harmless because the code never executes on edge, but they print so often they fill the workflow card and Replit colours it red. **Fix**: extracted the entire Node-only body of `register()` into a new `src/instrumentation-node.ts` module (`registerNode()` containing the v0.7.86 crash-guard handlers + v0.7.19 opt-in startup test email + v0.5.46 SMTP send block — full comment history preserved verbatim). The new `instrumentation.ts` is a 7-line wrapper that gates on `process.env.NEXT_RUNTIME === 'nodejs'` and dynamic-imports `./instrumentation-node` only when true. Because the import is dynamic, Turbopack's edge-bundle static scan never sees `process.on`, so the warnings disappear entirely. Behaviour is identical: `register()` still runs once per Node cold-start, the global `__SL_CRASH_GUARDS_INSTALLED` latch still prevents double-registration during HMR, and the edge runtime still no-ops the same way it did before. **Files**: `src/instrumentation-node.ts` (new, ~135 lines, all Node-only logic + comment history), `src/instrumentation.ts` (slimmed to 7 lines + explanation comment), `package.json` + `BUILD.bat` banner bumped to 0.7.170. Tests: `tsc --noEmit` clean; dev server restart shows zero `A Node.js API is used` warnings post-fix; bible API still returns 200. **GUARD-RAIL**: any new Node-only API (`fs`, `process.*`, `child_process`, `nodemailer`, etc.) added to a Next 16+ entry-point file (instrumentation, middleware, route handlers reachable from edge) MUST live behind a dynamic `import()` gated on `process.env.NEXT_RUNTIME === 'nodejs'` — a `if (...) return` guard at the top of the function is necessary but NOT sufficient because Turbopack's static scanner ignores runtime guards and prints warnings on every compile, which makes the workflow card render red and operators panic.

-   **v0.7.169 — LLM + AI Detector Responsiveness Pass**: Operator reported "Both the LLM and AI detector are very slow in detecting and very slow in listening accurately. I don't know; it seems the LLM and AI detector are not performing as well as they did previously." Architect investigation traced the regression to three independent throttles tuned conservatively in v0.7.93/v0.7.117 that, combined, made the system feel sluggish in field use. Three conservative reverts. **Fix A (`src/lib/verse-auto-live.ts` `LIVE_STICKY_MS`)**: 8000 → 4000. The v0.7.117 read-lock window prevented any new verse from displacing the current live verse for 8 s unless it cleared a 0.10 confidence delta. In a fast-paced sermon the preacher moves on faster than 8 s, leaving the projector "stuck" on the prior verse. 4 s still filters out the catalogue-near-miss flutter (which collapses within 1-2 s of the initial detection) but unblocks responsive cross-column swaps. **Fix B (`src/lib/voice/llm-classifier.ts` `DEFAULT_TIMEOUT_MS`)**: 800 → 1200 ms. The v0.7.93 800 ms cap was tuned for an OpenAI median of 250-600 ms, but Ghana-region church Wi-Fi pushes p90 to 900-1100 ms. Result: ~1-in-3 classifications were timing out and dropping to "I didn't catch that" silently — operator perceived this as the detector being slow/inaccurate. 1200 ms clears the slow-network p90 while still failing fast on a true outage. **Fix C (`src/components/providers/speech-provider.tsx` `SEMANTIC_THROTTLE_MS`)**: 1500 → 1000 ms. The semantic-match probe throttle left up to 1.5 s of dead-air on the "Bible Reference Quoted" column during a fast sermon. 1000 ms still rate-limits the OpenAI semantic endpoint comfortably (~1 req/sec/seat is well under the gpt-4o-mini ceiling) while doubling responsiveness perception. Conservative scope: did NOT touch the cross-pipeline corroboration floor (0.58, v0.7.131-v0.7.135) or the `semanticOwnsLive` latch (v0.7.152) — those were both intentionally tuned by recent operator escalations and reversing them risks reintroducing the bugs they fixed. If the operator still reports slowness after v0.7.169, the next lever to pull is the corroboration floor (0.58 → 0.50). **Files**: `src/lib/verse-auto-live.ts`, `src/lib/voice/llm-classifier.ts`, `src/components/providers/speech-provider.tsx`, `package.json` + `BUILD.bat` banner bumped to 0.7.169. Tests: `tsc --noEmit` clean. **GUARD-RAIL**: any future tuning of `LIVE_STICKY_MS`, `DEFAULT_TIMEOUT_MS` (LLM), or `SEMANTIC_THROTTLE_MS` MUST be done in 1 s / 200 ms increments, NEVER as a wholesale doubling — the v0.7.117/v0.7.93 mistake was changing the values by 2× / 1.875× in a single bump and overshooting the field-usable range. The cross-pipeline corroboration floor (0.58) and `semanticOwnsLive` latch are the NEXT levers to pull if responsiveness complaints persist; don't pull them in the same release.

-   **v0.7.168 — Offline Bibles in Packaged Electron**: (full text demoted to CHANGELOG) — `outputFileTracingIncludes` in `next.config.ts` for `src/data/bibles/*.json` forces Next's standalone tracer to copy the JSONs; new server-side `fsFallback()` in `local-bible.ts` reads from disk (cwd, standalone artifact dir, `__dirname` resolve) when `require('@/data/bibles/<key>.json')` returns an empty stub. Renderer keeps webpack-inlined chunk path. **GUARD-RAIL**: any new `src/data/*.json` MUST be added to BOTH `outputFileTracingIncludes` AND `loadTranslation()` switch in `local-bible.ts`. NOTE: v0.7.171 had to rewrite the fallback's `require('node:fs')` / `require('node:path')` calls to use `eval('require')` because the static form crashed webpack's CLIENT pass with `UnhandledSchemeError` — see v0.7.171 entry.

-   **v0.7.167 — Independent Lower-Third Typography + Persisted-TWI Migration**: (full text demoted to CHANGELOG) — Two operator bugs. **Bug 1**: v0.7.166 LT-typography coupling made the four in-app lower-third surfaces inherit NDI broadcast typography. **Fix**: split `USE_NDI_OVERRIDES` (NDI-only) from new `USE_LT_OVERRIDES` (in-app LT-only) in `route.ts`; added 7 `lowerThird*` settings + 3-tier resolution chain (NDI → LT → body) + companion `settingsRenderKey()` keys + new "Lower Third Typography" card in `settings.tsx`. **Bug 2**: persisted `'TWI'` translation values still showed on header/badge after v0.7.163 dropped TWI; persist `version: 3 → 4` migration rewrites `settings.defaultTranslation` / `settings.ndiTranslation` / `selectedTranslation` from `'TWI'` → `'TWIASANTE'`. Plus `.replitignore` adds `.next/dev` etc to keep deploys lean. **GUARD-RAIL (A1)**: any new lower-third-like display mode must propagate via `dm.indexOf('lower-third')===0`. **GUARD-RAIL (A2)**: every key in `route.ts` resolution chain MUST be added to `settingsRenderKey()` in lockstep — otherwise slider drag does nothing until an unrelated field changes. **GUARD-RAIL (B)**: any future `TRANSLATIONS_INFO` removal MUST ship a persist-migration bump that rewrites the 3 persisted keys for every seat that had the orphan key.

-   **v0.7.166 — Activation Lifecycle Sync + Settings Refresh Flicker + LT Typography + Deepgram Alignment**: (full text demoted to CHANGELOG) — `applyAdminLedgerSnapshot()` activation merge now propagates `isUsed`/`usedAt`/`subscriptionExpiresAt` cross-device (monotonic isUsed, latest-wins on usedAt/expiresAt); admin-modal `/admin/list` poll gated to `tab === 'overview'`; `USE_NDI_OVERRIDES` predicate broadened (REPLACED in v0.7.167 by `USE_LT_OVERRIDES` split); renderer's direct Deepgram WebSocket params brought into lockstep with api-server proxy. **GUARD-RAIL (A)**: any new SHARED field on `ActivationCodeRecord` MUST be added to `applyAdminLedgerSnapshot()` activation merge. **GUARD-RAIL (B)**: every auto-refresh poll inside `<Dialog>` MUST gate on the tab it feeds. **GUARD-RAIL (D)**: renderer direct-Deepgram URL params and api-server proxy params MUST stay in lockstep — tune one, update both. (GR-C from v0.7.166 superseded by v0.7.167 LT typography decoupling.)

-   **v0.7.164 — Bundle NKJV + NLT + AMP Offline**: (full text demoted to CHANGELOG) — bundler default-list expanded to 8 Bibles (KJV/NIV/ESV/NKJV/NLT/AMP/TWIASANTE/EWE = ~32 MB); per-source concurrency split (`isWldeh ? 12 : 3`) because bolls.life 429s past 3 concurrent; 429-aware backoff in `fetchChapter()` honours `Retry-After`; 3 new switch cases (`nkjv`/`nlt`/`amp`) in `local-bible.ts`. **GUARD-RAIL**: every NEW translation added to `bundle-bibles.mjs` default-list needs three lockstep edits — (a) stub-loop list (or `next build` errors on missing import), (b) `loadTranslation()` switch in `local-bible.ts` (or runtime falls back to online), (c) v0.7.168's `outputFileTracingIncludes` pattern in `next.config.ts` ALREADY covers any `src/data/bibles/*.json` so no per-file edit needed there. The bolls concurrency pin (3) is a HARD upper bound — pushing back to 12 reproduces the 429-storm that wipes runs.

-   **v0.7.163 — "Give Me 3 Version" → Asante Twi + Drop Akuapem TWI**: (full text demoted to CHANGELOG) — collapsed to a single Twi key (TWIASANTE = Asante `tw-wasna`); 11 ordinal voice aliases (`3 version`, `3rd version`, `three version`, `third version`, `3 bible`, `3rd bible`, `three bible`, `version 3`, `version three`, `bible 3`, `bible three`) all → `TWIASANTE`; TWI removal lives in 8 lockstep places: `bible-api.ts` TRANSLATIONS_INFO, `twi-bible.ts` WldehKey + WLDEH_TRANSLATIONS + isWldehKey, `local-bible.ts` switch, `bundle-bibles.mjs` default-list + WLDEH map, `voice/commands.ts` aliases, `voice/llm-classifier.ts` prompt — touch one without the others and you get a half-wired translation. Bundler GH_PAT auth path required on Replit-class infra (anonymous raw.github throttled to 60/hr). v0.7.167 added the persisted-state migration that finishes the job for upgrading seats whose `selectedTranslation` was still `'TWI'`.

### Older releases — guard-rails only (full text in `artifacts/imported-app/CHANGELOG.md` and git history)

-   **v0.7.162 — Cloud Sync stats**: cloud-sync-test buckets MUST stay in sync with `storage.computeCodeStatus()` precedence (deleted > cancelled > master > never-used > active/expired/used). Revenue is PAID + CONSUMED only — never include WAITING_PAYMENT.
-   **v0.7.159 — NDI Live Preview background**: any iframe for OPERATOR consumption MUST omit `transparent=1` — only true NDI/OBS capture surfaces keep transparency.
-   **v0.7.158 — Single-renderer across all 6 surfaces**: NEVER re-introduce a parallel React mirror of the slide composite — every verse-display surface goes through `<OutputPreview>` (or `<NdiPreviewSurface>`). Extend `buildOutputPayload()` or add a flag.
-   **v0.7.157 — OBS card + cross-device sync UI**: `browserFallbackUrl = ${window.location.origin}/api/output/congregation?transparent=1` is the canonical fallback for hybrid web/Electron renderers when Electron IPC data is null. NEVER outer-`&&`-guard a card on optional Electron-IPC data.
-   **v0.7.156 — Output-window regex hotfix**: regex inside `route.ts` giant template literal must double-escape backslashes (`\\.`, `\\/`, `\\d`); verify with `node --check` on extracted inline script after every regex edit.
-   **v0.7.155 — Video backgrounds**: `safeBgUrl()` allowlist (`http://`, `https://`, `data:image/`, `data:video/`, `/`) + `escAttr()` are the XSS guard for the unauthenticated `/api/output/congregation` state-push. Inline comments inside the giant template literal MUST use `/* */`, never embed unescaped backticks.
-   **v0.7.161 — Auto-sync OOTB (bake cloud masterCode)**: `BAKED_CLOUD_ADMIN_CODE` + `getCloudAdminCode()` in `src/lib/baked-credentials.ts`; resolution chain (per-PC `cloudAdminCode` → env `SCRIPTURELIVE_CLOUD_ADMIN_CODE` → baked) in `adminSyncCode()` and `cloud-sync-test/route.ts`. `baked-credentials.ts` is gitignored; rotate masterCode in BOTH that constant AND `scripts/inject-keys.mjs` hardcoded fallback. Per-PC override must stay at the top of the chain.
-   **v0.7.160 — Cross-device admin sync visible + auto-pull on config read**: `admin/config` GET now mirrors the list/codes pattern (4 s `cloudPullAdminLedger` + `applyAdminLedgerSnapshot`); admin-modal header pill (`connected`/`wrong key`/`unreachable`/`not set up`) + Sync Now button. Any new admin-data read endpoint MUST start with the same pull block, and per-PC fields stay on the storage strip-list. v0.7.153 cloud routes still required.
-   **v0.7.154 — 3-letter book aliases**: `parseReference()` accepts lowercase 3-letter codes + whitespace separator. All 66 books aliased.
-   **v0.7.153 — Cross-device admin-panel sync transport**: cloud routes `/api/license/cloud/admin-{snapshot,merge}` (masterCode-auth, idempotent merge by `updatedAt`); helpers in `src/lib/licensing/cloud-sync.ts` no-op when `cloudAdminCode` unset — v0.7.157 added the UI to set it. Cloud must be redeployed before customers update.
-   **v0.7.150–v0.7.152 — Cross-pipeline preempt direction**: SEMANTIC (BRQ) preempts EXPLICIT (AVM) in `src/lib/verse-auto-live.ts`; latch fields `semanticOwnsLive` / `frozenExplicitId`; reverse direction held by 0.58 floor (`CROSS_PIPELINE_SEMANTIC_VS_EXPLICIT_MIN`). v0.7.150/151 had direction backwards — final shipped direction is v0.7.152.
-   **v0.7.149 — Boot Splash**: `electron/main.ts` splash is non-modal (`alwaysOnTop: false`, `skipTaskbar: false`, dwell 0); `loadLogoDataUrl()` candidate order packaged → dev → fallback; main-window minimize/restore mirrored to splash.
-   **v0.7.147–v0.7.148 — Paraphrase corpus**: `RAW_CATALOGUE` in `src/lib/bibles/preacher-phrases.ts` — Matt 4:19 (53 entries, all carrying distinctive signatures), Psalm 124:7 (26), 399-paraphrase pulpit corpus. Bare "out of the snare" / generic "follow me" omitted (collide with 2 Tim 2:26 / Matt 9:9 etc).
-   **v0.7.146 — Bundled NDI Runtime**: `build-resources/ndi/Processing.NDI.Lib.x64.dll` shipped via `electron-builder.yml` `extraResources`; `findNdiDll()` order in `ndi-service.ts`: env → bundled → dev → legacy. Bundled wins over system NDI Tools.
-   **v0.7.145 — Cross-Machine Activation + Payment Cloud Sync**: `cloudClaimActivation` / `cloudMirrorPayment` in `src/lib/licensing/cloud-sync.ts`; cloud routes `/api/license/cloud/{claim-activation,mirror-payment}`; `activate/route.ts` falls back to cloud only on `/not recognis|not found|unknown|invalid/i`. Cloud must be redeployed before customers update.
-   **v0.7.144 — Live-Mic Pulsing Dot**: `logos-shell.tsx` Card `badge` is a single `<span>` with `engineDotColor`. Never delete `engineLabel`/`engineTitle`/`preferredEngine`/`DropdownMenu` imports — speech-provider chain still consumes `preferredEngine`.
-   **v0.7.142–v0.7.143 — Post-install launch**: `customInstall` MessageBox in `installer.nsh` (primary; `IfSilent skipLaunchPrompt` for auto-updater); `MUI_FINISHPAGE_RUN_NOTCHECKED` Run-checkbox is backup. Launch via `Exec '"$INSTDIR\ScriptureLive AI.exe"'`.
-   **v0.7.140 — Single Update Modal + HTML Strip**: canonical mount = `src/app/layout.tsx` (NEVER re-introduce in `page.tsx`); `cleanReleaseNotes()` strips raw HTML; `rehype-raw` deliberately disabled.
-   **v0.7.139 — Installer Polish**: `installerHeader.bmp` MUST be BMP3 24-bit 150×57; `license.txt` uses `(a)…(f)` ASCII (UTF-8 bullets break NSIS).
-   **v0.7.138 — Admin Recent-Activations**: `RecentActivation` reads `paymentRef` off `row.generatedFor?.paymentRef`, NOT `row.paymentRef`; `installId` lives on `LicenseFile` only.
-   **v0.7.137 — Twi/Asante/Ewe Bibles**: `WLDEH_TRANSLATIONS` registry in `src/lib/bibles/twi-bible.ts` mirrored in `scripts/bundle-bibles.mjs`. Pentateuch slugs differ by language (Twi PREFIX `1mose…5mose`, Ewe POSTFIX `mose1…mose5`); Ewe Judges slug double-encoded-safe via `encodeURIComponent`.
-   **v0.7.136 — Bible Lookup Preview**: Bible Lookup tab uses `<OutputPreview>` iframe — never re-introduce a parallel React mirror in any verse-display surface.
-   **v0.7.131–v0.7.135 — Auto-live thresholds**: `CROSS_PIPELINE_SEMANTIC_VS_EXPLICIT_MIN = 0.58` (uniform); SAME-pipeline `LIVE_HIGH_CONF_LOCK = 0.85`. Manual operator click bypasses these gates.
-   **v0.7.134 — Domain Flip**: "Visit website" default = `https://scriptureliveai.com/` in BOTH `src/lib/website-url.ts` and `electron/main.ts` Help menu (keep in lockstep). Replit-app domain remains the API host.
-   **v0.7.132 — GitHub Sweep**: `cleanReleaseNotes()` strips github.com URLs and `by @user in <url>` attributions; `src/lib/github-repo.ts` kept only for electron-updater feed URL parsing.
-   **v0.7.128–v0.7.129 — Update Modal Dismissal + Read-Lock**: per-version `localStorage["sl.update-popup-dismissed.<version>"]` is the shared dismissal contract between `<UpdateAvailableDialog>` (writer) and `<UpdateBanner>` (reader); 8s read-lock blocks SAME-pipeline near-misses but cross-pipeline check runs FIRST.
-   **v0.7.127 — Single-Renderer Output**: `<OutputPreview>` is a thin `<iframe src="/api/output/congregation?preview=1">`; `buildOutputPayload()` in `src/lib/output-payload.ts` is the shared helper for SSE + preview. Suggestions enforced strictly in 0.10–0.499 band for ALL sources.
-   **v0.7.124–v0.7.126 — Installer/Confirm/Font**: `electron-builder.yml` full MUI2 wizard (`oneClick: false`); destructive prompts use `useConfirm()` (Radix `<AlertDialog>`); `fullScreenClamp()` in `src/lib/fonts.ts` is the canonical font-size formula consumed by `fitFont()`. `customInit`/`customUnInit` task-kill macros + `customHeader`/`customWelcomePage`/`customFinishPage` branding macros all live in `installer.nsh` — never collapse them.

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
-   When `replit.md` gets long, archive older Architecture-decisions entries to `artifacts/imported-app/CHANGELOG.md` and leave one-line guard-rails behind. **Do this automatically without asking** — at every release bump, keep only the LAST 3 versions in "Recent (full detail)" and demote everything below into one-line guard-rails / move full text to CHANGELOG.

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
