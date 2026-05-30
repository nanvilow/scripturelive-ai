// v0.7.266 — Pin the customer-facing MoMo-number migration.
//
// The operator split the two phone-number roles apart: the RECEIVING
// MoMo wallet (the modal's "Send MoMo to" row, where customers actually
// pay) moved to 0530686367, while the WhatsApp SUPPORT / payment-proof
// line (the modal's "contact support" + "send a screenshot" lines and
// the receipt "contact us" link) STAYS on 0246798526.
//
// Operators who customised these via the in-app Admin Settings screen
// still have older values persisted in license.json, and the payment
// modal renders those persisted values — so migrateStaleConfigNumbers()
// must (a) push a stale 0246798526 momoNumber forward to 0530686367 and
// (b) pull a stale 0530686367 whatsappNumber back to 0246798526, while
// leaving the operator's INTERNAL SMS-alert line (adminPhone) on
// 0246798526.
//
// Money is on the line here: a wrong direction sends customer MoMo to a
// wallet the church no longer owns, or shows the wrong support number.
// These tests exercise the REAL load() disk path against a temp license
// dir (same pattern as persist-resilience.test.ts) — no mocking of the
// production migration.
//
// Contract:
//   1. persisted momoNumber     0246798526 -> 0530686367 (money dest)
//   2. persisted whatsappNumber 0530686367 -> 0246798526 (support pin)
//   3. persisted adminPhone     0530686367 -> 0246798526 (internal pin)
//   4. an already-correct money wallet (0530686367) is left intact
//   5. an already-correct support line (0246798526) is left intact
//   6. a custom operator number is never touched

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as realFs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const MONEY_OLD = '0246798526'
const MONEY_NEW = '0530686367'
const SUPPORT_PINNED = '0246798526'

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
  tmpDir = realFs.mkdtempSync(path.join(os.tmpdir(), 'sl-momo-migration-'))
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

describe('v0.7.266 customer-facing MoMo/support number migration', () => {
  it('rewrites a persisted momoNumber 0246798526 -> 0530686367 (money destination)', () => {
    writeLicense({ momoNumber: MONEY_OLD })
    expect(storage.getConfig()?.momoNumber).toBe(MONEY_NEW)
  })

  it('pins a stale persisted whatsappNumber 0530686367 back to 0246798526 (support line)', () => {
    writeLicense({ whatsappNumber: MONEY_NEW })
    expect(storage.getConfig()?.whatsappNumber).toBe(SUPPORT_PINNED)
  })

  it('pins a stale persisted adminPhone 0530686367 back to 0246798526', () => {
    writeLicense({ adminPhone: MONEY_NEW })
    expect(storage.getConfig()?.adminPhone).toBe(MONEY_OLD)
  })

  it('leaves an already-correct money wallet (0530686367) intact', () => {
    writeLicense({ momoNumber: MONEY_NEW })
    expect(storage.getConfig()?.momoNumber).toBe(MONEY_NEW)
  })

  it('leaves an already-correct support line (0246798526) intact', () => {
    writeLicense({ whatsappNumber: SUPPORT_PINNED })
    expect(storage.getConfig()?.whatsappNumber).toBe(SUPPORT_PINNED)
  })

  it('never touches a custom operator number', () => {
    writeLicense({ momoNumber: '0551234567', adminPhone: '0559876543' })
    const cfg = storage.getConfig()
    expect(cfg?.momoNumber).toBe('0551234567')
    expect(cfg?.adminPhone).toBe('0559876543')
  })

  it('tolerates formatted (spaced) persisted numbers', () => {
    writeLicense({ momoNumber: '024 679 8526' })
    expect(storage.getConfig()?.momoNumber).toBe(MONEY_NEW)
  })
})
