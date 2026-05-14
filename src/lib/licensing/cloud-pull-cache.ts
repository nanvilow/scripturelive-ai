// v0.7.173 — Server-side TTL cache for cloudPullAdminLedger.
//
// Pre-v0.7.173, every admin-panel GET (/admin/list, /admin/config,
// /admin/codes) awaited its own `cloudPullAdminLedger({ timeoutMs: 4000 })`
// before responding. Opening the modal fired all three in parallel,
// so the first paint was gated on the slowest cloud round-trip — up to
// the full 4 s ceiling on flaky Wi-Fi (Ghana p90), or instant when
// fast. Worse, every 5 s overview-tab poll re-paid the cost.
//
// This module wraps `cloudPullAdminLedger` so:
//   - The first read in a 30 s window awaits the cloud call ONCE
//     (with a tighter 2 s ceiling so even cold-start is bounded).
//   - All concurrent reads in that same window share the in-flight
//     promise — no thundering herd, no parallel cloud round-trips.
//   - Subsequent reads inside the TTL return instantly with the
//     cached snapshot and trigger a background refresh in the
//     background if the entry is older than `STALE_AFTER_MS`.
//   - On error we keep the previous good snapshot until TTL expires.
//
// Result: admin panel paints in <100 ms regardless of cloud latency,
// and cross-device sync still converges within ~30 s (bounded by TTL).
//
// Note: this is a per-process in-memory cache. Next dev mode boots
// a single Node process per artifact, and the packaged Electron build
// runs a single standalone server. Multi-replica deployments would
// need Redis, but ScriptureLive AI cloud is a single-replica Replit
// autoscale at present.

import { cloudPullAdminLedger, type AdminLedgerSnapshot } from './cloud-sync'
import { applyAdminLedgerSnapshot, getFile } from './storage'

interface CacheEntry {
  snapshot: AdminLedgerSnapshot | null
  fetchedAt: number
}

// One slot per installId — in practice always one slot (the local
// install) on desktop, and one per cloud caller on the cloud side
// (which doesn't self-pull anyway, so still effectively one slot).
const cache = new Map<string, CacheEntry>()
// Single in-flight promise per installId — coalesces concurrent reads
// during the first paint of the admin panel (3 endpoints fire at once).
const inflight = new Map<string, Promise<AdminLedgerSnapshot | null>>()

const FRESH_TTL_MS = 30_000
const STALE_AFTER_MS = 5_000
const FETCH_TIMEOUT_MS = 2_000

async function performPull(installId: string): Promise<AdminLedgerSnapshot | null> {
  try {
    const local = getFile()
    const snap = await cloudPullAdminLedger({
      installId: local.installId,
      config: local.config ?? null,
      timeoutMs: FETCH_TIMEOUT_MS,
    })
    if (snap) {
      try { applyAdminLedgerSnapshot(snap) } catch { /* persist failure — keep going */ }
    }
    cache.set(installId, { snapshot: snap, fetchedAt: Date.now() })
    return snap
  } catch {
    // On failure, keep the previous entry (if any) until TTL expires.
    // We still record fetchedAt so we don't hammer the cloud while it
    // is unreachable.
    const prev = cache.get(installId)
    cache.set(installId, { snapshot: prev?.snapshot ?? null, fetchedAt: Date.now() })
    return prev?.snapshot ?? null
  }
}

function startBackgroundPull(installId: string): void {
  if (inflight.has(installId)) return
  const p = performPull(installId).finally(() => { inflight.delete(installId) })
  inflight.set(installId, p)
  // Detach: caller doesn't await.
  void p.catch(() => { /* logged inside performPull */ })
}

/** Fast-path admin-ledger pull. Returns immediately when a cached
 *  snapshot is available; awaits the network only on cold start.
 *  A background refresh is kicked off whenever the cached entry is
 *  older than STALE_AFTER_MS so subsequent reads stay near-fresh
 *  without ever blocking. */
export async function cloudPullAdminLedgerCached(): Promise<AdminLedgerSnapshot | null> {
  const installId = (() => {
    try { return getFile().installId } catch { return 'default' }
  })()

  const now = Date.now()
  const entry = cache.get(installId)

  // Cold start: no entry yet — must await once.
  if (!entry) {
    let p = inflight.get(installId)
    if (!p) {
      p = performPull(installId).finally(() => { inflight.delete(installId) })
      inflight.set(installId, p)
    }
    return p
  }

  const age = now - entry.fetchedAt

  // Hard expiry (TTL exceeded) — must await fresh data, but coalesce
  // with any in-flight fetch so the 3 admin GETs share one cloud call.
  if (age > FRESH_TTL_MS) {
    let p = inflight.get(installId)
    if (!p) {
      p = performPull(installId).finally(() => { inflight.delete(installId) })
      inflight.set(installId, p)
    }
    return p
  }

  // Within TTL: return cached snapshot immediately. If we're past
  // STALE_AFTER_MS, kick off a background refresh so the next read
  // gets fresher data without paying any latency now.
  if (age > STALE_AFTER_MS) startBackgroundPull(installId)
  return entry.snapshot
}

/** Test/debug hook — clears the cache so the next call re-pulls. */
export function _resetCloudPullCacheForTests(): void {
  cache.clear()
  inflight.clear()
}
