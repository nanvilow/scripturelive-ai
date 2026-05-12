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
