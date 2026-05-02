// Single source of truth for the public website URL surfaced from
// the desktop app (Help menu, Help & Updates card, first-run welcome
// dialog) so operators can share a link with their pastor or IT lead.
//
// As of v0.7.37 the `scriptureliveai.com` marketing domain has been
// fully disconnected from this project — both the website-default
// here and the matching constant in `electron/main.ts` now point at
// `https://scripturelive.replit.app/` (this Repl's published Bible-app
// URL). When/if a separate marketing site comes back online, set
// `NEXT_PUBLIC_WEBSITE_URL` at build time to override.
//
// The runtime preference order is:
//
//   1. `process.env.NEXT_PUBLIC_WEBSITE_URL` (the canonical override —
//      Next.js inlines NEXT_PUBLIC_* into the renderer bundle at
//      build time, AND the Electron main process picks up the same
//      var at launch, so a single env-var assignment in CI propagates
//      to both surfaces — see `electron/main.ts` for the matching
//      lookup).
//   2. The default below.
//
// IMPORTANT: keep this var name in lockstep with the lookup in
// `electron/main.ts` (`buildAppMenu` → `WEBSITE_URL`). Renderer
// (this file) and main-process (electron/main.ts) intentionally
// share the SAME env var so the Help-menu link and the in-app
// "Visit website" row never disagree about which URL they open.
//
// This file deliberately has no runtime dependencies so it can be
// kept narrowly focused on the single constant.

const DEFAULT_WEBSITE_URL = 'https://scripturelive.replit.app/'

function pickWebsiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_WEBSITE_URL?.trim()
  if (fromEnv) return fromEnv
  return DEFAULT_WEBSITE_URL
}

/** Public marketing site URL — pricing, contact, system requirements. */
export const WEBSITE_URL: string = pickWebsiteUrl()
