import { defineConfig } from 'vitest/config'

// We don't extend the existing `vite.config.ts` because that file is
// authored for the (separate) Vite mockup pipeline and asserts that
// `PORT` / `BASE_PATH` are set in the environment. Tests run in plain
// Node and shouldn't need either.
export default defineConfig({
  test: {
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'electron/**/*.{test,spec}.{ts,tsx}',
    ],
    // The electron/e2e/ suite spins up real Electron processes and
    // needs xvfb + a built dist-electron/. It runs through its own
    // config (vitest.e2e.config.ts) via `pnpm run test:e2e`, so
    // exclude it from the default `pnpm test` run.
    exclude: ['node_modules/**', 'dist/**', 'electron/e2e/**'],
    environment: 'node',
  },
})
