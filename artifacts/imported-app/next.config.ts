import path from "path";
import type { NextConfig } from "next";

// Workspace root (two levels up: artifacts/imported-app -> repo root). The
// `next` package itself, along with most other deps, lives in the hoisted
// node_modules at this root — Turbopack must be told where to look.
const workspaceRoot = path.join(__dirname, "..", "..");

const nextConfig: NextConfig = {
  // Standalone output is needed when the app is packaged inside the Electron
  // desktop build. It is harmless for normal `next dev` / `next start`.
  output: "standalone",
  // Production builds use webpack (`next build --webpack`) because Turbopack
  // currently panics inside the PostCSS loader on this app's globals.css —
  // `<PostCssTransformedAsset as Asset>::content failed → parse_css failed →
  // evaluate_webpack_loader failed → unexpected end of file`. The same panic
  // hits dev mode for the Bible-app `/` route too. Webpack mode needs these
  // server-only deps EXTERNALIZED so it leaves them as plain `require()`s
  // (otherwise it tries to bundle nodemailer and fails resolving the Node
  // built-in `stream` module pulled in by `instrumentation.ts`). Dev mode
  // keeps using Turbopack via `next dev` (no --webpack flag) for speed —
  // the marketing route works there, only the Bible homepage panics, which
  // doesn't matter for production builds.
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
  turbopack: {
    root: workspaceRoot,
  },
  allowedDevOrigins: process.env.REPLIT_DEV_DOMAIN
    ? [process.env.REPLIT_DEV_DOMAIN]
    : [],
  // Host-based routing for two-domain deploy:
  //   scriptureliveai.com (+ www) → marketing site (static SPA bundled at /__marketing/)
  //   all other hosts (scripturelive.replit.app, dev domain) → existing Next.js app
  // /__marketing/*, /api/*, /_next/* always pass through so the SPA's bundled
  // assets and the desktop app's API calls keep working on every host.
  async rewrites() {
    // Segment-bounded exclusion: only paths whose first segment is exactly
    // __marketing, api, _next, .well-known, or root files robots.txt /
    // sitemap.xml / favicon.ico bypass the rewrite. `/apiary`, `/_nextfoo`
    // etc. still rewrite to marketing on marketing hosts.
    const passthrough =
      "(?:__marketing(?:/.*)?|api(?:/.*)?|_next(?:/.*)?|\\.well-known(?:/.*)?|robots\\.txt|sitemap\\.xml|favicon\\.ico)";
    const source = `/:path((?!${passthrough}$).*)`;
    return {
      beforeFiles: [
        {
          source,
          has: [{ type: "host", value: "scriptureliveai.com" }],
          destination: "/__marketing/index.html",
        },
        {
          source,
          has: [{ type: "host", value: "www.scriptureliveai.com" }],
          destination: "/__marketing/index.html",
        },
      ],
    };
  },
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
  experimental: {
    webpackMemoryOptimizations: true,
    cpus: 1,
  },
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
