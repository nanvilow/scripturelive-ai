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

-   **Matthew 4:19 EXHAUSTIVE Paraphrase Coverage (v0.7.148)**: Operator follow-up to v0.7.147 — wants this app's Matthew 4:19 detection to be the BEST in the worship-tech market (beat ProPresenter / EasyWorship / Faithlife Proclaim). v0.7.147's 14 entries were a minimal viable fix; v0.7.148 expands `RAW_CATALOGUE` in `src/lib/bibles/preacher-phrases.ts` to **53 hand-curated Matthew 4:19 / Matthew 4:20 phrase aliases** organised into four sections: (1) **Verbatim translation variants** — KJV ("follow me and i will make you fishers of men"), ESV gender-neutral ("fishers of people"), NIV ("fish for people" / "send you out to fish for people"), MSG ("i'll show you how to fish for people"), plus the operator's "come with me" paraphrase from v0.7.147. (2) **Punchline / keyword fragments** — every combinatorial slice of "fishers/fisher of men/people", "make you / become / i will make you" × "fishers / fish for men / fish for people". (3) **Narrative summaries** — "jesus called peter and andrew", "calling of the first disciples / fishermen", "walking by the sea of galilee jesus saw two brothers", "casting a net into the sea for they were fishermen", plus 7 Matthew 4:20 follow-up phrases ("they left their nets and followed him", "straightway they forsook their nets", "immediately they left their nets", etc — pointed at Matt 4:20 the action verse, not 4:19 the call). (4) **Sermon-callback paraphrases** — "from fishermen to fishers of men", "from catching fish to catching men", "drop your nets and follow jesus". **FALSE-POSITIVE GUARD removed two v0.7.147 entries**: `come after me` and `come ye after me` — code review flagged these as collisions with Matthew 16:24 / Luke 9:23 ("If any man will come after me…"). Generic "follow me" / "come with me" / "come and follow me" alone are also DELIBERATELY OMITTED — they fire on Matthew 9:9 (Matthew the tax collector), John 1:43 (Philip), Luke 9:59 (would-be disciple), John 21:19 (post-resurrection Peter). Every entry now contains "fishers" / "fish for men/people" / "left their nets" / "Peter and Andrew" / "casting a net into the sea" or another distinctive Matt 4:19-only signature. Per v0.7.117 dispatch table: hand-curated EXACT → conf 0.95, source `'semantic'` → BIBLE REFERENCE QUOTED column → clears `SEMANTIC_AUTO_LIVE_MIN = 0.50` AND v0.7.120 high-conf read-lock floor (≥ 0.85), so it auto-fires AND sticks for the full 8 s sticky window. Verified: `pnpm exec tsc --noEmit` clean.

-   **Matthew 4:19 "Fishers of Men" Paraphrase Detection (v0.7.147)**: Operator screenshot https://imgur.com/a/<v0.7.147> — preacher said "Come with me. I will make you fishers of men." (paraphrase of Matthew 4:19 "Follow me, and I will make you fishers of men."). Verse landed in SCRIPTURE FEED HISTORY but NEVER appeared in BIBLE REFERENCE QUOTED column and never auto-fired. **Root cause**: hand-curated `RAW_CATALOGUE` in `src/lib/bibles/preacher-phrases.ts` has zero entries for Matthew 4:19 — so the local fast-path missed entirely. The auto-derived 5-7-word slice path of `POPULAR_VERSES_KJV` may have caught "make you fishers of men" but auto-derived FUZZY = conf 0.42, source `'suggestion'` (per v0.7.117 dispatch table at speech-provider.tsx L1685-1697) → never auto-fires. The AI cosine path (`/api/scripture/semantic-match` at L1882) either landed in the 0.50-0.54 dead band that gets dropped by the L1935 noise floor (`if (m.score < 0.55) continue`) or scored just above and briefly painted then aged out of `detectedVerses`. **Fix in `preacher-phrases.ts` RAW_CATALOGUE** — added 14 hand-curated phrase aliases for Matthew 4:19 covering all common pulpit paraphrases: punchline-only (`fishers of men`, `make you fishers of men`, `i will make you fishers`, `i will make you fishers of men`), opening variants (`come with me i will make you fishers of men`, `come with me and i will make you fishers of men`, `come follow me and i will make you fishers of men`, `follow me and i will make you fishers of men`, `come ye after me`, `come after me`), and narrative summaries (`jesus called peter and andrew`, `jesus called the first disciples`, `calling of the first disciples`, `jesus calls the disciples`). Per v0.7.117 dispatch: hand-curated EXACT → conf 0.95, source `'semantic'` → lands in BIBLE REFERENCE QUOTED column → clears `SEMANTIC_AUTO_LIVE_MIN = 0.50` AND clears the v0.7.120 high-conf read-lock floor (≥ 0.85), so it auto-fires AND sticks for the full 8 s sticky window. No threshold tuning needed — same approach used for "Stephen was stoned to death" (v0.7.115) and the "silver and gold I have none" Acts 3:6 cluster (v0.7.120). Verified: `pnpm exec tsc --noEmit` clean.

-   **Bundled NDI Runtime — "Just Works" Like Wirecast/vMix (v0.7.146)**: Operator follow-up to v0.7.145 — even with the new prominent "Download NDI Tools" button, customers worldwide still hit a one-time install friction step before NDI worked. Operator quote: "I need it to work on users app without Download NDI Tools or installing NDI. make it work just like Wirecast and vMix". On re-reading the NDI SDK redistribution license we confirmed integrated applications **are** allowed to ship the runtime DLL — vMix, Wirecast, OBS Studio, Resolume, Streamlabs all do exactly this. **Fix**: (1) operator uploaded `Processing.NDI.Lib.x64.dll` (NDI 6 runtime, 28 MB — size grew vs older versions because NDI 6 ships AVX2/AVX512 paths + HX codec support inline) → placed at `artifacts/imported-app/build-resources/ndi/Processing.NDI.Lib.x64.dll`. (2) `electron-builder.yml` `extraResources` adds `from: build-resources/ndi → to: ndi` so it lands at `process.resourcesPath/ndi/Processing.NDI.Lib.x64.dll` after install. (3) `electron/ndi-service.ts` `findNdiDll()` reordered: explicit `NDI_DLL_PATH` override → BUNDLED path via `process.resourcesPath/ndi/` (NEW, takes precedence over any system install so we pin to a known-good copy) → dev-mode fallback to source `build-resources/ndi/` via `__dirname` walks (so `electron .` from artifact root finds it without packaging) → legacy `NDI_RUNTIME_DIR_V*` env vars + `C:\Program Files\NDI\…` paths kept as a safety net for the pathological "bundled DLL got corrupted" case. (4) `src/components/views/ndi-output-panel.tsx` — entire amber "NDI runtime not detected" card with v0.7.145's Download/Re-check buttons GONE; `CardDescription` no longer ever reads "NDI runtime not detected". `available` still consumed for `ndiOk` to disable the Stop/Start button in the pathological corrupted-DLL case (quieter and accurate failure mode); `unavailableReason` and `AlertTriangle` imports removed (unused). Installer .exe grows ~28 MB (compresses to ~12-15 MB with LZMA `compression: maximum`). v0.7.145 cross-machine cloud-sync work unchanged — fixes are independent. Verified: `pnpm exec tsc --noEmit` clean.

### Older releases — guard-rails only (full text in `artifacts/imported-app/CHANGELOG.md`)

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
