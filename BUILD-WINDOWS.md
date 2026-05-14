# Building ScriptureLive AI for Windows

This produces a Windows installer (`ScriptureLive AI-<version>-Setup-x64.exe`)
with the full feature set: multi-screen display engine, native NDI output,
microphone selector, full Bible browsing, voice scripture detection, lyrics,
sermon mode, and the WassMedia branding.

## What you need on the Windows build machine

1. **Windows 10 or 11 (64-bit)**
2. **Node.js 20.x LTS** — https://nodejs.org/en/download
3. **pnpm 9.x** — open PowerShell and run:
   ```
   npm install -g pnpm
   ```
4. **Visual Studio Build Tools 2022** with the "Desktop development with C++"
   workload — this is required to compile the native NDI bindings
   (`grandiose`).
   Download: https://visualstudio.microsoft.com/visual-cpp-build-tools/
5. **NDI 6 SDK for Windows** — required so `grandiose` can find the NDI
   runtime headers and libraries.
   Download: https://ndi.video/sdk/

After installing the NDI SDK, make sure these environment variables are set
(the installer usually does this for you):

```
NDI_SDK_DIR=C:\Program Files\NDI\NDI 6 SDK
NDI_RUNTIME_DIR_V6=C:\Program Files\NDI\NDI 6 Runtime\v6
```

## Build steps

Open PowerShell **as administrator** in the extracted project folder, then:

```powershell
cd artifacts\imported-app

# 1. Install dependencies (also compiles the native NDI binding)
pnpm install

# 2. Generate the Prisma client and build the Next.js app + Electron main
pnpm run package:win
```

That last command does three things in order:

1. `next build` — compiles the Next.js app in production mode and outputs the
   standalone server bundle (`.next/standalone`).
2. `tsc -p electron/tsconfig.json` — compiles the Electron main process,
   preload, NDI service and frame-capture modules into `dist-electron/`.
3. `electron-builder --win` — bundles the Electron runtime + the Next.js
   standalone server + the native NDI bindings into a Windows NSIS installer.

When it finishes, you'll find the installer in:

```
artifacts\imported-app\release\ScriptureLive AI-0.2.0-Setup-x64.exe
```

Double-click it to install. After installation, launch **ScriptureLive AI**
from the Start menu or the desktop shortcut.

## Optional: code-signing

To avoid the SmartScreen "Unknown publisher" warning on first install, set
these environment variables before running `pnpm run package:win`:

```powershell
$env:CSC_LINK = "C:\path\to\your-cert.pfx"
$env:CSC_KEY_PASSWORD = "your-pfx-password"
```

`electron-builder` will then sign the installer and the embedded `.exe` with
SHA-256 + RFC-3161 timestamp using the cert from `CSC_LINK`. No code change
required.

## What the installed desktop app gives you

- **Operator console** — the full ScriptureLive web UI in a native window.
- **Multi-screen display engine** — Settings → Display & Output exposes a
  picker that lists every monitor connected to the machine. Click "Open on
  this display" to launch a fullscreen congregation window on that screen.
  Plug in a new monitor → it shows up immediately.
- **Native NDI output** — Settings → NDI panel turns on a real NDI sender
  named "ScriptureLive". vMix, Wirecast, OBS (with NDI plugin), and any
  other NDI receiver on the LAN will see it automatically. Resolution and
  frame-rate are configurable; lower-third + transparency layers are
  available via the layout selector.
- **Microphone selector** — Voice Detection panel enumerates every audio
  input device on the machine and lets the operator pick which one feeds
  the speech-to-text scripture detector.
- **All web features** — Bible browser (multi-translation, full chapter),
  voice-driven scripture detection, AI slide generator, lyrics, sermon
  notes, media library, etc. — all run identically inside the desktop
  shell because it's the exact same Next.js app.

## Troubleshooting

- **`gyp ERR! find VS`** during install → install the Visual Studio C++
  build tools (step 4 above) and restart PowerShell.
- **`Cannot find module 'grandiose'`** at runtime → you didn't install the
  NDI SDK before `pnpm install`. Reinstall the SDK, set the env vars,
  delete `node_modules`, and run `pnpm install` again.
- **Installer builds but NDI panel says "NDI runtime not available"** →
  install the **NDI 6 Runtime for Windows** (separate from the SDK) on the
  *target* PC. Download: https://ndi.video/tools/
- **App opens to a blank screen** → check the bundled Next standalone
  server is present at
  `<install-dir>\resources\app\.next\standalone\server.js`. If missing,
  rebuild with `pnpm run package:win`.
