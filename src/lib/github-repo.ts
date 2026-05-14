// Single source of truth for the project's GitHub owner/repo and any URL
// the app builds against it (release pages, issue tracker, docs links).
//
// The canonical owner/repo lives in `package.json`'s `repository.url`
// field. electron-builder auto-detects the same value at packaging time
// (see electron-builder.yml — the `publish` block deliberately omits
// `owner`/`repo`), so everything that points at the GitHub repo —
// auto-update feeds, the in-app "View on GitHub" link in the update
// banner, and the Quick Start / Troubleshooting / Report-a-bug links
// in Settings — stays in lockstep when the repo is renamed or moved.
//
// To move the project to a different GitHub repo, update
// `repository.url` in `artifacts/imported-app/package.json` and both
// the build config and these constants will follow.

import pkg from '../../package.json'

type RepositoryField =
  | string
  | { url?: string }
  | undefined

function parseGithubRepo(repository: RepositoryField): { owner: string; repo: string } {
  let raw: string | undefined
  if (typeof repository === 'string') {
    raw = repository
  } else if (repository && typeof repository === 'object') {
    raw = repository.url
  }
  if (!raw) {
    throw new Error(
      'package.json `repository` field is missing — github-repo.ts cannot determine owner/repo.',
    )
  }

  // Normalize common forms electron-builder + npm accept:
  //   "owner/repo"
  //   "https://github.com/owner/repo"
  //   "https://github.com/owner/repo.git"
  //   "git+https://github.com/owner/repo.git"
  //   "git@github.com:owner/repo.git"
  const cleaned = raw.replace(/^git\+/, '').replace(/\.git$/, '')

  const shorthand = cleaned.match(/^([^/\s:]+)\/([^/\s:]+)$/)
  if (shorthand) return { owner: shorthand[1], repo: shorthand[2] }

  const url = cleaned.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\/|$)/)
  if (url) return { owner: url[1], repo: url[2] }

  throw new Error(
    `package.json \`repository\` does not look like a GitHub repo: ${raw}`,
  )
}

const { owner, repo } = parseGithubRepo(pkg.repository as RepositoryField)

/** GitHub owner (user or org) parsed from package.json's `repository.url`. */
export const GITHUB_OWNER = owner

/** GitHub repository name parsed from package.json's `repository.url`. */
export const GITHUB_REPO = repo

/** Canonical https URL of the GitHub repository (no trailing slash). */
export const GITHUB_REPO_URL = `https://github.com/${owner}/${repo}`

/** URL of the project's GitHub releases page (lists every release). */
export function releasesUrl(): string {
  return `${GITHUB_REPO_URL}/releases`
}

/** URL of the "latest" release on GitHub. */
export function latestReleaseUrl(): string {
  return `${GITHUB_REPO_URL}/releases/latest`
}

/**
 * URL of a specific release tag. Accepts either a bare semver
 * ("1.4.2") or a "v"-prefixed tag ("v1.4.2"); falls back to the
 * "latest" page when given an empty/whitespace-only version.
 */
export function releaseTagUrl(version: string | null | undefined): string {
  const v = (version ?? '').trim()
  if (!v) return latestReleaseUrl()
  const tag = v.startsWith('v') ? v : `v${v}`
  return `${GITHUB_REPO_URL}/releases/tag/${encodeURIComponent(tag)}`
}

/** URL of the "compare two refs" page on GitHub. */
export function compareUrl(from: string, to: string): string {
  return `${GITHUB_REPO_URL}/compare/${encodeURIComponent(from)}...${encodeURIComponent(to)}`
}

/** URL of the "open a new issue" form on GitHub. */
export function newIssueUrl(): string {
  return `${GITHUB_REPO_URL}/issues/new`
}

/** URL of the project README's Quick Start anchor on GitHub. */
export function quickStartUrl(): string {
  return `${GITHUB_REPO_URL}#quick-start`
}

/** URL of the troubleshooting doc shipped in the repo. */
export function troubleshootingUrl(): string {
  return `${GITHUB_REPO_URL}/blob/main/docs/TROUBLESHOOTING.md`
}
