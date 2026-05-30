// Task #126 — Direct safety test for reloadFromDisk().
//
// reloadFromDisk() is the SINGLE supported way to make the licensing
// layer re-read operator-saved settings from license.json after an
// out-of-band change (another process, or a fixture written straight
// to disk). All reads funnel through a module-level in-memory `cache`
// populated lazily by load(); the one thing that cache cannot see on
// its own is a file rewritten behind its back. reloadFromDisk() just
// clears that cache so the next read re-hydrates from disk.
//
// Until now this contract was only exercised indirectly via the
// route-level payment-number-split test. This locks it in at the
// storage level so a future refactor of the cache can't silently
// break out-of-band reads.
//
// Same temp-dir pattern as momo-number-migration.test.ts: a real
// SCRIPTURELIVE_LICENSE_DIR pointed at a freshly-minted tmp dir, the
// REAL load()/getConfig() disk path, no mocking.
//
// IMPORTANT: the config values below (momoName) are chosen so they do
// NOT collide with migrateStaleConfigNumbers() — that migration only
// touches momoNumber/whatsappNumber/adminPhone, so a plain label field
// round-trips through disk untouched and the stale-vs-fresh assertions
// stay about the cache, not the migration.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as realFs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

let storage: typeof import('./storage')
let tmpDir: string
let tmpFile: string

function writeLicense(config: Record<string, unknown>): void {
  const file = {
    schemaVersion: 1,
    installId: 'test-install',
    firstLaunchAt: new Date().toISOString(),
    activeSubscription: null,
    paymentCodes: [],
    activationCodes: [],
    notifications: [],
    config,
  }
  realFs.writeFileSync(tmpFile, JSON.stringify(file), 'utf8')
}

beforeEach(async () => {
  tmpDir = realFs.mkdtempSync(path.join(os.tmpdir(), 'sl-reload-'))
  tmpFile = path.join(tmpDir, 'license.json')
  process.env.SCRIPTURELIVE_LICENSE_DIR = tmpDir
  const { vi } = await import('vitest')
  vi.resetModules()
  storage = await import('./storage')
})

afterEach(() => {
  delete process.env.SCRIPTURELIVE_LICENSE_DIR
  try { realFs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
})

describe('reloadFromDisk() picks up out-of-band license.json edits', () => {
  it('returns the STALE cached value until reloadFromDisk() is called, then the FRESH disk value', () => {
    // 1. Seed disk + populate the in-memory cache via the first read.
    writeLicense({ momoName: 'Original Name' })
    expect(storage.getConfig()?.momoName).toBe('Original Name')

    // 2. Out-of-band rewrite straight to disk (cache still holds v1).
    writeLicense({ momoName: 'Changed Name' })

    // 3. Without reloadFromDisk(), the read is still served from cache.
    expect(storage.getConfig()?.momoName).toBe('Original Name')

    // 4. reloadFromDisk() invalidates the cache; next read re-hydrates.
    storage.reloadFromDisk()
    expect(storage.getConfig()?.momoName).toBe('Changed Name')
  })

  it('keeps the file on disk intact (unlike __testReset, which deletes it)', () => {
    writeLicense({ momoName: 'Persist Me' })
    expect(storage.getConfig()?.momoName).toBe('Persist Me')

    storage.reloadFromDisk()

    // The file is still there and still readable after a reload.
    expect(realFs.existsSync(tmpFile)).toBe(true)
    expect(storage.getConfig()?.momoName).toBe('Persist Me')
  })
})
