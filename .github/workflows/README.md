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

## Caveats

- The NDI SDK download is fetched from <https://downloads.ndi.tv> at build
  time. If their CDN is temporarily unavailable, the build will fail; re-run
  it or set the URL secrets noted above.
- Each runner has the matching toolchain (Visual Studio Build Tools on
  windows-latest, Xcode Command Line Tools on macos-latest), so no extra
  setup is needed beyond what the workflow file already does.
- Notarization usually takes 2–10 minutes. Apple very occasionally has
  multi-hour queues; the workflow will simply wait.
