import { defineConfig } from 'vitest/config'

// Separate config for the Electron close-button E2E test. Excluded
// from the default `pnpm test` run because it needs a real
// (xvfb-backed) display and a built `dist-electron/`. Run via
// `pnpm run test:e2e` (which wraps this in `scripts/run-e2e.sh`).
export default defineConfig({
  test: {
    include: ['electron/e2e/**/*.{test,spec}.{ts,tsx}'],
    environment: 'node',
    // BrowserWindow boot + first IPC round-trip in a headless
    // container reliably finishes well under 10 s, but we give
    // each test a generous budget for slow CI.
    testTimeout: 60_000,
    hookTimeout: 30_000,
    // Real Electron processes are heavy and bind to OS resources
    // (windows, trays, IPC). Run sequentially so two tests don't
    // race over the same xvfb display. (`poolOptions` was removed
    // in Vitest 4 — these flags are now top-level.)
    fileParallelism: false,
    pool: 'forks',
    isolate: true,
  },
})
