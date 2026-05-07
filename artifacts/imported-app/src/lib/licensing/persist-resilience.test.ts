// v0.7.96 — Concrete proof that persist() actually survives the
// failure modes the operator was hitting. These tests do NOT mock
// the production code paths; they install a fault-injecting hook
// inside `node:fs` so we exercise the real `persist()` →
// `enqueuePersist()` → `runPersistOnce()` path with a controlled
// disk that misbehaves the way Windows AV / OneDrive / a full disk
// would.
//
// The user said: "what shows that it working good now and you not
// just guessing". This file is the answer. Each test maps directly
// to a failure mode that produced "This page couldn't load" in the
// field:
//
//   1. AV holds the file lock for several attempts (EPERM x N → ok).
//   2. Disk is full / read-only (ENOSPC) — must NOT throw.
//   3. Operator clicks Deactivate then re-Activate while a retry
//      is pending — the LATEST data must win on disk (no stale
//      write race).
//   4. 100 rapid persist() calls — all return synchronously, final
//      state lands.
//
// Every test asserts the v0.7.96 contract:
//   - persist() returns synchronously, well under 50 ms.
//   - persist() never throws.
//   - The in-memory cache reflects the latest call immediately.
//   - The on-disk file eventually matches the LATEST persist() call.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as realFs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

// Module-level fault-injection state, mutated by each test before
// it triggers persist(). The vi.mock factory below reads from this
// object so we get per-test control without re-mocking.
type WriteOutcome = 'ok' | 'EPERM' | 'EBUSY' | 'EACCES' | 'ENOSPC'
const inj: {
  outcomes: WriteOutcome[]
  attempts: { path: string; outcome: WriteOutcome }[]
  guardPath: string
} = { outcomes: [], attempts: [], guardPath: '' }

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  const guardedWrite: typeof actual.writeFileSync = ((p, data, opts) => {
    const pathStr = String(p)
    const isOurs =
      inj.guardPath !== '' &&
      (pathStr === inj.guardPath || pathStr.startsWith(inj.guardPath + '.tmp.'))
    if (!isOurs) return actual.writeFileSync(p, data, opts)
    const outcome = inj.outcomes.shift() ?? 'ok'
    inj.attempts.push({ path: pathStr, outcome })
    if (outcome !== 'ok') {
      const e = new Error(`injected ${outcome}`) as NodeJS.ErrnoException
      e.code = outcome
      throw e
    }
    return actual.writeFileSync(p, data, opts)
  }) as typeof actual.writeFileSync
  // storage.ts uses `import fs from 'node:fs'` — that resolves to the
  // module's `default` export, NOT to the named exports. So the
  // hook MUST be installed on `default` too, otherwise the
  // production code goes straight through to the real disk.
  const mocked = { ...actual, writeFileSync: guardedWrite }
  return { ...mocked, default: mocked }
})

let storage: typeof import('./storage')
let tmpDir: string
let tmpFile: string

async function awaitPending(maxMs = 5_000): Promise<void> {
  const fn = (storage as unknown as { __awaitPendingPersistsForTests?: () => Promise<void> })
    .__awaitPendingPersistsForTests
  if (typeof fn !== 'function') return
  // Race the drain against a max budget so a permanently-failing disk
  // (ENOSPC test) doesn't block the suite for the full 60s deadline.
  await Promise.race([
    fn(),
    new Promise<void>((r) => setTimeout(r, maxMs)),
  ])
}

beforeEach(async () => {
  tmpDir = realFs.mkdtempSync(path.join(os.tmpdir(), 'sl-persist-test-'))
  tmpFile = path.join(tmpDir, 'license.json')
  process.env.SCRIPTURELIVE_LICENSE_DIR = tmpDir

  inj.outcomes = []
  inj.attempts = []
  inj.guardPath = tmpFile

  // Fresh import so the per-path PENDING map is empty between tests
  // and the in-memory cache singleton resets.
  vi.resetModules()
  storage = await import('./storage')
})

afterEach(async () => {
  await awaitPending(2_000)
  delete process.env.SCRIPTURELIVE_LICENSE_DIR
  inj.guardPath = ''
  try { realFs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
})

describe('v0.7.96 persist() resilience contract', () => {
  it('returns synchronously even when the disk write needs several retries (AV lock)', async () => {
    // v0.7.120 — Warm-up the module before the timed measurement.
    // `vi.resetModules()` + `await import('./storage')` in beforeEach
    // gives us a cold module; the FIRST saveConfig() call pays JIT +
    // lazy-init overhead (~70-150ms on slow CI) that is NOT part of
    // the contract being tested here. The contract is: "saveConfig
    // returns synchronously and does NOT block on disk-write retries".
    // A warm-up call with a sentinel value isolates the timed call
    // from cold-start overhead. The warm-up runs against the simulated
    // disk too (consumes one outcome from the array), so we prepend
    // an extra 'ok' so the timed measurement still sees the intended
    // 4×EPERM → ok retry sequence.
    inj.outcomes = ['ok', 'EPERM', 'EPERM', 'EPERM', 'EPERM', 'ok']
    storage.saveConfig({ momoNumber: '0240000000' }) // warm-up (untimed)
    await awaitPending()
    inj.attempts = [] // reset attempt log so the timed assertion is clean

    const t0 = Date.now()
    storage.saveConfig({ momoNumber: '0241111111' })
    const elapsed = Date.now() - t0

    // CONTRACT: saveConfig() (which calls persist()) returns synchronously.
    // The operator's fetch() → /api/license/* must not block on disk I/O.
    expect(elapsed).toBeLessThan(50)

    // CONTRACT: in-memory cache reflects the change immediately.
    expect(storage.getConfig()?.momoNumber).toBe('0241111111')

    await awaitPending()

    // CONTRACT: disk eventually matches the latest cache.
    const onDisk = JSON.parse(realFs.readFileSync(tmpFile, 'utf8')) as {
      config?: { momoNumber?: string }
    }
    expect(onDisk.config?.momoNumber).toBe('0241111111')

    // CONTRACT: we actually retried until success.
    expect(inj.attempts.length).toBeGreaterThanOrEqual(5)
    expect(inj.attempts[inj.attempts.length - 1]?.outcome).toBe('ok')
  }, 30_000)

  it('never throws when every disk write fails (ENOSPC permanent failure)', () => {
    // Every attempt fails. saveConfig must NOT throw — the operator's
    // POST /api/license/activate or /deactivate would otherwise
    // bubble a 500 to the renderer and trigger "This page couldn't
    // load". The 60s deadline eventually trips and logs, but for
    // test speed we only assert the synchronous contract here.
    inj.outcomes = Array(20).fill('ENOSPC') as WriteOutcome[]

    const t0 = Date.now()
    expect(() => storage.saveConfig({ momoNumber: '0242222222' })).not.toThrow()
    const elapsed = Date.now() - t0

    expect(elapsed).toBeLessThan(50)
    expect(storage.getConfig()?.momoNumber).toBe('0242222222')
  })

  it('with overlapping persist() calls the LATEST data wins on disk (no stale-write race)', async () => {
    // Simulate the operator sequence the architect flagged:
    //   call A: saveConfig({momoNumber: '111'}) — first write fails (AV lock)
    //   ... 25ms passes, retry chain pending ...
    //   call B: saveConfig({momoNumber: '999'}) — fires while A's retry is pending
    //
    // Pre-fix: A and B each had their own retry chain; A's eventual
    // rename could land AFTER B's, leaving '111' on disk while cache
    // says '999'. Post-fix: there's one PENDING slot per path; B
    // supersedes A's data in place; only the latest data ever lands.
    inj.outcomes = ['EPERM', 'ok', 'ok']

    storage.saveConfig({ momoNumber: '111' })
    await new Promise((r) => setTimeout(r, 25)) // mid retry-window
    storage.saveConfig({ momoNumber: '999' })

    await awaitPending()

    const onDisk = JSON.parse(realFs.readFileSync(tmpFile, 'utf8')) as {
      config?: { momoNumber?: string }
    }
    expect(onDisk.config?.momoNumber).toBe('999') // newer call wins
    expect(storage.getConfig()?.momoNumber).toBe('999') // cache agrees
  }, 30_000)

  it('100 rapid persist() calls all return synchronously and the final state lands', async () => {
    // Stress-test: simulate a burst of persist calls (status poll +
    // heartbeat + activate + trial tick all firing in the same tick
    // under load). All must return sync; the LAST state must win.
    inj.outcomes = []

    const t0 = Date.now()
    for (let i = 0; i < 100; i++) {
      storage.saveConfig({ momoNumber: `n${i}` })
    }
    const elapsed = Date.now() - t0

    expect(elapsed).toBeLessThan(200) // ~2ms per call, very generous
    expect(storage.getConfig()?.momoNumber).toBe('n99')

    await awaitPending()

    const onDisk = JSON.parse(realFs.readFileSync(tmpFile, 'utf8')) as {
      config?: { momoNumber?: string }
    }
    expect(onDisk.config?.momoNumber).toBe('n99')

    // Critically: we should NOT have done 100 disk writes. The
    // single-flight scheduler should have collapsed most of them
    // into the latest pending state.
    expect(inj.attempts.length).toBeLessThanOrEqual(10)
  })
})
