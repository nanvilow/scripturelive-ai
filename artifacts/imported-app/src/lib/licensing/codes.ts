// v1 licensing — code generators.
//
// `paymentRef`: a 3-digit zero-padded number (000-999). The operator
// asked for "3-digit or 4-digit"; 3 digits is shorter for the customer
// to type into the MoMo reference field. We collision-check against
// other ACTIVE (non-expired, non-paid) refs at allocation time and
// promote to 4 digits if all 1000 codes happen to be in flight.
//
// `activationCode`: SL-{PLAN}-{6 alphanum upper, no ambiguous chars}.
// We exclude 0/O/1/I/L/U so a customer reading the code over the phone
// doesn't transcribe "SL-1M-LOO0L1" into something nobody can verify.
//
// Both generators take a "taken" callback so the route handlers can
// retry against the storage file without exposing storage internals
// here.

import crypto from 'node:crypto'

const ACTIVATION_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'

function randInt(maxExclusive: number): number {
  // crypto.randomInt is uniform; Math.random has known bias on small ranges.
  return crypto.randomInt(0, maxExclusive)
}

export function generatePaymentRef(isTaken: (ref: string) => boolean): string {
  for (let attempt = 0; attempt < 200; attempt++) {
    const n = randInt(1000)
    const ref = String(n).padStart(3, '0')
    if (!isTaken(ref)) return ref
  }
  // 3-digit space exhausted — promote to 4 digits.
  for (let attempt = 0; attempt < 1000; attempt++) {
    const n = randInt(10000)
    const ref = String(n).padStart(4, '0')
    if (!isTaken(ref)) return ref
  }
  throw new Error('Unable to allocate a free payment reference code')
}

export function generateActivationSuffix(length = 6): string {
  let out = ''
  for (let i = 0; i < length; i++) {
    out += ACTIVATION_ALPHABET[randInt(ACTIVATION_ALPHABET.length)]
  }
  return out
}

export function generateActivationCode(planCode: string, isTaken: (code: string) => boolean): string {
  for (let attempt = 0; attempt < 200; attempt++) {
    const code = `SL-${planCode}-${generateActivationSuffix(6)}`
    if (!isTaken(code)) return code
  }
  // Bump to 8 chars on the (statistically impossible) collision storm.
  for (let attempt = 0; attempt < 200; attempt++) {
    const code = `SL-${planCode}-${generateActivationSuffix(8)}`
    if (!isTaken(code)) return code
  }
  throw new Error('Unable to allocate a free activation code')
}

export function generateMasterCode(): string {
  // 16-char master, plain SL-MASTER-… prefix so it is recognisable in
  // the audit log + the operator's email inbox.
  return `SL-MASTER-${generateActivationSuffix(8)}-${generateActivationSuffix(8)}`
}

export function isMasterCode(code: string): boolean {
  return /^SL-MASTER-/.test(code)
}

/** Normalise user-typed codes — strip whitespace, uppercase. */
export function normaliseCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '')
}
