# Repository rulesets

Declarative branch-protection rules for this repo. GitHub's UI calls these
"Repository rulesets" (Settings → Rules → Rulesets). Storing them here as
JSON lets us code-review changes to merge requirements the same way we
code-review the workflows that produce the checks.

## Files

- `main-branch-protection.json` — protects `refs/heads/main`. Requires a PR
  with at least one approval and blocks merges until the CodeQL and
  gitleaks security checks pass. Closes the loop on Task #105: Task #104
  turned CodeQL on, this ruleset makes its result a hard gate so a PR that
  introduces a new high-severity finding cannot be merged without an
  explicit dismissal in the Security tab.
- `release-tag-protection.json` — protects `refs/tags/v*` (the tags that
  trigger `release-desktop.yml`). Blocks tag creation unless the tagged
  commit already has passing CodeQL + gitleaks status. Because
  `main-branch-protection.json` requires those same checks for anything
  merged into `main`, the practical effect is "you can only tag a release
  off a commit that went through the main-branch PR gate." Closes the
  hole where a contributor with push access could `git tag v0.7.x` on a
  feature-branch commit that never got scanned, and the release pipeline
  would ship it anyway. Also blocks tag `deletion` and `update`
  (force-move) so a tag, once cut, cannot be silently re-pointed at a
  different commit after the scans have run.

## Required status checks

Check `context` values are the **job name** GitHub displays on the PR
"Checks" tab, not the workflow filename. Today:

| Workflow file                       | Job `name:`                     | Required check `context`        |
| ----------------------------------- | ------------------------------- | ------------------------------- |
| `.github/workflows/codeql.yml`      | `Analyze (${{ matrix.language }})` | `Analyze (javascript-typescript)` |
| `.github/workflows/secret-scan.yml` | `gitleaks`                      | `gitleaks`                      |

If a workflow's job name (or the CodeQL matrix language) ever changes,
update the matching `context` here in the same PR or every subsequent PR
will be blocked waiting for a check that no longer reports under that
name.

`integration_id: 15368` is GitHub Actions. Leave it set so the rule
matches the GitHub Actions-produced check specifically and not a
same-named check from some other app.

`strict_required_status_checks_policy: true` means the PR branch must be
up to date with `main` before the checks count — this prevents the
classic "two PRs each pass on their own base but conflict in semantics
once both land" hole.

## Applying the ruleset

GitHub does not auto-import files from this directory. Apply once via
either the UI or the API; thereafter, edit the JSON here and re-apply on
change.

### UI (one-off, easiest)

1. Repo → **Settings** → **Rules** → **Rulesets** → **New ruleset** →
   **Import a ruleset**.
2. Upload each file in this directory in turn
   (`main-branch-protection.json`, `release-tag-protection.json`).
   They are independent rulesets and must each be imported once.
3. Set **Enforcement status** to **Active** (the JSON already sets it,
   but the UI confirms).
4. Save.

### API (scriptable, preferred when iterating)

With a token that has `repo` admin scope:

```bash
gh api \
  --method POST \
  -H "Accept: application/vnd.github+json" \
  /repos/:owner/:repo/rulesets \
  --input .github/rulesets/main-branch-protection.json
```

Repeat for `release-tag-protection.json`. To update an existing ruleset,
swap `POST /rulesets` for `PUT /rulesets/{ruleset_id}` (find the id with
`gh api /repos/:owner/:repo/rulesets`).

## How "release tags must come from main" is enforced (two layers)

Two complementary controls work together. Either alone has a gap; the
pair closes it.

**Layer 1 — `release-tag-protection.json` ruleset (status-check gate).**
GitHub evaluates `required_status_checks` on a tag ruleset against the
status checks attached to the **commit the tag points at** at the
moment the tag is pushed. `git push origin v0.7.x` is rejected if the
tagged commit doesn't have green `Analyze (javascript-typescript)` and
`gitleaks` runs recorded against it. The `update` rule blocks
force-moving a tag with `git push --force`, and `deletion` blocks the
delete-then-recreate workaround. So whatever SHA a release tag pins,
that SHA passed the scans and that SHA cannot be silently swapped out
later.

**Layer 2 — `tag-ancestry` job in `release-desktop.yml`
(ancestry gate).** The status-check layer alone has a leak: CodeQL and
gitleaks both run on **PR events** as well as on `main` pushes, so a
commit that opened a PR but was never merged can still carry the two
green check runs. That means a contributor with push access could
`git tag v0.7.x <feature-branch-sha>` on a never-merged commit and
Layer 1 would let the tag through. The `tag-ancestry` job, which runs
ahead of every other job in the release pipeline, fails the run if
`git merge-base --is-ancestor "$GITHUB_SHA" origin/main` returns
non-zero. That guarantees the tagged commit was reached the only way
that records `main`-side check history: by being merged into `main`
via PR through `main-branch-protection.json`.

**Why both:** Layer 1 stops the push at the git-server boundary so the
pipeline never even starts. Layer 2 fails fast inside the pipeline so
even if Layer 1 is misconfigured, disabled, or a future GitHub API
change moves the goalposts on what counts as a "matching" status check,
no release is published from off-`main`. Defense in depth.

## Why a ruleset and not classic branch protection

Rulesets supersede classic branch protection in the GitHub UI, support
JSON import/export (these files), and layer cleanly — the
`release-tag-protection.json` ruleset coexists with
`main-branch-protection.json` without overwriting it. Classic branch
protection has neither property.
