// v0.7.153 — Cross-device admin-panel sync proof.
//
// Spins up two ledger directories simulating "phone (cloud)" and
// "desktop (Electron)" installs, then exercises the snapshot
// extract → cloud merge → snapshot pull → local merge round-trip
// to prove that admin actions on either side become visible on
// the other.
//
// No real network: we drive the cloud route handlers directly,
// swapping SCRIPTURELIVE_LICENSE_DIR + module cache between calls
// so each "device" has its own isolated license.json.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

type StorageModule = typeof import('./storage')

interface DeviceCtx {
  dir: string
  storage: StorageModule
}

async function loadStorageInDir(dir: string): Promise<StorageModule> {
  process.env.SCRIPTURELIVE_LICENSE_DIR = dir
  // Reset the module registry so storage.ts re-evaluates with the new
  // SCRIPTURELIVE_LICENSE_DIR — its `cache` and persist queue must be
  // local to each "device".
  vi.resetModules()
  return (await import('./storage')) as StorageModule
}

async function withDevice<T>(ctx: DeviceCtx, fn: (m: StorageModule) => Promise<T> | T): Promise<T> {
  process.env.SCRIPTURELIVE_LICENSE_DIR = ctx.dir
  return await fn(ctx.storage)
}

describe('v0.7.153 — cross-device admin ledger sync', () => {
  let cloudDir: string
  let desktopDir: string
  let cloud: DeviceCtx
  let desktop: DeviceCtx
  const findPlan = (planCode: string) =>
    planCode === 'CUSTOM' ? null : { days: 30 }

  beforeEach(async () => {
    cloudDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-cloud-'))
    desktopDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-desk-'))
    // Disable real network base URL so any accidental fetch fails fast.
    process.env.SCRIPTURELIVE_CLOUD_BASE = ''
    delete process.env.REPLIT_DEPLOYMENT_ID
    delete process.env.SCRIPTURELIVE_CLOUD_ADMIN_CODE

    // Pre-seed cloud's license.json BEFORE the first storage import.
    // If we let storage bootstrap and then mutate masterCode after the
    // fact, the bootstrap's already-queued enqueuePersist writes a
    // pre-mutation JSON snapshot back to disk and overwrites our edit.
    const seed = {
      schemaVersion: 1 as const,
      installId: 'cloud-test-install',
      firstLaunchAt: new Date().toISOString(),
      trialDurationMs: 60 * 60 * 1000,
      masterCode: 'TEST-MASTER-CODE-1234',
      activeSubscription: null,
      paymentCodes: [],
      activationCodes: [],
      notifications: [],
    }
    fs.writeFileSync(path.join(cloudDir, 'license.json'), JSON.stringify(seed, null, 2))

    const cloudStorage = await loadStorageInDir(cloudDir)
    cloud = { dir: cloudDir, storage: cloudStorage }

    const desktopStorage = await loadStorageInDir(desktopDir)
    desktop = { dir: desktopDir, storage: desktopStorage }
    // Pair desktop to cloud by setting cloudAdminCode in its config.
    desktopStorage.saveConfig({ cloudAdminCode: 'TEST-MASTER-CODE-1234' })
  })

  afterEach(() => {
    delete process.env.SCRIPTURELIVE_LICENSE_DIR
    fs.rmSync(cloudDir, { recursive: true, force: true })
    fs.rmSync(desktopDir, { recursive: true, force: true })
  })

  it('extracts a snapshot that excludes per-PC fields', async () => {
    await withDevice(desktop, (s) => {
      const snap = s.extractAdminLedgerSnapshot()
      expect(snap.paymentCodes).toEqual([])
      expect(snap.activationCodes).toEqual([])
      expect(snap.notifications).toEqual([])
      // cloudAdminCode is per-PC and MUST NOT leave the device.
      expect(snap.config?.cloudAdminCode).toBeUndefined()
    })
  })

  it('phone-side admin action surfaces on desktop after a sync round-trip', async () => {
    // 1. Phone (cloud) admin generates an activation code.
    const phoneActivation = await withDevice(cloud, (s) =>
      s.generateStandaloneActivation(
        { planCode: '1M', note: 'Pastor John — Lagos', email: 'pastor@example.com' },
        findPlan,
      ),
    )
    expect(phoneActivation.code).toMatch(/^SL-/)

    // 2. Phone snapshot — what cloudPullAdminLedger would return.
    const cloudSnapshot = await withDevice(cloud, (s) => s.extractAdminLedgerSnapshot())
    expect(cloudSnapshot.activationCodes.find((a) => a.code === phoneActivation.code)).toBeDefined()

    // 3. Desktop admin pulls + merges the snapshot (what /admin/list
    //    does after v0.7.153 BEFORE returning).
    const desktopChanged = await withDevice(desktop, (s) =>
      s.applyAdminLedgerSnapshot(cloudSnapshot),
    )
    expect(desktopChanged).toBeGreaterThan(0)

    // 4. Desktop now sees the phone-generated code in its admin list.
    await withDevice(desktop, (s) => {
      const codes = s.listAdminCodes({ includeDeleted: false })
      const seen = codes.find((c) => c.code === phoneActivation.code)
      expect(seen).toBeDefined()
      expect(seen?.generatedFor?.note).toBe('Pastor John — Lagos')
    })

    // 5. Re-applying the same snapshot is idempotent (no double rows).
    const desktopChanged2 = await withDevice(desktop, (s) =>
      s.applyAdminLedgerSnapshot(cloudSnapshot),
    )
    expect(desktopChanged2).toBe(0)
  })

  it('desktop-side admin action surfaces on the cloud after a push', async () => {
    // 1. Desktop admin confirms a customer payment, minting an
    //    activation. Both rows land in the local desktop ledger.
    const desktopActivation = await withDevice(desktop, (s) => {
      s.createPaymentCode({
        planCode: '1M',
        amountGhs: 250,
        email: 'buyer@example.com',
        whatsapp: '233200000000',
      })
      // The ref the customer typed was the most-recent one.
      const f = s.getFile()
      const ref = f.paymentCodes[f.paymentCodes.length - 1].ref
      return s.confirmPaymentAndIssueActivation(ref, findPlan)
    })
    expect(desktopActivation.activation.code).toMatch(/^SL-/)

    // 2. Desktop pushes its snapshot → cloud merges it.
    const desktopSnapshot = await withDevice(desktop, (s) => s.extractAdminLedgerSnapshot())
    const cloudChanged = await withDevice(cloud, (s) => s.applyAdminLedgerSnapshot(desktopSnapshot))
    expect(cloudChanged).toBeGreaterThan(0)

    // 3. Cloud (= phone admin) now sees the desktop-confirmed payment
    //    AND the freshly minted activation code.
    await withDevice(cloud, (s) => {
      const f = s.getFile()
      const payment = f.paymentCodes.find((p) => p.email === 'buyer@example.com')
      expect(payment?.status).toBe('PAID')
      expect(payment?.activationCode).toBe(desktopActivation.activation.code)
      const codes = s.listAdminCodes({ includeDeleted: false })
      expect(codes.find((c) => c.code === desktopActivation.activation.code)).toBeDefined()
    })
  })

  it('cancellations and soft-deletes propagate via latest-write-wins', async () => {
    // Both sides start with the same activation row.
    const seedSnapshot = await withDevice(cloud, (s) => {
      s.generateStandaloneActivation({ planCode: '1M', note: 'seed' }, findPlan)
      return s.extractAdminLedgerSnapshot()
    })
    await withDevice(desktop, (s) => s.applyAdminLedgerSnapshot(seedSnapshot))
    const code = seedSnapshot.activationCodes[0].code

    // Phone admin cancels the code.
    await withDevice(cloud, (s) => s.cancelActivationByCode(code, 'chargeback'))
    const afterCancelSnapshot = await withDevice(cloud, (s) => s.extractAdminLedgerSnapshot())

    // Desktop pulls — sees the cancellation.
    await withDevice(desktop, (s) => s.applyAdminLedgerSnapshot(afterCancelSnapshot))
    await withDevice(desktop, (s) => {
      const row = s.getFile().activationCodes.find((a) => a.code === code)
      expect(row?.cancelledAt).toBeDefined()
      expect(row?.cancelReason).toBe('chargeback')
    })

    // Desktop admin then soft-deletes (later wall-clock).
    await new Promise((r) => setTimeout(r, 10))
    await withDevice(desktop, (s) => s.softDeleteActivationByCode(code))
    const afterDeleteSnapshot = await withDevice(desktop, (s) => s.extractAdminLedgerSnapshot())

    // Cloud merges the desktop change — soft-delete propagates.
    await withDevice(cloud, (s) => s.applyAdminLedgerSnapshot(afterDeleteSnapshot))
    await withDevice(cloud, (s) => {
      const row = s.getFile().activationCodes.find((a) => a.code === code)
      expect(row?.softDeletedAt).toBeDefined()
      expect(row?.cancelledAt).toBeDefined() // cancellation preserved
    })
  })

  it('hard-deletes propagate as tombstones — no resurrection from stale snapshots', async () => {
    // Both sides start with the same code (seed via cloud).
    const seed = await withDevice(cloud, (s) => {
      s.generateStandaloneActivation({ planCode: '1M', note: 'tombstone-test' }, findPlan)
      return s.extractAdminLedgerSnapshot()
    })
    await withDevice(desktop, (s) => s.applyAdminLedgerSnapshot(seed))
    const code = seed.activationCodes[0].code

    // Capture STALE desktop snapshot BEFORE the cloud delete (this is
    // the "older sibling" the merge must NOT use to resurrect).
    const desktopStaleSnapshot = await withDevice(desktop, (s) => s.extractAdminLedgerSnapshot())
    expect(desktopStaleSnapshot.activationCodes.find((a) => a.code === code)).toBeDefined()

    // Cloud admin hard-deletes the row. A tombstone is recorded.
    await withDevice(cloud, (s) => s.deleteActivationByCode(code))
    const cloudPostDelete = await withDevice(cloud, (s) => s.extractAdminLedgerSnapshot())
    expect(cloudPostDelete.activationCodes.find((a) => a.code === code)).toBeUndefined()
    expect(cloudPostDelete.deletedActivationCodes?.find((t) => t.code === code)).toBeDefined()

    // Cloud receives the desktop's stale snapshot (the resurrection
    // attack). Local tombstone must reject the incoming row.
    await withDevice(cloud, (s) => s.applyAdminLedgerSnapshot(desktopStaleSnapshot))
    await withDevice(cloud, (s) => {
      const row = s.getFile().activationCodes.find((a) => a.code === code)
      expect(row).toBeUndefined() // still deleted; resurrection blocked
    })

    // Desktop pulls cloud's post-delete snapshot — propagates the
    // tombstone and evicts the local copy.
    await withDevice(desktop, (s) => s.applyAdminLedgerSnapshot(cloudPostDelete))
    await withDevice(desktop, (s) => {
      const row = s.getFile().activationCodes.find((a) => a.code === code)
      expect(row).toBeUndefined()
      const tomb = s.getFile().deletedActivationCodes?.find((t) => t.code === code)
      expect(tomb).toBeDefined()
    })
  })

  it('hard-delete tombstones survive a process restart (re-hydrated from disk)', async () => {
    // Seed both sides with the same code.
    const seed = await withDevice(cloud, (s) => {
      s.generateStandaloneActivation({ planCode: '1M', note: 'restart-test' }, findPlan)
      return s.extractAdminLedgerSnapshot()
    })
    await withDevice(desktop, (s) => s.applyAdminLedgerSnapshot(seed))
    const code = seed.activationCodes[0].code

    // Capture the stale desktop snapshot BEFORE the cloud delete.
    const desktopStale = await withDevice(desktop, (s) => s.extractAdminLedgerSnapshot())

    // Cloud hard-deletes — tombstone goes to disk.
    await withDevice(cloud, (s) => s.deleteActivationByCode(code))
    // Drain pending fire-and-forget persist writes before reload.
    await new Promise((r) => setTimeout(r, 50))

    // Simulate process restart: drop the cached storage module and
    // re-import from the same dir. The fresh `cache` is rebuilt by
    // load(), which must hydrate the on-disk tombstone arrays.
    cloud.storage = await loadStorageInDir(cloudDir)
    await withDevice(cloud, (s) => {
      const f = s.getFile()
      const tomb = f.deletedActivationCodes?.find((t) => t.code === code)
      expect(tomb).toBeDefined() // survived restart
      expect(f.activationCodes.find((a) => a.code === code)).toBeUndefined()
    })

    // The post-restart cloud STILL rejects the resurrection attempt
    // from desktop's stale snapshot.
    await withDevice(cloud, (s) => s.applyAdminLedgerSnapshot(desktopStale))
    await withDevice(cloud, (s) => {
      expect(s.getFile().activationCodes.find((a) => a.code === code)).toBeUndefined()
    })
  })

  it('soft-delete restore propagates via tri-state (restore wins over older bin)', async () => {
    // Seed the same code on both sides.
    const seed = await withDevice(cloud, (s) => {
      s.generateStandaloneActivation({ planCode: '1M', note: 'restore-test' }, findPlan)
      return s.extractAdminLedgerSnapshot()
    })
    await withDevice(desktop, (s) => s.applyAdminLedgerSnapshot(seed))
    const code = seed.activationCodes[0].code

    // Cloud soft-deletes (older action).
    await withDevice(cloud, (s) => s.softDeleteActivationByCode(code))
    const cloudBin = await withDevice(cloud, (s) => s.extractAdminLedgerSnapshot())
    await withDevice(desktop, (s) => s.applyAdminLedgerSnapshot(cloudBin))
    await withDevice(desktop, (s) => {
      const row = s.getFile().activationCodes.find((a) => a.code === code)
      expect(row?.softDeletedAt).toBeDefined()
    })

    // Desktop restores (newer action).
    await new Promise((r) => setTimeout(r, 10))
    await withDevice(desktop, (s) => s.restoreActivationByCode(code))
    const desktopRestoredSnap = await withDevice(desktop, (s) => s.extractAdminLedgerSnapshot())
    const restoredRow = desktopRestoredSnap.activationCodes.find((a) => a.code === code)
    expect(restoredRow?.softDeletedAt).toBeUndefined()
    expect(restoredRow?.softDeleteRestoredAt).toBeDefined()

    // Cloud merges desktop's restore. Restore must win (it's newer
    // than cloud's softDeletedAt) and clear the bin status.
    await withDevice(cloud, (s) => s.applyAdminLedgerSnapshot(desktopRestoredSnap))
    await withDevice(cloud, (s) => {
      const row = s.getFile().activationCodes.find((a) => a.code === code)
      expect(row).toBeDefined()
      expect(row?.softDeletedAt).toBeUndefined() // restore won
      expect(row?.softDeleteRestoredAt).toBeDefined()
    })

    // The reverse pull from cloud back to desktop must NOT silently
    // re-bin the row (cloud's softDeletedAt is older than desktop's
    // restore timestamp).
    const cloudPostMerge = await withDevice(cloud, (s) => s.extractAdminLedgerSnapshot())
    await withDevice(desktop, (s) => s.applyAdminLedgerSnapshot(cloudPostMerge))
    await withDevice(desktop, (s) => {
      const row = s.getFile().activationCodes.find((a) => a.code === code)
      expect(row?.softDeletedAt).toBeUndefined()
    })
  })

  it('config merge uses wall-clock LWW (stale push cannot overwrite newer cloud value)', async () => {
    // Cloud sets price (newer wall-clock).
    await withDevice(cloud, (s) => s.saveConfig({ planPriceOverrides: { '1M': 250 } }))
    const cloudCfgSnap = await withDevice(cloud, (s) => s.extractAdminLedgerSnapshot())
    const cloudUpdatedAt = cloudCfgSnap.config?.updatedAt
    expect(cloudUpdatedAt).toBeDefined()

    // Build a STALE desktop snapshot that pretends to have set price
    // EARLIER than the cloud (older updatedAt → must lose).
    await new Promise((r) => setTimeout(r, 5))
    const desktopStaleSnapshot = await withDevice(desktop, (s) => s.extractAdminLedgerSnapshot())
    const stale = {
      ...desktopStaleSnapshot,
      config: {
        ...(desktopStaleSnapshot.config ?? {}),
        planPriceOverrides: { '1M': 999 },
        updatedAt: new Date(Date.parse(cloudUpdatedAt!) - 60_000).toISOString(),
      },
    }

    // Cloud merges stale snapshot — must PRESERVE its newer 250 value.
    await withDevice(cloud, (s) => s.applyAdminLedgerSnapshot(stale))
    await withDevice(cloud, (s) => {
      const cfg = s.getConfig()
      expect(cfg?.planPriceOverrides?.['1M']).toBe(250)
    })

    // Now build a STRICTLY-newer desktop snapshot — must win.
    await new Promise((r) => setTimeout(r, 5))
    const fresh = {
      ...desktopStaleSnapshot,
      config: {
        ...(desktopStaleSnapshot.config ?? {}),
        planPriceOverrides: { '1M': 300 },
        updatedAt: new Date(Date.parse(cloudUpdatedAt!) + 60_000).toISOString(),
      },
    }
    await withDevice(cloud, (s) => s.applyAdminLedgerSnapshot(fresh))
    await withDevice(cloud, (s) => {
      const cfg = s.getConfig()
      expect(cfg?.planPriceOverrides?.['1M']).toBe(300)
    })
  })

  it('v0.7.166 — activation lifecycle (isUsed/usedAt/subscriptionExpiresAt) propagates cross-device', async () => {
    // Reproduces the operator screenshots: same 5-code ledger,
    // desktop showed "1 ACTIVE / 3 UNUSED" while phone showed
    // "0 ACTIVE / 4 UNUSED" because the v0.7.153 activation merge
    // never adopted the incoming isUsed flip.

    // 1. Cloud (phone) and desktop both start with the SAME unused code.
    const seed = await withDevice(cloud, (s) => {
      s.generateStandaloneActivation({ planCode: '1M', note: 'lifecycle-test' }, findPlan)
      return s.extractAdminLedgerSnapshot()
    })
    const code = seed.activationCodes[0].code
    await withDevice(desktop, (s) => s.applyAdminLedgerSnapshot(seed))

    // Both sides agree it's never-used.
    await withDevice(cloud, (s) => {
      const row = s.getFile().activationCodes.find((a) => a.code === code)
      expect(row?.isUsed).toBe(false)
    })
    await withDevice(desktop, (s) => {
      const row = s.getFile().activationCodes.find((a) => a.code === code)
      expect(row?.isUsed).toBe(false)
    })

    // 2. Desktop activates the code (the operator pastes it into a
    //    fresh install). We mutate the row directly to mirror what
    //    activateCode() does to the persisted activation row, without
    //    coupling the test to the full subscription bookkeeping.
    const usedAt = new Date().toISOString()
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    await withDevice(desktop, (s) => {
      const f = s.getFile()
      const row = f.activationCodes.find((a) => a.code === code)!
      row.isUsed = true
      row.usedAt = usedAt
      row.subscriptionExpiresAt = expiresAt
    })

    // 3. Desktop pushes its snapshot to the cloud (the every-list-read
    //    fan-out in v0.7.160).
    const desktopSnap = await withDevice(desktop, (s) => s.extractAdminLedgerSnapshot())
    const cloudChanged = await withDevice(cloud, (s) => s.applyAdminLedgerSnapshot(desktopSnap))
    expect(cloudChanged).toBeGreaterThan(0)

    // 4. Cloud (= phone admin reads here) MUST now report the code as
    //    USED with the desktop's usedAt + subscriptionExpiresAt. This
    //    is the assertion the v0.7.153 code FAILED — pre-fix the
    //    cloud row stayed isUsed=false and the phone admin saw
    //    NEVER-USED for a code that was actively running on desktop.
    await withDevice(cloud, (s) => {
      const row = s.getFile().activationCodes.find((a) => a.code === code)
      expect(row?.isUsed).toBe(true)
      expect(row?.usedAt).toBe(usedAt)
      expect(row?.subscriptionExpiresAt).toBe(expiresAt)
    })

    // 5. Monotonic guard: a STALE snapshot that still says
    //    isUsed=false MUST NOT un-use the cloud row.
    const staleUnusedSnap = {
      ...desktopSnap,
      activationCodes: desktopSnap.activationCodes.map((a) =>
        a.code === code
          ? { ...a, isUsed: false, usedAt: undefined, subscriptionExpiresAt: undefined }
          : a,
      ),
    }
    await withDevice(cloud, (s) => s.applyAdminLedgerSnapshot(staleUnusedSnap))
    await withDevice(cloud, (s) => {
      const row = s.getFile().activationCodes.find((a) => a.code === code)
      expect(row?.isUsed).toBe(true) // monotonic — cannot revert
      expect(row?.usedAt).toBe(usedAt)
      expect(row?.subscriptionExpiresAt).toBe(expiresAt)
    })

    // 6. Renewal: a LATER usedAt + further-out expiry must win.
    const renewalUsedAt = new Date(Date.parse(usedAt) + 60_000).toISOString()
    const renewalExp = new Date(Date.parse(expiresAt) + 30 * 24 * 60 * 60 * 1000).toISOString()
    const renewalSnap = {
      ...desktopSnap,
      activationCodes: desktopSnap.activationCodes.map((a) =>
        a.code === code
          ? { ...a, isUsed: true, usedAt: renewalUsedAt, subscriptionExpiresAt: renewalExp }
          : a,
      ),
    }
    await withDevice(cloud, (s) => s.applyAdminLedgerSnapshot(renewalSnap))
    await withDevice(cloud, (s) => {
      const row = s.getFile().activationCodes.find((a) => a.code === code)
      expect(row?.usedAt).toBe(renewalUsedAt)
      expect(row?.subscriptionExpiresAt).toBe(renewalExp)
    })
  })

  it('rejects snapshots from a wrong cloudAdminCode (constant-time compare)', async () => {
    // Cloud-side snapshot route enforces the credential. Drive it
    // directly with a NextRequest mock. We must reset the module
    // cache so the route's dynamic `import` of storage.ts re-evaluates
    // against SCRIPTURELIVE_LICENSE_DIR=cloudDir (otherwise it would
    // re-use the storage module instance the desktop test seeded,
    // whose masterCode is the desktop's random value).
    process.env.SCRIPTURELIVE_LICENSE_DIR = cloudDir
    vi.resetModules()
    const { POST } = (await import('../../app/api/license/cloud/admin-snapshot/route')) as unknown as {
      POST: (req: Request) => Promise<Response>
    }

    // Wrong credential → 401
    const bad = await POST(
      new Request('http://x/api/license/cloud/admin-snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cloudAdminCode: 'WRONG-CODE', installId: 'desk-123' }),
      }),
    )
    expect(bad.status).toBe(401)

    // Correct credential → 200 with snapshot
    const good = await POST(
      new Request('http://x/api/license/cloud/admin-snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cloudAdminCode: 'TEST-MASTER-CODE-1234',
          installId: 'desk-123',
        }),
      }),
    )
    expect(good.status).toBe(200)
    const j = (await good.json()) as { ok: boolean; snapshot: unknown }
    expect(j.ok).toBe(true)
    expect(j.snapshot).toBeDefined()
  })
})
