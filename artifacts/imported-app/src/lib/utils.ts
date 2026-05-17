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
export function resolveMediaUrl(url: string | null | undefined): string {
  if (!url) return url || ''
  if (typeof window === 'undefined') return url // SSR — leave HTTP shape
  const sl = (window as unknown as { scriptureLive?: { isDesktop?: boolean } }).scriptureLive
  if (!sl?.isDesktop) return url
  // Data URIs and already-rewritten URLs pass through.
  if (url.startsWith('data:') || url.startsWith('scripturelive-media://')) return url
  const m = /^(?:https?:\/\/[^/]+)?\/api\/upload\?file=([^&#]+)/.exec(url)
  if (!m) return url
  return `scripturelive-media://uploads/${m[1]}`
}
