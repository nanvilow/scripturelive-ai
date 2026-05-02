#!/usr/bin/env node
/**
 * Build the UI E2E harness bundle.
 *
 * Bundles `electron/e2e-ui/harness.tsx` (which mounts the production
 * `StartupCard` from `src/components/views/startup-card.tsx`) into
 * `dist-electron-ui/harness.bundle.js`, and copies `harness.html`
 * alongside it. The harness is loaded by `electron/test-entry.ts`
 * via a `file://` URL when `SL_TEST_LOAD_UI=1` so the close-button
 * E2E can drive the *actual* Radix `<Switch>` operators interact
 * with — not a stub.
 *
 * Kept separate from `electron:build` (tsc) because:
 *   - It needs JSX + esbuild bundling (tsc would only emit per-file
 *     ESM, not a single browser-loadable bundle).
 *   - It needs the `@/*` path-alias from `tsconfig.json` resolved to
 *     `src/*` at bundle time (handled by the inline plugin below).
 */
import { build } from 'esbuild'
import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const outDir = path.join(projectRoot, 'dist-electron-ui')

await fs.mkdir(outDir, { recursive: true })

// Resolve `@/foo` imports to `<projectRoot>/src/foo`. Mirrors the
// `paths: { "@/*": ["./src/*"] }` mapping from the project's
// tsconfig.json so the bundled StartupCard can reach the same UI
// primitives the production app uses. We delegate back to esbuild's
// own resolver via `build.resolve` so file-extension lookup
// (`.tsx`, `.ts`, `/index.tsx`, …) keeps working.
const aliasPlugin = {
  name: 'tsconfig-alias',
  setup(b) {
    b.onResolve({ filter: /^@\// }, async (args) => {
      const result = await b.resolve('./' + args.path.slice(2), {
        kind: args.kind,
        resolveDir: path.join(projectRoot, 'src'),
      })
      if (result.errors.length > 0) return { errors: result.errors }
      return { path: result.path, external: result.external }
    })
  },
}

await build({
  entryPoints: [path.join(projectRoot, 'electron/e2e-ui/harness.tsx')],
  outfile: path.join(outDir, 'harness.bundle.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome120'],
  jsx: 'automatic',
  loader: { '.tsx': 'tsx', '.ts': 'ts' },
  plugins: [aliasPlugin],
  // Drop `process.env.NODE_ENV` checks down to a real string so React
  // doesn't error on `process is not defined` in the renderer.
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info',
})

await fs.copyFile(
  path.join(projectRoot, 'electron/e2e-ui/harness.html'),
  path.join(outDir, 'harness.html'),
)

console.log('[e2e-ui] bundle written to', outDir)
