import path from "path";
import type { NextConfig } from "next";

// Workspace root (two levels up: artifacts/imported-app -> repo root). The
// `next` package itself, along with most other deps, lives in the hoisted
// node_modules at this root — Turbopack must be told where to look.
const workspaceRoot = path.join(__dirname, "..", "..");

// Standalone output is gated behind NEXT_OUTPUT_STANDALONE=1 because:
//
//  1. The Electron desktop build NEEDS it — `electron-builder` packages
//     the entire `.next/standalone/...` tree as a self-contained Node
//     server. The `package`, `package:win`, and `package:mac` scripts in
//     package.json set NEXT_OUTPUT_STANDALONE=1 before invoking `build`.
//
//  2. The Cloud Run autoscale deploy does NOT need it — it runs the
//     same custom `server.mjs` directly from the artifact root, with
//     `import next from "next"` resolving to the workspace-hoisted
//     node_modules/next. Because pnpm hoists, the artifact directory
//     has full access to every dep at runtime, so the standalone trace
//     step's whole job (re-bundling node_modules into a portable tree)
//     is wasted work for Cloud Run.
//
//  3. The standalone trace step is the SINGLE most memory-heavy phase
//     of a Next 16 webpack production build. Skipping it on Cloud Run
//     was the remaining lever after v0.7.36's outputFileTracingExcludes
//     + heap bump still SIGKILLed inside the cr-2-4 (4 GB) cgroup.
const enableStandalone = process.env.NEXT_OUTPUT_STANDALONE === "1";

// ─────────────────────────────────────────────────────────────────────────
// v0.7.45 — Path-based config split: standalone vs non-standalone.
// ─────────────────────────────────────────────────────────────────────────
// Between v0.7.32 (last known-green Windows release) and v0.7.43, this
// file accumulated a stack of options that were all targeted at the
// Cloud Run 4 GB cgroup OOM problem (outputFileTracingExcludes,
// experimental.{webpackMemoryOptimizations, cpus, optimizePackageImports},
// productionBrowserSourceMaps, the DISABLE_MINIFY webpack callback).
// Every one of those was applied UNCONDITIONALLY, which on the Windows
// GHA runner triggered a deterministic crash 9 s into `next build --webpack`:
//
//   ▲ Next.js 16.2.4 (webpack)
//     Creating an optimized production build ...
//   glob error [Error: EPERM: operation not permitted, scandir
//     'C:\Users\runneradmin\Application Data']
//   Failed to compile.
//
// `C:\Users\<user>\Application Data` is an XP-era junction that always
// returns EPERM on read; something in the layered config above causes
// webpack/glob to walk up and trip on it. v0.7.44 narrowed the gate to
// just `experimental` and confirmed the EPERM still reproduces — so the
// trigger is one of the OTHER post-v0.7.32 additions. Rather than play
// whack-a-mole, this version gates the WHOLE Cloud-Run-only block, so
// the Electron Windows build runs the literal v0.7.32-shaped config
// that was the last green release. Cloud Run gets every optimization
// it had before, untouched. `serverExternalPackages` is the one
// post-v0.7.32 addition kept in BOTH paths because instrumentation.ts
// imports nodemailer/better-sqlite3/@prisma/client at server startup
// and webpack must externalise them or the build fails on Node-builtin
// `stream` resolution.
const nextConfig: NextConfig = {
  ...(enableStandalone ? { output: "standalone" as const } : {}),
  // In a pnpm monorepo, Next traces deps from the workspace root (where the
  // hoisted node_modules lives). Both must be pinned to the same value in
  // Next 16+ — and they must match the Turbopack root, otherwise Turbopack
  // can't find the hoisted `next` package. Standalone output therefore lands
  // at `.next/standalone/artifacts/imported-app/server.js` (the artifact's
  // path relative to the workspace root); the Electron launcher and
  // electron-builder config are aligned with this nested location.
  outputFileTracingRoot: workspaceRoot,
  // Webpack mode needs these server-only deps EXTERNALIZED so it leaves
  // them as plain `require()`s (otherwise it tries to bundle nodemailer
  // and fails resolving the Node built-in `stream` module pulled in by
  // `instrumentation.ts`). Required on BOTH the Cloud Run and the
  // standalone (Electron) build paths — instrumentation.ts runs in
  // both places.
  serverExternalPackages: [
    "nodemailer",
    "better-sqlite3",
    "@prisma/client",
    "prisma",
  ],
  turbopack: {
    root: workspaceRoot,
  },
  allowedDevOrigins: process.env.REPLIT_DEV_DOMAIN
    ? [process.env.REPLIT_DEV_DOMAIN]
    : [],
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // ───────────────────────────────────────────────────────────────────
  // Cloud-Run-only build optimizations (NOT applied to the Electron
  // Windows installer build — see comment block at top of this file).
  // ───────────────────────────────────────────────────────────────────
  ...(enableStandalone
    ? {}
    : {
        // Skip tracing huge native modules that the Cloud Run prod
        // runtime never executes.
        outputFileTracingExcludes: {
          "*": [
            "node_modules/electron/**",
            "node_modules/electron-builder/**",
            "node_modules/electron-updater/**",
            "node_modules/@electron/**",
            "node_modules/app-builder-lib/**",
            "node_modules/dmg-builder/**",
            "node_modules/koffi/**",
            "node_modules/playwright/**",
            "node_modules/playwright-core/**",
            "node_modules/vitest/**",
            "node_modules/@vitest/**",
            "node_modules/bun-types/**",
            "node_modules/typescript/**",
            "node_modules/@types/**",
            "node_modules/eslint/**",
            "node_modules/eslint-*/**",
            "node_modules/@eslint/**",
            "node_modules/.cache/**",
            "node_modules/.prisma/client/query-engine-windows*",
            "node_modules/.prisma/client/query-engine-darwin*",
            "node_modules/@prisma/engines/query-engine-windows*",
            "node_modules/@prisma/engines/query-engine-darwin*",
            "node_modules/@prisma/engines/migration-engine-*",
            "node_modules/@prisma/engines/introspection-engine-*",
            "node_modules/@img/sharp-win32-*/**",
            "node_modules/@img/sharp-darwin-*/**",
            "node_modules/@img/sharp-libvips-win32-*/**",
            "node_modules/@img/sharp-libvips-darwin-*/**",
          ],
        },
        // V8 heap is also capped via NODE_OPTIONS=--max-old-space-size=3584
        // in artifact.toml's services.production.build.env. The two
        // experimental knobs below shrink webpack's own resident set:
        //
        //  - webpackMemoryOptimizations: opts into Next's tree-of-modules
        //    reuse + early generator GC, trading ~10-20% longer builds for
        //    a smaller working set during the optimizer pass.
        //  - cpus: 1 forces a single build worker so we don't multiply
        //    the working set by the host's CPU count.
        //  - optimizePackageImports: forces aggressive tree-shaking of
        //    barrel-import packages. `recharts` is intentionally absent
        //    — it isn't a direct dep of this app (only of artifacts/site)
        //    and naming it triggered Windows-side webpack glob issues.
        experimental: {
          webpackMemoryOptimizations: true,
          cpus: 1,
          optimizePackageImports: [
            "lucide-react",
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-popover",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-accordion",
            "@radix-ui/react-checkbox",
            "@radix-ui/react-label",
            "@radix-ui/react-progress",
            "@radix-ui/react-radio-group",
            "@radix-ui/react-scroll-area",
            "@radix-ui/react-separator",
            "@radix-ui/react-slider",
            "@radix-ui/react-slot",
            "@radix-ui/react-switch",
            "@radix-ui/react-toast",
            "sonner",
          ],
        },
        // Make the absence of source maps explicit so a future toggle
        // can't silently bring back the OOM by serialising a few hundred
        // MB of source maps to disk on Cloud Run.
        productionBrowserSourceMaps: false,
        // Terser/minification is on by default. Set DISABLE_MINIFY=1 as
        // an escape hatch if a future, larger build pushes us back over
        // the 4 GB cgroup before we have a chance to bump the build
        // runner to cr-4-8 in the Replit deployment pane. See DEPLOY.md.
        webpack: (config: { optimization?: { minimize?: boolean } }, { dev }: { dev: boolean }) => {
          if (
            !dev &&
            config.optimization &&
            process.env.DISABLE_MINIFY === "1"
          ) {
            config.optimization.minimize = false;
          }
          return config;
        },
      }),
  // v0.5.53 — Cloud keys are now baked into src/lib/keys.baked.ts via
  // scripts/inject-keys.mjs (runs as predev/prebuild and inside
  // BUILD.bat). The renderer imports the literal constants directly.
};

export default nextConfig;
