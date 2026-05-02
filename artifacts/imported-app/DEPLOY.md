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
| `SKIP_MARKETING_PREBUILD=1` | `.replit-artifact/artifact.toml` (`services.production.build.env`) | Short-circuits `scripts/maybe-build-marketing.mjs` when invoked from imported-app's own `prebuild` npm script, so the @workspace/site Vite build does **not** run back-to-back with the Next webpack build inside the same per-artifact build process tree. The Replit-level pre-build hook in `.replit` (`[deployment.build]`) has already populated `public/__marketing/` by then — see "Marketing site flow" below. |
| `NODE_OPTIONS=--max-old-space-size=3584` | `.replit-artifact/artifact.toml` (`services.production.build.env`) | Caps V8's old-space heap at 3584 MB, leaving ~512 MB of cgroup headroom for native allocs (SWC, Prisma generate, terser's Rust binaries). |
| `experimental.webpackMemoryOptimizations` + `experimental.cpus = 1` | `next.config.ts` | Opts into Next's tree-of-modules reuse + early generator GC, and forces a single build worker so we don't multiply the working set by the host's CPU count. |

With all four in place, terser/minification is back on by default —
the shipped client bundle is minified again. There's still a
`DISABLE_MINIFY=1` escape hatch in `next.config.ts`'s webpack callback
in case a future, much larger version of the app pushes back over the
limit before someone has a chance to upsize the runner.

## Marketing site flow (Task #91)

The @workspace/site Vite app hosts the marketing landing page that
`scriptureliveai.com` (and `www.scriptureliveai.com`) serve via the
`async rewrites()` block in `next.config.ts`. Because Replit Autoscale
only promotes ONE service per deploy (see the comment in
`artifacts/api-server/.replit-artifact/artifact.toml` about "Multiple
ports are being forwarded") and the shared proxy routes by path only
(no host-based routing layer below the Next.js app), the marketing
bundle has to live on disk inside this artifact's `public/__marketing/`
folder at deploy time. There is no separate marketing deploy.

To avoid the cr-2-4 OOM that bit us when the Vite build ran inside the
imported-app `prebuild` npm script, the production build flow is:

1. **`.replit`'s `[deployment.build]` pre-build hook** invokes
   `node artifacts/imported-app/scripts/maybe-build-marketing.mjs` at
   the workspace root. SKIP_MARKETING_PREBUILD is unset at this layer,
   so the Vite build runs and `copy-marketing.mjs` populates
   `artifacts/imported-app/public/__marketing/`. The peak Vite memory
   (~400 MB) is reclaimed when this hook's process tree exits.
2. **Per-artifact build phase** runs `pnpm --filter
   @workspace/imported-app run build`. Its `prebuild` script also calls
   `maybe-build-marketing.mjs`, but this time SKIP_MARKETING_PREBUILD=1
   from `[services.production.build.env]` short-circuits the rebuild —
   `public/__marketing/` is already populated from step 1.
3. **Standalone postbuild** (`scripts/copy-standalone-assets.mjs`)
   copies `public/` into the standalone tree, which now includes
   `public/__marketing/`.

When step 1 succeeds, `scriptureliveai.com` renders the marketing site;
when it ever fails the host rewrite falls through to Next's default for
`/` (the previous failure mode).

Local desktop builds (`BUILD.bat`, `pnpm --filter @workspace/imported-app
run package:win`, `... package:mac`) never go through `.replit`. They
rely entirely on imported-app's own `prebuild` script with
`SKIP_MARKETING_PREBUILD` unset, so the Electron .exe still ships with
the marketing bundle baked into `public/__marketing/` exactly as
before.

## User-side escape hatch

If the build ever SIGKILLs again on `cr-2-4` (e.g. after a major
dependency or feature bump), the operator-friendly fix is to bump the
**build** machine in the Replit deployment pane to **`cr-4-8`**
(4 vCPU, 8 GB RAM). The runtime machine size is independent — only the
build runner is the bottleneck this doc is about. After bumping, the
`NODE_OPTIONS` cap can be raised proportionally (a good rule of thumb
is `runner_ram_mb - 1024`, e.g. `7168` on `cr-4-8`).
