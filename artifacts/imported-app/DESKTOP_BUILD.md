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

## First-run notes

- **Windows**: SmartScreen will warn that the publisher is unknown (we do not yet ship a code-signing certificate). Click "More info" → "Run anyway".
- **macOS**: Gatekeeper will refuse to open it the first time. Right-click the app → **Open**, then confirm. (We do not yet ship Apple notarization.)
- Both: ensure your firewall allows the app on the local network — NDI uses mDNS for discovery and TCP/UDP between peers on the LAN.

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
