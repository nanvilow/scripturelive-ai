// v0.7.19 — Tests for resolveAdminPassword's 4-tier fallback chain.
//
// New in v0.7.19: a build-time baked password (BAKED_ADMIN_PASSWORD
// from src/lib/baked-credentials.ts, populated by
// scripts/inject-keys.mjs) sits BETWEEN the env-var override and
// the legacy hard-coded "admin" default. This was added because
// operators reported that a password they saved on PC1 (e.g.
// "1234") didn't carry over to PC2 — every fresh install fell
// back to the literal default. Baking the operator's chosen
// password into the .exe at build time gives every install of
// that build the same default password, while still allowing
// per-PC overrides via Admin → Settings.
//
// We exercise each tier in isolation and assert the priority
// order (config > env > baked > 'admin').

import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('./storage', () => ({
  getConfig: vi.fn(),
  getFile: vi.fn(() => ({})),
  getPendingAdminReset: vi.fn(() => null),
  consumePendingAdminReset: vi.fn(),
}))

vi.mock('../baked-credentials', () => ({
  getBakedAdminPassword: vi.fn(() => ''),
}))

import { resolveAdminPassword } from './admin-auth'
import { getConfig } from './storage'
import { getBakedAdminPassword } from '../baked-credentials'

const mockedGetConfig = vi.mocked(getConfig)
const mockedGetBaked = vi.mocked(getBakedAdminPassword)

describe('resolveAdminPassword', () => {
  beforeEach(() => {
    mockedGetConfig.mockReset()
    mockedGetBaked.mockReset()
    delete process.env.SCRIPTURELIVE_ADMIN_PASSWORD
    mockedGetConfig.mockReturnValue(undefined)
    mockedGetBaked.mockReturnValue('')
  })

  it('Tier 1 — operator override in license.json wins over everything', () => {
    mockedGetConfig.mockReturnValue({ adminPassword: 'per-pc-1234' } as never)
    process.env.SCRIPTURELIVE_ADMIN_PASSWORD = 'env-pwd'
    mockedGetBaked.mockReturnValue('baked-pwd')
    expect(resolveAdminPassword()).toBe('per-pc-1234')
  })

  it('trims whitespace around the per-PC override', () => {
    mockedGetConfig.mockReturnValue({ adminPassword: '   spaced  ' } as never)
    expect(resolveAdminPassword()).toBe('spaced')
  })

  it('Tier 2 — env var wins when no per-PC override is saved', () => {
    process.env.SCRIPTURELIVE_ADMIN_PASSWORD = 'env-pwd'
    mockedGetBaked.mockReturnValue('baked-pwd')
    expect(resolveAdminPassword()).toBe('env-pwd')
  })

  it('Tier 3 — baked default wins when no per-PC override and no env var', () => {
    mockedGetBaked.mockReturnValue('baked-1234')
    expect(resolveAdminPassword()).toBe('baked-1234')
  })

  it('trims whitespace around the baked default', () => {
    mockedGetBaked.mockReturnValue('   baked   ')
    expect(resolveAdminPassword()).toBe('baked')
  })

  it('Tier 4 — falls back to legacy "admin" only when nothing is configured', () => {
    expect(resolveAdminPassword()).toBe('admin')
  })

  it('treats an empty per-PC override as unset and falls through', () => {
    mockedGetConfig.mockReturnValue({ adminPassword: '   ' } as never)
    mockedGetBaked.mockReturnValue('baked')
    expect(resolveAdminPassword()).toBe('baked')
  })

  it('treats an empty env var as unset and falls through', () => {
    process.env.SCRIPTURELIVE_ADMIN_PASSWORD = '   '
    mockedGetBaked.mockReturnValue('baked')
    expect(resolveAdminPassword()).toBe('baked')
  })

  it('survives the baked module throwing — falls through to "admin"', () => {
    mockedGetBaked.mockImplementation(() => { throw new Error('baked module gone') })
    expect(resolveAdminPassword()).toBe('admin')
  })
})
