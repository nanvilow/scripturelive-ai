// Single source of truth for the app's installed version string in
// the renderer.
//
// The canonical version lives in `package.json`'s `version` field —
// the same field electron-builder reads when stamping installers and
// the same value `app.getVersion()` returns from the main process at
// runtime. We import it here so the Settings → Help & Updates card
// (and anything else that needs an at-build-time version seed) can
// render an accurate value on first paint, even before the IPC call
// to the desktop bridge resolves and even when running in a browser
// preview where the bridge is absent.
//
// The runtime preference order is unchanged:
//   1. `process.env.NEXT_PUBLIC_APP_VERSION` (set by CI for branded
//      preview builds)
//   2. `pkg.version` (always present, always correct for whatever
//      build the user just installed)
//
// The previous fallback was a hardcoded literal that drifted from
// `package.json` after every release; centralising it here means a
// `pnpm version` bump propagates automatically and the small unit
// test in `app-version.test.ts` keeps the constant honest.

import pkg from '../../package.json'

/** App version read from `package.json` at build time. */
export const PACKAGE_VERSION: string = pkg.version

/**
 * Best-effort installed version for the renderer. Prefers the
 * `NEXT_PUBLIC_APP_VERSION` env var (set by CI for branded preview
 * builds) and falls back to `package.json`'s `version` field, which
 * is always correct for whatever build the user just installed.
 *
 * Used as the *seed* for the Settings card — the Electron main
 * process still overwrites this with `app.getVersion()` once the
 * bridge handshake lands.
 */
export const APP_VERSION: string =
  process.env.NEXT_PUBLIC_APP_VERSION || PACKAGE_VERSION
