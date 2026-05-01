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
import {
  getConfig,
  getFile,
  getPendingAdminReset,
  consumePendingAdminReset,
} from './storage'
import { getBakedAdminPassword } from '../baked-credentials'

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
 *     — per-PC override; lets one operator pick a custom local
 *     password on a single PC without affecting other installs.
 *  2. SCRIPTURELIVE_ADMIN_PASSWORD env var (live override on this
 *     box — useful for emergency lockout recovery without rebuild).
 *  3. v0.7.19 — Build-time baked password from
 *     getBakedAdminPassword(). Operator sets ADMIN_PASSWORD (or
 *     SCRIPTURELIVE_ADMIN_PASSWORD) once in deployment secrets,
 *     scripts/inject-keys.mjs bakes it into the .exe at build
 *     time, and every PC running the same build now defaults to
 *     the same password. This fixes the "I set 1234 on PC1 but
 *     PC2 still asks for the default 'admin'" report.
 *  4. Hard-coded 'admin' fallback (only if nothing above is set).
 *     Logs a one-time loud warning so the operator notices.
 */
let warnedDefault = false
export function resolveAdminPassword(): string {
  const cfg = getConfig()?.adminPassword
  if (cfg && cfg.trim()) return cfg.trim()
  const env = process.env.SCRIPTURELIVE_ADMIN_PASSWORD
  if (env && env.trim()) return env.trim()
  // v0.7.19 — Baked default from BUILD.bat. Empty when the operator
  // never set ADMIN_PASSWORD before building, in which case we fall
  // through to the legacy 'admin' default below for back-compat.
  let baked = ''
  try { baked = getBakedAdminPassword() } catch { /* baked module missing — ignore */ }
  if (baked && baked.trim()) return baked.trim()
  if (!warnedDefault) {
    warnedDefault = true
    // eslint-disable-next-line no-console
    console.warn('[admin-auth] No admin password set — using default "admin". Set ADMIN_PASSWORD before BUILD.bat (so every PC ships with the same one) or change it per-PC in Admin → Settings.')
  }
  return 'admin'
}

/** Constant-time string comparison helper. */
function constantTimeEq(expected: string, submitted: string): boolean {
  const len = Math.max(expected.length, submitted.length, 1)
  const a = Buffer.alloc(len)
  const b = Buffer.alloc(len)
  Buffer.from(expected, 'utf8').copy(a)
  Buffer.from(submitted, 'utf8').copy(b)
  let ok = false
  try { ok = timingSafeEqual(a, b) } catch { ok = false }
  return ok && expected.length === submitted.length
}

/** Constant-time password comparison so a remote attacker can't
 *  use response-timing to learn the password length / prefix.
 *  v0.7.7 — Also accepts (a) the master code (permanent fallback,
 *  same code that unlocks transcription) and (b) a live, unexpired
 *  one-time forgot-password OTP. The OTP is consumed on success so
 *  it can't be reused. The operator-set adminPassword stays the
 *  primary credential; the alternates exist purely so the operator
 *  can recover if they forget it. */
export function passwordMatches(submitted: string): boolean {
  if (!submitted) return false
  const expected = resolveAdminPassword()
  if (constantTimeEq(expected, submitted)) return true

  // Master code fallback — always works, same value the operator
  // already keeps for transcription unlock.
  try {
    const f = getFile()
    if (f.masterCode && constantTimeEq(f.masterCode, submitted)) return true
  } catch {
    /* storage unavailable — skip alternate */
  }

  // One-shot forgot-password OTP. consume on hit so the same code
  // can't be re-used by anyone who later sees the SMS / email.
  const reset = getPendingAdminReset()
  if (reset && constantTimeEq(reset.code, submitted)) {
    consumePendingAdminReset()
    return true
  }
  return false
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

/** v0.7.3 — Wipe every active admin session. Called from
 *  /api/license/admin/config when the admin password is changed
 *  so existing 12h cookies don't continue to work against the new
 *  password (operator's expectation: "I changed it, so re-login
 *  should be required"). Returns the number of sessions cleared
 *  for caller logging. */
export function revokeAllSessions(): number {
  const n = sessions.size
  sessions.clear()
  return n
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
