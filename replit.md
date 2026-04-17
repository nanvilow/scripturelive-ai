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
- NDI output is supported by opening the congregation output page fullscreen and capturing that browser window with NDI Tools, OBS, vMix, or Wirecast.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
