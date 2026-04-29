// v0.7.1 — Server-side auth gate for /api/license/admin/* routes.
//
// Pre-v0.7.1 the admin endpoints were wide open: the only "gate" was
// the Ctrl+Shift+P UI shortcut + a password field in the Settings
// tab that was never actually checked. A code review of v0.7.0
// flagged this as critical because the v0.7.0 dashboard exposes
// every customer's phone number, email, and approximate location —
// any caller who could reach the app's port could pull that list.
//
// Design constraints:
//   • Backward-compatible with operators who never set a password
//     (we accept a baked default 'admin' but log a loud warning so
//     they're nudged to change it).
//   • Operator-set password (saved via the Settings tab) wins.
//   • SCRIPTURELIVE_ADMIN_PASSWORD env var is honoured for
//     operators who want to bake the password into the build.
//   • Sessions live in a process-local Set (no DB churn). 12-hour
//     sliding window, 64-byte URL-safe random token, HttpOnly +
//     SameSite=Strict cookie.
//   • Never, ever logs the password or token.

import { randomBytes, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getConfig } from './storage'

// Cookie + session config. The cookie name is intentionally
// app-specific so it can coexist with other tools on the same
// origin without collisions.
export const ADMIN_COOKIE = 'sl_admin_session'
const SESSION_TTL_MS = 12 * 60 * 60 * 1000  // 12 h

// In-memory session store. Map token -> expiry epoch ms. We sweep
// expired entries lazily on every read.
const sessions = new Map<string, number>()

function sweep(now = Date.now()): void {
  for (const [tok, exp] of sessions) {
    if (exp <= now) sessions.delete(tok)
  }
}

/** Resolve the active admin password from highest-priority source.
 *  1. Operator-set value in admin-config (saved via Settings tab)
 *  2. SCRIPTURELIVE_ADMIN_PASSWORD env var
 *  3. Baked fallback 'admin' (with a one-time console warning so
 *     the operator notices they're using the default)
 */
let warnedDefault = false
export function resolveAdminPassword(): string {
  const cfg = getConfig()?.adminPassword
  if (cfg && cfg.trim()) return cfg.trim()
  const env = process.env.SCRIPTURELIVE_ADMIN_PASSWORD
  if (env && env.trim()) return env.trim()
  if (!warnedDefault) {
    warnedDefault = true
    // eslint-disable-next-line no-console
    console.warn('[admin-auth] No admin password set — using default "admin". Set one in the Admin → Settings tab.')
  }
  return 'admin'
}

/** Constant-time password comparison so a remote attacker can't
 *  use response-timing to learn the password length / prefix. */
export function passwordMatches(submitted: string): boolean {
  const expected = resolveAdminPassword()
  // Pad both to the same length to avoid an early-exit on
  // length-mismatch leaking length info.
  const len = Math.max(expected.length, submitted.length, 1)
  const a = Buffer.alloc(len)
  const b = Buffer.alloc(len)
  Buffer.from(expected, 'utf8').copy(a)
  Buffer.from(submitted, 'utf8').copy(b)
  let ok = false
  try { ok = timingSafeEqual(a, b) } catch { ok = false }
  // Also require true length equality so a longer guess that
  // shares a prefix doesn't match.
  return ok && expected.length === submitted.length
}

/** Mint a new session token and remember it. Returns the token
 *  the caller should put in a Set-Cookie header. */
export function createSession(): { token: string; expiresAt: number } {
  sweep()
  const token = randomBytes(48).toString('base64url')  // ~64 chars
  const expiresAt = Date.now() + SESSION_TTL_MS
  sessions.set(token, expiresAt)
  return { token, expiresAt }
}

/** Forget a session token (logout). */
export function destroySession(token: string | undefined): void {
  if (!token) return
  sessions.delete(token)
}

/** Returns true if the supplied token (from the cookie) is a known,
 *  unexpired admin session. */
export function isSessionValid(token: string | undefined): boolean {
  if (!token) return false
  sweep()
  const exp = sessions.get(token)
  if (!exp) return false
  if (exp <= Date.now()) { sessions.delete(token); return false }
  return true
}

/** Extract the admin session token from a request's Cookie header.
 *  Next.js's NextRequest exposes req.cookies.get(...) — we use the
 *  raw header here so the helper also works in plain Web Request
 *  shapes during testing. */
export function readSessionToken(req: Request): string | undefined {
  // Prefer the Next-style cookies API if present (NextRequest).
  const ck = (req as unknown as { cookies?: { get?: (n: string) => { value?: string } | undefined } }).cookies
  const v = ck?.get?.(ADMIN_COOKIE)?.value
  if (v) return v
  const raw = req.headers.get('cookie')
  if (!raw) return undefined
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === ADMIN_COOKIE) return rest.join('=')
  }
  return undefined
}

/** Drop-in guard for admin route handlers. Usage:
 *
 *    const guard = requireAdmin(req)
 *    if (guard) return guard
 *    ... handler body ...
 *
 *  Returns null when authorized, or a 401 NextResponse otherwise.
 *  Cookies are auto-sent by the browser on same-origin fetches,
 *  so the admin modal does not need to do anything special after
 *  /login succeeds — every subsequent admin fetch is gated. */
export function requireAdmin(req: Request): NextResponse | null {
  if (isSessionValid(readSessionToken(req))) return null
  return NextResponse.json(
    { error: 'Admin authentication required', code: 'ADMIN_AUTH_REQUIRED' },
    { status: 401 },
  )
}

/** Set-Cookie attribute string for a freshly-minted session. */
export function buildSessionCookie(token: string, expiresAt: number): string {
  const exp = new Date(expiresAt).toUTCString()
  return [
    `${ADMIN_COOKIE}=${token}`,
    `Path=/`,
    `Expires=${exp}`,
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    `HttpOnly`,
    `SameSite=Strict`,
  ].join('; ')
}

/** Set-Cookie string that immediately invalidates the cookie
 *  (used by /logout). */
export function buildClearCookie(): string {
  return [
    `${ADMIN_COOKIE}=`,
    `Path=/`,
    `Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
    `Max-Age=0`,
    `HttpOnly`,
    `SameSite=Strict`,
  ].join('; ')
}
