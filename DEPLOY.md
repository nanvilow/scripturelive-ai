# Deploy notes — `@workspace/imported-app`

## Build runner sizing

This artifact deploys to Replit's **autoscale** target, which runs the
production build on Cloud Run's **`cr-2-4`** runner (2 vCPU, 4 GB RAM).
The Next 16 webpack build is the binding constraint — it's RAM-bound,
not CPU-bound, on a runner that small. These levers keep it inside the
4 GB cgroup:

| Lever | Where | Effect |
| --- | --- | --- |
| Heavy UI libraries removed (Task #92) | `package.json` | `framer-motion`, `recharts`, `@mdxeditor/editor`, and `react-syntax-highlighter` were unused by any live route and have been deleted along with the 7 dead-code files that imported them. Roughly 120 MB of dependency code is no longer downloaded, traced, or parsed by webpack on the build VM. |
| Desktop deps in `devDependencies` | `package.json` | `electron-updater` and `koffi` are only imported from `electron/` (main process), so they live in `devDependencies` and Cloud Run still installs them at build time but they don't get bundled into the Next runtime trace. |
| `NODE_OPTIONS=--max-old-space-size=2048` | `.replit-artifact/artifact.toml` (`services.production.build.env`) | Caps V8's old-space heap at 2048 MB — the smallest heap that still fits Next's module graph for this app — leaving ~2 GB of cgroup headroom for native allocs (SWC, Prisma generate). |
| `DISABLE_MINIFY=1` | `.replit-artifact/artifact.toml` (`services.production.build.env`) | Hard-disables webpack's terser pass via the callback in `next.config.ts`. Terser is the single most memory-intensive build step (each worker holds the full module AST in RAM). The client bundle ships unminified, but gzip at Cloud Run's edge still cuts ~70% off transfer size. Remove once the build runner is bumped to `cr-4-8`. |
| `experimental.webpackMemoryOptimizations` + `experimental.cpus = 1` | `next.config.ts` | Opts into Next's tree-of-modules reuse + early generator GC, and forces a single build worker so we don't multiply the working set by the host's CPU count. |

## Marketing site (scriptureliveai.com)

The marketing site at `scriptureliveai.com` is moving to its own
standalone Replit project. As of v0.7.34 this artifact **does not**
build, bundle, or rewrite to it:

- `next.config.ts` no longer has a host-based rewrite for
  `scriptureliveai.com` / `www.scriptureliveai.com`.
- `package.json`'s `prebuild` no longer runs the marketing Vite build —
  it only runs `inject-keys.mjs`.
- `public/__marketing/` has been removed.
- `scripts/copy-marketing.mjs` has been deleted.
- `scripts/maybe-build-marketing.mjs` has been reduced to a no-op stub
  that exits 0 immediately, because the `[deployment.build]` hook in
  `.replit` invokes it by absolute path and the Replit agent sandbox
  hard-blocks ALL writes to `.replit` (edit, write, sed, echo redirect
  — all rejected with `Direct edits to .replit and replit.nix are not
  allowed`). The deployment skill confirms `.replit`'s `deployment.build`
  is a "root pre-build hook" but exposes no programmatic callback to
  remove it. The stub is therefore the correct and only workaround
  available to the agent. Once the user deletes the
  `[deployment.build]` lines from `.replit` via the Files pane (a
  one-time, ~5 second manual edit), the stub file can be deleted too.
- `artifact.toml` no longer sets `SKIP_MARKETING_PREBUILD=1` — there
  is nothing to skip.

The `@workspace/site` Vite app is still in the monorepo for now and
runs as the `artifacts/site` dev workflow. It will be moved to its own
Replit project (where `scriptureliveai.com` will be pointed) in a
follow-up; until then it has no production deploy path here.

## User-side escape hatch

If the build ever SIGKILLs again on `cr-2-4` (e.g. after a major
dependency or feature bump), the operator-friendly fix is to bump the
**build** machine in the Replit deployment pane to **`cr-4-8`**
(4 vCPU, 8 GB RAM). The runtime machine size is independent — only the
build runner is the bottleneck this doc is about. After bumping, the
`NODE_OPTIONS` cap can be raised proportionally (a good rule of thumb
is `runner_ram_mb - 1024`, e.g. `7168` on `cr-4-8`) and `DISABLE_MINIFY`
can be removed so the client bundle ships minified again.

## Heavyweight UI library audit (Task #92, May 2026)

Full sweep across `src/`, `electron/`, and `scripts/` confirmed these
libraries had zero live importers and were removed:

- `@mdxeditor/editor` — zero imports anywhere.
- `react-syntax-highlighter` — zero imports anywhere.
- `recharts` — only imported by `src/components/ui/chart.tsx`, which
  had zero importers (the whole shadcn chart wrapper was dead).
- `framer-motion` — only imported by 6 components in `src/components/`
  and `src/views/`, none of which were mounted by any live route. The
  mounted UI is `LogosShell → easyworship-shell → library-compact.tsx`,
  which uses no `framer-motion`.

The 7 dead-code files were also deleted; `tsc --noEmit` passes after
the removal.
