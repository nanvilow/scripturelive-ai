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
  // v0.7.33 — Cloud Run autoscale build OOM fix. The deploy build
  // machine has finite RAM and the Next 16 webpack build was
  // SIGKILL'd by the kernel even at NODE_OPTIONS=--max-old-space-size=8192
  // because the build VM itself caps below that. Two settings work
  // together to keep webpack inside a smaller working set:
  //
  //   - webpackMemoryOptimizations: opts into Next's tree-of-modules
  //     reuse + early generator GC, trading ~10-20% longer builds for
  //     a noticeably smaller resident set during the optimizer pass.
  //   - cpus: 1 forces a single build worker so we don't multiply the
  //     working set by the host's CPU count. Cloud Run build runners
  //     usually report 4-8 logical cores but only have ~4 GB of usable
  //     RAM after Linux + the Next runtime; one worker still finishes
  //     in under 3 minutes for an app this size.
  //
  // Both knobs are dev-mode no-ops, so local `next dev` and the
  // Electron desktop build keep their original parallelism.
  experimental: {
    webpackMemoryOptimizations: true,
    cpus: 1,
  },
  // Disable production source maps. They were already off by default
  // (Next 16 omits them unless you opt in) — making it explicit so a
  // future toggle can't silently bring back the OOM by serialising a
  // few hundred MB of source maps to disk.
  productionBrowserSourceMaps: false,
  // v0.7.33 part 2 — Even at NODE_OPTIONS=--max-old-space-size=3072
  // the build still SIGKILL'd on Cloud Run's 4 GB cr-2-4 runner.
  // Terser is the heaviest webpack memory consumer (often 1–2 GB
  // resident on its own minifying React component trees). Disabling
  // it here trades a larger client bundle for actually completing the
  // build inside the cgroup. Once the deploy is healthy we can swap
  // terser back in by raising the build VM through the Replit
  // deployment pane (cr-4-8 or larger).
  webpack: (config, { dev }) => {
    if (!dev && config.optimization) {
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
