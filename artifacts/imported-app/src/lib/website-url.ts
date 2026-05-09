// Single source of truth for the public website URL surfaced from
// the desktop app (Help menu, Help & Updates card, first-run welcome
// dialog) so operators can share a link with their pastor or IT lead.
//
// v0.7.134 — Operator request: every "Visit website" surface (Help
// menu, Help & Updates card, first-run welcome dialog, the desktop
// links the user pointed at in https://imgur.com/a/gZoZtsp) should
// open the public marketing domain `https://scriptureliveai.com/`,
// NOT the Replit-app fallback. The Replit-app domain is still the
// transcribe / telemetry / auto-update HOST (those wires intentionally
// stay independent — they're API endpoints, not user-facing links),
// but anything an operator clicks goes to scriptureliveai.com so the
// branding is consistent. Same default mirrored in `electron/main.ts`
// so the Electron Help menu and the renderer never disagree.
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

const DEFAULT_WEBSITE_URL = 'https://scriptureliveai.com/'

function pickWebsiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_WEBSITE_URL?.trim()
  if (fromEnv) return fromEnv
  return DEFAULT_WEBSITE_URL
}

/** Public marketing site URL — pricing, contact, system requirements. */
export const WEBSITE_URL: string = pickWebsiteUrl()
