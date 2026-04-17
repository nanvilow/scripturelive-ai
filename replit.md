# Workspace

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
