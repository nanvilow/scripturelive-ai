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

// Match an inline markdown image: `![alt](url)`. We drop these
// entirely from the preview — there's no useful prose to surface and
// the alt text is usually descriptive of the asset, not the change.
const MARKDOWN_IMAGE = /!\[[^\]]*\]\([^)]*\)/g
// Match an inline markdown link: `[label](url)`. We collapse to just
// the label so a single long GitHub URL can't eat the entire preview
// budget. Labels are non-empty and don't contain `]`; URLs don't
// contain `)` (GitHub-rendered URLs never do — they'd be percent-
// encoded). Captured group #1 is the visible label.
const MARKDOWN_LINK = /\[([^\]]+)\]\([^)]*\)/g
// Match a bare http(s) URL not already collapsed by the link strip
// above. Stops at whitespace so it doesn't eat following prose.
const BARE_URL = /\bhttps?:\/\/\S+/gi

/**
 * Build a single-line, human-readable preview of release notes for
 * surfaces with a tight character budget (e.g. the desktop update
 * toast description).
 *
 * Pipeline (order matters):
 *   1. `cleanReleaseNotes` strips GitHub auto-generated boilerplate
 *      so it can't dominate the preview.
 *   2. HTML tags are stripped — also removes `<https://...>` autolinks
 *      that GitHub sometimes emits.
 *   3. Markdown images `![alt](url)` are dropped wholesale.
 *   4. Markdown links `[label](url)` are collapsed to just `label`,
 *      so a long URL never blows the budget.
 *   5. Any remaining bare http(s) URLs are dropped.
 *   6. Markdown punctuation (`# * _ \` > ~ [ ] ( )`) is stripped so
 *      the preview reads as plain prose.
 *   7. All whitespace is collapsed to single spaces and trimmed.
 *   8. Result is truncated to `maxLen` chars with an ellipsis.
 *
 * Returns `undefined` when the input is empty/blank or there's no
 * meaningful content left after cleaning. Callers can branch on the
 * `undefined` to fall back to a generic description.
 *
 * Note: this is preview-only. The persistent in-app update banner
 * (`components/update-banner.tsx`) and the modal update dialog
 * (`components/providers/update-dialog.tsx`) render the full
 * markdown — they call `cleanReleaseNotes` directly and are
 * unaffected by this helper.
 */
export function previewReleaseNotes(
  raw: string | null | undefined,
  maxLen = 180,
): string | undefined {
  if (!raw) return undefined
  const deboilerplated = cleanReleaseNotes(raw)
  if (!deboilerplated) return undefined
  const cleaned = deboilerplated
    .replace(/<[^>]+>/g, ' ')
    .replace(MARKDOWN_IMAGE, ' ')
    .replace(MARKDOWN_LINK, '$1')
    .replace(BARE_URL, ' ')
    .replace(/[#*_`>~\[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return undefined
  if (cleaned.length <= maxLen) return cleaned
  // Reserve one char for the ellipsis so we never exceed maxLen.
  return cleaned.slice(0, Math.max(0, maxLen - 1)) + '…'
}
