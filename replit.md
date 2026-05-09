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
-   **Branded MUI2 Installer Wizard (v0.7.126)**: Operator screenshot https://ibb.co/fzQ95pt4 showed the bog-standard NSIS oneClick mini-dialog ("Installing, please wait..." with a flat green progress bar in a tiny unbranded chrome window) — looked like a 1990s freeware installer or, worse, malware. Wirecast / vMix / OBS / Pro Presenter all use the full assisted MUI2 wizard with branded sidebar artwork and the operator wanted parity. **Fix**: flipped `nsis.oneClick: true → false` in `electron-builder.yml` and added five new branding assets in `build-resources/`: (1) `installerSidebar.bmp` 164×314 24-bit BMP3, dark navy → indigo gradient (`#0f172a → #1e3a8a`), centred 110×110 logo crop of `icon.png`, vertically-stacked "ScriptureLive / AI" wordmark in white + sky-blue (`#7dd3fc`), tagline footer + domain. (2) `uninstallerSidebar.bmp` same dimensions/layout but with red-tinted "Uninstall Wizard" footer to give the destructive flow visual differentiation. (3) `installerHeader.bmp` 150×57 BMP3, white → slate gradient with 38×38 logo and small wordmark + tagline — appears top-right on every inner wizard page. (4) `license.txt` plain ASCII EULA (10 sections covering grant, restrictions, telemetry, activation transfer, warranty disclaimer, third-party notices, termination) so the License page has actual content instead of a blank scrollbox — NSIS chokes on RTF surprises so kept it ASCII-only. (5) MUI2 customisation macros appended to `installer.nsh`: `customHeader` overrides `MUI_PAGE_HEADER_TEXT/SUBTEXT` for brand-consistent page titles; `customWelcomePage` injects a multi-line welcome paragraph mentioning version + product capabilities ($\r$\n line breaks because NSIS); `customFinishPage` retitles the finish step to "ScriptureLive AI is ready" and renames the auto-checked run-app checkbox to "Launch ScriptureLive AI now". electron-builder auto-checks the run-after-install box for us so the perceived flow is still essentially one-click: Next → I Agree → Install → Finish (4 clicks vs the previous 0, but the wizard now LOOKS professional). The pre-existing `customInit`/`customUnInit` macros (v0.7.85/v0.7.88/v0.7.122 task-kill hardening) are preserved verbatim alongside the new branding macros — they live in different lifecycle hooks so there's no conflict. **BMP format constraints**: NSIS MUI2 only reliably reads uncompressed 24-bit BMP3 across all Windows targets (BMP4/BMP5 with embedded ICC profiles fail silently to "image not found"); generated via `magick ... -depth 8 -type TrueColor BMP3:...`. Required explicit `-font /usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf` because magick on the Replit sandbox can't auto-resolve a default font. **What stays**: `perMachine: false` (still installs into `%LOCALAPPDATA%` with no UAC prompt), `allowToChangeInstallationDirectory: false` (operators don't pick install paths — power users can still pass `/D=...`), `differentialPackage: true` (incremental auto-updates still tiny), `deleteAppDataOnUninstall: false` (license keys + SQLite cache survive reinstalls), and electron-builder's auto-detected `repository.url` for GitHub Releases auto-update.
-   **Styled Confirm/Alert Dialogs in License Flow (v0.7.125)**: Operator screenshot diffs (https://ibb.co/PZwwp7qN + https://ibb.co/YTt9ytv2) showed two raw Chromium dialogs — one labelled "@workspace/imported-app" with bare OK/Cancel (Move-to-PC pre-confirm) and a second native alert that revealed the activation code in plain Windows chrome (post-transfer receipt). Both were `window.confirm()` / `window.alert()` callsites in `src/components/views/settings.tsx` (lines 132/184/261) plus one more in `src/components/settings/bible-downloads.tsx:80` (Remove offline copy). Looked amateurish to congregants seated next to the operator and broke the app's otherwise-consistent Radix design system. **Fix part 1**: new `src/components/ui/confirm-dialog.tsx` ships `<ConfirmDialogProvider>` + Promise-based `useConfirm()` hook backed by Radix `<AlertDialog>` (NOT `<Dialog>` — alertdialog enforces focus trap + Esc-to-cancel + role=alertdialog semantics expected for destructive prompts; NOT toast — path-aware-toaster has been globally silenced since v0.7.114). Migration is mechanical: `if (!confirm("…")) return` becomes `if (!(await confirm({title, description, destructive}))) return`. Provider mounted INSIDE `<ThemeProvider>` in `src/app/layout.tsx` so the dialog inherits the operator's dark/light theme. Resolution latch (`resolvedRef`) prevents double-resolve on rapid clicks or onOpenChange firing twice during close animation. Description string supports `\n\n` for paragraph breaks + single `\n` for line breaks so the migrated multi-line confirm text keeps its visual rhythm. **Fix part 2**: the post-transfer code-receipt alert is more sensitive — v0.7.102 explicitly REMOVED the in-tree React `transferOpen` Dialog because rendering it after the deactivation API resolved triggered chrome-error mid-paint (license-provider's 30 s status poll mutated context just as the dialog mounted → useEffect threw against in-flight fetch with stale auth → renderer crashed). Naively swapping `window.alert` for a React Dialog would re-introduce the exact crash. Instead: handleTransfer now stashes the code in `localStorage["sl.lastTransferCode"]` (already written as a fallback since v0.7.102 — promoted to primary delivery channel), skips the alert entirely, and hard-reloads immediately. New `<TransferSuccessDialog>` mounted inside `<LicenseProvider>` (alongside `<ActivationSuccessDialog>` from v0.7.122) reads the payload on the FRESH page load — same proven pattern that v0.7.122 used for the activation receipt. Fresh page has a settled license context post-deactivation so the v0.7.102 race cannot recur. Dialog shows preserved-time + monospace `<code class="select-all">` + Copy button + retry-friendly clipboard write; tracks once-per-code via `localStorage["sl-celebrated-transfer"]` so it won't re-pop on subsequent launches; payload expires after 10 min via `at` timestamp. Net result: every destructive prompt in the License & Bible flows now uses the app's own dark-themed Radix UI; the Chromium "@workspace/imported-app" chrome is gone from operator-facing surfaces. The `transferOpen` defensive-dead-code Dialog from v0.7.102 is left untouched as a safety net.
-   **Preview ↔ Output Parity for Full-Screen Verses (v0.7.124)**: Operator screenshot diff — the "PREVIEW (FULL SCREEN)" thumbnail in `Settings → Display & Output` painted the verse as a small centred banner inside the preview card while the actual second-screen output painted the same verse as huge text filling the entire frame. Two surfaces, identical settings, completely different layouts → operators couldn't trust the preview before going live. Root cause was a triple mismatch in `src/components/settings/output-preview.tsx`: (1) **font-size formula** — preview body used an ad-hoc `clamp(${10·sizeMult}px, min(${4·sizeMult}cqw, ${8·sizeMult}cqh), ${28·sizeMult}px)` while the real `/api/output/congregation` `fitFont()` uses `clamp(1.1rem, ${bandText·scale}vw, 7rem)` with `bandText` = 4.0/4.6/**5.2**/6.0 per fontSize bucket and a `7rem` (112 px) cap. At `lg` + textScale 1, the real renderer paints at ~112 px on a 1920 px screen (~6 % of viewport width); the preview capped at ~31 px in a 320 px-wide card (~10 % of card but visually tiny). (2) **textScale default** — preview used `?? 0.9`, real renderer uses `?? 1` (route.ts line 653), so even fresh installs saw a ~10 % size discrepancy before the operator touched anything. (3) **wrapper padding** — preview used `padding: 6% 6%` while the real `#output` is `100vw × 100vh` with no padding, pushing preview text inward into a banner-inset look. **Fix**: new shared `fullScreenClamp({ totalChars, fontSize, textScale })` helper exported from `src/lib/fonts.ts` — mirrors `fitFont()` exactly (same bandText map, same totalChars shrink schedule, same `FS_MULT[fontSize] × textScale` double-count, same `clamp(1.1rem, …, 7rem)` envelope) but emits `cqw` instead of `vw` so it composes with the preview's `container-type: size` wrapper. Reference clamp also unified to `clamp(.85rem, 1.4cqw, 1.6rem)` matching the real `.slide-reference` rule. Default `textScale` flipped 0.9 → 1. Wrapper padding trimmed 6% → 3%. Lower-third path is untouched — it already shared `lowerThirdClamp()` from v0.7.x. Net result: identical proportions on both surfaces because `cqw` inside a container-typed box equals `vw` inside the viewport, so the same coefficient × scale produces the same fraction of the rendered surface. Long passages still progressively shrink on both renderers via the shared shrink schedule. Lower-third surfaces, NDI surface, and `fitFont()` itself are unchanged — risk-isolated to the preview component.
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
-   Auto-live confidence thresholds and stability gates are crucial for projection; consult `verse-auto-live.ts` for current logic. As of v0.7.109: explicit ≥0.60, semantic ≥0.55, suggestions 0.10-0.49, **1.25 s anti-flicker dwell** (previous verse stays live), newest-first ordering.
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
