// Helpers for cleaning up GitHub-flavoured release notes before we
// render them in the desktop update banner.
//
// GitHub's "Generate release notes" feature appends a few boilerplate
// blocks that look noisy once they're rendered as proper markdown:
//
//   ## What's Changed
//   * Fix thing by @alice in https://github.com/org/repo/pull/12
//   * Add thing by @bob in https://github.com/org/repo/pull/13
//
//   ## New Contributors
//   * @carol made their first contribution in https://github.com/org/repo/pull/9
//
//   **Full Changelog**: https://github.com/org/repo/compare/v1.0.0...v1.1.0
//
// We strip:
//   * the "Full Changelog: <compare-url>" footer line,
//   * the auto "## What's Changed" heading (the list under it is real
//     content, so we leave the bullets alone), and
//   * the "## New Contributors" section in its entirety, up to the
//     next heading or end of notes.
//
// Manually-authored content — operator-written headings, lists, and
// links to issues/PRs — is preserved. The function is pure so it's
// trivial to cover with unit tests.

const FULL_CHANGELOG_LINE = /^[ \t]*(?:[*_]{1,2})?\s*Full Changelog\s*(?:[*_]{1,2})?\s*:\s*\S+.*$/gim
const WHATS_CHANGED_HEADING = /^[ \t]*#{1,6}[ \t]+What['’]s Changed[ \t]*$/gim
// Match a "## New Contributors" heading and consume everything up to
// (but not including) the next markdown heading or end-of-string.
// `[\s\S]*?` is non-greedy and we anchor the terminator on `(?=^#)`
// or "no characters remain" (JS regex has no `\Z`, so we emulate it
// with `(?![\s\S])`). The `m` flag makes `^` line-aware.
const NEW_CONTRIBUTORS_SECTION = /^[ \t]*#{1,6}[ \t]+New Contributors[ \t]*\n?[\s\S]*?(?=^[ \t]*#{1,6}[ \t]|(?![\s\S]))/gim

export function cleanReleaseNotes(raw: string | null | undefined): string {
  if (!raw) return ''
  let out = raw.replace(/\r\n?/g, '\n')
  out = out.replace(NEW_CONTRIBUTORS_SECTION, '')
  out = out.replace(WHATS_CHANGED_HEADING, '')
  out = out.replace(FULL_CHANGELOG_LINE, '')
  // Collapse runs of 3+ blank lines that the strips can leave behind
  // so the rendered markdown doesn't end up with awkward gaps.
  out = out.replace(/\n{3,}/g, '\n\n')
  return out.trim()
}
