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
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // v0.5.53 — Cloud keys are now baked into src/lib/keys.baked.ts via
  // scripts/inject-keys.mjs (runs as predev/prebuild and inside
  // BUILD.bat). The renderer imports the literal constants directly,
  // which is more reliable than relying on Next's `env` block to
  // propagate NEXT_PUBLIC_ vars at the right moment. This block is
  // intentionally omitted now — see runtime-keys.ts for the new flow.
};

export default nextConfig;
