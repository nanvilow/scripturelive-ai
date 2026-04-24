# GitHub Actions — Desktop Release Pipeline

This folder contains the cloud-build pipeline that produces the Windows `.exe`
and macOS `.dmg` installers for the ScriptureLive AI desktop app and publishes
them as a GitHub Release. The `/download` page on the web app then points at
those release assets.

## One-time setup

1. **Push this repo to GitHub** (any account, public or private — Actions are
   free for public repos and have a generous free tier for private ones).
2. **Open `artifacts/imported-app/public/downloads/manifest.json`** and set
   `externalReleaseUrl` to the release asset base URL for your repo:

   ```json
   "externalReleaseUrl": "https://github.com/<your-user-or-org>/<repo>/releases/download/v0.2.0"
   ```

   Update the `v0.2.0` segment whenever you publish a new tag.
3. (Optional) If the default NDI SDK download URLs ever break, add repo
   secrets `NDI_SDK_URL_WIN` and/or `NDI_SDK_URL_MAC` pointing at fresh
   installer URLs from <https://ndi.video/sdk/>.

## Cutting a release

Tag and push:

```bash
git tag v0.2.0
git push origin v0.2.0
```

GitHub Actions will then:

1. Spin up a real Windows machine and a real Mac (in parallel).
2. Install the NDI SDK on each so the native NDI binding can compile.
3. Run `pnpm install`, build the Next.js app, compile the Electron main
   process, and run `electron-builder` for the matching OS.
4. Upload the resulting `.exe`, both `.dmg` files, and a `SHA256SUMS.txt`
   to a new GitHub Release named after the tag.

The whole run takes roughly 15–25 minutes end-to-end. As soon as it finishes
the **Download for Windows / macOS** buttons on `/download` work — the API
endpoints redirect to the GitHub Release assets.

## Manual run

You can also trigger the workflow without a tag from the **Actions** tab in
GitHub: pick **Release ScriptureLive AI Desktop** → **Run workflow** and
optionally provide a tag name.

## Code signing & notarization

The pipeline picks up signing certificates from repo secrets. When the secrets
are unset (e.g. on a fresh fork) the build still succeeds — it just produces
an unsigned installer. Add these secrets in **Settings → Secrets and variables
→ Actions** to get clean installs on user machines:

### Windows (Authenticode)

| Secret name            | Value                                                                |
| ---------------------- | -------------------------------------------------------------------- |
| `WIN_CSC_LINK`         | Base64 of your `.pfx` file: `base64 -w 0 cert.pfx` (Linux/macOS) or `[Convert]::ToBase64String([IO.File]::ReadAllBytes("cert.pfx"))` (PowerShell). |
| `WIN_CSC_KEY_PASSWORD` | Password that protects the `.pfx`.                                   |

Any Authenticode certificate from a recognised CA works (DigiCert, Sectigo,
SSL.com, etc.). EV certificates remove SmartScreen warnings instantly;
standard OV certificates accumulate reputation over the first few hundred
downloads.

### macOS (Developer ID + notarization)

| Secret name                   | Value                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| `MAC_CSC_LINK`                | Base64 of your `Developer ID Application` `.p12` exported from Keychain Access.        |
| `MAC_CSC_KEY_PASSWORD`        | Password that protects the `.p12`.                                                     |
| `APPLE_ID`                    | Apple ID email of an account on your developer team.                                   |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password generated at <https://appleid.apple.com> → Sign-In and Security. |
| `APPLE_TEAM_ID`               | 10-character Team ID from <https://developer.apple.com/account>.                       |

When all five macOS secrets are present the build:

1. Signs the `.app` with the Developer ID Application certificate (with
   hardened runtime + the entitlements in
   `artifacts/imported-app/build-resources/entitlements.mac.plist`).
2. Submits it to Apple's `notarytool` and waits for a verdict.
3. Staples the notarization ticket onto the `.app` before packaging the DMG.

Result: Gatekeeper opens the app on first launch with no right-click workaround.

## Certificate expiry warnings & rotation

Code-signing certificates do not last forever:

- **Windows Authenticode** (`WIN_CSC_LINK`): typically valid 1–3 years.
- **Apple Developer ID Application** (`MAC_CSC_LINK`): typically valid 5 years.
- **Apple app-specific password** (`APPLE_APP_SPECIFIC_PASSWORD`): no fixed
  expiry, but Apple revokes it whenever the owning Apple ID password is
  changed and it can be revoked manually at any time.

If any of these expires (or is revoked) and we don't notice, the next release
ships **unsigned**. Users then see SmartScreen / Gatekeeper warnings as if they
were downloading an unknown executable.

### How the team gets warned

The `Check code-signing certificate expiry` workflow
(`.github/workflows/check-cert-expiry.yml`) runs:

- **On every release**, as a required preceding job in
  `release-desktop.yml`. The build still runs even if this check fails, so a
  release in flight is never blocked, but a failed run sends the standard
  GitHub Actions "workflow failed" email to repo admins.
- **Once a month** at 09:00 UTC on the 1st (cron `0 9 1 * *`). This guarantees
  we get an early-warning email at least 30 days before either certificate
  expires, even during long quiet periods between releases.
- **On demand** from the **Actions → Check code-signing certificate expiry →
  Run workflow** button.

The check uses OpenSSL to read the `notAfter` of each `.pfx` / `.p12` stored
in the secret, then:

| Days until expiry  | Result                                                                |
| ------------------ | --------------------------------------------------------------------- |
| > 60               | `::notice::` only — workflow succeeds.                                |
| 31–60              | `::warning::` annotation — workflow succeeds (yellow run).            |
| ≤ 30 or expired    | `::error::` annotation — workflow fails (red run, email sent).        |
| Secret unset       | `::notice::` only — treated as "not configured", not a failure.       |

The Apple app-specific password can't be inspected programmatically, so the
workflow always emits a notice reminding the team to re-issue it whenever the
owning Apple ID password is rotated.

### Defensive signature check at publish time

The cert-expiry workflow gives the team early warning, but if a rotation is
missed anyway the build will quietly produce **unsigned** installers and
historically would still have published them — end users would only find out
when SmartScreen / Gatekeeper warnings started landing in support tickets.

To close that gap, three checks gate the GitHub Release:

- **Build-time Windows check** (inside the `build` job, on `windows-latest`):
  immediately after `pnpm --filter @workspace/imported-app run package:win`
  finishes — and **before** any `actions/upload-artifact` step runs — the job
  walks every `artifacts/imported-app/release/*.exe` and verifies it with
  both `signtool verify /pa /v` (the Windows Authenticode policy, with the
  signing toolchain still on the runner for rich diagnostics) and PowerShell's
  `Get-AuthenticodeSignature` (cross-check + fallback if `signtool.exe` is
  missing). Failures surface within seconds of `electron-builder` instead of
  forcing the maintainer to wait the full ~15-25 minutes for the upload +
  `release` job spin-up. Honors the same `allow_unsigned` input and
  `[unsigned-release]` commit-message / annotated-tag marker as the other
  checks below, so the three opt-outs stay in sync.

- **`verify-macos`** runs on `macos-latest`, downloads any `mac-installer*`
  artifacts, mounts each `.dmg`, and runs the full Apple verification stack
  on the bundled `.app`:
  - `codesign --verify --deep --strict` (the seal is intact and the bundle
    is signed),
  - `spctl -a -vvv --type execute` (Gatekeeper would accept it on first
    launch — this is the check that proves notarization succeeded), and
  - `xcrun stapler validate` (a notarization ticket is stapled, so first
    launch works even when the user is offline).

  When the build doesn't produce any macOS artifacts (the current state),
  the job logs a `::notice::` and exits cleanly so it doesn't block
  Windows-only releases.

- **`release`** runs on `ubuntu-latest`, depends on both `build` and
  `verify-macos`, and re-verifies every downloaded `.exe` with
  `osslsigncode verify` against the runner's system CA bundle as a
  defense-in-depth backstop to the build-time check above (different tool,
  different OS, different CA store — catches anything the Windows-side
  check might miss). Unsigned binaries, malformed Authenticode blobs, and
  signatures whose chain doesn't validate all fail the step **before**
  `softprops/action-gh-release` is invoked.

When any check fails, it logs a clear `::error::` message that points back
at this README's
[Certificate expiry warnings & rotation](#certificate-expiry-warnings--rotation)
section. The Windows build-time check fails the `build` job before the
upload steps run, so debugging the unsigned build will need a re-run; the
release-time `osslsigncode` check runs after the artifacts have already been
uploaded, and those artifacts (`windows-installer`, `windows-latest-yml`,
`windows-blockmap`) keep their 14-day retention so debugging that path
doesn't require a rebuild.

#### Intentionally publishing an unsigned release

For one-off dev/testing releases where unsigned installers are acceptable,
there are three opt-outs (any one is sufficient — all three checks
above honor every opt-out):

1. **Workflow input** — trigger from **Actions → Release ScriptureLive AI
   Desktop → Run workflow** and tick the **Publish even if installers fail
   signature verification** box (the `allow_unsigned` input).
2. **Annotated tag message** — include the literal string `[unsigned-release]`
   in the annotated tag's message, e.g.

   ```bash
   git tag -a v0.2.0-rc1 -m "Pre-release smoke build [unsigned-release]"
   git push origin v0.2.0-rc1
   ```

   Each check checks out the repo with `fetch-depth: 0` and reads the tag
   annotation via `git for-each-ref --format='%(contents)' refs/tags/<tag>`.
3. **Tagged-commit message** — include `[unsigned-release]` in the commit
   the tag points at. Useful when releasing via lightweight tags or when
   you prefer the marker to live in commit history. Each check reads the
   message deterministically via `git log -1 --format=%B '<tag>^{commit}'`,
   which dereferences both annotated and lightweight tags to their
   underlying commit (so this works regardless of whether the workflow was
   triggered by a tag push or by `workflow_dispatch`).

In every case each check logs a `::warning::` explaining which opt-out
fired, so the unsigned status is still visible at a glance in the Actions UI.

#### Artifact naming contract (fail-closed)

The `verify-macos` job is fail-closed in two ways:

1. **Inventory before download.** Before touching `actions/download-artifact`,
   the job calls the GitHub Actions REST API
   (`GET /repos/{repo}/actions/runs/{run_id}/artifacts`, requires
   `permissions.actions: read`) and filters the result for names matching
   `^mac-installer($|-)`. The job's behavior is deterministic from there:
   - Inventory finds **zero** matching artifacts → log `::notice::`,
     `has_mac=false`, skip download and verification cleanly. This is the
     legitimate path for Windows-only releases.
   - Inventory finds **≥1** matching artifact → `has_mac=true`, the
     download step runs **without** `continue-on-error`, and the verify
     step asserts that at least one `.dmg` ended up in `dist/` before
     looping. Any transient download failure or empty payload fails the
     job (and therefore the release).
2. **Single source of truth for Mac artifacts.** The `release` job
   intentionally does **not** download or publish `mac-installer*`
   artifacts — only `verify-macos` is allowed to handle them. If you later
   add `dist/*.dmg` to the publish file list, do the download inside
   `verify-macos` (where they're already verified) or wire up a separate
   fail-closed download in `release` first.

Whenever you add a macOS build step, name its `actions/upload-artifact`
either exactly `mac-installer` or with a `mac-installer-` prefix (e.g.
`mac-installer-arm64`, `mac-installer-x64`) so the inventory regex picks
it up automatically. Any other name will be invisible to the inventory
step and the macOS guard will not engage.

### Rotating `WIN_CSC_LINK` (Windows Authenticode)

1. Order or renew the certificate from your CA (DigiCert, Sectigo, SSL.com,
   etc.). For OV/EV certs the CA delivers a `.pfx` (or you export one from
   the Windows certificate store after install).
2. Base64-encode the new `.pfx`:
   - Linux/macOS: `base64 -w 0 cert.pfx > cert.pfx.b64`
   - PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("cert.pfx")) > cert.pfx.b64`
3. In GitHub: **Settings → Secrets and variables → Actions** → update
   `WIN_CSC_LINK` with the contents of `cert.pfx.b64` and
   `WIN_CSC_KEY_PASSWORD` with the password protecting the `.pfx`.
4. Manually trigger **Actions → Check code-signing certificate expiry → Run
   workflow** and confirm it now reports the new `notAfter` date in the job
   summary.

### Rotating `MAC_CSC_LINK` (Apple Developer ID Application)

1. In <https://developer.apple.com/account>, request a new
   *Developer ID Application* certificate (right before the old one expires
   you can keep both active in parallel).
2. Install it into Keychain Access on a Mac, then **right-click → Export →
   Personal Information Exchange (.p12)** and set a password.
3. Base64-encode it: `base64 -w 0 DeveloperID.p12 > DeveloperID.p12.b64`.
4. Update repo secrets `MAC_CSC_LINK` and `MAC_CSC_KEY_PASSWORD` the same way
   as the Windows cert.
5. Re-run the cert-expiry check to confirm.

### Rotating `APPLE_APP_SPECIFIC_PASSWORD`

1. Sign in to <https://appleid.apple.com> → **Sign-In and Security** →
   **App-Specific Passwords**.
2. Revoke the old password (or just generate a fresh one) and label it
   something like `scripturelive-notarytool`.
3. Update the `APPLE_APP_SPECIFIC_PASSWORD` repo secret with the new value.
4. Trigger a workflow_dispatch run of `release-desktop.yml` against a recent
   tag and confirm the macOS package step prints `notarization successful`.

## Signing the download manifest

The release pipeline also produces a detached
[minisign](https://jedisct1.github.io/minisign/) signature for the published
`manifest.json` and `SHA256SUMS.txt`, so admins can verify the
installer-hash chain end-to-end even if the web host serving `/download` is
later compromised. The maintainer-held public key lives at
`artifacts/imported-app/public/downloads/minisign.pub` (and should be mirrored
into the GitHub project README so users have an out-of-band channel to
cross-check the fingerprint).

| Secret name         | Required? | Value                                                                                          |
| ------------------- | --------- | ---------------------------------------------------------------------------------------------- |
| `MINISIGN_KEY`      | optional  | Base64 of your `minisign.key` private key: `base64 -w 0 minisign.key`. Leave unset to skip signing entirely (release proceeds without `.minisig` sidecars; build logs a `::notice::`). |
| `MINISIGN_PASSWORD` | optional  | Password for an encrypted minisign key. Omit when the key was generated passwordless via `minisign -G -W`. |

Full setup, key-rotation, and end-user verification instructions live in
`artifacts/imported-app/DESKTOP_BUILD.md` →
**End-to-end verification with `minisign`**.

## Caveats

- The NDI SDK download is fetched from <https://downloads.ndi.tv> at build
  time. If their CDN is temporarily unavailable, the build will fail; re-run
  it or set the URL secrets noted above.
- Each runner has the matching toolchain (Visual Studio Build Tools on
  windows-latest, Xcode Command Line Tools on macos-latest), so no extra
  setup is needed beyond what the workflow file already does.
- Notarization usually takes 2–10 minutes. Apple very occasionally has
  multi-hour queues; the workflow will simply wait.
