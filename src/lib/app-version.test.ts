import { describe, it, expect } from 'vitest'
import pkg from '../../package.json'
import { APP_VERSION, PACKAGE_VERSION } from './app-version'

describe('app-version', () => {
  it('PACKAGE_VERSION matches package.json `version` exactly', () => {
    // This is the safety net the task calls out: every `pnpm version`
    // bump should carry both the manifest and the renderer constant
    // forward together. If this assertion ever fails, the Settings
    // → Help & Updates card will start showing a stale version on
    // first paint.
    expect(PACKAGE_VERSION).toBe(pkg.version)
  })

  it('PACKAGE_VERSION is a non-empty semver-shaped string', () => {
    expect(typeof PACKAGE_VERSION).toBe('string')
    expect(PACKAGE_VERSION).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('APP_VERSION falls back to PACKAGE_VERSION when no env override is present', () => {
    // In the test environment NEXT_PUBLIC_APP_VERSION is unset, so
    // the seed should come straight from package.json — the same
    // value the desktop main process will report once the bridge
    // handshake lands.
    if (!process.env.NEXT_PUBLIC_APP_VERSION) {
      expect(APP_VERSION).toBe(PACKAGE_VERSION)
    } else {
      expect(APP_VERSION).toBe(process.env.NEXT_PUBLIC_APP_VERSION)
    }
  })
})
