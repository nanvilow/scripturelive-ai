import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// We don't extend the existing `vite.config.ts` because that file is
// authored for the (separate) Vite mockup pipeline and asserts that
// `PORT` / `BASE_PATH` are set in the environment. Tests run in plain
// Node and shouldn't need either.
//
// v0.7.19 — Added the `@/` alias so test files can use the same
// import style as the source they exercise. Mirrors the `paths` block
// in tsconfig.json (`"@/*": ["./src/*"]`).
const __dirname = dirname(fileURLToPath(import.meta.url))
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
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
