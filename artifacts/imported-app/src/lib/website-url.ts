// Single source of truth for the public marketing website URL.
//
// As of v0.7.34 the marketing site is being moved to its own
// standalone Replit project pointed at `scriptureliveai.com`, so this
// app no longer co-hosts it under `/site/`. Operators still get a link
// from inside the desktop app (Help menu, Help & Updates card,
// first-run welcome dialog) so they can share pricing / contact /
// system requirements with their pastor or IT lead.
//
// Override at build time with `NEXT_PUBLIC_WEBSITE_URL` if the
// canonical marketing domain ever changes again. The runtime
// preference order is:
//
//   1. `process.env.NEXT_PUBLIC_WEBSITE_URL` (the canonical override —
//      Next.js inlines NEXT_PUBLIC_* into the renderer bundle at
//      build time, AND the Electron main process picks up the same
//      var at launch, so a single env-var assignment in CI propagates
//      to both surfaces — see `electron/main.ts` for the matching
//      lookup).
//   2. The default marketing domain below.
//
// IMPORTANT: keep this var name in lockstep with the lookup in
// `electron/main.ts` (`buildAppMenu` → `WEBSITE_URL`). Renderer
// (this file) and main-process (electron/main.ts) intentionally
// share the SAME env var so the Help-menu link and the in-app
// "Visit website" row never disagree about which URL they open.
//
// This file deliberately has no runtime dependencies so it can be
// kept narrowly focused on the single constant.

const DEFAULT_WEBSITE_URL = 'https://scriptureliveai.com/'

function pickWebsiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_WEBSITE_URL?.trim()
  if (fromEnv) return fromEnv
  return DEFAULT_WEBSITE_URL
}

/** Public marketing site URL — pricing, contact, system requirements. */
export const WEBSITE_URL: string = pickWebsiteUrl()
