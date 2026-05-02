# Deploy notes — `@workspace/imported-app`

## Build runner sizing

This artifact deploys to Replit's **autoscale** target, which runs the
production build on Cloud Run's **`cr-2-4`** runner (2 vCPU, 4 GB RAM).
The Next 16 webpack build is the binding constraint — it's RAM-bound,
not CPU-bound, on a runner that small. Four levers keep it inside the
4 GB cgroup:

| Lever | Where | Effect |
| --- | --- | --- |
| Desktop deps in `devDependencies` | `package.json` | `electron-updater` and `koffi` are no longer installed or traced into the Cloud Run build, since both are only imported from `electron/` (main process). Cuts hundreds of MB out of `node_modules` on the build VM. |
| `SKIP_MARKETING_PREBUILD=1` | `.replit-artifact/artifact.toml` (`services.production.build.env`) | Short-circuits `scripts/maybe-build-marketing.mjs` so the @workspace/site Vite build does **not** run back-to-back with the Next webpack build on the same VM. The build VM stops peaking twice. |
| `NODE_OPTIONS=--max-old-space-size=3584` | `.replit-artifact/artifact.toml` (`services.production.build.env`) | Caps V8's old-space heap at 3584 MB, leaving ~512 MB of cgroup headroom for native allocs (SWC, Prisma generate, terser's Rust binaries). |
| `experimental.webpackMemoryOptimizations` + `experimental.cpus = 1` | `next.config.ts` | Opts into Next's tree-of-modules reuse + early generator GC, and forces a single build worker so we don't multiply the working set by the host's CPU count. |

With all four in place, terser/minification is back on by default —
the shipped client bundle is minified again. There's still a
`DISABLE_MINIFY=1` escape hatch in `next.config.ts`'s webpack callback
in case a future, much larger version of the app pushes back over the
limit before someone has a chance to upsize the runner.

## Side effect of `SKIP_MARKETING_PREBUILD`

When the marketing prebuild is skipped, `public/__marketing/` is not
populated. The host-based rewrite for `scriptureliveai.com` (and `www.`)
in `next.config.ts` therefore has nothing to serve and falls through to
Next's default response for `/`. Every other host
(`scripturelive.replit.app`, the Replit dev domain, the desktop app's
loopback) is unaffected. The follow-up is to run the marketing site as
its own deployable artifact behind the Replit-level proxy instead of
bundling it into this artifact's `public/`.

Local desktop builds (`BUILD.bat`, `pnpm --filter @workspace/imported-app
run package:win`, `... package:mac`) leave `SKIP_MARKETING_PREBUILD`
unset, so the Electron .exe still ships with the marketing bundle baked
into `public/__marketing/` exactly as before.

## User-side escape hatch

If the build ever SIGKILLs again on `cr-2-4` (e.g. after a major
dependency or feature bump), the operator-friendly fix is to bump the
**build** machine in the Replit deployment pane to **`cr-4-8`**
(4 vCPU, 8 GB RAM). The runtime machine size is independent — only the
build runner is the bottleneck this doc is about. After bumping, the
`NODE_OPTIONS` cap can be raised proportionally (a good rule of thumb
is `runner_ram_mb - 1024`, e.g. `7168` on `cr-4-8`).
