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
-   **High-Conf VS High-Conf Read-Lock Escape Hatch (v0.7.128)**: Operator screenshot https://imgur.com/a/uf6ndTK showed the projector stuck on **Deuteronomy 2:1** @ 100 % (came from a Chapter Navigator lookup that pre-loaded the chapter — explicit pipeline tagged it 1.0) while the preacher was actively quoting "My help cometh from the Lord" → COL 2 "Bible Reference Quoted" detected **Psalm 121:2** @ 95 % (semantic, hand-curated preacher-phrase EXACT). The right verse was sitting RIGHT THERE in the Detected Verses card at 95 % but couldn't reach the projector. Root cause: v0.7.120's `LIVE_HIGH_CONF_LOCK` was an absolute lock — `if (liveIsHighConf) return false` for ALL cross-ref candidates inside the 8 s sticky window, no escape clause. v0.7.120 was designed to stop the OPPOSITE bug (a verbatim 0.85 hand-curated EXACT being hijacked by a spurious 0.65 regex near-miss) but it over-fired here: a navigation/lookup hit at 1.0 in COL 1 indistinguishable from a real quotation, so it locked just as hard. **Fix** in `verse-auto-live.ts` `passesReadLock()`: when `liveIsHighConf` is true, the lock now yields IFF the new candidate is ALSO ≥ `LIVE_HIGH_CONF_LOCK` (0.85). Two independent high-conf detections from different columns is a near-zero-false-positive signal that the preacher has demonstrably moved on — newer wins. A weak detection (semantic 0.65, explicit near-miss) still cannot break a high-conf live verse, so v0.7.120's protection against navigation/regex spurious hits hijacking a verbatim quote stays intact. The same-reference no-flicker guard runs FIRST so flicker prevention is unaffected. Manual operator click in the Detected Verses card still overrides because that path doesn't go through this gate. Two regression tests added: (a) the operator scenario — Deut 2:1 @ 1.0 explicit gets correctly displaced by Psalm 121:2 @ 0.95 semantic; (b) inverse — Exo 22:18 @ 0.95 semantic still NOT displaced by a 0.70 explicit near-miss.
-   **Single-Renderer Output Preview + Suggested-Verses Gap Closure (v0.7.127)**: Two operator-screenshot-driven fixes shipped together. **Part 1 — Single-renderer Preview iframe**: previous Settings-page `<OutputPreview>` was a hand-rolled React mirror of `/api/output/congregation` that drifted on every render-affecting setting (font-size formula was unified in v0.7.124 but reference-opacity, lower-third box width, bg-overlay, displayRatio, line-clamp etc still diverged). **Fix**: `<OutputPreview>` is now a thin `<iframe src="/api/output/congregation?preview=1[&fullScreen=1|&lowerThird=1]">`. New `src/lib/output-payload.ts` exports `buildOutputPayload()` lifted verbatim from `output-broadcaster.tsx` so SSE broadcaster + preview iframe build IDENTICAL payloads. The route gained `IS_PREVIEW`+`FORCE_FULL` URL flags; when `?preview=1` it skips SSE/poll entirely and listens for `{__sl_preview:1, payload}` postMessages from the parent, posting back `{__sl_preview_ready:1}` as a handshake so the parent flushes its first snapshot the moment the iframe is ready. `FORCE_FULL` wins over `FORCE_LT` in the `dm` resolution chain so side-by-side "Full Screen" + "Lower Third" preview cards can pin layout per card without the operator's projector displayMode bleeding through. The preview also synthesizes a sample slide (sample → liveVerse → currentVerse → stage slide → John 3:16 fallback) and forces `blanked: false` + `showStartupLogo: false` so it always paints real-looking content even with nothing on air. Net result: the preview IS the live renderer running off-screen, byte-identical paint guaranteed for every future render-affecting setting with zero parallel maintenance. The legacy inline payload-builder in `output-broadcaster.tsx` is preserved verbatim under `if (false as boolean) { ... }` so v0.7.57's minimised-window history stays in git blame. **Part 2 — Suggested Verses 50–54% dead-gap closure**: operator screenshot diff (https://ibb.co/KcXrbF1r + https://ibb.co/7wrZkfJ) showed Matthew 4:19 painting at "52%" inside the column whose own header reads "Low-confidence guesses (10–49%)", then immediately vanishing to a "0" count card on the next render. Root cause was a triple problem: (a) `verse-auto-live.ts` had `SEMANTIC_AUTO_LIVE_MIN = 0.55` so the semantic live column rejected 50–54% hits; (b) `suggestionsFor()` capped at `< 0.50` so 50–54% wasn't in suggestions either — a dead gap with no home column; (c) `suggestionsFor()` had a `if (sourceOf(v) === 'suggestion') return true` short-circuit that bypassed the band check entirely, letting upstream taggers leak ≥0.50 'suggestion'-tagged verses INTO the column they shouldn't appear in. **Fix** mirrors v0.7.114 (which closed the same class of bug at 55–59%): lowered `SEMANTIC_AUTO_LIVE_MIN` 0.55 → 0.50; lowered the suggestion-tag threshold in `speech-provider.tsx` at L1827 (keyword-search hits) and L1984 (AI cosine matcher hits) from `< 0.55` to `< 0.50` so tag-floor == column-floor; and removed the `source==='suggestion'` bypass in `suggestionsFor()` so the 10–49% band is enforced strictly for ALL sources. Preacher-phrase auto-derived FUZZY hits (hard-coded conf=0.42 in speech-provider.tsx L1685–1689) still appear in suggestions because their confidence sits naturally inside the band — the bypass was redundant for them anyway. Auto-go-live still requires per-source stability + 1.25s anti-flicker dwell, so the lower 0.50 visibility floor does NOT mean every 50% hit fires immediately — it means the operator can SEE 50%+ semantic hits in COL 2 instead of having them disappear into a typography gap. Test suite updated: 5 boundary tests rewritten + new "v0.7.127 — source=suggestion tag NO LONGER bypasses the band" regression test asserting that a 0.52 'suggestion'-tagged verse is now correctly dropped.
-   **Branded MUI2 Installer Wizard (v0.7.126)**: Operator screenshot https://ibb.co/fzQ95pt4 showed the bog-standard NSIS oneClick mini-dialog ("Installing, please wait..." with a flat green progress bar in a tiny unbranded chrome window) — looked like a 1990s freeware installer or, worse, malware. Wirecast / vMix / OBS / Pro Presenter all use the full assisted MUI2 wizard with branded sidebar artwork and the operator wanted parity. **Fix**: flipped `nsis.oneClick: true → false` in `electron-builder.yml` and added five new branding assets in `build-resources/`: (1) `installerSidebar.bmp` 164×314 24-bit BMP3, dark navy → indigo gradient (`#0f172a → #1e3a8a`), centred 110×110 logo crop of `icon.png`, vertically-stacked "ScriptureLive / AI" wordmark in white + sky-blue (`#7dd3fc`), tagline footer + domain. (2) `uninstallerSidebar.bmp` same dimensions/layout but with red-tinted "Uninstall Wizard" footer to give the destructive flow visual differentiation. (3) `installerHeader.bmp` 150×57 BMP3, white → slate gradient with 38×38 logo and small wordmark + tagline — appears top-right on every inner wizard page. (4) `license.txt` plain ASCII EULA (10 sections covering grant, restrictions, telemetry, activation transfer, warranty disclaimer, third-party notices, termination) so the License page has actual content instead of a blank scrollbox — NSIS chokes on RTF surprises so kept it ASCII-only. (5) MUI2 customisation macros appended to `installer.nsh`: `customHeader` overrides `MUI_PAGE_HEADER_TEXT/SUBTEXT` for brand-consistent page titles; `customWelcomePage` injects a multi-line welcome paragraph mentioning version + product capabilities ($\r$\n line breaks because NSIS); `customFinishPage` retitles the finish step to "ScriptureLive AI is ready" and renames the auto-checked run-app checkbox to "Launch ScriptureLive AI now". electron-builder auto-checks the run-after-install box for us so the perceived flow is still essentially one-click: Next → I Agree → Install → Finish (4 clicks vs the previous 0, but the wizard now LOOKS professional). The pre-existing `customInit`/`customUnInit` macros (v0.7.85/v0.7.88/v0.7.122 task-kill hardening) are preserved verbatim alongside the new branding macros — they live in different lifecycle hooks so there's no conflict. **BMP format constraints**: NSIS MUI2 only reliably reads uncompressed 24-bit BMP3 across all Windows targets (BMP4/BMP5 with embedded ICC profiles fail silently to "image not found"); generated via `magick ... -depth 8 -type TrueColor BMP3:...`. Required explicit `-font /usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf` because magick on the Replit sandbox can't auto-resolve a default font. **What stays**: `perMachine: false` (still installs into `%LOCALAPPDATA%` with no UAC prompt), `allowToChangeInstallationDirectory: false` (operators don't pick install paths — power users can still pass `/D=...`), `differentialPackage: true` (incremental auto-updates still tiny), `deleteAppDataOnUninstall: false` (license keys + SQLite cache survive reinstalls), and electron-builder's auto-detected `repository.url` for GitHub Releases auto-update.
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
