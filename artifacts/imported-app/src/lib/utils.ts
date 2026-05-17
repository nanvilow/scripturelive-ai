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
// v0.7.196 — Re-enabled scripturelive-media:// URL rewrite using ONLY
// string ops (indexOf/substring). The pre-rollback implementation used a
// regex literal `/^(?:https?:\/\/[^/]+)?\/api\/upload\?file=([^&#]+)/`
// which works fine in this React/TS file but the IDENTICAL helper
// embedded inside congregation/route.ts's outer template literal got its
// `\/` escapes stripped by Next.js/SWC, producing the broken
// `/^(?:https?:/:` at runtime that killed every congregation
// BrowserWindow's inline script with an Unterminated-group SyntaxError.
// To eliminate that class of bug forever, BOTH this helper AND the
// __scrMedia twin in congregation/route.ts now use plain indexOf +
// substring with zero regex literals. String operations cannot be
// mangled by template-literal escape handling.
//
// Detection MUST tolerate BOTH `window.scriptureLive?.isDesktop` (set
// by preload script on mainWindow) AND `navigator.userAgent` containing
// "Electron" (the NDI offscreen capture window in electron/frame-capture.ts
// L66-91 and createKioskOutput secondary screen in electron/main.ts
// L2525-2537 both lack a preload: key, so window.scriptureLive is
// undefined there). Without the UA fallback the rewrite would silently
// skip exactly the two surfaces operators care MOST about.
//
// SECURITY: this rewrite is purely cosmetic. The actual path-traversal
// guard lives in the protocol handler (electron/main.ts ~L2783) which
// rejects any filename containing `..` / `/` / `\` / leading `.`.
//
// DIAGNOSTIC: the first successful rewrite per page logs once to
// console so a future regression where the rewrite silently stops
// happening shows up immediately in DevTools / launch.log.
let __scrMediaLogged = false
export function resolveMediaUrl(url: string | null | undefined): string {
  if (!url) return url || ''
  if (typeof window === 'undefined') return url // SSR — leave HTTP shape
  const sl = (window as unknown as { scriptureLive?: { isDesktop?: boolean } }).scriptureLive
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
  const inElectron = !!sl?.isDesktop || ua.indexOf('Electron') >= 0
  if (!inElectron) return url
  if (url.startsWith('data:')) return url
  if (url.startsWith('scripturelive-media://')) return url
  const key = '/api/upload?file='
  const idx = url.indexOf(key)
  if (idx < 0) return url
  const rest = url.substring(idx + key.length)
  const amp = rest.indexOf('&')
  const hash = rest.indexOf('#')
  let end = -1
  if (amp >= 0 && hash >= 0) end = Math.min(amp, hash)
  else if (amp >= 0) end = amp
  else if (hash >= 0) end = hash
  const fn = end < 0 ? rest : rest.substring(0, end)
  if (!fn) return url
  const out = 'scripturelive-media://uploads/' + fn
  if (!__scrMediaLogged) {
    __scrMediaLogged = true
    try { console.log('[resolveMediaUrl] first rewrite:', url, '->', out) } catch { /* ignore */ }
  }
  return out
}
