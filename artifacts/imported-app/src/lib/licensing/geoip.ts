// v0.7.0 — Free, no-key geo-IP lookup for the activation-code admin
// dashboard. Operator request: "All activation codes must show where
// the user is using it from, through their accurate internet location
// or any other means."
//
// Uses ip-api.com which:
//   • is free for non-commercial use (45 req/min from one IP)
//   • requires no API key
//   • returns city/region/country/CC in one call
//
// Lookups are cached in-memory for 30 minutes per IP — the same
// install pings license/status frequently and we don't want to burn
// the rate budget on heartbeats.
//
// Always best-effort: a failed lookup returns undefined and the
// caller stores nothing rather than displaying garbage.

interface GeoResult {
  city?: string
  regionName?: string
  country?: string
  countryCode?: string
}

const cache = new Map<string, { at: number; result: GeoResult | null }>()
const CACHE_TTL_MS = 30 * 60 * 1000

/** Extract the client's public IP from a Next.js request. We trust
 *  x-forwarded-for (the deployment proxy adds it) and fall back to
 *  x-real-ip then the connection remote address. Multiple commas in
 *  XFF mean a chain of proxies — we want the FIRST entry, which is
 *  the original client. Strips port and IPv6 brackets. */
export function clientIpFromRequest(req: Request): string | undefined {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return cleanIp(first)
  }
  const xri = req.headers.get('x-real-ip')
  if (xri) return cleanIp(xri.trim())
  return undefined
}

/** v0.7.3 — Cached lookup of THIS server's own public IP via
 *  ip-api.com (no IP arg → uses caller's outbound address).
 *  Used when the request's client IP is loopback / RFC1918, which
 *  is the common case for the desktop Electron build (the
 *  Next.js server is bound to 127.0.0.1 and the buyer enters their
 *  code on the same machine). Without this fallback the operator's
 *  dashboard showed empty geo for every activation, which is what
 *  the operator's bug report flagged: "doesn't show the accurate
 *  region, country, city, or town." */
let serverPublicIpCache: { at: number; ip: string | null } | null = null
const SERVER_IP_TTL_OK_MS = 24 * 60 * 60 * 1000  // 24 h on success
const SERVER_IP_TTL_FAIL_MS = 5 * 60 * 1000      // 5 min on failure
// v0.7.3.1 — Tight 1.5s timeout so the geo enrichment cannot stretch
// the activation / status request when ip-api.com is slow or unreachable.
// On timeout we negative-cache for 5 min (not 24 h) so a transient
// outage doesn't disable geo for the whole day.
const SERVER_IP_FETCH_TIMEOUT_MS = 1500

async function resolveServerPublicIp(): Promise<string | null> {
  const now = Date.now()
  if (serverPublicIpCache) {
    const age = now - serverPublicIpCache.at
    const ttl = serverPublicIpCache.ip ? SERVER_IP_TTL_OK_MS : SERVER_IP_TTL_FAIL_MS
    if (age < ttl) return serverPublicIpCache.ip
  }
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), SERVER_IP_FETCH_TIMEOUT_MS)
    const res = await fetch('http://ip-api.com/json/?fields=status,query', { signal: controller.signal })
    clearTimeout(t)
    if (!res.ok) {
      serverPublicIpCache = { at: now, ip: null }
      return null
    }
    const data = (await res.json()) as { status?: string; query?: string }
    const ip = data.status === 'success' && typeof data.query === 'string' ? data.query : null
    serverPublicIpCache = { at: now, ip }
    return ip
  } catch {
    serverPublicIpCache = { at: now, ip: null }
    return null
  }
}

function cleanIp(ip: string): string {
  // Strip IPv6 brackets and any port suffix.
  let s = ip.replace(/^\[|\]$/g, '')
  // IPv4 with port: 1.2.3.4:5678 → 1.2.3.4 (but not for IPv6).
  if (s.includes('.') && s.split(':').length === 2) {
    s = s.split(':')[0]
  }
  return s
}

/** Returns true for IPs that are private/loopback/local — no point
 *  hitting ip-api.com for these (it'll return "fail, reserved range"). */
function isPrivateIp(ip: string): boolean {
  if (!ip) return true
  if (ip === '127.0.0.1' || ip === '::1') return true
  if (ip.startsWith('10.')) return true
  if (ip.startsWith('192.168.')) return true
  if (ip.startsWith('169.254.')) return true
  // 172.16.0.0 — 172.31.255.255
  const m = ip.match(/^172\.(\d+)\./)
  if (m) {
    const oct = Number(m[1])
    if (oct >= 16 && oct <= 31) return true
  }
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true  // IPv6 ULA
  if (ip.startsWith('fe80:')) return true                       // IPv6 link-local
  return false
}

export async function lookupGeo(ip: string | undefined): Promise<GeoResult | null> {
  if (!ip) return null
  if (isPrivateIp(ip)) return null
  const cached = cache.get(ip)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.result
  try {
    // 5-second timeout — we don't want geo lookups to drag activation
    // requests when the venue's network is shaky.
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,regionName,city`,
      { signal: controller.signal },
    )
    clearTimeout(t)
    if (!res.ok) {
      cache.set(ip, { at: Date.now(), result: null })
      return null
    }
    const data = (await res.json()) as { status?: string; city?: string; regionName?: string; country?: string; countryCode?: string }
    if (data.status !== 'success') {
      cache.set(ip, { at: Date.now(), result: null })
      return null
    }
    const result: GeoResult = {
      city: data.city,
      regionName: data.regionName,
      country: data.country,
      countryCode: data.countryCode,
    }
    cache.set(ip, { at: Date.now(), result })
    return result
  } catch {
    cache.set(ip, { at: Date.now(), result: null })
    return null
  }
}

/** Format a GeoResult into a single human-readable line for the
 *  admin dashboard column. Returns undefined for null/empty geo
 *  so the storage layer doesn't persist an empty string. */
export function formatGeoLocation(g: GeoResult | null | undefined): string | undefined {
  if (!g) return undefined
  const parts: string[] = []
  if (g.city) parts.push(g.city)
  if (g.regionName && g.regionName !== g.city) parts.push(g.regionName)
  if (g.country) parts.push(g.country)
  let out = parts.join(', ')
  if (g.countryCode && !out.includes(`(${g.countryCode})`)) out = out + (out ? ' ' : '') + `(${g.countryCode})`
  return out || undefined
}

/** One-call helper used by activate + status routes. Pulls the IP,
 *  looks up geo (cached), and returns both for storage.
 *
 *  v0.7.3 — When the request's client IP is missing or RFC1918
 *  (which is virtually always the case on the desktop Electron
 *  build, where the buyer's browser hits 127.0.0.1), we fall back
 *  to the server's own outbound public IP via resolveServerPublicIp().
 *  The geo result then describes where the operator's PC is on the
 *  internet, which is the closest stand-in available without a
 *  separate IP-from-the-internet round-trip in the buyer's browser. */
export async function captureGeoFromRequest(req: Request): Promise<{ ip?: string; location?: string; countryCode?: string }> {
  let ip = clientIpFromRequest(req)
  if (!ip || isPrivateIp(ip)) {
    const fallback = await resolveServerPublicIp()
    if (fallback) ip = fallback
  }
  if (!ip || isPrivateIp(ip)) return ip ? { ip } : {}
  const g = await lookupGeo(ip)
  const location = formatGeoLocation(g)
  // v0.7.17 — Surface the ISO country code separately so callers
  // (telemetry install + heartbeat) can persist it on the install
  // row regardless of whether the desktop client could derive it
  // locally. Was previously embedded only inside the formatted
  // location string, which the records dashboard doesn't parse
  // — that left the Country column showing "—" for any install
  // whose first /telemetry/install ping never reached us.
  return { ip, location, countryCode: g?.countryCode || undefined }
}
