import { defineConfig } from 'vitest/config'

// We don't extend the existing `vite.config.ts` because that file is
// authored for the (separate) Vite mockup pipeline and asserts that
// `PORT` / `BASE_PATH` are set in the environment. Tests run in plain
// Node and shouldn't need either.
export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    environment: 'node',
  },
})
