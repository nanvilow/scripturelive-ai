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

-   **v0.7.157 — OBS Card Always Visible + Cross-Device Admin Sync UI**: Operator escalation: (a) "where is the OBS Browser Source URL card you said you added in v0.7.153? There is nothing there" — the card existed but was wrapped in `{(localObsUrl || lanObsUrls.length > 0) && (…)}` which evaluates falsy in the web build (no Electron IPC bridge → `serverInfo` stays null → both URLs are null → entire card silently disappears). Same hide also fires on Electron renderers that mount before `app:get-server-info` IPC settles, and on PCs whose bundled Next bound port=0. (b) Cross-device admin sync (v0.7.153) was silently disabled because `adminSyncCode()` in `src/lib/licensing/cloud-sync.ts` returns null when `cloudAdminCode` is unset, and there was NO UI to set it — operator never knew they had to paste the cloud's masterCode. **Fix A (OBS card)**: introduced `browserFallbackUrl = `${window.location.origin}/api/output/congregation?transparent=1`` in `ndi-output-panel.tsx`; `localObsUrl` falls through to it when `serverInfo` is null/port-0; the card's outer `&&` guard removed entirely (always renders). Added `usingBrowserFallback` flag that surfaces an amber explainer when we're not getting LAN IPs (the web build can't enumerate the user's PC interfaces — that's an Electron-only ability). Empty-`lanObsUrls` Electron path also gets an amber "no LAN IPv4 detected — connect to Wi-Fi" explainer instead of the silent omission. **Fix B (admin sync UI)**: NEW `src/app/api/license/admin/cloud-sync-test/route.ts` — admin-gated POST that pings the cloud's `/api/license/cloud/admin-snapshot` with the locally-saved `cloudAdminCode` and returns a structured `{ok, stage: 'disabled'|'unreachable'|'unauthorized'|'connected', detail, cloudBase, pulledCounts}` so the UI can render a real status badge and an actionable error string. NEW "Cross-Device Admin Sync" card in admin-modal.tsx Settings tab (rendered between Access&Trial and MoMo Recipient sections) — input field for `cloudAdminCode` (round-tripped on reload via `cfg.config.cloudAdminCode` — operator can SEE what's saved without re-pasting), Test connection button (auto-saves the field FIRST so the test reads the latest value), colored stage badge (emerald=connected, rose=unauthorized, amber=unreachable, zinc=disabled), and a result panel with the cloud's snapshot row counts on success. Wired `cloudAdminCode` into `saveCfg()` body (always sent — empty ⇒ null disables sync, non-empty ⇒ saved verbatim). `Globe` lucide-react icon added to imports. **Files**: `src/components/views/ndi-output-panel.tsx` (browserFallbackUrl + always-render), `src/components/license/admin-modal.tsx` (state + UI + saveCfg wiring + Globe import + AdminConfigResp type extension), NEW `src/app/api/license/admin/cloud-sync-test/route.ts`. Tests: tsc --noEmit clean. Verified the v0.7.156 regex hotfix is still intact (`node --check` on extracted inline script of `/api/output/congregation` PASSES). `package.json` + `BUILD.bat` banner bumped to 0.7.157. **GUARD-RAIL**: any future "card disappears" operator complaint should look first for an outer `&&` guard on optional Electron-IPC data — same root cause as this one. The `browserFallbackUrl` pattern (use `window.location.origin` when IPC data is null) is the canonical fix for hybrid web/Electron renderers. **Cloud MUST still be redeployed from this release** (carries v0.7.153's `/api/license/cloud/admin-snapshot` route) BEFORE the new Test connection button can return "connected" — without the redeploy operators will see "unreachable" or HTTP 404.

-   **v0.7.158 — Single-Renderer Architecture Across ALL 6 Surfaces (Main Preview + Live Display Now Use Iframe)**: Operator escalation w/ screenshots: Settings PREVIEW, Wirecast NDI feed, Main Preview pane, Live Display pane, NDI Live Preview, Browser Source URL output were all visually different despite "same settings" — lower-third bar in different positions, different fonts, different sizes, sometimes background image visible sometimes not. Root cause: although v0.7.127 introduced `<OutputPreview>` (a thin iframe of `/api/output/congregation?preview=1`) and Settings + NDI Live Preview were migrated to it, the **Main Preview pane and Live Display pane in `logos-shell.tsx` still used a hand-rolled React mirror** (`DisplayStage` function, lines 717-852, plus a giant inline IIFE composite at lines 1493-1703) that re-implemented font clamps, lower-third geometry, container queries, background image rendering, and typography pipeline IN PARALLEL — every settings axis was duplicated and inevitably drifted from the canonical congregation route. **Fix**: extended `<OutputPreview>` with three new optional props in `src/components/settings/output-preview.tsx`: `slideOverride?: Slide | null` (splices a caller-supplied slide into the broadcaster payload — used by Main Preview to send the queued `previewSlide` through the iframe), `mirrorLive?: boolean` (returns `buildOutputPayload()` unmodified — used by Live Display so `blanked` and `showStartupLogo` come from real state, making the pane byte-identical to the projector), `hideModeBadge?: boolean` + `className?: string` + `aspectOverride?: string` (cosmetic). Then DELETED the entire `DisplayStage` function (~146 lines) AND the entire Live Display IIFE composite block (~210 lines). Replaced PreviewCard's DisplayStage usage with `<OutputPreview slideOverride={previewSlide} hideModeBadge>` wrapped in StableStage. Replaced Live Display's IIFE with `<OutputPreview mirrorLive hideModeBadge aspectOverride="16 / 9">` wrapped in StableStage(scale={actualSize}). Also DELETED the React-level startup-logo overlay in Live Display (lines 1463-1478) — the congregation route renders the identical "Scripture AI / Powered By WassMedia" splash itself when `showStartupLogo` is true (route.ts ~line 159 + ~600), and keeping the React copy would double-render the text. Removed now-orphaned imports (`SlideThumb`, `getFontStack`, `isVideoBackground`). **Net result**: all SIX surfaces — Settings PREVIEW (FULL SCREEN + LOWER THIRD), Main Preview pane, Live Display pane, NDI Live Preview, Browser Source URL, Second Screen — render through the IDENTICAL `/api/output/congregation` route off the IDENTICAL `buildOutputPayload()` payload. Any new render-affecting field added to that helper is honoured everywhere automatically. **Files**: `src/components/settings/output-preview.tsx` (+58/−5: new props + slideOverride/mirrorLive payload branches + className/badge gating), `src/components/layout/logos-shell.tsx` (+~40/−~360: removed DisplayStage + Live IIFE + startup-logo overlay; replaced both panes with `<OutputPreview>`; pruned unused imports). Tests: tsc --noEmit clean. `package.json` + `BUILD.bat` banner bumped to 0.7.158. **GUARD-RAIL**: never re-introduce a parallel React copy of the slide composite in any pane — every verse-display surface MUST go through `<OutputPreview>` (or `<NdiPreviewSurface>` which is the same iframe with `?ndi=1&transparent=1`). The two new props (`slideOverride` / `mirrorLive`) cover every legitimate need any caller has: previewing a queued slide vs. mirroring live state. If a future operator wants a specific tweak in one pane, extend `buildOutputPayload()` or add another flag to `<OutputPreview>` — do NOT hand-roll a React mockup.

-   **v0.7.156 — HOTFIX: Restore Output Window**: regex inside route.ts giant template literal must double-escape backslashes (`\\.`, `\\/`, `\\d`, etc.); single-escape gets eaten by the surrounding template literal and breaks `render()` parse → output stuck on splash. Verify with `node --check` on extracted inline script after every regex edit.

-   **v0.7.155 — Video Files Allowed As App Background**: `isVideoBackground(url)` helper in `src/lib/utils.ts` mirrored as inline `isVideoBg()` in route.ts. Six surfaces use `<video autoPlay loop muted playsInline>` branch. `safeBgUrl()` allowlist (`http://`, `https://`, `data:image/`, `data:video/`, `/`) + `escAttr()` close XSS in the unauthenticated `/api/output/congregation` state-push. Inline comments inside the giant template literal MUST use `/* */` not `//`, and never embed an unescaped backtick.

### Older releases — guard-rails only (full text in `artifacts/imported-app/CHANGELOG.md` and git history)

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
