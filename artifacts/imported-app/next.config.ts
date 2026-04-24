import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output is needed when the app is packaged inside the Electron
  // desktop build. It is harmless for normal `next dev` / `next start`.
  output: "standalone",
  // In a pnpm monorepo, Next auto-detects the workspace root and emits the
  // standalone bundle at `.next/standalone/<relative-path>/server.js`
  // (i.e. `.next/standalone/artifacts/imported-app/server.js`), which breaks
  // the Electron packaging that expects `.next/standalone/server.js` at the
  // top level. Pinning the tracing root to this artifact's directory forces
  // Next to emit `server.js` directly under `.next/standalone/`.
  outputFileTracingRoot: __dirname,
  allowedDevOrigins: process.env.REPLIT_DEV_DOMAIN
    ? [process.env.REPLIT_DEV_DOMAIN]
    : [],
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
