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
 *  looks up geo (cached), and returns both for storage. */
export async function captureGeoFromRequest(req: Request): Promise<{ ip?: string; location?: string }> {
  const ip = clientIpFromRequest(req)
  if (!ip) return {}
  const g = await lookupGeo(ip)
  const location = formatGeoLocation(g)
  return { ip, location }
}
