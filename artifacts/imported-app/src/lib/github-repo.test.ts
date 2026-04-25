import { describe, it, expect } from 'vitest'
import pkg from '../../package.json'
import {
  GITHUB_OWNER,
  GITHUB_REPO,
  GITHUB_REPO_URL,
  releasesUrl,
  latestReleaseUrl,
  releaseTagUrl,
  compareUrl,
  newIssueUrl,
  quickStartUrl,
  troubleshootingUrl,
} from './github-repo'

describe('github-repo', () => {
  it('parses owner and repo from package.json `repository.url`', () => {
    // Sanity-check that the helper agrees with the canonical source —
    // electron-builder reads the same field at packaging time, so this
    // test is what keeps the auto-update feed and the in-app links
    // pointing at the same repo.
    const repository = (pkg as { repository?: { url?: string } | string }).repository
    const url =
      typeof repository === 'string'
        ? repository
        : (repository?.url ?? '')
    expect(url).toContain(`${GITHUB_OWNER}/${GITHUB_REPO}`)
    expect(GITHUB_OWNER).toBeTruthy()
    expect(GITHUB_REPO).toBeTruthy()
    expect(GITHUB_REPO).not.toMatch(/\.git$/)
  })

  it('builds the canonical repository URL', () => {
    expect(GITHUB_REPO_URL).toBe(`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`)
  })

  it('builds release page URLs', () => {
    expect(releasesUrl()).toBe(`${GITHUB_REPO_URL}/releases`)
    expect(latestReleaseUrl()).toBe(`${GITHUB_REPO_URL}/releases/latest`)
  })

  it('prefixes a bare semver with `v` when building a release-tag URL', () => {
    expect(releaseTagUrl('1.4.2')).toBe(`${GITHUB_REPO_URL}/releases/tag/v1.4.2`)
  })

  it('keeps an existing `v` prefix on a release-tag URL', () => {
    expect(releaseTagUrl('v1.4.2')).toBe(`${GITHUB_REPO_URL}/releases/tag/v1.4.2`)
  })

  it('falls back to the latest release page when version is empty/missing', () => {
    expect(releaseTagUrl('')).toBe(latestReleaseUrl())
    expect(releaseTagUrl('   ')).toBe(latestReleaseUrl())
    expect(releaseTagUrl(null)).toBe(latestReleaseUrl())
    expect(releaseTagUrl(undefined)).toBe(latestReleaseUrl())
  })

  it('url-encodes unusual characters in the version tag', () => {
    expect(releaseTagUrl('1.0.0-beta+build')).toBe(
      `${GITHUB_REPO_URL}/releases/tag/v1.0.0-beta%2Bbuild`,
    )
  })

  it('builds compare URLs between two refs', () => {
    expect(compareUrl('v1.0.0', 'v1.1.0')).toBe(
      `${GITHUB_REPO_URL}/compare/v1.0.0...v1.1.0`,
    )
  })

  it('builds the new-issue URL', () => {
    expect(newIssueUrl()).toBe(`${GITHUB_REPO_URL}/issues/new`)
  })

  it('builds the README quick-start anchor URL', () => {
    expect(quickStartUrl()).toBe(`${GITHUB_REPO_URL}#quick-start`)
  })

  it('builds the troubleshooting doc URL', () => {
    expect(troubleshootingUrl()).toBe(
      `${GITHUB_REPO_URL}/blob/main/docs/TROUBLESHOOTING.md`,
    )
  })
})
