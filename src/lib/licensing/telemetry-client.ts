// v0.7.13 — Central telemetry client (server-side, runs inside the
// embedded Next.js standalone bundle in the packaged Electron app).
//
// The api-server deployed at https://scripturelive.replit.app exposes:
//   POST /api/telemetry/install
//   POST /api/telemetry/heartbeat
//   POST /api/telemetry/error
//   POST /api/telemetry/codes-last-seen   (master-key gated)
//   GET  /api/telemetry/records           (master-key gated)
//
// All inbound calls from the desktop app are FIRE-AND-FORGET. A
// telemetry outage MUST NEVER block licensing, transcription, or any
// user-visible flow. We use AbortController + 4-second timeout and
// swallow every error.
//
// To rotate the URL: change DEFAULT_TELEMETRY_URL, bump version,
// rebuild + push. Operators on older builds keep posting to the old
// URL — that endpoint can be left alive for a few releases.

const DEFAULT_TELEMETRY_URL =
  process.env.NEXT_PUBLIC_SCRIPTURELIVE_TELEMETRY_URL?.trim() ||
  'https://scripturelive.replit.app/api/telemetry'

export function telemetryUrl(): string {
  return DEFAULT_TELEMETRY_URL
}

const TIMEOUT_MS = 4_000

// v0.7.14 — Per-app-launch session identity. Minted ONCE per Node
// process: the embedded Next.js standalone server starts when
// Electron starts and exits when Electron exits, so a process =
// a session. Heartbeats carry SESSION_ID so the central
// /telemetry/records endpoint can derive avg session duration as
// `max(ts) - min(ts)` per session_id.
function mintSessionId(): string {
  try {
    // Node's crypto.randomUUID is available on every supported
    // runtime; fall back to a Math.random scrap if for any reason
    // it isn't (telemetry is best-effort, never throw).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const c = require('node:crypto') as { randomUUID?: () => string }
    if (typeof c.randomUUID === 'function') return c.randomUUID()
  } catch { /* fall through */ }
  return (
    'sess-' +
    Date.now().toString(36) +
    '-' +
    Math.random().toString(36).slice(2, 10)
  )
}

export const SESSION_ID: string = mintSessionId()
export const SESSION_STARTED_AT: string = new Date().toISOString()
export function getSessionInfo(): { sessionId: string; startedAt: string } {
  return { sessionId: SESSION_ID, startedAt: SESSION_STARTED_AT }
}

async function postFireAndForget(path: string, body: unknown, headers?: Record<string, string>): Promise<void> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      await fetch(`${telemetryUrl()}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(headers ?? {}) },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })
    } finally {
      clearTimeout(t)
    }
  } catch {
    /* telemetry is best-effort — never bubble */
  }
}

export interface InstallPingPayload {
  installId: string
  appVersion?: string
  os?: string
  countryCode?: string
}
export function pingInstall(p: InstallPingPayload): Promise<void> {
  return postFireAndForget('/install', p)
}

export interface HeartbeatPayload {
  installId: string
  /** v0.7.14 — per-app-launch session UUID. Defaults to the module-
   *  level SESSION_ID if the caller doesn't pass one, so existing
   *  call sites get session tracking automatically. */
  sessionId?: string
  code?: string
  appVersion?: string
  location?: string
  /** v0.7.17 — OS string (e.g. "win32 10.0.19045") and ISO country
   *  code, both forwarded by the desktop on every heartbeat. The
   *  install-ping is one-shot and routinely missed (network blip,
   *  disabled telemetry, fresh-install race) so the records
   *  dashboard's App ver / OS / Country columns used to show "—"
   *  for any install whose initial ping never landed. Sending
   *  these on every heartbeat backfills them within 30s of first
   *  launch and keeps appVersion accurate across upgrades. */
  os?: string
  countryCode?: string
  features?: Record<string, number | boolean>
}
export function pingHeartbeat(p: HeartbeatPayload): Promise<void> {
  return postFireAndForget('/heartbeat', { sessionId: SESSION_ID, ...p })
}

export interface ErrorPayload {
  installId: string
  code?: string
  appVersion?: string
  errorType: string
  message: string
  stack?: string
  /** v0.7.43 — Reporter contact fields. Required when
   *  errorType === 'user_report' so the operator can follow up
   *  with the customer; ignored for system-generated error rows
   *  (uncaught exceptions, SMTP failures, etc.) which have no
   *  human reporter to contact. Validated upstream in
   *  /api/license/report-issue and stored as part of the
   *  ErrorRow so the admin Records dashboard can surface them. */
  reporterName?: string
  reporterPhone?: string
  reporterLocation?: string
}
export function pingError(p: ErrorPayload): Promise<void> {
  return postFireAndForget('/error', p)
}

// ── Admin-only (master-key gated) ─────────────────────────────────

export interface CodesLastSeenMap {
  [code: string]: { lastSeenAt: string; lastSeenLocation?: string; lastSeenIp?: string }
}

export async function fetchCodesLastSeen(
  codes: string[],
  masterKey: string,
): Promise<CodesLastSeenMap> {
  if (codes.length === 0 || !masterKey) return {}
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      const r = await fetch(`${telemetryUrl()}/codes-last-seen`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-master-key': masterKey,
        },
        body: JSON.stringify({ codes }),
        signal: ctrl.signal,
        cache: 'no-store',
      })
      if (!r.ok) return {}
      const j = (await r.json().catch(() => ({}))) as {
        ok?: boolean
        codes?: CodesLastSeenMap
      }
      return j.codes ?? {}
    } finally {
      clearTimeout(t)
    }
  } catch {
    return {}
  }
}

export interface RecordsResp {
  ok: boolean
  generatedAt?: string
  activeNow?: number
  totalInstalls?: number
  sessionsToday?: number
  /** v0.7.14 — average session duration today, in milliseconds.
   *  Derived server-side as avg(max(ts)-min(ts)) per (install_id,
   *  session_id) for sessions that produced ≥2 heartbeats today.
   *  Single-heartbeat sessions are excluded so they don't drag the
   *  average to ~0. Undefined when no qualifying sessions exist. */
  avgSessionMs?: number
  errorsToday?: number
  topFeatures?: { name: string; count: number }[]
  recentErrors?: {
    id: number
    errorType: string
    message: string
    ts: string
    installId: string
    code?: string
    appVersion?: string
  }[]
  systemStatus?: {
    server: 'ok' | 'idle' | 'down'
    ai: 'ok' | 'idle' | 'down'
    ndi: 'ok' | 'idle' | 'down'
  }
  error?: string
}

export async function fetchRecords(masterKey: string): Promise<RecordsResp> {
  if (!masterKey) return { ok: false, error: 'no_master_key' }
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      const r = await fetch(`${telemetryUrl()}/records`, {
        method: 'GET',
        headers: { 'x-master-key': masterKey },
        signal: ctrl.signal,
        cache: 'no-store',
      })
      if (!r.ok) return { ok: false, error: `http_${r.status}` }
      return (await r.json()) as RecordsResp
    } finally {
      clearTimeout(t)
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'fetch_failed' }
  }
}
