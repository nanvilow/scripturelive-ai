// v0.7.8 — Reference Code system.
//
// PROBLEM
// -------
// Operator wanted a way to activate AI Detection on a customer's
// already-installed copy of the app WITHOUT either (a) issuing a
// permanent activation code from the CODES tab (which lives forever
// in the ledger and clutters the dashboard) or (b) cutting a fresh
// installer build (which can't reach customers who already paid and
// downloaded the v0.7.x EXE). The reference code closes that gap:
// the operator clicks one button in the Admin → Activation tab, gets
// a short human-readable code valid for ~30 minutes, and reads it
// out to the customer over WhatsApp / phone. The customer types it
// into a small "Have a reference code?" form on the lock overlay
// and AI Detection unlocks immediately.
//
// HOW IT WORKS — OFFLINE-VALIDATABLE
// ----------------------------------
// Reference codes are NOT stored in any ledger. Instead, both the
// operator install AND the customer install derive the same valid
// code at the same wall-clock time using:
//
//   code = HMAC-SHA256(referenceSecret, "ref:" + bucket) → first
//          40 bits → base32-uppercase (no I/O, formatted XXXX-XXXX
//          for readability).
//
// `referenceSecret` is sourced in priority order:
//   1. process.env.SCRIPTURELIVE_REFERENCE_SECRET  (operator can
//      override at build time via BUILD.bat or CI env vars)
//   2. BAKED_REFERENCE_SECRET — a constant compiled into every
//      v0.7.8+ build below. Same value on every install of the
//      same build, so cross-install validation works WITHOUT
//      either side having custom env vars set. Operators can
//      rotate this string per future release if they want to
//      invalidate all previously-handed-out reference codes.
//
// Note on per-install `masterCode`: the existing licensing
// `masterCode` is generated randomly PER INSTALL (storage.ts
// `generateMasterCode()`), so it is NOT suitable as the shared
// reference-code secret. We deliberately use a separate baked
// secret here so codes are valid across every install of the same
// build.
//
// 30-MINUTE WINDOW + GRACE
// ------------------------
// Codes are bucketed in 30-minute windows (1800_000 ms). Verification
// accepts the current bucket AND the previous bucket so a code minted
// at 11:29 still works for the customer at 11:31 (when they've finally
// finished paying). That gives a worst-case 60-minute validity window
// and a best-case ~30-minute window — which is exactly what the
// operator asked for ("expires in 30 min").
//
// SECURITY
// --------
// Codes are 8 base32 chars from a HMAC-SHA256 → ~40 bits of entropy
// per minted code. Brute-forcing within the 30 / 60-minute window
// would require ~10^12 attempts, far beyond what any customer-facing
// activation form would allow. The activate endpoint also rate-limits
// per-IP (see /api/license/activate-reference/route.ts).
//
// The masterCode never leaves the install — only HMAC outputs do.

import { createHmac } from 'node:crypto'

/** 30 minutes in ms. ALSO the "minted code expires in this much
 *  time" promise we make in the admin UI. */
export const REFERENCE_BUCKET_MS = 30 * 60 * 1000

/** Base32 alphabet, EXACTLY 32 chars so a 5-bit chunk maps 1:1
 *  with no aliasing / no biased symbol. Drops only the two most
 *  visually-confusable glyphs (I → 1, O → 0). Keeps L (with the
 *  upper-case font we use it reads cleanly), 0, 1, and the rest
 *  of the alphanumerics. 26 letters - 2 (I, O) + 8 digits (2-9)
 *  = 32. Result: every minted code carries a uniform 40-bit value
 *  with no skew toward the duplicated symbol the previous draft
 *  introduced. */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

/** Baked-in shared secret for cross-install reference-code
 *  derivation. Every install of v0.7.8+ holds this exact string,
 *  so an operator-minted code on machine A validates on customer
 *  machine B without either side talking to a server. Rotate this
 *  per release if you want to invalidate every previously-handed-
 *  out reference code; otherwise leave it stable so an upgraded
 *  v0.7.9 install can still accept v0.7.8-era operator codes. */
const BAKED_REFERENCE_SECRET = 'SL-REF-v078-K9wQpX2mZjN4vRtLcF7yBhA3uDgEsPkMfHnVbT5oI8eY6arXJ'

/** Resolve the active shared secret. Env var wins so an operator
 *  can override per-build (e.g., to rotate without changing source
 *  code). Falls back to BAKED_REFERENCE_SECRET so vanilla builds
 *  Just Work with no extra setup. */
function getReferenceSecret(): string {
  const fromEnv = process.env.SCRIPTURELIVE_REFERENCE_SECRET
  if (fromEnv && fromEnv.trim()) return fromEnv.trim()
  return BAKED_REFERENCE_SECRET
}

function hexToCode(hex: string): string {
  // Take 10 hex chars (40 bits) split into two 20-bit halves so we
  // stay below Number.MAX_SAFE_INTEGER without needing BigInt
  // (keeps the file portable to older TS targets in this repo).
  // Re-encode as 8 base32 chars from ALPHABET (5 bits per char × 8
  // = 40 bits). ALPHABET is EXACTLY 32 chars so `& 31` maps 1:1 to
  // an alphabet index with no aliasing / no biased symbol. Output
  // is always 8 chars, formatted XXXX-XXXX for phone read-out.
  const lo = parseInt(hex.slice(0, 5), 16) // 20 bits
  const hi = parseInt(hex.slice(5, 10), 16) // 20 bits
  const halves = [lo, hi]
  const out: string[] = []
  for (let h = 0; h < 2; h++) {
    let n = halves[h] || 0
    for (let i = 0; i < 4; i++) {
      out.push(ALPHABET[n & 31] || '2') // 32-char alphabet → no fold
      n = n >>> 5
    }
  }
  return out.join('').replace(/(.{4})(.{4})/, '$1-$2')
}

function bucketAt(ms: number): number {
  return Math.floor(ms / REFERENCE_BUCKET_MS)
}

/** Compute the reference code for a specific bucket index. Pure —
 *  deterministic given the build-baked referenceSecret. Same on
 *  every install of the same build, so the operator's machine and
 *  the customer's machine generate the same code for the same
 *  bucket. */
function codeForBucket(bucket: number): string {
  const secret = getReferenceSecret()
  const hex = createHmac('sha256', secret).update(`ref:${bucket}`).digest('hex')
  return hexToCode(hex)
}

export interface MintedReferenceCode {
  code: string
  /** Wall-clock ms at which the CURRENT bucket ends. Useful for
   *  the admin UI countdown ("Expires in mm:ss"). */
  expiresAt: number
  /** Same value, expressed in seconds remaining at mint time. */
  secondsRemaining: number
  bucket: number
}

/** Mint a reference code for the current 30-minute bucket. The
 *  same code is also valid for the next bucket via the +/-1 grace
 *  window in verifyReferenceCode(), so the worst-case lifetime is
 *  60 minutes and the best-case is just under 30. */
export function mintReferenceCode(): MintedReferenceCode {
  const now = Date.now()
  const bucket = bucketAt(now)
  const code = codeForBucket(bucket)
  const expiresAt = (bucket + 1) * REFERENCE_BUCKET_MS
  const secondsRemaining = Math.max(0, Math.floor((expiresAt - now) / 1000))
  return { code, expiresAt, secondsRemaining, bucket }
}

export interface VerifyReferenceCodeResult {
  valid: boolean
  /** When valid, which bucket relative to "now" matched (0 = current,
   *  -1 = previous, +1 = next — small positive grace covers minor
   *  clock skew between the operator's clock and the customer's). */
  bucketDelta?: -1 | 0 | 1
}

function normalize(input: string): string {
  // Map confusable glyphs that a customer might mistype on the phone:
  // I → 1 (not in alphabet, fails cleanly); O → 0 (not in alphabet,
  // fails cleanly). We also drop any non-alphanumeric (the dash, etc.)
  // so XXXX-XXXX, XXXXXXXX, and XXXX XXXX all normalise the same way.
  return (input || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/I/g, '1')
    .replace(/O/g, '0')
    .slice(0, 8)
}

/** Constant-time-ish equality for the 8-char codes. Length is
 *  always 8 here so bitwise compare is safe. */
function eq(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

/** Verify a customer-submitted reference code. Accepts the current
 *  bucket plus ±1 bucket of grace so:
 *    • -1: a code minted at the end of a window still works for the
 *      next ~30 min.
 *    • +1: small clock skew between the operator's PC and the
 *      customer's PC (e.g., one is 30 sec ahead) still validates.
 *  Worst-case validity ≈ 90 min, best-case ≈ 30 min. Returns
 *  { valid: false } for any other input. */
export function verifyReferenceCode(input: string): VerifyReferenceCodeResult {
  const submitted = normalize(input)
  if (submitted.length !== 8) return { valid: false }
  const now = Date.now()
  const cur = bucketAt(now)
  // Try current first so the freshly-minted code wins on the common
  // path; then previous (window roll-over); then next (skew).
  for (const delta of [0, -1, 1] as const) {
    const candidate = normalize(codeForBucket(cur + delta))
    if (eq(candidate, submitted)) return { valid: true, bucketDelta: delta }
  }
  return { valid: false }
}
