# ScriptureLive AI — Desktop Build (Native NDI)

The desktop build wraps the Next.js app in Electron and adds a **native NDI sender** so you get real, click-to-enable NDI output — exactly like EasyWorship — instead of the browser-based screen-capture workflow.

> **NDI is a LAN protocol.** The desktop app must run on the same local network as the receiver (vMix, Wirecast, OBS, NDI Studio Monitor, etc.).

## What you get

- A standalone Windows installer (`.exe`, NSIS) and macOS disk image (`.dmg`).
- The full ScriptureLive AI UI in its own window.
- A new **"Native NDI Output"** panel in **Settings**:
  - Enable / Stop toggle
  - Source name (default `ScriptureLive`)
  - Resolution (720p / 1080p)
  - Frame rate (30 / 60 fps)
  - Live frame counter and broadcasting status
- Per-user SQLite database in the OS app-data folder.

## Prerequisites for building

You **must build on the target OS**:

- **Windows installer** → build on Windows
- **macOS DMG** → build on macOS

(Cross-compiling Electron apps that include native modules — like the NDI binding — is unreliable. Run the Windows build on Windows and the macOS build on macOS.)

Both platforms also need:

- Node.js 20+ and `pnpm` 9+
- The platform's C/C++ toolchain (Visual Studio Build Tools on Windows, Xcode Command Line Tools on macOS) — required to compile the NDI native binding.
- **NDI SDK 5+** installed at the default location:
  - Windows: `C:\Program Files\NDI\NDI 5 SDK`
  - macOS: `/Library/NDI SDK for Apple/`
  - Get it free at <https://ndi.video/sdk/>.
- **NDI Tools** (free) installed on every machine that will run the built app — provides the runtime the binary loads at startup. <https://ndi.video/tools/>

## Build steps

```bash
# from the repo root
pnpm install
cd artifacts/imported-app

# Windows
pnpm run package:win
# → release/ScriptureLive AI-0.2.0-Setup-x64.exe

# macOS
pnpm run package:mac
# → release/ScriptureLive AI-0.2.0-arm64.dmg
# → release/ScriptureLive AI-0.2.0-x64.dmg
```

## Recommended: automated cloud builds via GitHub Actions

A ready-to-use pipeline lives at `.github/workflows/release-desktop.yml`. Once
the project is pushed to a GitHub repo, tagging a release (`git tag v0.2.0 &&
git push origin v0.2.0`) triggers GitHub-hosted Windows and macOS runners to
build, sign-in-the-future, and upload installers as a GitHub Release. See
`.github/workflows/README.md` for the one-time setup (~ 2 minutes) and how to
point the `/download` page at the published assets.

## Publishing the installers so users can download them

The web app exposes a polished `/download` page with OS detection at
`https://<your-host>/download`. It reads `public/downloads/manifest.json` and
serves files via `/api/download/<platform>`.

Two ways to publish:

### Option A — host the files alongside the app (default)

1. Copy the build output from `release/` into `artifacts/imported-app/public/downloads/`,
   keeping the original filenames (the manifest's `filename` field must match).
2. Update `version` and `releaseNotes` in `public/downloads/manifest.json`.
3. Restart the server. The download page will pick up size and availability
   automatically from disk.

### Option B — host on GitHub Releases (recommended for large files)

Create a Release on GitHub, upload the three artifacts, then edit
`public/downloads/manifest.json`:

```json
{
  "externalReleaseUrl": "https://github.com/your-org/scripturelive-ai/releases/download/v0.2.0"
}
```

The `/api/download/*` endpoints will 302-redirect to GitHub instead of
streaming local files.

## First-run notes

- **Windows**: a signed installer (Authenticode) installs cleanly. An unsigned installer triggers SmartScreen — click "More info" → "Run anyway".
- **macOS**: a signed + notarized DMG opens directly. An unsigned DMG is blocked by Gatekeeper — right-click the app → **Open**, then confirm.
- Both: ensure your firewall allows the app on the local network — NDI uses mDNS for discovery and TCP/UDP between peers on the LAN.

## Code signing & notarization

Signed builds use the standard `electron-builder` env vars, so anything you set
in your shell, your CI, or a `.env` file the build inherits will be picked up
automatically.

### Windows (Authenticode)

Set both env vars before running `pnpm run package:win`:

```bash
# .pfx can be a path on disk, a base64 string, or an https URL
export CSC_LINK="/absolute/path/to/codesign.pfx"
export CSC_KEY_PASSWORD="<pfx password>"

pnpm run package:win
```

Any Authenticode certificate from a recognised CA (DigiCert, Sectigo, SSL.com,
…) works. **EV certificates** clear SmartScreen warnings the first time the
installer runs; standard OV certificates accumulate trust over the first few
hundred downloads.

To verify the result:

```powershell
Get-AuthenticodeSignature ".\release\ScriptureLive AI-0.2.0-Setup-x64.exe"
# Status should report "Valid" with your publisher name.
```

### macOS (Developer ID + Apple notarization)

You need a `Developer ID Application` certificate from your Apple Developer
account (export it from Keychain Access as a `.p12`) and an app-specific
password generated at <https://appleid.apple.com>.

```bash
# Signing identity
export CSC_LINK="/absolute/path/to/developer-id.p12"
export CSC_KEY_PASSWORD="<p12 password>"

# Notarization (notarytool)
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="abcd-efgh-ijkl-mnop"
export APPLE_TEAM_ID="ABCDE12345"

pnpm run package:mac
```

What happens during the build:

1. The `.app` bundle is signed with your Developer ID identity, the hardened
   runtime is enabled, and the entitlements at
   `build-resources/entitlements.mac.plist` are applied.
2. The `afterSign` hook (`build-resources/notarize.js`) submits the `.app` to
   Apple's `notarytool` and waits for the verdict (typically 2–10 minutes).
3. On success the notarization ticket is stapled to the `.app` before the DMG
   is packaged. Gatekeeper will then accept the app on first launch with no
   right-click workaround.

If `CSC_LINK` is unset the build still completes — it just produces an
unsigned/un-notarized DMG so local development isn't blocked. **However**, if
`CSC_LINK` is set but any of `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` /
`APPLE_TEAM_ID` is missing, the build fails fast. This is intentional: a
signed-but-not-notarized DMG would still trigger Gatekeeper warnings on first
launch, defeating the point of paying for a Developer ID certificate.

To verify the result:

```bash
codesign -dv --verbose=4 "release/ScriptureLive AI.app"
spctl -a -vvv --type install "release/ScriptureLive AI-0.2.0-arm64.dmg"
# Should report: source=Notarized Developer ID
```

### Cloud builds (GitHub Actions)

The same env vars are wired up in `.github/workflows/release-desktop.yml`.
Add the certificates as repository secrets — see
`.github/workflows/README.md` for the exact secret names and expected formats.

## How NDI is broadcast

1. The desktop app starts the bundled Next.js server on a random local port.
2. When you click **Enable NDI** in Settings, the main process opens a hidden offscreen `BrowserWindow` that loads `/api/output/congregation` at the chosen resolution.
3. Frames from that window are captured at the chosen FPS (BGRA buffers via `webContents.beginFrameSubscription`).
4. Each frame is pushed into the NDI sender (`grandiose` native binding), which broadcasts on the LAN.
5. Any NDI receiver on the same network sees a source named after the **Source Name** field.

## Falling back

If `grandiose` fails to load (NDI runtime not installed, missing SDK at build time, etc.), the **Native NDI Output** panel shows an "NDI runtime not detected" warning and the legacy browser-capture flow remains fully functional from the same Settings page.

## Dev loop

```bash
# terminal 1 — run Next dev as usual
pnpm --filter @workspace/imported-app run dev

# terminal 2 — run the Electron shell pointed at the dev server
pnpm --filter @workspace/imported-app run electron:dev
```
