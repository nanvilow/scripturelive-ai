// v0.7.14 — Electron MAIN-PROCESS telemetry helper.
//
// The Next.js telemetry-client (src/lib/licensing/telemetry-client.ts)
// runs inside the EMBEDDED standalone server. Errors that happen in
// the renderer or main process — uncaughtException, unhandledRejection,
// NDI native binding faults — never see that module. This helper is
// the main-process equivalent: a tiny POST shim that:
//
//   • lazy-loads the install_id from license.json (one shot, cached)
//   • fires error telemetry to /api/telemetry/error on the central
//     api-server, with a 4-second AbortController timeout
//   • SWALLOWS every failure (telemetry is best-effort and must never
//     turn a non-fatal main-process warning into an app crash)
//
// To rotate the URL: edit DEFAULT_TELEMETRY_URL, bump version, ship.
// Operators on older builds keep posting to the old URL — that
// endpoint can stay alive for a few releases.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { app } from 'electron'

const DEFAULT_TELEMETRY_URL =
  process.env.SCRIPTURELIVE_TELEMETRY_URL?.trim() ||
  'https://scripturelive.replit.app/api/telemetry'

const TIMEOUT_MS = 4_000

let cachedInstallId: string | null = null
let cachedAppVersion: string | undefined

function loadInstallId(): string | null {
  if (cachedInstallId) return cachedInstallId
  // license.json lives at  ~/.scripturelive/license.json on every
  // platform we ship (mirrors src/lib/licensing/storage.ts). We avoid
  // importing storage.ts itself because it pulls in the whole
  // licensing module graph (plans/codes/notifications/...) which
  // would be wasteful in the main process and risks circular
  // initialisation timing bugs.
  try {
    const home = os.homedir()
    const file = path.join(home, '.scripturelive', 'license.json')
    if (!fs.existsSync(file)) return null
    const raw = fs.readFileSync(file, 'utf-8')
    const j = JSON.parse(raw) as { installId?: string }
    if (j && typeof j.installId === 'string' && j.installId.length >= 8) {
      cachedInstallId = j.installId
      return cachedInstallId
    }
  } catch { /* swallow */ }
  return null
}

function appVersion(): string | undefined {
  if (cachedAppVersion) return cachedAppVersion
  try { cachedAppVersion = app.getVersion() } catch { cachedAppVersion = undefined }
  return cachedAppVersion
}

export interface MainProcessErrorPayload {
  errorType: string                   // e.g. 'uncaughtException', 'ndi_native'
  message: string                     // human-readable description
  stack?: string                      // truncated server-side at 8000 chars
  /** Override install id — defaults to the cached one read from
   *  license.json. Useful in test/dev where the file may not exist. */
  installId?: string
}

/**
 * Fire-and-forget. Resolves on completion / timeout / failure;
 * NEVER rejects. Safe to `void`.
 */
export async function pingErrorMain(p: MainProcessErrorPayload): Promise<void> {
  try {
    const installId = p.installId ?? loadInstallId()
    if (!installId) return // nothing useful to send (first-launch race)
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      await fetch(`${DEFAULT_TELEMETRY_URL}/error`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          installId,
          errorType: p.errorType.slice(0, 64),
          message: p.message.slice(0, 2000),
          stack: p.stack ? p.stack.slice(0, 8000) : undefined,
          appVersion: appVersion(),
        }),
        signal: ctrl.signal,
      })
    } finally {
      clearTimeout(t)
    }
  } catch {
    /* best-effort — never throw */
  }
}

/**
 * Convenience: format an unknown thrown value into a stable
 * { message, stack } pair before posting. Used by the
 * uncaughtException / unhandledRejection / ndi.on('error') wires.
 */
export function pingThrown(errorType: string, err: unknown): void {
  const message = err instanceof Error
    ? err.message
    : typeof err === 'string' ? err : (() => { try { return JSON.stringify(err) } catch { return String(err) } })()
  const stack = err instanceof Error ? err.stack : undefined
  void pingErrorMain({ errorType, message: message || '(no message)', stack })
}
