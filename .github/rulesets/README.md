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
  different commit after the scans have run. Also requires the tag
  object itself to carry a valid GPG or SSH signature
  (`required_signatures`) — closes the "stolen push token can still
  ship a release under someone else's name" gap, since the attacker
  would also need the maintainer's signing key to produce a tag
  GitHub will accept.

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

GitHub does not auto-import files from this directory. Run the apply
script — it iterates every `*.json` file here, looks up whether a
ruleset of that `name` already exists on the repo, and POSTs new ones
or PUTs existing ones accordingly. The JSON files are the source of
truth; re-run after every edit.

```bash
pnpm --filter @workspace/scripts run apply-rulesets
```

Requires the `gh` CLI authenticated with a token that has `repo` admin
scope, and the current working directory must be inside a clone of the
target GitHub repo (the script reads the repo slug from
`gh repo view`).

Falling back to the UI or raw `gh api` calls is no longer recommended —
they let the live config drift from these JSON files, which is the
exact problem the script exists to prevent.

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

## Signed tags — contributor setup

`release-tag-protection.json` enforces `required_signatures`, so an
unsigned `git tag v0.7.x && git push origin v0.7.x` is rejected at the
git-server boundary with **"signature required"** before any pipeline
runs. To be able to cut a release you need a signing key registered
with GitHub and `git` configured to use it.

### One-time GPG setup

```bash
# Generate a key (skip if you already have one)
gpg --full-generate-key            # pick "RSA and RSA", 4096 bits

# Find the key ID
gpg --list-secret-keys --keyid-format=long
# sec   rsa4096/ABCD1234EF567890 2026-05-20 [SC]

# Export the public key and add it to GitHub
gpg --armor --export ABCD1234EF567890
# Paste into https://github.com/settings/keys → "New GPG key"

# Tell git to sign with this key
git config --global user.signingkey ABCD1234EF567890
git config --global tag.gpgSign true        # auto-sign every tag
git config --global commit.gpgSign true     # recommended, not required
```

### One-time SSH setup (alternative)

GitHub also accepts SSH signatures, which lets you reuse your existing
auth key:

```bash
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub
git config --global tag.gpgSign true
# Then add the SAME public key at
# https://github.com/settings/keys → "New SSH key" → key type "Signing Key"
```

### Cutting a release

With `tag.gpgSign=true` set, `git tag v0.7.x` is already signed. If you
skipped that config, sign explicitly:

```bash
git tag -s v0.7.x -m "v0.7.x"
git push origin v0.7.x
```

A missing or invalid signature surfaces as:

```text
remote: error: GH013: Repository rule violations found for refs/tags/v0.7.x.
remote: - Tag must be signed.
```

If you see that, run `git tag -v v0.7.x` locally to confirm the
signature state, then re-tag (delete the local tag, re-create with
`-s`, push) — note that the `update` rule means you cannot overwrite
a tag that already made it to the remote, so this only works if the
push was rejected and the bad tag never landed.

## Key rotation / loss

If your signing key is lost (laptop dies, key file deleted, passphrase
forgotten) or you're proactively rotating to a new one, the release
pipeline is blocked for **you specifically** until GitHub knows about
the new key — `required_signatures` only accepts tags signed by a key
that's registered on the pusher's GitHub account. Other maintainers
can still cut releases in the meantime; this is a per-account
incident, not a repo-wide outage.

Treat a lost key as compromised. You can't prove it isn't, and the
cost of revoking a key you still control is zero.

### 1. Revoke the old key on GitHub

Go to <https://github.com/settings/keys>, find the old GPG or SSH
signing key, and click **Delete**. This immediately stops the git
server from accepting new tags signed by it. Tags already pushed
under the old key keep their "Verified" badge — GitHub records the
verification result at push time, it does not re-check on every
view, so historical releases are unaffected.

If you still have the GPG private key, also publish a revocation
certificate so anyone verifying old artifacts offline sees the key
as revoked rather than just unknown:

```bash
gpg --output revoke-ABCD1234EF567890.asc --gen-revoke ABCD1234EF567890
gpg --import revoke-ABCD1234EF567890.asc
gpg --keyserver keys.openpgp.org --send-keys ABCD1234EF567890
```

For SSH signing keys there's no equivalent — GitHub removal is the
whole revocation story.

### 2. Generate and register the new key

Follow the same "One-time GPG setup" or "One-time SSH setup" steps
above to produce a fresh key and paste the public half into
<https://github.com/settings/keys>. For GPG, make sure the new key's
UID email matches a verified email on your GitHub account
(`https://github.com/settings/emails`), otherwise GitHub will accept
the signature but mark the tag **Unverified**, which is not the same
as signed and will still fail downstream tooling that checks for the
green badge.

### 3. Point git at the new key

```bash
# GPG
git config --global user.signingkey NEWKEYID1234ABCD

# SSH
git config --global user.signingkey ~/.ssh/id_ed25519_signing.pub
```

If you have a per-repo override (`git config user.signingkey` without
`--global`), update that too. Run `git config --get user.signingkey`
inside the release clone to confirm which value is actually winning.

### 4. Verify against a test branch before cutting a real release

Don't discover a misconfigured key by failing the real `v0.7.x` push.
Smoke-test it first:

```bash
git checkout -b key-rotation-smoke-$(date +%s)
git commit --allow-empty -m "smoke test for signing key rotation"
git push -u origin HEAD

# Throwaway tag against the smoke branch
git tag -s v0.0.0-keytest-$(date +%s) -m "key rotation smoke test"
git push origin v0.0.0-keytest-$(date +%s)
```

The tag push exercises the **exact** signature path
`required_signatures` enforces. Outcomes:

- **Push accepted, tag shows "Verified" on github.com/<repo>/tags** —
  new key works end-to-end, you're cleared to cut releases.
- **`remote: - Tag must be signed.`** — git is not actually signing
  (check `tag.gpgSign` is `true` and `user.signingkey` resolves);
  or the public key was never added to GitHub; or the GPG UID email
  doesn't match a verified GitHub email.
- **Push accepted but tag shows "Unverified"** — signature is
  cryptographically valid but GitHub doesn't trust it (wrong email
  on the GPG UID, or you added the SSH key as an Authentication key
  instead of a Signing Key). Re-add the key with the correct type.

Then clean up — the smoke tag matches the `v*` pattern, so it's
subject to the same rules as a real release tag:

```bash
git push origin --delete key-rotation-smoke-<timestamp>
git tag -d v0.0.0-keytest-<timestamp>
```

Note that `git push origin :refs/tags/v0.0.0-keytest-<timestamp>`
will be **rejected** — the `release-tag-protection.json` ruleset
blocks `deletion` on `refs/tags/v*`. That's intentional (see Layer 1
above) and applies to smoke tags as much as real ones. Either accept
that the smoke tag stays in the remote tag list forever, or use a
naming scheme outside `v*` (e.g. `keytest-*`) so the ruleset doesn't
apply. The `v0.0.0-` prefix above is deliberate — it sorts below any
real release and makes its purpose obvious.

### Interaction with the `update` rule

`release-tag-protection.json` sets `update: true`, which means **you
cannot re-sign a tag that's already been pushed.** Force-pushing a
re-signed tag (`git push --force origin v0.7.x`) is rejected at the
git-server boundary, and `deletion: true` blocks the
delete-and-recreate workaround. The practical consequence:

- If a release tag was pushed before the key was lost and it shows
  "Verified", do nothing — it stays verified. GitHub doesn't
  re-validate signatures on key removal.
- If a release tag was pushed under a key that GitHub will not
  accept (e.g. the push somehow bypassed the rule, or the rule was
  briefly disabled), **you cannot fix that tag in place.** Cut a new
  release under the next version number (`v0.7.x+1`) signed with the
  new key, and treat the bad tag as a known-bad release in the
  changelog. This is the same constraint as v0.7.222's "you cannot
  un-publish a release" — the immutability is the point.

## Why a ruleset and not classic branch protection

Rulesets supersede classic branch protection in the GitHub UI, support
JSON import/export (these files), and layer cleanly — the
`release-tag-protection.json` ruleset coexists with
`main-branch-protection.json` without overwriting it. Classic branch
protection has neither property.
