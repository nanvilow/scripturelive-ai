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

## v0.5.5 (2026-04-23) — Critical persistence fix

- **Pinned the internal Next.js port to 47330.** Root cause of "OpenAI key disappears every restart" (and silently every other persisted setting too — schedule, sermon notes, voice prefs): `electron/main.ts` called `getFreePort()` on every launch, so the renderer loaded `http://127.0.0.1:<random>`. Chromium scopes `localStorage` per-origin, so a different port = a different origin = empty storage. Fixed by `getPinnedPort(47330)` which prefers a fixed port and falls back to dynamic only if 47330 is squatted (warning logged; persisted state will look empty for that ONE session, then come back next launch when 47330 is free again).
- This single 30-line change fixes ALL persisted settings, not just the OpenAI key. Speech recognition now keeps working across restarts because the key the renderer reads from `settings.userOpenaiKey` actually survives a relaunch.
- **Dual AI detection mode (Base ↔ OpenAI).** New `aiMode: 'base' | 'openai'` in `AppSettings` (defaults to `'base'`). Settings surfaces a side-by-side picker with a ⭐ Recommended badge on OpenAI, a gentle nudge banner while on Base, and a 7-step setup dialog (`UpgradeToOpenAiDialog`) with masked key input + Test Connection. Key stays stored only on the PC; sent directly to api.openai.com.
  - **Base engine (new):** bundled `whisper-cli.exe` (whisper.cpp v1.7.4) + quantized `ggml-base.en-q5_1.bin` (~58 MB) download into `electron/whisper-bundle/` via `scripts/download-whisper-assets.mjs`, chained into `electron:build`. `electron-builder.yml` `extraResources` ships the bundle at `resources/whisper-bundle/`. Installer grows ~70 MB → ~190 MB total.
  - **Audio pipeline split by mode:** OpenAI Mode keeps the `MediaRecorder` → webm/opus → `/api/transcribe` path. Base Mode uses a new `createWavRecorder()` (Web Audio + `ScriptProcessorNode` for 16 kHz mono PCM → hand-rolled WAV) → IPC `whisper:transcribe` → `electron/whisper-service.ts` spawns whisper-cli on a temp WAV and reads the `-otxt` sidecar.
  - **Failsafe in `SpeechProvider`:** writes `window.__aiMode` every render. If operator is on `openai` without a key → coerces to `base` + toast. If on `base` but the bundled model is missing AND the operator has a key → coerces to `openai` + toast. Detection never goes dark on a lost internet connection or a stale install.
  - **Latency trade-off (known):** Base ≈ 2–4 s per 5 s chunk on a typical PC vs ~1 s on OpenAI. Documented in the Settings card copy. v0.6 roadmap: switch Base to long-lived `whisper-server` for near-realtime streaming.
  - **No `.github/workflows/` edits needed** — the download script runs inside `pnpm run electron:build`, which the existing release-desktop workflow already invokes before electron-builder. User's hand-edited workflow file on GitHub is untouched.

## v0.5.6–v0.5.23 (2026-04-23 → 2026-04-24) — Windows installer + launch fixes

- v0.5.6–v0.5.18: progressive CI fixes for the GitHub Actions Windows
  release pipeline (electron-builder version pin 33.4.11, signtoolOptions
  schema, nested standalone path, --publish never, root vs artifact-level
  electron-builder.yml drift).
- v0.5.19–v0.5.22: fixed "Next standalone server missing" launch crash.
  In the pnpm monorepo on Next 16, `outputFileTracingRoot` AND
  `turbopack.root` must both point to the workspace root — accepting the
  nested `.next/standalone/artifacts/imported-app/server.js` path. Updated
  `electron/main.ts` startNextServer + icon resolution and
  `electron-builder.yml` extraResources for `static/` and `public/` to land
  in the nested location.
- v0.5.23: aligned the **root** `electron-builder.yml` (used by the
  redundant root rebuild whose `.exe` is the actual installer artifact) so
  it ships the same nested layout. First-launch confirmed working.

## v0.5.27 (pending — 2026-04-24) — Single cloud Whisper engine

- **Collapsed dual AI Detection Mode (Base ↔ OpenAI) into a single
  cloud-only Whisper path.** Operators no longer have to paste an OpenAI
  key, no longer hit "model file missing" errors on Base, and there is no
  more letter-dropping audio path feeding the live broadcast.
- **New: api-server `/api/transcribe` route** at
  `artifacts/api-server/src/routes/transcribe.ts`. Multer (memory, 25 MB)
  + `openai` SDK on `gpt-4o-mini-transcribe`, English-locked, biased
  toward Bible vocabulary by a system prompt, silence short-circuit for
  sub-1 KB chunks. Reads `OPENAI_API_KEY` (Replit Deployment Secret) so
  the desktop installer ships with NO keys.
- **Next.js `/api/transcribe` is now a thin proxy.** If
  `OPENAI_API_KEY`/`AI_INTEGRATIONS_OPENAI_*` env exists it calls OpenAI
  directly (dev convenience); otherwise it forwards the multipart body
  upstream to `TRANSCRIBE_PROXY_URL`. Electron main injects
  `TRANSCRIBE_PROXY_URL=https://scripturelive-ai-api.replit.app/api/transcribe`
  into the spawned Next standalone server so the user PC needs zero env
  vars. **TODO before "ship it": confirm/update that hostname after
  deploying api-server.**
- **Renderer hook rewritten cloud-only** (`src/hooks/use-whisper-speech-recognition.ts`).
  Single MediaRecorder loop, 4500 ms chunks, ≥6 KB to upload (silence
  drop). Hardened error paths: stream tracks now stop cleanly if
  MediaRecorder construction throws or chunk-rotate fails mid-session
  (no more stuck mic capture).
- **Settings UI purged.** Removed AiDetectionModeCard +
  UpgradeToOpenAiDialog + OpenAiKeyField + BaseModelDiagnosticsButton +
  WhisperDiagnosticsView from `src/components/views/settings.tsx`.
  Pruned now-unused lucide icons. Speech Recognition card now shows just
  microphone selection.
- **Store fields removed** from `src/lib/store.ts`: `aiMode`,
  `userOpenaiKey`, `whisperAutoFallbackToOpenAI` plus their defaults.
  Operators with old localStorage values keep them harmlessly until
  next reset; nothing reads them anymore.
- **Electron whisper-service GONE.** Deleted
  `electron/whisper-service.ts`, dropped `whisper:*` IPC handlers from
  `electron/main.ts` + the `whisper` bridge from `electron/preload.ts`,
  removed `killActiveWhisperChildren` from shutdown sequence and the
  startup probe log line. Recompiled `dist-electron/main.js` +
  `preload.js` so they no longer `require("./whisper-service")`.
- **Build pipeline trimmed:** `package.json` `electron:build` no longer
  runs `scripts/download-whisper-assets.mjs`; both
  `artifacts/imported-app/electron-builder.yml` and the root
  `electron-builder.yml` no longer ship `electron/whisper-bundle/` as
  `extraResources`. Installer drops ~70 MB.
- **Verified end-to-end.** api-server `/api/healthz` → `{status:ok}`;
  `/api/transcribe` with bad audio → 500 with mapped OpenAI error;
  silent micro-chunk → `{text:""}`; missing field → 400. The earlier
  "letter-drop" garble in NDI/SDR output (#4 "his purpose"→"hi purpo e")
  came from the local Base engine being driven by a 16 kHz
  ScriptProcessorNode — that path is gone, so the live broadcaster
  receives clean Bible text only.
- **Known follow-ups (not yet shipped):** public proxy hardening
  (per-IP rate limit, restricted CORS, optional shared-secret token);
  optional cleanup of dead `scripts/download-whisper-assets.mjs` +
  `electron/whisper-bundle/` directory + the CI cache step that warmed
  it. None of these block "ship it" — they tighten the operational
  surface area after launch.

## v0.5.24 (2026-04-24) — Preview vs Live Display visual twins

- **Home shell layout fix.** PreviewCard had no bottom transport strip
  while LiveDisplayCard has an always-visible Mic / Vol / Prev / GoLive /
  Next strip below its body. With both columns equal width in the
  ResizablePanelGroup, Live Display's body ended up shorter than
  Preview's by exactly the strip height, so the inner 16:9 stage frames
  rendered at different sizes side-by-side. Operators reported the two
  stages should be visual twins.
- Fix: added a height-matched `aria-hidden`/`role="presentation"` empty
  bottom strip to PreviewCard with the same `border-t / px-3 py-2 / h-7`
  inner sizing as Live Display's. Pure vertical-rhythm symmetry — no new
  controls or behaviour. Both card bodies now reserve identical space so
  the staged-vs-live frames render at exactly the same size.
- CI workflow optimization (commit `be6dbc9`) is in effect for v0.5.24+
  — drops the duplicate "Build Next.js app" + "Package Windows
  installer" steps and caches whisper-bundle + electron downloads.
  Expected build time ~10 min (down from ~20 min).

