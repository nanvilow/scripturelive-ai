// v0.7.32 — Pin the default-on semantics of the LLM-classifier kill
// switch. The product contract is "default ON unless an operator has
// explicitly unticked the box" — i.e. only an explicit `false` value
// disables the classifier. Undefined / missing / null / true ALL
// resolve to enabled.
//
// If this test ever fails, do NOT relax it without a deliberate
// product decision: the v0.7.32 release notes promise operators that
// the AI voice fallback is on automatically with no admin action,
// and the marketing/support story is built on that. Three downstream
// callsites depend on this helper:
//   - /api/voice/classifier-status (renderer's cached enable flag)
//   - /api/voice/classify (server-side defensive gate)
//   - admin-modal hydration (initial checkbox state)

import { describe, it, expect } from 'vitest'

import { isLlmClassifierEnabled } from './storage'

describe('isLlmClassifierEnabled (v0.7.32 default-on contract)', () => {
  it('returns true when cfg is undefined', () => {
    expect(isLlmClassifierEnabled(undefined)).toBe(true)
  })

  it('returns true when cfg is null', () => {
    expect(isLlmClassifierEnabled(null)).toBe(true)
  })

  it('returns true when the field is missing', () => {
    expect(isLlmClassifierEnabled({})).toBe(true)
  })

  it('returns true when the field is undefined', () => {
    expect(isLlmClassifierEnabled({ enableLlmClassifier: undefined })).toBe(true)
  })

  it('returns true when the field is explicitly true', () => {
    expect(isLlmClassifierEnabled({ enableLlmClassifier: true })).toBe(true)
  })

  it('returns true when the field is null (admin endpoint clear-to-default)', () => {
    // The admin config endpoint accepts `null` to mean "remove the
    // override and fall back to the default". Default is ON, so null
    // must resolve to true.
    expect(isLlmClassifierEnabled({ enableLlmClassifier: null })).toBe(true)
  })

  it('returns FALSE only when the field is explicitly false', () => {
    expect(isLlmClassifierEnabled({ enableLlmClassifier: false })).toBe(false)
  })

  it('ignores unrelated config fields (structural-typing tolerance)', () => {
    // The helper accepts the loose shape `{ enableLlmClassifier?: ... }`,
    // so extra fields on a passed object are fine and must not affect
    // the outcome. Cast through `unknown` so the literal can carry an
    // unrelated property without widening the helper's parameter type.
    const cfg = { enableLlmClassifier: true, adminPassword: 'admin' }
    expect(
      isLlmClassifierEnabled(cfg as unknown as { enableLlmClassifier?: boolean | null }),
    ).toBe(true)
  })
})
