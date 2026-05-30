// v0.7.265 — Per-code Deepgram AI-detection usage accounting.
//
// These tests pin the durable-accumulator contract that the admin
// "AI usage" / "Est. cost" columns are built on:
//
//   1. addDeepgramUsage(code, deltaMs) increments a SINGLE monotonic
//      accumulator on the matching activation record.
//   2. A missing / empty code is a no-op (returns false) — telemetry
//      from a device with no active subscription must never mint rows.
//   3. Non-positive / non-finite deltas are rejected (defensive against
//      a renderer clock glitch sending 0 / NaN / negative wall-clock).
//   4. Each delta is capped at 30 minutes so a single runaway flush
//      (socket held open through a sleep/wake) can't inflate the ledger.
//   5. applyAdminLedgerSnapshot MAX-merges deepgramUsageMs so a stale
//      inbound snapshot can never roll a device's usage BACKWARDS —
//      the accumulator is monotonic across cross-device sync.
//
// The tests exercise the REAL load()/persist() disk path against a
// temp license dir (same pattern as persist-resilience.test.ts) — no
// mocking of the production code, so a regression in the accumulator
// or the merge rule fails here.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as realFs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

let storage: typeof import('./storage')
let tmpDir: string

const planLookup = (_code: string): { days: number } | null => ({ days: 30 })

function newCode(): string {
  const rec = storage.generateStandaloneActivation(
    { planCode: 'STD', days: 30 },
    planLookup,
  )
  return rec.code
}

function usageOf(code: string): number | undefined {
  return storage
    .listAdminCodes({ includeDeleted: true })
    .find((r) => r.code === code)?.deepgramUsageMs
}

beforeEach(async () => {
  tmpDir = realFs.mkdtempSync(path.join(os.tmpdir(), 'sl-dgusage-test-'))
  process.env.SCRIPTURELIVE_LICENSE_DIR = tmpDir
  vi.resetModules()
  storage = await import('./storage')
})

afterEach(() => {
  delete process.env.SCRIPTURELIVE_LICENSE_DIR
  try { realFs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
})

describe('addDeepgramUsage (v0.7.265 durable accumulator)', () => {
  it('increments a single monotonic accumulator on the matching code', () => {
    const code = newCode()
    expect(usageOf(code) ?? 0).toBe(0)

    expect(storage.addDeepgramUsage(code, 60_000)).toBe(true)
    expect(usageOf(code)).toBe(60_000)

    // A second flush ADDS to the same accumulator (single-accumulator
    // contract — NOT a max, NOT a replace).
    expect(storage.addDeepgramUsage(code, 30_000)).toBe(true)
    expect(usageOf(code)).toBe(90_000)
  })

  it('is a no-op for an empty or unknown code', () => {
    const code = newCode()
    expect(storage.addDeepgramUsage('', 60_000)).toBe(false)
    expect(storage.addDeepgramUsage('NOPE-DOES-NOT-EXIST', 60_000)).toBe(false)
    expect(usageOf(code) ?? 0).toBe(0)
  })

  it('rejects non-positive and non-finite deltas', () => {
    const code = newCode()
    expect(storage.addDeepgramUsage(code, 0)).toBe(false)
    expect(storage.addDeepgramUsage(code, -5_000)).toBe(false)
    expect(storage.addDeepgramUsage(code, Number.NaN)).toBe(false)
    expect(storage.addDeepgramUsage(code, Number.POSITIVE_INFINITY)).toBe(false)
    expect(usageOf(code) ?? 0).toBe(0)
  })

  it('caps a single delta at 30 minutes (runaway-flush guard)', () => {
    const code = newCode()
    const THIRTY_MIN = 30 * 60 * 1000
    // One hour in a single flush must land as 30 minutes, not 60.
    expect(storage.addDeepgramUsage(code, 60 * 60 * 1000)).toBe(true)
    expect(usageOf(code)).toBe(THIRTY_MIN)
  })
})

describe('applyAdminLedgerSnapshot deepgramUsageMs MAX-merge (monotonic)', () => {
  it('takes the higher of local vs inbound and never rolls backwards', () => {
    const code = newCode()
    storage.addDeepgramUsage(code, 120_000) // local = 120s
    expect(usageOf(code)).toBe(120_000)

    const base = storage.extractAdminLedgerSnapshot()

    // Inbound snapshot with a LOWER value must NOT lower local usage.
    const stale = {
      ...base,
      activationCodes: base.activationCodes.map((a) =>
        a.code === code ? { ...a, deepgramUsageMs: 30_000 } : a,
      ),
    }
    storage.applyAdminLedgerSnapshot(stale)
    expect(usageOf(code)).toBe(120_000)

    // Inbound snapshot with a HIGHER value must win (another device
    // streamed more audio against the same code).
    const ahead = {
      ...base,
      activationCodes: base.activationCodes.map((a) =>
        a.code === code ? { ...a, deepgramUsageMs: 500_000 } : a,
      ),
    }
    storage.applyAdminLedgerSnapshot(ahead)
    expect(usageOf(code)).toBe(500_000)
  })
})
