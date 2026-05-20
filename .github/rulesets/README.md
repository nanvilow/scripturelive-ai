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
2. Upload `main-branch-protection.json`.
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

To update an existing ruleset, swap `POST /rulesets` for
`PUT /rulesets/{ruleset_id}` (find the id with `gh api /repos/:owner/:repo/rulesets`).

## Why a ruleset and not classic branch protection

Rulesets supersede classic branch protection in the GitHub UI, support
JSON import/export (this file), and layer cleanly — a future "release
tag" ruleset can coexist with this one without overwriting it. Classic
branch protection has neither property.
