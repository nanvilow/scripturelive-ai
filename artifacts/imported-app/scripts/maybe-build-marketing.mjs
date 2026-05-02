#!/usr/bin/env node
// Conditionally build the marketing SPA (`@workspace/site`) and copy
// its `dist/public` into `public/__marketing/` so the host-based
// rewrite to `scriptureliveai.com` in next.config.ts can serve it
// from the same Next process.
//
// Skipped when SKIP_MARKETING_PREBUILD is set. The Cloud Run autoscale
// build runner (cr-2-4 = 2 vCPU / 4 GB RAM) sets this flag because
// running the marketing Vite build immediately before the Next webpack
// build pushes the build VM over its 4 GB cgroup and gets the Next
// build SIGKILL'd halfway through. Local desktop builds (BUILD.bat,
// package:win, package:mac) leave the flag unset, so the marketing
// bundle is still generated and packaged into the Electron .exe.
//
// Trade-off when skipped: the host rewrite for scriptureliveai.com
// falls through to the Next.js default 404 (or whatever the renderer
// shows for `/`) until the marketing site is wired through the
// Replit-level proxy as a separate artifact in a follow-up. Every
// other host (scripturelive.replit.app, the Replit dev domain, the
// desktop app's loopback) is unaffected.

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
