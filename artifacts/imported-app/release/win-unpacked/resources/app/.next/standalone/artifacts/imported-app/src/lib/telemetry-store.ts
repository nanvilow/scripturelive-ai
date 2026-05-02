// ─────────────────────────────────────────────────────────────────────
// Telemetry storage — REPLIT_DB-backed (with in-memory dev fallback).
// ─────────────────────────────────────────────────────────────────────
// v0.7.15 — The /api/telemetry/* routes back the operator's admin
// Records dashboard (active-now, total installs, errors, sessions,
// avg-session-duration KPI). v0.7.13 stood up the telemetry contract
// against an api-server + Drizzle + Postgres backend that was never
// deployed; the production app at scripturelive.replit.app is the
// imported-app Next.js bundle, so all desktop pings to
// `https://scripturelive.replit.app/api/telemetry/*` were silently
// 404'ing for two releases. v0.7.15 ports the api-server's storage
// model into the imported-app itself, backed by Replit DB (an HTTP
// key-value store available on every autoscale deployment) so a
// single deployment serves both the download landing page AND the
// telemetry sink — no separate api-server needed.
//
// On local dev (no REPLIT_DB_URL) we fall back to a process-lifetime
// in-memory Map so the routes still answer 200, just without
// persistence between server restarts.
//
// Schema (key prefixes):
//   inst:{installId}           → install metadata + lastSeenAt
//   hb:{tsIso}:{rand}          → per-heartbeat row (ts is sortable ISO)
//   err:{tsIso}:{rand}         → per-error row
//   code:{code}                → cached "last-seen by activation code"
//                                projection (write-through) so the
//                                /codes-last-seen aggregator is O(N
//                                requested codes) instead of O(N
//                                heartbeats).
//
// Keys carry the timestamp prefix so we can cheaply scan a window
// (today / last 24 h) by listing the prefix and filtering. Counts
// are small enough for the operator's church-scale usage that this
// is fine; if the operator ever scales to thousands of installs
// we can slap a daily-bucket layer on top without breaking callers.

const REPLIT_DB_URL = process.env.REPLIT_DB_URL?.trim() || ''

const memory = new Map<string, string>()

function memoryList(prefix: string): string[] {
  const out: string[] = []
  for (const k of memory.keys()) if (k.startsWith(prefix)) out.push(k)
  return out
}

export async function dbGet(key: string): Promise<string | null> {
  if (!REPLIT_DB_URL) return memory.get(key) ?? null
  const r = await fetch(`${REPLIT_DB_URL}/${encodeURIComponent(key)}`, {
    cache: 'no-store',
  })
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`db get failed ${r.status}`)
  return await r.text()
}

export async function dbSet(key: string, value: string): Promise<void> {
  if (!REPLIT_DB_URL) {
    memory.set(key, value)
    return
  }
  const body = `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
  const r = await fetch(REPLIT_DB_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!r.ok) throw new Error(`db set failed ${r.status}`)
}

export async function dbDelete(key: string): Promise<void> {
  if (!REPLIT_DB_URL) {
    memory.delete(key)
    return
  }
  await fetch(`${REPLIT_DB_URL}/${encodeURIComponent(key)}`, {
    method: 'DELETE',
  }).catch(() => undefined)
}

export async function dbList(prefix: string): Promise<string[]> {
  if (!REPLIT_DB_URL) return memoryList(prefix)
  const r = await fetch(
    `${REPLIT_DB_URL}?prefix=${encodeURIComponent(prefix)}`,
    { cache: 'no-store' },
  )
  if (!r.ok) throw new Error(`db list failed ${r.status}`)
  const text = await r.text()
  return text.split('\n').filter(Boolean)
}

// ── helpers ────────────────────────────────────────────────────────

/** Lower-case hex random suffix to disambiguate keys minted in the
 *  same millisecond. 8 chars = 32 bits = effectively zero collision
 *  for the operator's volume. */
export function randSuffix(): string {
  return Math.random().toString(16).slice(2, 10).padEnd(8, '0')
}

/** Anonymize an inbound IP to a /24 (IPv4) or /48 (IPv6) so we never
 *  retain a fully-identifying address. Mirror of the api-server
 *  helper so the privacy contract is identical. */
export function anonIp(raw: string | undefined | null): string | null {
  if (!raw) return null
  const ip = raw.split(',')[0]?.trim()
  if (!ip) return null
  if (ip.includes(':')) {
    const parts = ip.split(':').filter(Boolean)
    return parts.slice(0, 3).join(':') + '::/48'
  }
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`
}

/** Pull a best-effort client IP out of a Next.js request, honouring
 *  the standard upstream proxy headers Replit's edge sets. */
export function clientIpFrom(req: Request): string | null {
  const h = req.headers
  const cf = h.get('cf-connecting-ip')
  const xff = h.get('x-forwarded-for') || ''
  return anonIp(cf || xff)
}

/** Master-key gate. Mirrors the api-server policy: this server
 *  doesn't know the build's master code, so any non-trivial
 *  non-empty header is accepted. The actual gate is upstream — the
 *  desktop's /api/license/admin/records proxy only forwards if the
 *  operator has authed against /api/license/admin/login. Belt-and-
 *  braces: reject obvious test strings + anything <6 chars. */
export function masterKeyOK(req: Request): boolean {
  const incoming = req.headers.get('x-master-key')?.trim() || ''
  if (!incoming) return false
  if (incoming.length < 6) return false
  if (/^(test|admin|password|null|undefined)$/i.test(incoming)) return false
  return true
}

// ── shaped values stored under each prefix ─────────────────────────

export interface InstallRow {
  installId: string
  firstSeenAt: string
  lastSeenAt: string
  appVersion?: string | null
  os?: string | null
  countryCode?: string | null
}

export interface HeartbeatRow {
  installId: string
  sessionId?: string | null
  code?: string | null
  appVersion?: string | null
  ipAnon?: string | null
  location?: string | null
  features?: Record<string, unknown> | null
  ts: string
}

export interface ErrorRow {
  id: string
  installId: string
  code?: string | null
  appVersion?: string | null
  errorType: string
  message: string
  stack?: string | null
  ts: string
}

export interface CodeLastSeenRow {
  code: string
  lastSeenAt: string
  lastSeenLocation?: string | null
  lastSeenIp?: string | null
  installId: string
}
