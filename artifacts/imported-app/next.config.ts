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
//     same custom `server.mjs` (which programmatically wraps Next via
//     `next({ dev:false, dir:__dirname })` and attaches the Deepgram
//     WebSocket via `attachTranscribeStream`) directly from the artifact
//     root, with `import next from "next"` resolving to the workspace-
//     hoisted node_modules/next. Because pnpm hoists, the artifact
//     directory has full access to every dep at runtime, so the
//     standalone trace step's whole job (re-bundling node_modules into
//     a portable tree) is wasted work for Cloud Run.
//
//  3. The standalone trace step is the SINGLE most memory-heavy phase
//     of a Next 16 webpack production build — it walks the entire
//     resolved dep graph, opens every used file, and holds full per-
//     file metadata in RAM at once. Skipping it on Cloud Run was the
//     remaining lever after v0.7.36's outputFileTracingExcludes +
//     heap bump still SIGKILLed inside the cr-2-4 (4 GB) cgroup. With
//     standalone off, webpack only has to emit `.next/` and the trace
//     step is bypassed entirely.
const enableStandalone = process.env.NEXT_OUTPUT_STANDALONE === "1";

const nextConfig: NextConfig = {
  ...(enableStandalone ? { output: "standalone" as const } : {}),
  // Production builds use webpack (`next build --webpack`) because Turbopack
  // currently panics inside the PostCSS loader on this app's globals.css —
  // `<PostCssTransformedAsset as Asset>::content failed → parse_css failed →
  // evaluate_webpack_loader failed → unexpected end of file`. The same panic
  // hits dev mode for the Bible-app `/` route too. Webpack mode needs these
  // server-only deps EXTERNALIZED so it leaves them as plain `require()`s
  // (otherwise it tries to bundle nodemailer and fails resolving the Node
  // built-in `stream` module pulled in by `instrumentation.ts`).
  serverExternalPackages: [
    "nodemailer",
    "better-sqlite3",
    "@prisma/client",
    "prisma",
  ],
  // In a pnpm monorepo, Next traces deps from the workspace root (where the
  // hoisted node_modules lives). Both must be pinned to the same value in
  // Next 16+ — and they must match the Turbopack root, otherwise Turbopack
  // can't find the hoisted `next` package. Standalone output therefore lands
  // at `.next/standalone/artifacts/imported-app/server.js` (the artifact's
  // path relative to the workspace root); the Electron launcher and
  // electron-builder config are aligned with this nested location.
  outputFileTracingRoot: workspaceRoot,
  // Skip tracing huge native modules that the Cloud Run prod runtime
  // never executes. They're either Electron-only (electron itself,
  // electron-builder, electron-updater, koffi NDI bridge), test-only
  // (playwright, vitest), or alternate-arch binaries Prisma ships
  // for cross-platform support. Each excluded path is one fewer
  // tarball Next has to walk and resolve during the standalone trace
  // step — that step is one of the most memory-heavy parts of the
  // build because it holds the entire dep graph + per-file metadata
  // in RAM at once. Trimming it is a direct win against the cr-2-4
  // (4 GB) build cgroup.
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
      // Prisma's per-arch query engine binaries — keep only the
      // linux ones the Cloud Run container actually loads.
      "node_modules/.prisma/client/query-engine-windows*",
      "node_modules/.prisma/client/query-engine-darwin*",
      "node_modules/@prisma/engines/query-engine-windows*",
      "node_modules/@prisma/engines/query-engine-darwin*",
      "node_modules/@prisma/engines/migration-engine-*",
      "node_modules/@prisma/engines/introspection-engine-*",
      // Sharp pre-builds for non-linux platforms.
      "node_modules/@img/sharp-win32-*/**",
      "node_modules/@img/sharp-darwin-*/**",
      "node_modules/@img/sharp-libvips-win32-*/**",
      "node_modules/@img/sharp-libvips-darwin-*/**",
    ],
  },
  // (Next 16 removed the `eslint.ignoreDuringBuilds` config knob from
  // its public NextConfig type — `next build` no longer runs ESLint
  // by default in 15+. Linting is now an explicit `next lint` step,
  // which we don't run during the prod build, so there is no
  // ESLint memory cost to disable here.)
  turbopack: {
    root: workspaceRoot,
  },
  allowedDevOrigins: process.env.REPLIT_DEV_DOMAIN
    ? [process.env.REPLIT_DEV_DOMAIN]
    : [],
  // Host-based marketing-site rewrite REMOVED (v0.7.34). The marketing
  // site at scriptureliveai.com is being moved to its own standalone
  // Replit project, so this app no longer needs to handle that domain
  // — every host (scripturelive.replit.app, the Replit dev domain,
  // the desktop app's loopback) now serves the Bible app directly.
  // Companion changes: prebuild no longer runs the marketing Vite
  // build, public/__marketing/ is gone, copy-marketing.mjs is gone,
  // and SKIP_MARKETING_PREBUILD is gone from artifact.toml. The
  // .replit `[deployment.build]` hook still calls
  // scripts/maybe-build-marketing.mjs (the agent sandbox blocks
  // direct edits to `.replit`), but that script is now a 3-line
  // no-op stub that exits 0 in milliseconds, so the hook is
  // effectively dead weight. The user can delete the hook line
  // (and then the stub) via the Files pane to fully excise it.
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // ───────────────────────────────────────────────────────────────────
  // Cloud Run autoscale build OOM controls.
  // ───────────────────────────────────────────────────────────────────
  // Production deploys build on Cloud Run's `cr-2-4` runner (2 vCPU,
  // 4 GB RAM). The Next 16 webpack build is RAM-bound on that VM, so
  // a layered defence keeps it inside the cgroup:
  //
  //   1. Shrink the input. `electron-updater` and `koffi` were moved
  //      to devDependencies (they're only imported from electron/),
  //      and the marketing-site prebuild is gated behind
  //      SKIP_MARKETING_PREBUILD=1 in artifact.toml — Cloud Run no
  //      longer runs the Vite build right before the Next build, so
  //      the build VM doesn't peak twice.
  //
  //   2. Cap V8's heap via `NODE_OPTIONS=--max-old-space-size=3584`
  //      in artifact.toml's `services.production.build.env`. 3584 MB
  //      leaves ~512 MB of cgroup headroom for native allocs (SWC,
  //      Prisma generate, terser's Rust binaries) on a 4 GB runner.
  //
  //   3. The two knobs below shrink webpack's own resident set:
  //      - webpackMemoryOptimizations: opts into Next's tree-of-
  //        modules reuse + early generator GC, trading ~10-20% longer
  //        builds for a noticeably smaller working set during the
  //        optimizer pass.
  //      - cpus: 1 forces a single build worker so we don't multiply
  //        the working set by the host's CPU count. One worker still
  //        finishes in under 3 minutes for an app this size.
  //
  // Both experimental knobs are dev-mode no-ops, so local `next dev`
  // and the Electron desktop build keep their original parallelism.
  // Terser/minification is now back on (re-enabling it shaves
  // ~30-50% off shipped client bundles), gated only behind the
  // DISABLE_MINIFY=1 escape hatch in the webpack callback below.
  // v0.7.44 hotfix — Gate the Cloud-Run-only experimental knobs behind
  // !enableStandalone. The Electron Windows installer build runs with
  // NEXT_OUTPUT_STANDALONE=1 on a beefy GHA runner where these knobs
  // give zero benefit. On Windows specifically, listing `recharts` in
  // optimizePackageImports caused webpack's barrel-import resolver to
  // glob upward looking for the package (recharts isn't in this app's
  // own package.json — it's hoisted into the workspace node_modules
  // by artifacts/site and artifacts/mockup-sandbox). The walk tripped
  // on the legacy `C:\Users\<user>\Application Data` junction with
  // EPERM, breaking the v0.7.43 release CI:
  //   glob error [Error: EPERM: operation not permitted, scandir
  //   'C:\Users\runneradmin\Application Data']
  // Restoring the v0.7.32-style minimal config for the standalone
  // path is the safest fix — that build was the last known green
  // Windows release. Cloud Run (where standalone is OFF) keeps all
  // the OOM mitigations untouched.
  ...(enableStandalone ? {} : {
    experimental: {
      webpackMemoryOptimizations: true,
      cpus: 1,
      // Force aggressive tree-shaking of barrel-import packages that
      // webpack would otherwise pull whole-module into every chunk that
      // imports anything from them. lucide-react is the worst offender.
      // Note: `recharts` is intentionally NOT listed here — it isn't a
      // direct dep of this app (only of artifacts/site), and naming it
      // triggered the Windows EPERM described above.
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
  }),
  // Disable production source maps. They were already off by default
  // (Next 16 omits them unless you opt in) — making it explicit so a
  // future toggle can't silently bring back the OOM by serialising a
  // few hundred MB of source maps to disk.
  productionBrowserSourceMaps: false,
  // Terser/minification is enabled by default. Set DISABLE_MINIFY=1
  // as an escape hatch if a future, larger build pushes us back over
  // the 4 GB cgroup before we have a chance to bump the build runner
  // to cr-4-8 in the Replit deployment pane. See DEPLOY.md.
  webpack: (config, { dev }) => {
    if (!dev && config.optimization && process.env.DISABLE_MINIFY === '1') {
      config.optimization.minimize = false;
    }
    return config;
  },
  // v0.5.53 — Cloud keys are now baked into src/lib/keys.baked.ts via
  // scripts/inject-keys.mjs (runs as predev/prebuild and inside
  // BUILD.bat). The renderer imports the literal constants directly,
  // which is more reliable than relying on Next's `env` block to
  // propagate NEXT_PUBLIC_ vars at the right moment. This block is
  // intentionally omitted now — see runtime-keys.ts for the new flow.
};

export default nextConfig;
