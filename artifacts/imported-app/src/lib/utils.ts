import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// v0.7.155 — Operators can now use video files as the congregation
// background, not just still images. Detection is by URL extension or
// data-URI mime so it works for both:
//   • /api/upload?file=<uuid>.mp4    (server-persisted operator upload)
//   • data:video/webm;base64,…       (in-memory media-library entries)
// Anything we don't recognise is treated as an image so the v0.7.154-
// and-earlier image-only behaviour is preserved as the safe fallback.
export function isVideoBackground(url: string | null | undefined): boolean {
  if (!url) return false
  const lower = url.toLowerCase()
  if (lower.startsWith('data:video/')) return true
  // Match a video extension that ends the string OR is followed by ? or #
  // (so /uploads/clip.mov, /uploads/clip.mov?v=2, /api/upload?file=clip.mp4
  // all match — the regex is anchored on the extension, not on a path
  // boundary, so query strings like ?file=foo.mp4 are caught too).
  return /\.(mp4|webm|mov|mkv|avi|m4v|ogv)(?:$|[?#])/.test(lower)
}

// v0.7.194-hotfix.10 — Rewrite legacy `/api/upload?file=<uuid>` URLs to
// the Electron custom protocol `scripturelive-media://uploads/<uuid>` so
// the renderer's <video>/<img> elements read straight off disk via
// Node's fs.createReadStream instead of round-tripping through Next.js
// single-threaded /api/upload route. Eliminates the lag class where
// 3-5 concurrent <video> decoders (Preview, Live, NDI in-app preview,
// NDI offscreen capture window, secondary-screen kiosk) starved each
// other's range requests over one Node event loop.
//
// Detection MUST gate on `window.scriptureLive?.isDesktop` so we
// only rewrite inside Electron — the dev/browser preview pane has no
// custom protocol handler and would 404. Data-URIs are passed through
// unchanged (the media library uses them for in-memory entries).
//
// SECURITY: the renderer-side rewrite is purely cosmetic — the actual
// path-traversal guard lives in the protocol handler (electron/main.ts)
// which refuses any filename containing `..` / `/` / `\`. Do not skip
// that guard by trusting this rewrite as the only sanitiser.
// v0.7.196 — ROLLBACK: temporarily disable the scripturelive-media:// URL
// rewrite. Operator on v0.7.194-hotfix.12 reported the empty "Scripture AI"
// placeholder bug persisted on ALL 5 video surfaces (Typography preview, NDI
// Live Preview, Display & Output Live Preview, main Preview/Live columns)
// even though launch.log proves the protocol handler IS registered at boot
// (line "[boot] scripturelive-media:// protocol handler registered, uploadsDir=
// C:\Users\<u>\AppData\Roaming\@workspace\imported-app\uploads") AND
// SCRIPTURELIVE_UPLOADS_DIR is correctly piped from electron/main.ts L998 into
// /api/upload route.ts L35 so both writers/readers point at the same dir.
// The log shows ZERO scripturelive-media:// requests and ZERO /api/upload GET
// requests in the failing session — meaning the renderer never even issues
// the request. The bug is somewhere in the renderer/React layer, not in the
// protocol handler or CORS (hotfix.12's hypothesis was wrong). Until we can
// instrument the renderer with verbose logging + browser DevTools to find
// the actual root cause, fall back to the pre-hotfix.10 behaviour: leave the
// URL as `/api/upload?file=...` so the Next.js HTTP route serves the bytes
// (slower because all surfaces share one Node event loop, but at least
// videos PLAY). The protocol handler is left registered in electron/main.ts
// so a future fix can re-enable rewrite once the renderer bug is identified.
// GUARD-RAIL: do NOT re-enable rewrite without (a) DevTools-confirmed
// reproduction of the placeholder bug and a known cause, (b) verbose
// diagnostic logging in both renderer and protocol handler, (c) operator
// approval.
export function resolveMediaUrl(url: string | null | undefined): string {
  return url || ''
}
