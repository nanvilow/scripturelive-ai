# ScriptureLive AI — Handoff Bundle

**Version at handoff:** v0.7.101
**Repository:** https://github.com/nanvilow/scripturelive-ai
**Stack:** Next.js 16 (App Router) + React + TypeScript + Electron 38 + Tailwind + shadcn/ui + Prisma + Zustand
**Target:** Windows desktop app for live Bible projection / worship

---

## What this app does

ScriptureLive AI is a Windows desktop worship app that helps churches project Bible verses live during services. It runs Next.js inside an Electron shell and adds:

- **Live transcription** (Deepgram) of the preacher's voice → auto-detects scripture references → sends them to the projector screen.
- **Lookup** by reference (John 3:16) or full-text search.
- **Secondary screen** output (NDI + window mode).
- **Self-hosted licensing** with MoMo (Mobile Money) payments, lossless deactivation, and PC-to-PC license transfer.
- **30-minute usage-based free trial** for unactivated installs.

---

## Architecture

```
artifacts/imported-app/
├── electron/                  ← Electron main process (window mgmt, IPC, crash recovery)
│   ├── main.ts                ← Entry point — installCrashMask, setupFileLogging
│   └── preload.ts             ← Bridge for renderer ↔ main
├── src/
│   ├── app/                   ← Next.js App Router
│   │   ├── api/license/*      ← Activation, deactivate, plans, admin, telemetry
│   │   └── ...                ← All UI routes
│   ├── components/
│   │   ├── license/           ← subscription-modal, license-provider, lock-overlay
│   │   ├── views/settings.tsx ← Settings screen (Move/Deactivate buttons live here)
│   │   └── ...
│   ├── lib/                   ← Shared utilities
│   ├── data/bibles/           ← Bible JSON (KJV, NIV, ESV)
│   └── hooks/
├── prisma/                    ← Schema for local SQLite db (telemetry, training)
├── package.json               ← v0.7.101
├── BUILD.bat                  ← One-click Windows build script
├── electron-builder.yml       ← Windows installer config
└── README.md / DESKTOP_BUILD.md / DEPLOY.md
```

---

## Recent work (most recent first)

**v0.7.101 — Activate-path hard reset + Settings UI consolidation (THIS BUILD)**
- Operator confirmed v0.7.100's Deactivate flow worked but Activate still produced "This page couldn't load" Chromium chrome-error.
- Root cause: success modal rendered with stale React tree before user could click Close, downstream useEffect crashed renderer.
- Fix: `submitActivation` in `src/components/license/subscription-modal.tsx` now calls `window.location.assign('/')` immediately after the API confirms success, with `return` to skip `setReceipt/setPhase/refresh`. The receipt UI is sacrificed — operators see their active subscription on the reloaded Settings page.
- 8 s safety `setTimeout(() => { setBusy(false); setPhase('active') }, 8000)` preserves modal escape if navigation is vetoed.
- UI: removed dedicated "Move to Another PC" button, renamed "Deactivate on this PC" → "Move to Another PC" pointing at `handleTransfer` (always shows code in copy-friendly dialog). Single button, no operator confusion.
- `handleDeactivate` in `src/components/views/settings.tsx` kept as defensive dead code.

**v0.7.100 — Synchronous hard reset (architect-found CRITICAL fix)**
- v0.7.99 had a 700 ms toast-delay in handleDeactivate that reintroduced the chrome-error window.
- Architect code review caught it before operator downloaded.
- Removed all setTimeout delays, synchronous `window.location.assign('/')` everywhere.

**v0.7.99 — Hard-reset after license state changes**
- Replaced soft `await refresh()` with hard window reload after Deactivate / Transfer / Activate succeeds.
- Operator pastebin guidance: "uses hard reloads" pattern after activate/disconnect.

**v0.7.98 — Brute-force chrome-error guard (recovery layer, kept as belt-and-braces)**
- `installCrashMask` listens on did-navigate + did-finish-load + render-process-gone + did-fail-load.
- Mask paint instrumentation with executeJavaScript fallback.
- Persistent `launch.log` (append + 2 MB rotation + session banner).
- Reentrancy `recoveryActive` guard so triple-event triggers don't burn the 60 s recovery budget.

**v0.7.97 — Secondary-screen defaults**
- Fresh installs ship with `textScale: 0.9`, `bibleLineHeight: 0.95` per operator feedback.

**v0.7.96 — Single-flight licensing/storage persist**
- Atomic-write JSON file for local license persistence.

---

## Known open issues / pending

1. **Confirm v0.7.101 fully fixes chrome-error on Activate.** Operator was repeatedly re-hitting the bug across v0.7.97 → v0.7.100. v0.7.101 moves the hard reload to the moment the API resolves (before any new tree renders), which should be the definitive fix, but needs operator confirmation on Windows.

2. **Receipt UI sacrificed in v0.7.101 activation.** The "Copy receipt" / "Send via WhatsApp" buttons in the activation success modal are now dead code (the modal closes via reload before they paint). If operators miss the receipt, consider passing the activation receipt via `localStorage` and showing it as a toast on the next page load.

3. **`handleDeactivate` is dead code.** Kept as defensive dead code in v0.7.101. Can be removed in a future cleanup pass after confirming no automated tests / external callers reference it.

4. **GitHub Actions Windows build.** Tags push automatically triggers the build. The release artifact is the NSIS installer in `release/`.

---

## Build & run

```bash
# Install (root of monorepo OR inside imported-app — both work)
pnpm install

# Dev (Next.js only, in browser at localhost:47330)
pnpm dev

# Dev (Electron + Next.js)
pnpm electron:dev

# Production Windows build (run on Windows)
.\BUILD.bat
# OR
pnpm electron:build
```

`BUILD.bat` produces a one-click NSIS installer in `release/`. Full build log at `%TEMP%\scripturelive-build.log`.

---

## Key files for the chrome-error work

If you're continuing the chrome-error debugging, these are the files to focus on:

- `src/components/license/subscription-modal.tsx` — `submitActivation` (line ~184), success modal "active" phase (line ~577)
- `src/components/views/settings.tsx` — `handleDeactivate` (~133), `handleTransfer` (~178), Move-to-Another-PC button (~486), transfer dialog (~1625)
- `src/components/license/license-provider.tsx` — `refresh()` (~101), 30 s polling (~118)
- `electron/main.ts` — `installCrashMask` (~587), `setupFileLogging`, `recoveryActive` guard

---

## Excluded from this bundle

To keep the upload small, the following were excluded — they regenerate from source or are local state:

- `node_modules/` — `pnpm install` regenerates
- `.next/` — Next.js build cache
- `dist/`, `dist-electron/`, `dist-electron-ui/`, `release/` — Build outputs
- `src/generated/prisma-client/` — Run `pnpm prisma generate` to regenerate (schema in `prisma/schema.prisma`)
- `db/custom.db` — Local SQLite state
- `uploads/`, `upload/` — User-uploaded media (MP4s, images)
- `exports/` — Old source ZIPs

---

## Project memory

`replit.md` (in this bundle) contains the full project changelog and architectural notes maintained across the development session. Read it for the full history of design decisions.
