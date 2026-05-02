#!/usr/bin/env node
// Conditionally build the marketing SPA (`@workspace/site`) and copy
// its `dist/public` into `public/__marketing/` so the host-based
// rewrite to `scriptureliveai.com` in next.config.ts can serve it
// from the same Next process.
//
// This script has TWO callers:
//
//   1. The Replit-level pre-build hook in `.replit`'s
//      `[deployment.build]`. Cloud Run runs this BEFORE the per-artifact
//      build phase, so the Vite build's process tree is fully torn
//      down (and its memory reclaimed) before `next build --webpack`
//      starts. SKIP_MARKETING_PREBUILD is unset at this layer, so the
//      build + copy proceeds normally. This is what populates
//      `public/__marketing/` for the production deploy of
//      scriptureliveai.com.
//
//   2. imported-app's own `prebuild` npm script (Electron desktop
//      builds — BUILD.bat, package:win, package:mac). Those flows
//      leave SKIP_MARKETING_PREBUILD unset, so the marketing bundle
//      is generated locally and packaged into the .exe.
//
// SKIP_MARKETING_PREBUILD=1 is set ONLY in the imported-app artifact's
// `services.production.build.env` (see its artifact.toml). That short-
// circuits this script during the cr-2-4 Cloud Run per-artifact build,
// so the marketing Vite build does NOT run contiguously with the Next
// 16 webpack build inside the same `pnpm --filter ... run build`
// process tree (which is what caused the cr-2-4 OOM that motivated the
// flag in the first place — see DEPLOY.md). The Replit pre-build hook
// above has already populated `public/__marketing/` by then, so
// short-circuiting here is fine.

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

if (process.env.SKIP_MARKETING_PREBUILD) {
  console.log(
    '[maybe-build-marketing] SKIP_MARKETING_PREBUILD is set — skipping ' +
      "marketing site build/copy. The scriptureliveai.com host rewrite " +
      "will fall through to Next's default until the marketing site " +
      'is wired through the Replit proxy.'
  )
  process.exit(0)
}

console.log('[maybe-build-marketing] building @workspace/site for /__marketing/ …')

// Mirror the env vars the previous inline `pnpm --filter @workspace/site
// run build` invocation set, so the marketing SPA's Vite config sees
// the same BASE_PATH and PORT it always has.
const buildEnv = {
  ...process.env,
  PORT: '21238',
  BASE_PATH: '/__marketing/',
}

const buildResult = spawnSync(
  'pnpm',
  ['--filter', '@workspace/site', 'run', 'build'],
  { stdio: 'inherit', env: buildEnv, cwd: projectRoot }
)
if (buildResult.status !== 0) {
  console.error(
    `[maybe-build-marketing] @workspace/site build failed (exit ${buildResult.status})`
  )
  process.exit(buildResult.status ?? 1)
}

const copyResult = spawnSync(
  'node',
  [path.join(projectRoot, 'scripts', 'copy-marketing.mjs')],
  { stdio: 'inherit', env: process.env, cwd: projectRoot }
)
if (copyResult.status !== 0) {
  console.error(
    `[maybe-build-marketing] copy-marketing failed (exit ${copyResult.status})`
  )
  process.exit(copyResult.status ?? 1)
}

console.log('[maybe-build-marketing] done')
