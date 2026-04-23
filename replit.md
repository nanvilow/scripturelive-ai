# Workspace

## User Preferences (STANDING RULES — never skip)

- **After EVERY fix / version bump, build and present a fresh ZIP** of
  `artifacts/imported-app/` so the user can download it and run
  `BUILD.bat` on their Windows PC. Naming convention:
  `exports/ScriptureLive-AI-v<version>-source.zip`. Exclude
  `node_modules`, `.next`, `dist-electron`, `release`, `.turbo`, `.git`,
  `*.tsbuildinfo`, `build-log.txt`. Always use the `present_asset` tool
  to surface the zip — never assume the user will find it on their own.
- Bump the `BUILD.bat` banner version string to match the current
  `package.json` version on every release.

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies. The root preview now runs an imported Next.js app named "Imported App" from `artifacts/imported-app`.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Imported app**: Next.js 16, Prisma, SQLite (`artifacts/imported-app/db/custom.db`)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/imported-app run dev` — run the imported Next.js app

## Imported App Notes

- The uploaded archive was imported into `artifacts/imported-app`.
- The archive's `.env` and `.git` contents were intentionally not imported.
- The imported app owns both `/` and `/api` preview routes so its built-in Next API routes work.
- The starter API server was moved from `/api` to `/__api-server` to avoid route conflicts.
- Wireless congregation output is served from `/api/output/congregation` and receives live slide updates via `/api/output` Server-Sent Events.
- Browser-only NDI: open the congregation output page fullscreen and capture that browser window with NDI Tools, OBS, vMix, or Wirecast.
- Built-in NDI (desktop app): an Electron wrapper in `artifacts/imported-app/electron/` adds a native NDI sender via the `grandiose` binding. The renderer talks to the main process through a `contextIsolation` preload. Build with `pnpm --filter @workspace/imported-app run package:win` (on Windows) or `package:mac` (on macOS). See `artifacts/imported-app/DESKTOP_BUILD.md` for the full guide.
- Public desktop downloads: `/download` is a polished OS-detecting download page; it reads `public/downloads/manifest.json` and streams files via `/api/download/<platform>`. Drop built `.exe` / `.dmg` files into `public/downloads/` (or set `externalReleaseUrl` in the manifest to redirect to GitHub Releases). The dashboard shows a prominent "Download for Windows / macOS" CTA linking to it.
- Branding: the new ScriptureLive AI logo lives at `artifacts/imported-app/public/logo.png` (1664x928 PNG). Square icons (favicons + Electron app icon) are generated from it via `sharp` into `public/icon-{16,32,192,512}.png`, `public/apple-touch-icon.png`, and `build-resources/icon.png` (used by `electron-builder` for the installer / window icon).

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## v0.5.3 (2026-04-22) — Whisper speech + UX polish

- **Whisper speech transcription for the desktop app.** Chromium-in-Electron has no embedded Google STT key, so the browser `webkitSpeechRecognition` path bounces forever inside packaged builds. Added `src/app/api/transcribe/route.ts` (multipart audio → OpenAI `gpt-4o-mini-transcribe` via the Replit AI Integrations proxy — no user API key needed) and `src/hooks/use-whisper-speech-recognition.ts` (rotates a MediaRecorder every 4.5 s and posts each chunk to `/api/transcribe`). `SpeechProvider` now calls BOTH the browser hook and the Whisper hook (Rules of Hooks safe — `IS_ELECTRON` is computed once at module load) and routes commands to whichever engine matches the runtime. The selected microphone id is mirrored to `window.__selectedMicrophoneId` so the hookless Whisper engine can read it.
- **NDI single-toggle button (item #1).** New `NdiToggleButton` in `easyworship-shell.tsx` calls `desktop.ndi.start/stop` directly on click. ON AIR state is shown by a red glowing dot (CSS `box-shadow` halo). Advanced settings (source name, status) live in a small chevron-popover next to the toggle.
- **Top-bar polish.** Removed `Clear Schedule` button from the toolbar (item #14). Removed the bottom-bar `⏎ Live · ←→ Nav · Esc Clear` hint strip. Moved the master volume control out of the toolbar and into the Live Output panel header (item #11) — same `GlobalVolumeControl` component, just rendered next to the slide it actually affects.
- **Live Display SIZE slider removed (item #10).** Operators kept dragging it accidentally and shrinking the live output mid-service. Live preview now always renders at the natural slide aspect.
- **Suppressed `Connected (poll)` flash on the congregation window (item #8).** SSE already shows the badge once on connect; the 1.5 s poll runs silently underneath.

## v0.5.4 (2026-04-23) — Operator-supplied OpenAI key + UX cleanup

- **Speech recognition now works on the customer's PC.** Root cause: `/api/transcribe` only honored `AI_INTEGRATIONS_OPENAI_*` env vars (Replit-only). The packaged installer has no such env vars, so every chunk returned 503 "Transcription service is not configured". Fix: route now resolves credentials in priority order — (1) `X-OpenAI-Key` header from the renderer, (2) Replit proxy env vars (dev), (3) `OPENAI_API_KEY` env var (self-hosted). Renderer reads the operator's key from `settings.userOpenaiKey` (mirrored to `window.__userOpenaiKey` by `SpeechProvider`) and sends it on every transcribe POST. Settings → Voice Recognition has a new password-style input with Save / Test buttons; the Test button posts a sub-1 KB blob so it verifies the key path WITHOUT spending a Whisper credit.
- **NDI dropdown removed.** The chevron popover next to `NdiToggleButton` is gone. Live operations are one click on / one click off — the advanced settings live in Settings → NDI.
- **Settings → Help & Updates card.** New section shows current version (v0.5.4), a Check for Updates button (calls `window.scriptureLive.updater.check()` in Electron via the existing preload bridge; opens GitHub Releases in browser as fallback), and three quick links to docs / troubleshooting / bug report.
- **`clientCache` in `/api/transcribe` is LRU-capped at 8 entries** so a long-running dev server can't accumulate stale OpenAI client objects.

Deferred to v0.5.5 (told user explicitly): NDI audio capture, media sound monitor, smooth media transitions, full Preview/Live independence, send-to-live stops preview, lower-third re-fit, custom-background preview shrink, resizable panels, HIDDEN→output broadcast wire-through, auto-close trays, detected-verse → Chapter Navigator focus.
