import { app, BrowserWindow, Menu, MenuItemConstructorOptions, Tray, nativeImage, ipcMain, shell, screen, dialog, session, Notification, protocol, net } from 'electron'
import path from 'node:path'
import { spawn, ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import fs from 'node:fs'
import { NdiService, NdiStartOptions as NdiServiceStartOptions, NdiStatus } from './ndi-service'
import { pingThrown, pingErrorMain } from './telemetry'

let logFilePath = ''
function setupFileLogging() {
  try {
    const dir = app.getPath('userData')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    logFilePath = path.join(dir, 'launch.log')
    // v0.7.98 — APPEND instead of truncating. Previously we wiped the
    // log on every launch with flags: 'w', so the operator who hit a
    // chrome-error and relaunched the app to recover would lose the
    // log lines that explained what went wrong. Now we keep history
    // across launches and only rotate when the file exceeds 2 MB so it
    // never grows unbounded. A "----- session start -----" banner is
    // written below so it's easy to find the current session in the
    // log when triaging.
    try {
      const stat = fs.statSync(logFilePath)
      if (stat.size > 2 * 1024 * 1024) {
        const rotated = path.join(dir, 'launch.prev.log')
        try { fs.unlinkSync(rotated) } catch { /* ignore */ }
        try { fs.renameSync(logFilePath, rotated) } catch { /* ignore */ }
      }
    } catch { /* file doesn't exist — first launch */ }
    const stream = fs.createWriteStream(logFilePath, { flags: 'a' })
    stream.write(`\n----- session start ${new Date().toISOString()} -----\n`)
    const wrap = (orig: (...args: unknown[]) => void, prefix: string) =>
      (...args: unknown[]) => {
        try {
          const line = `[${new Date().toISOString()}] ${prefix} ` +
            args.map(a => (a instanceof Error ? `${a.message}\n${a.stack}` : typeof a === 'string' ? a : JSON.stringify(a))).join(' ') + '\n'
          stream.write(line)
        } catch { /* ignore */ }
        try { orig(...args) } catch { /* ignore */ }
      }
    console.log = wrap(console.log.bind(console), 'LOG')
    console.error = wrap(console.error.bind(console), 'ERR')
    console.warn = wrap(console.warn.bind(console), 'WRN')
    console.log('ScriptureLive AI starting', {
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      execPath: process.execPath,
      resourcesPath: process.resourcesPath,
      userData: dir,
    })
    // v0.7.14 — Central error reporting. Forward main-process
    // crashes / unhandled rejections to the api-server's
    // /api/telemetry/error endpoint so the operator's admin Records
    // dashboard surfaces them in real time. Both calls are
    // fire-and-forget with a 4-second timeout — a telemetry outage
    // never blocks crash logging or app shutdown.
    process.on('uncaughtException', (err) => {
      console.error('uncaughtException', err)
      try { pingThrown('uncaughtException', err) } catch { /* ignore */ }
    })
    process.on('unhandledRejection', (err) => {
      console.error('unhandledRejection', err)
      try { pingThrown('unhandledRejection', err) } catch { /* ignore */ }
    })
  } catch (e) {
    // best-effort: file logging optional
  }
}

function fatalError(stage: string, err: unknown) {
  const msg = err instanceof Error ? `${err.message}\n${err.stack || ''}` : String(err)
  console.error(`[fatal:${stage}]`, msg)
  try {
    dialog.showErrorBox(
      'ScriptureLive AI failed to start',
      `Stage: ${stage}\n\n${msg}\n\nFull log saved to:\n${logFilePath}\n\nPlease send this log file to support.`
    )
  } catch { /* ignore */ }
}

type NdiStartOptions = NdiServiceStartOptions & {
  layout?: 'mirror' | 'ndi'
  transparent?: boolean
  lowerThird?: {
    enabled?: boolean
    position?: 'top' | 'bottom'
    branding?: string
    accent?: string
    // v0.7.5.1 — Operator's lower-third HEIGHT bucket (sm/md/lg) and
    // SCALE multiplier (0.5..2). When the panel passes them through,
    // the FrameCapture URL includes ?lh= and ?sc= so the captured
    // BrowserWindow paints with the operator's exact settings on its
    // first frame, eliminating the "vMix sees an oversized bar even
    // though the in-app preview shows the correct small card" mismatch.
    height?: 'sm' | 'md' | 'lg'
    scale?: number
  }
}
import { FrameCapture } from './frame-capture'
import { setupAutoUpdater, runManualCheck, getUpdateState, onUpdateState, triggerUpdateDownload, type UpdateState } from './updater'
import { renderBadgedIcon, type BadgeColor } from './tray-badges'
import {
  type AppPreferences,
  readPreferences,
  writePreferences,
  installHideToTrayCloseHandler,
} from './preferences'

// ── Replit-hosted speech-to-text proxy ────────────────────────────────
// The bundled Next.js standalone server in this Electron app forwards
// every /api/transcribe request to this URL. The OpenAI key never lives
// on the customer's PC — it sits as an env secret on the Replit
// deployment that serves this URL. To rotate the deployment URL,
// change this constant, run `pnpm version` + the build/push workflow,
// and ship.
const DEFAULT_TRANSCRIBE_PROXY_URL =
  'https://cloud.scriptureliveai.com/api/transcribe'

// Public marketing site URL surfaced from the Help menu so operators
// can hand a link to their pastor / IT lead for pricing, contact, and
// system requirements. Mirrors `src/lib/website-url.ts` (the renderer
// can't be imported here because the electron tsconfig roots at
// ./electron) — keep the two in sync.
//
// Override at build time with `NEXT_PUBLIC_WEBSITE_URL` — the SAME
// env var the renderer's `src/lib/website-url.ts` reads. Sharing one
// var name means a single assignment in CI propagates to both the
// Help-menu link (this file) and the in-app "Visit website" row, so
// the two surfaces never disagree. Next.js inlines NEXT_PUBLIC_* at
// renderer build time, and Electron's main process picks the same
// var up from `process.env` at launch.
// v0.7.134 — Default flipped from `scripturelive.replit.app` →
// `scriptureliveai.com` so every operator-clicked "Visit website" link
// (Help menu, Help & Updates card, first-run welcome dialog, the
// desktop links from https://imgur.com/a/gZoZtsp) opens the public
// marketing domain. Mirrors the matching default in
// `src/lib/website-url.ts` — keep them in lockstep.
const WEBSITE_URL =
  process.env.NEXT_PUBLIC_WEBSITE_URL?.trim() ||
  'https://scriptureliveai.com/'

const isDev = !app.isPackaged

// ── Chromium command-line flags ───────────────────────────────────
// Best-effort flags to coax Web Speech / mic capture into working in
// the packaged app. These are applied BEFORE app.whenReady so they
// take effect during Chromium init.
//
// Note: Web Speech API in Electron is inherently limited because
// Google's speech-to-text endpoint requires a Google API key that's
// only baked into Chrome — packaged Electron builds will hit
// `network` errors. The renderer-side hook now detects this and
// shows a clear actionable error instead of bouncing on/off forever.
// v0.7.239 — Force Electron's runtime identity to "ScriptureLive AI" so
// Windows Task Manager groups the main + helper processes under that
// name (and uses the AppUserModelID to attach the round product icon to
// the grouped row in the task bar / jump list). Without these two calls
// the operator sees "Electron (8)" in Task Manager with the generic
// Electron atom icon, because:
//   • `app.name` defaults to package.json `name` = "@workspace/imported-app"
//     (npm scope name, not the product name). Electron-builder renames the
//     packaged .exe correctly via `productName`, but Electron's RUNTIME
//     name (used for some Windows window-class grouping calls) stays at
//     the package.json value unless we override it here.
//   • The AppUserModelID is what Windows uses to group windows of the
//     "same app" in Task Manager and the task bar. NSIS sets it on the
//     installed shortcut, but Electron must ALSO call setAppUserModelId
//     so the running process advertises the same AUMID — otherwise
//     Windows falls back to a process-name-derived AUMID and the group
//     row is labelled with the binary stem ("Electron" in dev,
//     "ScriptureLive AI" in production but without icon attachment).
// MUST be called BEFORE any BrowserWindow is created (i.e. BEFORE
// app.whenReady) so the very first window already advertises the AUMID.
// Must come BEFORE the commandLine.appendSwitch block so the AUMID is
// set during Electron's earliest init phase.
app.setName('ScriptureLive AI')
if (process.platform === 'win32') {
  // Mirror electron-builder.yml `appId`. Single source of truth in NSIS
  // is the installer; runtime mirror here keeps Task Manager grouping
  // consistent for both packaged AND dev (`electron .`) launches.
  app.setAppUserModelId('ai.scripturelive.desktop')
}

app.commandLine.appendSwitch('enable-features', 'WebSpeechAPI,SpeechSynthesisAPI,WebRTC-Audio-Red-For-Opus')
app.commandLine.appendSwitch('enable-speech-dispatcher')
// Auto-grant getUserMedia for the bundled origin so the mic doesn't
// need a per-session prompt the user has to click through.
app.commandLine.appendSwitch('use-fake-ui-for-media-stream')
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
// v0.7.92 — Disable Chromium's WebRTC automatic gain control so that
// (a) the operator's manual mic-gain knob actually has an effect
// (AGC was renormalizing the input continuously, completely
// overriding our renderer-side GainNode), and (b) Chromium stops
// writing to the OS-level mic-input volume slider — that write is
// system-wide on Windows, which is what was causing OBS / vMix /
// Zoom etc. to suddenly find their mic level lowered the moment our
// app captured audio. Belt-and-braces with the renderer-side
// `autoGainControl: false` constraint added in this same release.
app.commandLine.appendSwitch(
  'disable-features',
  'WebRtcAllowInputVolumeAdjustment,WebRtcHybridAgc,WebRtcAnalogAgcClippingControl',
)

const ndi = new NdiService()
let frameCapture: FrameCapture | null = null
// v0.6.6 — Tracks the layout/transparent/lowerThird flags the current
// FrameCapture window was started with. We store them at module scope
// (rather than exposing getters on FrameCapture) so the ndi:start
// short-circuit can detect operator-toggled changes (e.g. "Transparent
// ON → OFF while broadcasting") and rebuild the BrowserWindow with
// the new flags. Pre-v0.6.6 only source/geometry/fps were tracked, so
// transparent-toggle changes were silently ignored.
let frameCaptureFlags: {
  layout: 'mirror' | 'ndi'
  transparent: boolean
  lowerThird: boolean
  lowerThirdPosition: 'top' | 'bottom'
  // v0.7.5.1 — Track the URL-baked lower-third HEIGHT bucket and
  // SCALE multiplier on the running FrameCapture so the next
  // ndi:start can detect operator-dragged changes to those sliders
  // and force a true rebuild. Without this the equality check
  // below would short-circuit (source/geometry/fps/transparent/
  // lowerThird/position all unchanged), the BrowserWindow would
  // keep loading the OLD ?lh=&sc= params, and vMix/OBS would
  // continue to render the wrong size — defeating the whole point
  // of the URL-bake fix.
  lowerThirdHeight: 'sm' | 'md' | 'lg' | null
  lowerThirdScale: number | null
  // v0.7.230 — Track the operator-picked OBS-compat BGRA opt-in on
  // the running sender so a toggle WHILE NDI is running forces a true
  // rebuild instead of short-circuiting. The FourCC is baked into the
  // sender at ndilib_send_create and CANNOT be live-applied — without
  // this field the equality check below would short-circuit (same
  // source/geometry/fps/transparent/LT...) and the wire FourCC would
  // stay on the OLD value while the panel UI shows the new toggle
  // state. Same lesson as v0.6.6 transparent toggle + v0.7.5.1 LT
  // height/scale drag — any sender-create-time option MUST live here.
  forceBgraForObs: boolean
} | null = null
let mainWindow: BrowserWindow | null = null
// v0.7.121 — Tracked kiosk-style output BrowserWindows (congregation,
// stage, etc). Re-homed to primary on screen.on('display-removed') so
// the operator never sees a blank projector after unplugging.
const kioskWindows: Set<BrowserWindow> = new Set()
let tray: Tray | null = null
let nextProcess: ChildProcess | null = null
let appBaseUrl = ''
let ndiTransition: Promise<unknown> = Promise.resolve()
// Set the moment any explicit-quit code path runs (tray Quit, app menu
// Quit / Cmd+Q, updater restart, fatal error → app.quit()). The main
// window's `close` handler reads this to decide between
// "hide-to-tray" (default for the X button) and "really close".
let isQuitting = false
// Tracks whether we've already shown the "still running in the tray"
// hint THIS session, so multiple hide cycles don't spam the operator.
// First-ever hide is also gated by a marker file in userData (see
// `maybeShowTrayHint`).
let trayHintShownThisSession = false
// Live broadcast guard. True while the NDI sender is actively pushing
// frames to vMix / Wirecast / OBS / Studio Monitor. While true, every
// operator-actionable update prompt (tray menu CTA, in-app banner,
// renderer toast, OS notification) is held — an accidental click on
// "Restart to install" mid-service tears the source off the air. The
// flag is flipped by `applyNdiAirChange()` whenever NDI starts/stops;
// renderers see the same signal via the existing `ndi:status` push
// and gate their own UI off it.
let ndiOnAir = false
// Last "downloaded" state we received while on-air. Held instead of
// surfacing the OS toast immediately so we can replay it the moment
// NDI stops. Cleared on replay.
let pendingDownloadedNotification: UpdateState | null = null
// Operator preference: when true, the X button on the main window
// runs the normal shutdown path instead of hiding to tray. Default
// false (keeps the new tray-friendly behavior). Persisted to
// `userData/preferences.json` so the main process can honor it on
// the very first close after launch — before any IPC traffic from
// the renderer. See `loadAppPreferences` / `setQuitOnCloseAndPersist`.
let quitOnClose = false
// Operator preference: when false, the update-ready OS toast (the
// one fired by `notifyUpdateDownloaded`) is suppressed. Hidden in
// `userData/preferences.json` alongside `quitOnClose`. Default true
// — same surface operators have been getting since the toast shipped.
// Hydrated at boot by `loadAppPreferences` so the very first
// `onUpdateState` callback honors the saved choice.
let desktopUpdateToastEnabled = true

function serializeNdi<T>(fn: () => Promise<T>): Promise<T> {
  const next = ndiTransition.then(() => fn(), () => fn())
  ndiTransition = next.catch(() => undefined)
  return next
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, () => {
      const addr = srv.address()
      if (addr && typeof addr === 'object') {
        const port = addr.port
        srv.close(() => resolve(port))
      } else {
        reject(new Error('failed to allocate port'))
      }
    })
  })
}

// Pin the internal Next.js server to a stable port so the renderer's
// localStorage (zustand persist: OpenAI key, schedule, sermon notes,
// settings, etc.) stays in the SAME origin across launches. With a
// random port every launch the origin changes and Chromium scopes
// localStorage per-origin, so all persisted state silently disappears.
// If the preferred port is taken (e.g. another instance running, or
// some unrelated app squatting on it) we fall back to a dynamic port,
// which means data from the last launch will appear empty for THIS
// session only — better than failing to launch.
async function getPinnedPort(preferred = 47330): Promise<number> {
  return new Promise((resolve) => {
    const srv = createServer()
    srv.unref()
    srv.once('error', async () => {
      console.warn(`[port] preferred ${preferred} unavailable, using dynamic (settings will look empty this session)`)
      try { resolve(await getFreePort()) } catch { resolve(preferred) }
    })
    srv.listen(preferred, '127.0.0.1', () => {
      const a = srv.address()
      const p = (a && typeof a === 'object') ? a.port : preferred
      srv.close(() => resolve(p))
    })
  })
}

/**
 * Lightweight on-disk preferences store. Lives at
 * `userData/preferences.json`. Used by the main process for prefs
 * that must be known at boot time / at window-close time, BEFORE the
 * renderer has a chance to push them in over IPC. Keeps the file
 * tiny and human-editable; missing / malformed file → defaults.
 *
 * The actual JSON parse / write lives in `./preferences.ts` so it
 * can be unit-tested without an Electron `app` instance. The
 * wrappers below just resolve the userData path and add main-process
 * logging.
 */
function getPreferencesPath(): string {
  return path.join(app.getPath('userData'), 'preferences.json')
}

function loadAppPreferences(): AppPreferences {
  try {
    return readPreferences(getPreferencesPath())
  } catch (err) {
    console.warn('[prefs] failed to read preferences.json (using defaults):', err)
    return {}
  }
}

function writeAppPreferences(prefs: AppPreferences): void {
  try {
    writePreferences(getPreferencesPath(), prefs)
  } catch (err) {
    console.warn('[prefs] failed to write preferences.json:', err)
    throw err
  }
}

// The "should this window hide instead of really closing?" decision
// lives in `shouldHideOnCloseFromInputs` (./preferences.ts), wired
// onto each operator-facing window by `installHideToTrayCloseHandler`
// from the same module. Sharing the installer with the E2E harness
// means the bundled app and the test run identical close-handler
// code — no risk of the test version drifting.

/**
 * Hydrate the in-memory `quitOnClose` flag from the preferences
 * file. Called once on boot, before the main window is created, so
 * the very first close already honors the operator's choice.
 */
function hydrateQuitOnCloseFromDisk(): void {
  const prefs = loadAppPreferences()
  quitOnClose = prefs.quitOnClose === true
  console.log('[prefs] quitOnClose =', quitOnClose)
}

/**
 * Persist a new `quitOnClose` value AND update the in-memory flag
 * atomically. Toggling does not require an app restart — the next
 * close uses the new value immediately because the close handler
 * reads `quitOnClose` at fire time.
 */
function setQuitOnCloseAndPersist(next: boolean): void {
  const prefs = loadAppPreferences()
  prefs.quitOnClose = next
  writeAppPreferences(prefs)
  quitOnClose = next
}

/**
 * Hydrate the in-memory `desktopUpdateToastEnabled` flag from disk.
 * Default is true — the legacy behavior — so a missing pref or a
 * brand-new install still pops the toast that operators expect.
 * Read once at boot before the updater fires its first state push.
 */
function hydrateDesktopUpdateToastFromDisk(): void {
  const prefs = loadAppPreferences()
  // Only treat an explicit `false` as "off"; anything else (missing,
  // null, true) means the operator hasn't opted out, so keep the
  // toast on.
  desktopUpdateToastEnabled = prefs.desktopUpdateToastEnabled !== false
  console.log('[prefs] desktopUpdateToastEnabled =', desktopUpdateToastEnabled)
}

/**
 * Persist the desktop-toast preference and update the in-memory flag.
 * No restart needed: the next time `notifyUpdateDownloaded` fires it
 * reads the live flag and either fires the toast or short-circuits.
 */
function setDesktopUpdateToastEnabledAndPersist(next: boolean): void {
  const prefs = loadAppPreferences()
  prefs.desktopUpdateToastEnabled = next
  writeAppPreferences(prefs)
  desktopUpdateToastEnabled = next
}

function getUserDbPath(): string {
  const dir = path.join(app.getPath('userData'), 'db')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const dbPath = path.join(dir, 'custom.db')
  if (!fs.existsSync(dbPath)) {
    const bundled = isDev
      ? path.join(__dirname, '..', 'db', 'custom.db')
      : path.join(process.resourcesPath, 'app-db', 'custom.db')
    if (fs.existsSync(bundled)) {
      try { fs.copyFileSync(bundled, dbPath) } catch { /* ignore */ }
    }
  }
  return dbPath
}

/**
 * Where uploaded media (images / videos) lives on disk.
 *
 * BUG WE'RE FIXING — operator complaint "DATA NOT SAVING":
 * The Next.js upload route used to write to `process.cwd()/uploads`. In
 * the packaged app the spawned Next process has cwd = standaloneDir,
 * which lives INSIDE process.resourcesPath, i.e.
 *     C:\Program Files\ScriptureLive AI\resources\app\.next\standalone\…\uploads
 *
 * Two failure modes flow from that:
 *   1. On Windows non-admin, writes under Program Files either fail
 *      silently or get redirected by UAC VirtualStore — the file path
 *      we hand back in the response then 404s on the next read.
 *   2. The auto-updater REPLACES the entire resources/app folder on
 *      every release, wiping every uploaded asset along with it. The
 *      operator's mediaLibrary survives in localStorage but every URL
 *      in it points at a file that's been deleted.
 *
 * Routing uploads to userData/uploads fixes both: the folder is
 * always writable (it's per-user AppData), and the auto-updater
 * never touches it.
 */
function getUserUploadsDir(): string {
  const dir = path.join(app.getPath('userData'), 'uploads')
  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }) } catch { /* ignore */ }
  }
  return dir
}

// ──────────────────────────────────────────────────────────────────────
// v0.7.79 — Boot splash window.
//
// Operator request: clicking the desktop icon used to open onto a
// blank/black screen for the 1-3 s it takes the embedded Next.js
// server to come up + Chromium to mount the React tree, which felt
// like the app had hung. Wirecast / vMix / OBS all show a small
// branded splash with rolling status text during boot, and we now
// match that pattern.
//
// The splash is a frameless 480×320 BrowserWindow that loads an
// inline data: URL (no extra build artifact, no extraResources copy
// to keep the installer slim) and exposes a tiny `window.__setStatus`
// hook the main process drives via webContents.executeJavaScript at
// each boot phase. It's `alwaysOnTop` + `skipTaskbar` so it floats
// cleanly over a busy desktop without a taskbar entry, and it auto-
// closes the moment the main window's DOM is ready (`did-finish-load`)
// — never on a timer, so the splash never lingers nor disappears
// before the main UI is actually visible.
//
// Suppressed when the app is launched in --hidden mode (auto-launch
// at login boot path) since there is no operator at the keyboard to
// see it and we want the boot to be visually invisible there.
// ──────────────────────────────────────────────────────────────────────
let splashWindow: BrowserWindow | null = null

// v0.7.149 — Resolve the logo PNG once at boot. Tries the packaged
// standalone-public path (prod), then the source public/ path (dev),
// then the build-resources/icon.png shipped with electron-builder.
// Returns a data: URL ready to drop into `<img src=…>` in the splash
// HTML. If every path fails (corrupt install) we fall back to the
// inline orange-book SVG below so the splash still renders.
function loadLogoDataUrl(): string {
  const candidates = [
    path.join(process.resourcesPath || '', 'app', '.next', 'standalone', 'artifacts', 'imported-app', 'public', 'icon-512.png'),
    path.join(__dirname, '..', 'public', 'icon-512.png'),
    path.join(__dirname, '..', '..', 'public', 'icon-512.png'),
    path.join(__dirname, '..', 'build-resources', 'icon.png'),
    path.join(__dirname, '..', '..', 'build-resources', 'icon.png'),
  ]
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) {
        const b64 = fs.readFileSync(p).toString('base64')
        return `data:image/png;base64,${b64}`
      }
    } catch { /* try next */ }
  }
  return ''
}

function buildSplashHtml(version: string): string {
  // v0.7.149 — Splash now uses the operator's actual app logo
  // (public/icon-512.png) instead of an inline SVG glyph, for a more
  // professional look matching the installed Windows shortcut icon.
  // Falls back to the inline SVG mark only if the PNG can't be read.
  // Single-file dark dialog: brand mark, animated ring, status text,
  // version footer. The body is replaced by main-process IPC
  // (executeJavaScript -> window.__setStatus) at each boot phase.
  const logoDataUrl = loadLogoDataUrl()
  const markHtml = logoDataUrl
    ? `<img class="logo" src="${logoDataUrl}" alt="ScriptureLive AI" />`
    : `<div class="mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
        </svg>
      </div>`
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>ScriptureLive AI</title>
<style>
  :root { color-scheme: dark; }
  html, body {
    margin: 0; padding: 0;
    width: 100%; height: 100%;
    background: radial-gradient(ellipse at top, #1a1a1a 0%, #0a0a0a 60%, #050505 100%);
    color: #e5e5e5;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    overflow: hidden;
    user-select: none;
    -webkit-user-select: none;
    cursor: default;
  }
  .wrap {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    height: 100%; gap: 18px; padding: 28px;
    -webkit-app-region: drag;
  }
  .brand {
    display: flex; align-items: center; gap: 14px;
  }
  .mark {
    width: 56px; height: 56px;
    border-radius: 14px;
    background: linear-gradient(135deg, #f59e0b 0%, #b45309 100%);
    display: grid; place-items: center;
    box-shadow: 0 8px 24px -8px rgba(245, 158, 11, .55), inset 0 1px 0 rgba(255,255,255,.18);
  }
  .mark svg { width: 30px; height: 30px; color: #1a1a1a; }
  .logo {
    width: 64px; height: 64px;
    border-radius: 16px;
    object-fit: contain;
    box-shadow: 0 10px 28px -10px rgba(245, 158, 11, .55);
    -webkit-user-drag: none;
  }
  .title {
    font-size: 18px; font-weight: 600; letter-spacing: .2px;
    color: #fafafa;
  }
  .subtitle {
    font-size: 11px; color: #a3a3a3; margin-top: 2px;
    letter-spacing: .4px; text-transform: uppercase;
  }
  .ring {
    width: 22px; height: 22px;
    border: 2px solid rgba(245, 158, 11, .18);
    border-top-color: #f59e0b;
    border-radius: 50%;
    animation: spin .9s linear infinite;
  }
  .row {
    display: flex; align-items: center; gap: 10px;
    min-height: 22px;
    margin-top: 4px;
  }
  .status {
    font-size: 13px; color: #d4d4d8;
    transition: opacity .2s ease;
  }
  .status.fade { opacity: .35; }
  .footer {
    position: absolute; bottom: 12px; left: 0; right: 0;
    text-align: center;
    font-size: 10px; color: #525252; letter-spacing: .5px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>
  <div class="wrap">
    <div class="brand">
      ${markHtml}
      <div>
        <div class="title">ScriptureLive AI</div>
        <div class="subtitle">Worship Console</div>
      </div>
    </div>
    <div class="row">
      <div class="ring" aria-hidden="true"></div>
      <div id="status" class="status">Starting up…</div>
    </div>
  </div>
  <div class="footer">v${version} — by WassMedia</div>
  <script>
    window.__setStatus = function (text) {
      var el = document.getElementById('status');
      if (!el) return;
      el.classList.add('fade');
      setTimeout(function () {
        el.textContent = String(text || '');
        el.classList.remove('fade');
      }, 120);
    };
  </script>
</body>
</html>`
}

// v0.7.90 — Shared crash-mask + auto-reload installer.
//
// ROOT CAUSES this rewrite fixes (vs v0.7.89):
//
//   1) reload()-loops-the-mask bug. v0.7.89 did:
//        loadURL(MASK)  →  setTimeout(() => webContents.reload(), 400)
//      `reload()` reloads the CURRENT url. After loadURL(MASK), the
//      current URL IS the mask data: URL. So we kept reloading the
//      mask forever and NEVER retried the real server URL. When the
//      server recovered the user was stuck on the spinner; when it
//      stayed down we never actually noticed (because did-finish-load
//      of the mask kept resetting the attempts counter to 0).
//
//   2) did-finish-load resetting the counter on the MASK. Same root
//      cause as (1) — the mask "succeeding" was treated as a recovery,
//      so the give-up dialog never fired and the bookkeeping was lying.
//
// Fix:
//   • Track the LAST REAL navigation target (via did-navigate /
//     did-start-navigation) so we can re-attempt the right URL.
//   • Skip ALL of our own data: URL navigations in the bookkeeping —
//     the mask loading or "failing" never resets / increments the
//     counter and never schedules another reload.
//   • Use loadURL(targetURL) explicitly for retries — never reload().
//   • Cap at 8 consecutive failures of the REAL URL, then either show
//     the friendly Relaunch dialog (main window) or leave the spinner
//     up indefinitely (popouts).
const __MASK_HTML = `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><html><head><meta charset="utf-8"><title>ScriptureLive AI</title><style>html,body{margin:0;height:100%;background:#0a0a0a;color:#9ca3af;font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px}.s{width:32px;height:32px;border-radius:50%;border:2px solid #27272a;border-top-color:#f59e0b;animation:r 0.9s linear infinite}@keyframes r{to{transform:rotate(360deg)}}</style></head><body><div class="s"></div><div>Reconnecting…</div></body></html>`)}`

function installCrashMask(
  win: BrowserWindow,
  label: string,
  opts: { showDialogOnGiveUp: boolean },
): void {
  let attempts = 0
  let timer: NodeJS.Timeout | null = null
  // The last REAL URL the renderer navigated to (i.e. http(s)://, not
  // our own data: mask). This is what we re-attempt when the server
  // hiccups. Falls back to the validatedURL from did-fail-load if we
  // somehow never observed a navigation.
  let lastTargetURL: string | null = null

  // v0.7.98 — Reentrancy guard. A SINGLE failure can fire multiple
  // events for the same chrome-error episode: did-fail-load, then
  // did-navigate (chrome-error commit), then did-finish-load
  // (chrome-error finished). Without dedup, beginRecovery would run
  // 3× per real outage — the attempts counter would burn through the
  // 60 s budget in 20 s, causing a premature give-up dialog while
  // the bundled Next server was still respawning. recoveryActive is
  // set on entry to beginRecovery and cleared only when the REAL
  // target URL successfully finishes loading (or when the user
  // dismisses the give-up dialog), so the entire recovery episode is
  // treated atomically regardless of how many events surfaced it.
  let recoveryActive = false

  // v0.7.96 — Retry budget extended to ~60 seconds. The previous
  // 8 × 400 ms = 3.2 s budget gave up LONG before scheduleNextRestart
  // (in startNextServer) finished respawning the bundled Next child
  // process — that path waits up to 60 s for the readiness probe.
  // When the give-up dialog fired before the server came back, the
  // operator saw "could not reload its window after several attempts"
  // and the app force-quit, which is the user-visible bug.
  //
  // New schedule: first attempt at 400 ms, then 800, 1200, 1600… up
  // to a 2 s plateau, totalling ~60 s of patience. After 60 s we
  // either show the dialog (main window) or just leave the spinner.
  // Reset on every successful did-finish-load so subsequent hiccups
  // get a fresh budget.
  const MAX_ATTEMPTS = 40
  const nextDelay = (a: number): number => Math.min(400 + a * 400, 2000)

  const isMaskUrl = (u: string | null | undefined): boolean =>
    !!u && u.startsWith('data:')

  // v0.7.96 — Helper that paints the mask AND runs the retry timer
  // for `target`. Shared between did-fail-load and render-process-gone
  // so the recovery logic is identical regardless of which event
  // surfaced the failure.
  //
  // v0.7.98 — Instrument the mask paint so a SILENT loadURL failure
  // (e.g. data: URL blocked by session policy, renderer crashed mid-
  // navigation) is now logged to launch.log. Without this we had a
  // blind spot: the operator saw the chrome-error page persist and
  // we had no breadcrumb explaining why our mask never showed.
  const beginRecovery = (target: string | null): void => {
    if (win.isDestroyed()) return
    // v0.7.98 — dedup. If a recovery is already in flight for the
    // current chrome-error episode, every subsequent event firing
    // for the SAME episode (did-navigate, did-finish-load, repeat
    // did-fail-load) is a no-op. Prevents triple-counting attempts.
    if (recoveryActive) return
    recoveryActive = true
    win.webContents.loadURL(__MASK_HTML).catch((err) => {
      console.error(`[${label}] mask loadURL failed — chrome-error may persist`, err)
      // Fall back to an HTML inject. If even loadURL of a data: URL
      // is rejected, we can still try to overlay the chrome-error
      // page with our spinner via executeJavaScript.
      try {
        void win.webContents.executeJavaScript(
          'document.documentElement.innerHTML = ' +
          '\'<div style="position:fixed;inset:0;background:#0a0a0a;color:#9ca3af;display:flex;align-items:center;justify-content:center;font:14px system-ui;z-index:2147483647">Reconnecting…</div>\'',
          true,
        )
      } catch { /* nothing more we can do here */ }
    })
    if (!target) {
      console.error(`[${label}] no target URL recorded — cannot auto-recover`)
      return
    }
    if (attempts >= MAX_ATTEMPTS) {
      if (opts.showDialogOnGiveUp) {
        void dialog.showMessageBox(win, {
          type: 'error',
          title: 'ScriptureLive AI — connection lost',
          message: 'The app could not reload its window after a full minute of attempts.',
          detail: 'This usually clears up by relaunching ScriptureLive AI from the desktop shortcut. Your activation, library and settings are preserved.',
          buttons: ['Relaunch now', 'Quit'],
          defaultId: 0,
          cancelId: 1,
        }).then((r) => {
          if (r.response === 0) app.relaunch()
          app.exit(0)
        }).catch(() => { /* dialog failed — leave app as-is */ })
      } else {
        // Popout: keep the spinner up forever. Operator can close from
        // the console. Reset the budget so if the server LATER comes
        // back and any external nudge re-triggers a load, we cooperate.
        attempts = 0
        // v0.7.98 — also clear the reentrancy guard so a future
        // chrome-error event (after the operator manually reloads or
        // the server returns) can re-arm recovery. Without this, the
        // popout would be stuck "recovering forever" with no way to
        // recover from a NEW failure.
        recoveryActive = false
      }
      return
    }
    const delay = nextDelay(attempts)
    attempts += 1
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      if (win.isDestroyed()) return
      try {
        // CRITICAL: use loadURL(target), NOT webContents.reload().
        // reload() would re-load the mask we just painted, which
        // always succeeds and would silently abandon the real URL.
        void win.webContents.loadURL(target)
      } catch (err) {
        console.error(`[${label}] auto-recover loadURL threw:`, err)
      }
    }, delay)
  }

  win.webContents.on('did-start-navigation', (_e, url, _isInPlace, isMainFrame) => {
    if (!isMainFrame) return
    if (isMaskUrl(url)) return
    lastTargetURL = url
  })

  win.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return
    if (errorCode === -3) return // ERR_ABORTED — user cancelled / fast nav
    // The mask "failing" must NEVER count against us and must NEVER
    // schedule another retry. Just log and bail.
    if (isMaskUrl(validatedURL)) {
      console.warn(`[${label}] mask data: URL reported did-fail-load (ignored)`, { errorCode, errorDescription })
      return
    }
    const target = lastTargetURL || validatedURL || null
    console.warn(`[${label}] did-fail-load:`, { errorCode, errorDescription, validatedURL, target, attempts })
    beginRecovery(target)
  })

  // v0.7.96 — render-process-gone fires when the renderer subprocess
  // crashes (OOM, segfault, killed by AV). did-fail-load does NOT
  // fire in this case — the page is "gone" rather than "failed". A
  // gone renderer leaves the window painting Chromium's "Aw, Snap!"
  // / "This page couldn't load" page until something explicitly
  // calls reload() or loadURL(). Without this listener, a one-off
  // renderer crash would strand the operator on the error page
  // permanently. We treat it identically to did-fail-load and run
  // the same mask + retry recovery against the last known target URL.
  win.webContents.on('render-process-gone', (_e, details) => {
    console.warn(`[${label}] render-process-gone:`, details)
    if (details.reason === 'clean-exit') return // intentional
    beginRecovery(lastTargetURL)
  })

  win.webContents.on('did-finish-load', () => {
    const cur = win.webContents.getURL()
    // v0.7.98 — BRUTE-FORCE chrome-error guard. If Chromium ever
    // paints chrome-error://chromewebdata as a "successful" load
    // (some failure classes don't fire did-fail-load — e.g. a TLS
    // error that Chromium classifies internally as a navigation
    // success to the error page), force-trigger recovery here so
    // the operator never sees the raw error chrome with the
    // "Reload / Back" buttons. This is the safety net that makes
    // the symptom impossible regardless of which underlying event
    // (or non-event) caused it.
    if (cur.startsWith('chrome-error://')) {
      console.warn(`[${label}] chrome-error painted (did-finish-load) — forcing recovery`, { cur, lastTargetURL })
      beginRecovery(lastTargetURL)
      return
    }
    // Only the REAL URL succeeding counts as recovery. The mask
    // finishing must NOT reset the budget — otherwise the give-up
    // dialog never fires when the server is permanently dead.
    if (isMaskUrl(cur)) return
    attempts = 0
    // v0.7.98 — REAL URL succeeded → episode is over, allow the
    // next episode to trigger recovery again.
    recoveryActive = false
    if (timer) { clearTimeout(timer); timer = null }
  })

  // v0.7.98 — Second safety net. did-navigate fires the moment a
  // navigation commits (before did-finish-load), so we catch the
  // chrome-error URL ASAP and beat the user's eyeball to it. Some
  // chrome-error renders never reach did-finish-load (e.g. when the
  // renderer is killed mid-paint), so catching at did-navigate AND
  // did-finish-load gives us double coverage.
  win.webContents.on('did-navigate', (_e, url) => {
    if (url.startsWith('chrome-error://')) {
      console.warn(`[${label}] chrome-error navigated (did-navigate) — forcing recovery`, { url, lastTargetURL })
      beginRecovery(lastTargetURL)
    }
  })
}

// v0.7.91 — Track when the splash first became visible so closeSplash
// can guarantee an operator-perceived minimum dwell of 4.5 s. Without
// this, on fast machines the splash flickered for ~600 ms and the
// operator wasn't sure their click had landed (recurring complaint
// in the field). 4.5 s is the operator's spec ("4 to 5 sec").
let splashOpenedAt = 0
// v0.7.149 — Operator request: splash should disappear IMMEDIATELY
// when the main window is ready ("immediately app launch, take it
// off"). The 4.5 s minimum dwell from v0.7.91 was masking the
// transition with an unnecessary delay; with the main window now
// fully painted before closeSplash() fires there's no flicker risk
// to mitigate. Setting to 0 means closeSplash() runs synchronously
// the moment did-finish-load on the main window resolves.
const SPLASH_MIN_DWELL_MS = 0

function showSplash(): void {
  if (splashWindow && !splashWindow.isDestroyed()) return
  splashOpenedAt = Date.now()
  try {
    splashWindow = new BrowserWindow({
      width: 480,
      height: 320,
      frame: false,
      transparent: false,
      resizable: false,
      movable: true,
      // v0.7.149 — Splash is now MINIMIZABLE so the operator can shove
      // it out of the way if boot is genuinely slow and they need to
      // do something else on the PC. Pairs with the alwaysOnTop=false
      // change below — both serve the operator's "don't intrude over
      // my other apps" request.
      minimizable: true,
      maximizable: false,
      fullscreenable: false,
      // v0.7.149 — Operator request: previously alwaysOnTop=true meant
      // the splash floated over Word / Chrome / Spotify / etc. while
      // the operator was doing something else, which felt rude on
      // slower machines. Off by default — splash sits in the normal
      // window stack and yields focus to whatever the operator is
      // doing. They can still bring it back via the taskbar (see
      // skipTaskbar=false below).
      alwaysOnTop: false,
      // v0.7.149 — Show in the taskbar so a minimized splash has a
      // clickable entry to restore from. Was true (hidden) in v0.7.79
      // because the splash always-on-top'd anyway. Now that it can
      // be minimized the taskbar entry is the primary way back.
      skipTaskbar: false,
      center: true,
      show: false,
      backgroundColor: '#0a0a0a',
      title: 'ScriptureLive AI',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        // No preload — splash is fully self-contained. Setting
        // `additionalArguments: ['--splash']` would let a shared
        // preload distinguish, but we avoid wiring one at all so
        // the splash window has zero attack surface.
      },
    })
    const html = buildSplashHtml(app.getVersion())
    const url = 'data:text/html;charset=utf-8;base64,' + Buffer.from(html, 'utf8').toString('base64')
    void splashWindow.loadURL(url)
    splashWindow.once('ready-to-show', () => {
      if (splashWindow && !splashWindow.isDestroyed()) splashWindow.show()
    })
    splashWindow.on('closed', () => { splashWindow = null })
  } catch (err) {
    // Splash is decorative — never block boot on its failure.
    console.warn('[splash] failed to create (non-fatal):', err)
    splashWindow = null
  }
}

function setSplashStatus(text: string): void {
  if (!splashWindow || splashWindow.isDestroyed()) return
  try {
    void splashWindow.webContents.executeJavaScript(
      `window.__setStatus && window.__setStatus(${JSON.stringify(text)})`,
      true,
    ).catch(() => { /* splash gone mid-boot — ignore */ })
  } catch { /* ignore */ }
}

function closeSplash(): void {
  // v0.7.91 — Honor SPLASH_MIN_DWELL_MS. If the boot was fast and the
  // splash has been visible for less than the operator's minimum, defer
  // the actual close until the dwell elapses. The main window is
  // already up underneath; the splash just floats on top a moment
  // longer so the operator's brain registers "yes, the app is
  // launching" before the operator UI replaces it.
  if (!splashWindow || splashWindow.isDestroyed()) {
    splashWindow = null
    return
  }
  const elapsed = Date.now() - (splashOpenedAt || Date.now())
  const remaining = Math.max(0, SPLASH_MIN_DWELL_MS - elapsed)
  const doClose = () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      try { splashWindow.close() } catch { /* ignore */ }
    }
    splashWindow = null
  }
  if (remaining > 0) {
    setTimeout(doClose, remaining)
  } else {
    doClose()
  }
}

async function startNextServer(): Promise<string> {
  if (isDev) {
    return process.env.NEXT_DEV_URL || 'http://localhost:3000'
  }

  const port = await getPinnedPort()
  const dbPath = getUserDbPath()
  // Next.js emits the standalone bundle at
  //   .next/standalone/<artifact-path-relative-to-workspace-root>/server.js
  // because outputFileTracingRoot is pinned to the workspace root in
  // next.config.ts (required so Turbopack can resolve hoisted deps in this
  // pnpm monorepo). The full standalone tree is copied to resources/app/
  // by electron-builder's extraResources, so server.js lives at:
  //   resources/app/.next/standalone/artifacts/imported-app/server.js
  const standaloneDir = path.join(
    process.resourcesPath, 'app', '.next', 'standalone',
    'artifacts', 'imported-app'
  )
  const serverEntry = path.join(standaloneDir, 'server.js')

  if (!fs.existsSync(serverEntry)) {
    throw new Error(`Next standalone server missing at ${serverEntry}`)
  }

  // Resolve uploads folder under userData (writable + survives every
  // auto-update). The Next.js upload route reads
  // SCRIPTURELIVE_UPLOADS_DIR and falls back to cwd/uploads in dev.
  const uploadsDir = getUserUploadsDir()
  nextProcess = spawn(process.execPath, [serverEntry], {
    cwd: standaloneDir,
    env: {
      ...process.env,
      PORT: String(port),
      // v0.7.153 — Bind the bundled Next.js server to ALL interfaces
      // (0.0.0.0) instead of loopback only. This is what powers the
      // new "OBS Browser Source URL" card in the NDI Output panel:
      // operators can paste the LAN URL (http://<pc-ip>:<port>/api/output/congregation?transparent=1)
      // into OBS on a SECOND PC's Browser Source and receive the
      // verse-only feed with full transparency, ZERO plugin install
      // (no DistroAV, no NDI Tools required on the receiver). This is
      // the zero-install alternative to NDI for cross-PC OBS users.
      // Pre-v0.7.153 the server was bound to 127.0.0.1 which made the
      // LAN URL unreachable from any other machine on the church Wi-Fi.
      // Security note: the local server has no auth on its routes; it
      // is intended for trusted church LANs (the same trust model NDI
      // operates under — NDI also has zero auth and broadcasts to any
      // listener on the subnet via mDNS).
      HOSTNAME: '0.0.0.0',
      NODE_ENV: 'production',
      DATABASE_URL: `file:${dbPath}`,
      SCRIPTURELIVE_UPLOADS_DIR: uploadsDir,
      // Tell the standalone Next.js /api/transcribe route where to
      // forward audio chunks when no local OPENAI_API_KEY is set
      // (the only case in a customer's installed build).
      TRANSCRIBE_PROXY_URL:
        process.env.TRANSCRIBE_PROXY_URL || DEFAULT_TRANSCRIBE_PROXY_URL,
      ELECTRON_RUN_AS_NODE: '1',
    },
    stdio: 'pipe',
  })

  nextProcess.stdout?.on('data', (b) => console.log(`[next] ${b.toString().trimEnd()}`))
  nextProcess.stderr?.on('data', (b) => console.error(`[next:err] ${b.toString().trimEnd()}`))
  // v0.7.84 — Auto-restart on unexpected death. ROOT CAUSE of the
  // recurring "This page couldn't load" chrome-error page reported in
  // v0.7.82/0.7.83: the bundled Next.js standalone server is a child
  // process spawned with `spawn(process.execPath, [server.js])`. On
  // Windows it occasionally dies during the synchronous
  // writeFileSync + renameSync inside license storage.persist() —
  // antivirus / OneDrive / Defender briefly locks the rename target
  // and the unhandled EPERM exception kills the route handler thread
  // hard enough to take the whole server process down. Pre-v0.7.84 we
  // just LOGGED the exit and never respawned, so the renderer was
  // permanently orphaned (which is why v0.7.83's renderer-reload
  // handler couldn't recover — there was no server left to reload
  // against).
  //
  // Auto-restart contract:
  //   • Skip if `isQuitting` (we're shutting the app down on purpose).
  //   • Skip if `nextProcess` was nulled (manual stop in shutdown()).
  //   • Re-spawn with the SAME env / cwd / port and wait for the
  //     readiness probe before reloading the renderer.
  //   • Cap at 5 restarts within 60s so a permanently-broken server
  //     (corrupt standalone bundle, missing dep) surfaces as a
  //     dialog rather than a hot loop.
  nextProcess.on('exit', (code, signal) => {
    console.log(`[next] process exited with code ${code} signal ${signal}`)
    if (isQuitting) return
    if (!nextProcess) return // someone else cleaned up (shutdown())
    nextProcess = null
    void scheduleNextRestart()
  })

  // Wait for server readiness
  const url = `http://127.0.0.1:${port}`
  const deadline = Date.now() + 60_000
  let lastErr: unknown = null
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/api/output?format=json`)
      if (res.ok) return url
      lastErr = new Error(`HTTP ${res.status}`)
    } catch (e) { lastErr = e }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`Next server failed to start within 60s. Last error: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`)
}

// v0.7.84 — Sliding-window restart limiter for the bundled Next server.
// Keeps the last N restart timestamps; if 5 deaths happen inside 60s
// we stop respawning and surface a friendly dialog (the standalone
// bundle is genuinely broken, not just antivirus-locked).
const restartTimestamps: number[] = []
let restartInFlight = false
async function scheduleNextRestart(): Promise<void> {
  if (restartInFlight) return
  restartInFlight = true
  const now = Date.now()
  while (restartTimestamps.length && now - restartTimestamps[0] > 60_000) {
    restartTimestamps.shift()
  }
  if (restartTimestamps.length >= 5) {
    restartInFlight = false
    console.error('[next] crash-loop: 5 deaths in 60s — giving up')
    if (mainWindow && !mainWindow.isDestroyed()) {
      void dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'ScriptureLive AI — server keeps crashing',
        message: 'The bundled application server crashed 5 times in a minute and has stopped restarting.',
        detail: 'This usually means antivirus is quarantining a file inside the install folder, or the install is damaged. Try (1) excluding the ScriptureLive AI install folder from antivirus, or (2) reinstalling. Your activation, library and settings are preserved.',
        buttons: ['Relaunch now', 'Quit'],
        defaultId: 0,
        cancelId: 1,
      }).then((r) => {
        if (r.response === 0) app.relaunch()
        app.exit(0)
      }).catch(() => { /* dialog gone — leave app */ })
    }
    return
  }
  restartTimestamps.push(now)
  console.log(`[next] respawning (attempt ${restartTimestamps.length} in 60s)`)
  try {
    const url = await startNextServer()
    console.log(`[next] respawned and ready at ${url}`)
    if (mainWindow && !mainWindow.isDestroyed()) {
      try { mainWindow.webContents.reload() } catch (err) {
        console.error('[next] post-restart renderer reload threw:', err)
      }
    }
  } catch (err) {
    console.error('[next] restart failed:', err)
    // Try once more after a short delay; the readiness probe inside
    // startNextServer already waits up to 60s, so a fail here means
    // spawn() itself threw (e.g. EBUSY on the executable). Schedule
    // another attempt — the sliding-window limiter above protects us.
    setTimeout(() => { restartInFlight = false; void scheduleNextRestart() }, 1500)
    return
  }
  restartInFlight = false
}

async function createMainWindow(url: string, opts: { show?: boolean } = {}) {
  // `show` defaults to BrowserWindow's own default (true). The
  // launch-at-login boot path passes `show: false` so the operator's
  // PC comes up to a populated system tray + active NDI sender, with
  // no main window stealing focus from whatever they were doing
  // pre-service. The window still loads the URL, so when they later
  // click the tray icon `showMainWindow()` produces an instantly-
  // ready window instead of having to spin up Next/render from scratch.
  const showInitially = opts.show !== false
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: showInitially,
    backgroundColor: '#0a0a0a',
    // v0.7.253 — Switched from `public/icon-512.png` (PNG inside the
    // standalone bundle) to `icon.ico` shipped at the resources/ root
    // via electron-builder.yml extraResources. Three reasons this is
    // load-bearing for the "Electron (N)" Task Manager group label:
    //
    //   1. The previous PNG path resolved against `process.resourcesPath`
    //      + 'app/.next/standalone/artifacts/imported-app/public/icon-
    //      512.png' — a deep, tracing-dependent path that fails to load
    //      silently when output:'standalone' moves the public/ tree. On
    //      load failure Electron silently falls back to the EXE's PE
    //      icon resource (the Electron atom).
    //
    //   2. Windows BrowserWindow.icon → WM_SETICON expects a real
    //      multi-resolution .ico for the window-class icon Task Manager
    //      reads for the running process group row. PNG → ICO conversion
    //      inside Electron is flaky for the small (16×16, 32×32) sizes
    //      Task Manager actually displays.
    //
    //   3. Even with the v0.7.251 afterPack rcedit pass, --set-icon was
    //      bundled inside the same JSON-args app-builder rcedit call as
    //      the version-string operations; if any single arg silently
    //      drops --set-icon (a documented edge case in some app-builder
    //      versions), the inner exe still ships with the Electron atom
    //      PE icon. Pointing BrowserWindow directly at our .ico bypasses
    //      that dependency — Task Manager uses the window icon, not the
    //      EXE PE icon, when both are present.
    //
    // GUARD-RAIL: keep this path in lockstep with electron-builder.yml
    // extraResources entry `from: build-resources/icon.ico, to: icon.ico`.
    // Canonical pre-ship grep:
    //   `rg "icon\.ico" artifacts/imported-app/electron-builder.yml
    //    artifacts/imported-app/electron/main.ts`
    // must return ≥ 2 matches (one in each file) AND the destination
    // filename in electron-builder.yml MUST match the basename used here.
    icon: process.platform === 'win32'
      ? path.join(process.resourcesPath, 'icon.ico')
      : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Allow the renderer to use the microphone for live transcription
      // (Web Speech API + getUserMedia). Without these the Electron
      // session denies the request silently and the transcription panel
      // sits idle even when the user grants OS-level mic permission.
      webSecurity: true,
      // v0.7.194-hotfix.10 — Chromium throttles timers + requestAnimationFrame
      // by default on unfocused windows. The operator console drives the
      // Preview + Live <video> elements AND the MediaPreheat hidden warm-up
      // video; if the operator alt-tabs to OBS/Wirecast/PowerPoint mid-service
      // the throttle would freeze decoder warm-up and stall the Preview→Live
      // hand-off the moment they alt-tab back. Disable to match native-app
      // expectations (EasyWorship, ProPresenter never throttle).
      backgroundThrottling: false,
    },
    title: 'ScriptureLive AI',
    autoHideMenuBar: true,
  })
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    // v0.7.90 — Only EXTERNAL URLs (https://ndi.video, mailto:, etc.)
    // get handed to the system browser. Same-origin URLs against the
    // bundled Next server (e.g. window.open('/api/output/congregation'))
    // must NOT be opened in Edge — Edge can't resolve relative paths
    // and shows its own "This page couldn't load" page (the exact
    // symptom the operator screenshotted). Allow Electron to open
    // them in a new BrowserWindow that inherits our crash-mask via
    // did-create-window, so any hiccup paints "Reconnecting…" and
    // auto-recovers instead of dumping into the OS browser.
    try {
      const u = new URL(target, appBaseUrl || 'http://localhost')
      const sameOrigin = appBaseUrl
        ? u.origin === new URL(appBaseUrl).origin
        : u.hostname === 'localhost' || u.hostname === '127.0.0.1'
      if (sameOrigin) {
        return { action: 'allow' }
      }
    } catch { /* fall through to external */ }
    shell.openExternal(target)
    return { action: 'deny' }
  })
  // Any new BrowserWindow that Electron creates on our behalf (via
  // window.open from the renderer with action: 'allow' above) gets
  // the SAME crash-mask + auto-reload protection as the primary and
  // explicit popout windows. Without this, a renderer-driven popup
  // would be the one window in the app NOT protected — the exact
  // class of bug v0.7.89 left unfixed.
  mainWindow.webContents.on('did-create-window', (childWin, details) => {
    try {
      installCrashMask(childWin, `child:${details.url}`, { showDialogOnGiveUp: false })
    } catch (err) {
      console.error('[main] failed to install crash mask on child window:', err)
    }
  })
  // v0.7.83 — Auto-recover from "This page couldn't load" (Electron's
  // chrome-error://chromewebdata page). Symptom seen in the field: an
  // operator clicks Deactivate (or any flow that triggers a quick burst
  // of API calls), the bundled Next.js standalone server has a brief
  // hiccup mid-write (SQLite lock, slow disk, GC pause on a 4 GB box),
  // and the NEXT renderer fetch fails with ERR_CONNECTION_REFUSED.
  // Electron then paints the full-window chrome error page and the
  // operator is stuck — there is no in-app reload button.
  //
  // Belt-and-braces recovery:
  //   • Ignore subframe failures and user-aborted loads (errorCode -3).
  //   • IMMEDIATELY paint a dark mask page so the operator never sees
  //     Chromium's built-in "This page couldn't load" error chrome
  //     while we wait for the server to come back. The mask is a tiny
  //     inline data: URL — no network needed, no flash of white.
  //   • Wait 400ms (server usually back inside one tick), then reload
  //     the real URL.
  //   • Cap at 8 consecutive auto-reloads to ride out brief stalls on
  //     slow/AV-heavy machines without giving up. If we genuinely
  //     can't reconnect after that, surface a friendly dialog.
  //   • Reset the counter on every successful did-finish-load so the
  //     budget refills for the NEXT incident.
  installCrashMask(mainWindow, 'main', { showDialogOnGiveUp: true })
  // Hide-to-tray on close. The operator complaint we're solving:
  // closing the main console window during a live service used to
  // call shutdown(), which killed the Next.js server and the NDI
  // sender mid-broadcast. Now the X button just hides the window —
  // NDI keeps flowing, the bundled Next server keeps serving the
  // congregation/stage outputs, and the auto-updater keeps running.
  // The operator brings it back from the tray.
  //
  // The decision (hide vs. really close) is delegated to
  // `shouldHideOnClose()` so the same rule — `isQuitting`,
  // `quitOnClose`, tray availability, window aliveness — is shared
  // by every operator-facing window we ever wire up the same way.
  installHideToTrayCloseHandler(
    mainWindow,
    () => ({
      isQuitting,
      quitOnClose,
      hasLiveTray: !!tray && !tray.isDestroyed(),
    }),
    () => { void maybeShowTrayHint() },
  )
  mainWindow.on('closed', () => { mainWindow = null })
  // v0.7.149 — Mirror the main window's minimize/restore state onto
  // the splash so that if boot is slow and the operator minimizes
  // the main app to do something else on their PC, the splash also
  // hides (rather than floating around as a stray "ScriptureLive AI"
  // dialog the operator has to chase down separately). Restoring the
  // main window brings the splash back too — until closeSplash()
  // tears it down at did-finish-load.
  mainWindow.on('minimize', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      try { splashWindow.minimize() } catch { /* ignore */ }
    }
  })
  mainWindow.on('restore', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      try { splashWindow.restore(); splashWindow.show() } catch { /* ignore */ }
    }
  })
  mainWindow.on('hide', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      try { splashWindow.hide() } catch { /* ignore */ }
    }
  })
  await mainWindow.loadURL(url)
}

async function showDialog(opts: Electron.MessageBoxOptions): Promise<Electron.MessageBoxReturnValue> {
  const parent = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
  return parent ? dialog.showMessageBox(parent, opts) : dialog.showMessageBox(opts)
}

async function handleManualUpdateCheck() {
  if (!app.isPackaged) {
    await showDialog({
      type: 'info',
      title: 'Check for Updates',
      message: 'Updates are disabled in development builds.',
      detail: `You're running ScriptureLive AI ${app.getVersion()} from source.`,
      buttons: ['OK'],
      defaultId: 0,
    })
    return
  }

  const existing = getUpdateState()
  if (existing.status === 'downloading') {
    await showDialog({
      type: 'info',
      title: 'Check for Updates',
      message: 'An update is already downloading.',
      detail: `Download is ${Math.round(existing.percent)}% complete. You'll be prompted to restart when it's ready.`,
      buttons: ['OK'],
    })
    return
  }
  if (existing.status === 'downloaded') {
    const choice = await showDialog({
      type: 'info',
      title: 'Check for Updates',
      message: `Update ready to install`,
      detail: `Version ${existing.version} has been downloaded. Restart now to install it.`,
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    })
    if (choice.response === 0) {
      const { autoUpdater } = await import('electron-updater')
      setImmediate(() => autoUpdater.quitAndInstall(false, true))
    }
    return
  }

  // Drive the same code path as the `updater:check` IPC handler.
  const state = await runManualCheck()
  if (state.status === 'not-available') {
    await showDialog({
      type: 'info',
      title: 'Check for Updates',
      message: "You're up to date",
      detail: `ScriptureLive AI ${app.getVersion()} is the latest version.`,
      buttons: ['OK'],
    })
  } else if (state.status === 'available') {
    // Auto-download is OFF (operator-driven download flow). The
    // renderer's UpdateNotifier will show an "Update Available — Click
    // To Download" popup at the same moment, so this dialog just
    // confirms the check found something and points the operator at
    // the popup. Keeps every download decision inside the app.
    await showDialog({
      type: 'info',
      title: 'Check for Updates',
      message: 'Update available',
      detail: `Version ${state.version} is ready to download. Click Download in the popup to get it.`,
      buttons: ['OK'],
    })
  } else if (state.status === 'downloading') {
    await showDialog({
      type: 'info',
      title: 'Check for Updates',
      message: 'Update available',
      detail: `An update is downloading in the background (${Math.round(state.percent)}%). You'll be prompted to restart when it's ready.`,
      buttons: ['OK'],
    })
  } else if (state.status === 'downloaded') {
    const choice = await showDialog({
      type: 'info',
      title: 'Check for Updates',
      message: 'Update ready to install',
      detail: `Version ${state.version} has been downloaded. Restart now to install it.`,
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    })
    if (choice.response === 0) {
      const { autoUpdater } = await import('electron-updater')
      setImmediate(() => autoUpdater.quitAndInstall(false, true))
    }
  } else if (state.status === 'error') {
    // No browser-redirect button — operator wants the entire update
    // flow to stay inside the app. Surface the friendly message and
    // let the operator try Check for Updates again later.
    await showDialog({
      type: 'warning',
      title: 'Check for Updates',
      message: "Couldn't check for updates",
      detail: `${state.message}\n\nTry Check for Updates again when you have a stable internet connection.`,
      buttons: ['OK'],
    })
  }
}

/**
 * Surface (or recreate) the main window from the tray. The operator may
 * have minimized the console, hidden behind congregation/stage outputs,
 * or — with hide-to-tray on close — let the X button send it to the
 * tray while the app keeps running. Re-create against `appBaseUrl` if
 * the window has been disposed; otherwise just unminimize, show and
 * focus it.
 */
async function showMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    if (!mainWindow.isVisible()) mainWindow.show()
    mainWindow.focus()
    return
  }
  if (appBaseUrl) {
    try {
      await createMainWindow(appBaseUrl)
      mainWindow?.focus()
    } catch (err) {
      console.error('[tray] failed to recreate main window:', err)
    }
  }
}

/**
 * Tell the operator the app is still running in the tray after the
 * very first time they close the main window. Persisted by a marker
 * file in userData so subsequent installs / launches don't nag — and
 * we additionally gate by an in-memory flag so the same session
 * can't repeat-fire it (operator could close, reopen, close again).
 *
 * Best-effort throughout: file IO failures, missing notification
 * support, and balloon errors all degrade silently rather than
 * blocking the hide.
 */
async function maybeShowTrayHint(): Promise<void> {
  if (trayHintShownThisSession) return
  trayHintShownThisSession = true

  let markerPath = ''
  try {
    markerPath = path.join(app.getPath('userData'), 'tray-hint-shown.flag')
    if (fs.existsSync(markerPath)) return
  } catch { /* fall through and try to show it anyway */ }

  // Write the marker BEFORE actually showing the notification so a
  // crash mid-show doesn't cause the hint to fire forever.
  try {
    if (markerPath) fs.writeFileSync(markerPath, new Date().toISOString())
  } catch { /* ignore — worst case we show it again next launch */ }

  const title = 'ScriptureLive AI is still running'
  const body = 'The app is still in the system tray — your NDI feed and outputs are unaffected. Click the tray icon to bring the window back, or right-click the tray icon and choose Quit to exit.'

  try {
    if (Notification.isSupported()) {
      const n = new Notification({
        title,
        body,
        icon: resolveTrayIconPath(),
        silent: true,
      })
      n.on('click', () => { void showMainWindow() })
      n.show()
      return
    }
  } catch (err) {
    console.warn('[tray-hint] desktop notification failed:', err)
  }

  // Notification unsupported (some Linux desktops, headless test
  // runs). Fall back to a Windows tray balloon when available — and
  // otherwise just log it; the operator can still find the tray icon
  // on their own.
  if (process.platform === 'win32' && tray && !tray.isDestroyed()) {
    try {
      tray.displayBalloon({
        title,
        content: body,
        iconType: 'info',
      })
      return
    } catch (err) {
      console.warn('[tray-hint] tray balloon failed:', err)
    }
  }
  console.log('[tray-hint]', title, '—', body)
}

/**
 * Resolve the tray icon. Windows tray slots render at 16×16 logical
 * pixels — handing electron a 512px PNG produces a blurry, oversized
 * blob next to the system clock — so we explicitly resize. The icon
 * lives next to the bundled web assets (extraResources copies the
 * standalone tree to resources/app/) when packaged, and inside the
 * artifact's public/ folder when running from source.
 */
function resolveTrayIconPath(): string {
  if (app.isPackaged) {
    return path.join(
      process.resourcesPath, 'app', '.next', 'standalone',
      'artifacts', 'imported-app', 'public', 'icon-192.png',
    )
  }
  return path.join(__dirname, '..', 'public', 'icon-192.png')
}

/**
 * Render the current updater state as a single line suitable for the
 * tray tooltip / informational menu header. Returns `null` when there's
 * nothing worth surfacing (idle / silent not-available result), in which
 * case callers should fall back to the bare app name.
 */
function trayStatusLine(state: UpdateState): string | null {
  switch (state.status) {
    case 'idle':
    case 'not-available':
      return null
    case 'checking':
      return 'Checking for updates…'
    case 'available':
      return `Update available — v${state.version}`
    case 'downloading':
      return `Downloading update… ${Math.round(state.percent)}%`
    case 'downloaded':
      return `Update ready to install — restart to apply v${state.version}`
    case 'error':
      return "Couldn't check for updates"
  }
}

function trayTooltip(state: UpdateState): string {
  const line = trayStatusLine(state)
  if (!line) return 'ScriptureLive AI'
  // While the NDI sender is actively on the air, append a clarifying
  // suffix so a hover read makes it obvious why the tray menu won't
  // surface a clickable Download / Restart action — the prompt is held
  // until the broadcast ends so an accidental restart can't tear the
  // source off the air mid-service.
  if (ndiOnAir && (state.status === 'available' || state.status === 'downloaded')) {
    return `ScriptureLive AI — ${line} (held until broadcast ends)`
  }
  return `ScriptureLive AI — ${line}`
}

// ── Tray icon badging ─────────────────────────────────────────────────
// Pre-rendered badge variants of the base tray icon (one per color),
// populated asynchronously by `prepareTrayBadges()` once at startup.
// Until they finish rendering — and on platforms / icon paths where
// sharp fails — `trayImageFor()` falls back to the bare base image so
// the tray is never blank.
//
// `lastTrayImage` is a small memo to skip redundant `tray.setImage()`
// calls when the badge color hasn't changed (e.g. successive
// `downloading` progress ticks all map to the same orange variant).
const trayBadgedImages: Partial<Record<BadgeColor, Electron.NativeImage>> = {}
let trayBaseImage: Electron.NativeImage | null = null
let lastTrayImage: Electron.NativeImage | null = null

/**
 * Map an updater state to the badge color drawn on the tray icon, or
 * `null` for states where the bare icon is appropriate (idle, silent
 * not-available, transient checking). Kept in sync with the colors
 * referenced in `trayTitle()` so all three surfaces — tooltip, mac
 * menu-bar title, tray icon badge — agree on what state the operator
 * is looking at.
 */
function badgeColorFor(state: UpdateState): BadgeColor | null {
  switch (state.status) {
    case 'available': return 'blue'
    case 'downloading': return 'orange'
    case 'downloaded': return 'green'
    case 'error': return 'red'
    default: return null
  }
}

function trayImageFor(state: UpdateState): Electron.NativeImage | null {
  const color = badgeColorFor(state)
  if (!color) return trayBaseImage
  return trayBadgedImages[color] ?? trayBaseImage
}

/**
 * Short tag suitable for `tray.setTitle()` on macOS — appears next to
 * the menu-bar icon as plain text. Kept very short (~6 chars) so it
 * doesn't crowd other menu-bar items. No-op on Windows / Linux where
 * `setTitle` is unsupported.
 */
function trayTitle(state: UpdateState): string {
  switch (state.status) {
    case 'downloading':
      return `↓ ${Math.round(state.percent)}%`
    case 'available':
      return '● update'
    case 'downloaded':
      return '● restart'
    default:
      return ''
  }
}

function buildTrayMenu(state: UpdateState): Menu {
  const items: MenuItemConstructorOptions[] = []

  // Status header — a disabled informational row so the operator can
  // see "Update available", "Downloading 42%", etc. at the top of the
  // menu instead of having to read the tooltip. Skipped when there's
  // nothing interesting to surface (idle / silently up to date).
  const statusLine = trayStatusLine(state)
  if (statusLine) {
    items.push({ label: statusLine, enabled: false })
    items.push({ type: 'separator' })
  }

  // Contextual primary action driven by the current update state. The
  // generic "Check for Updates…" item is replaced with the most useful
  // next step the operator can take right now.
  //
  // BROADCAST-SAFE GATE: while the NDI sender is on-air, the
  // download / restart actions are replaced with disabled
  // informational rows. An accidental click on "Restart to install"
  // mid-service tears the source off the air in vMix / OBS — so we
  // hold every operator-actionable update prompt until the broadcast
  // ends. The colored tray badge + tooltip + this disabled row keep
  // the operator aware that an update is pending without offering a
  // foot-gun. As soon as `ndi:stop` flips `ndiOnAir` back to false,
  // `applyTrayState` is re-run and the normal CTAs come back.
  if (ndiOnAir && (state.status === 'available' || state.status === 'downloaded' || state.status === 'downloading')) {
    if (state.status === 'available') {
      items.push({
        label: `Update available (v${state.version}) — install after broadcast`,
        enabled: false,
      })
    } else if (state.status === 'downloading') {
      // Downloads are still allowed in the background; just keep the
      // disabled progress display so an operator glance shows activity.
      items.push({
        label: `Downloading update… ${Math.round(state.percent)}% (will install after broadcast)`,
        enabled: false,
      })
    } else {
      items.push({
        label: `Update ready (v${state.version}) — install after broadcast`,
        enabled: false,
      })
      // Operator override: install RIGHT NOW even while on-air. Guarded
      // by a native confirmation dialog (see `confirmInstallDuring-
      // Broadcast`) so an accidental click in the tray menu can't tear
      // the source off the air mid-service. Only offered when an
      // installer is actually staged on disk (status === 'downloaded')
      // — for 'available' / 'downloading' the operator has to wait for
      // the download to finish first, which gives them an explicit
      // off-ramp before the override even appears.
      items.push({
        label: 'Install anyway… (drops NDI feed for ~10s)',
        click: () => { void confirmInstallDuringBroadcast(state.version) },
      })
    }
  } else if (state.status === 'available') {
    items.push({
      label: `Download Update (v${state.version})`,
      click: () => {
        // Hand off to the same in-process download trigger the
        // renderer toast and Settings card use, so all three paths
        // share the in-flight guard, status check, and friendly
        // error normalization. Ignored when no update is available
        // (e.g. state changed between menu render and click).
        void triggerUpdateDownload()
      },
    })
  } else if (state.status === 'downloading') {
    items.push({
      label: `Downloading… ${Math.round(state.percent)}%`,
      enabled: false,
    })
  } else if (state.status === 'downloaded') {
    items.push({
      label: `Restart Now to Install v${state.version}`,
      click: () => { quitAndInstallUpdate() },
    })
  } else {
    items.push({
      label: 'Check for Updates…',
      click: () => { void handleManualUpdateCheck() },
    })
  }

  items.push(
    {
      label: 'Show Main Window',
      click: () => { void showMainWindow() },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => { app.quit() },
    },
  )

  return Menu.buildFromTemplate(items)
}

/**
 * Push the latest updater state into the tray's tooltip, contextual
 * menu, and (on macOS) menu-bar title. Throttling for the chatty
 * `downloading` status happens at the call site — here we just render.
 */
function applyTrayState(state: UpdateState) {
  if (!tray || tray.isDestroyed()) return
  try {
    tray.setToolTip(trayTooltip(state))
    tray.setContextMenu(buildTrayMenu(state))
    if (process.platform === 'darwin') {
      tray.setTitle(trayTitle(state))
    }
    // Swap the tray icon itself so the operator can see "update
    // available" / "downloading" / "ready to install" without having
    // to hover for the tooltip. Colored dot variants are pre-rendered
    // in `prepareTrayBadges()`; before they're ready (or if rendering
    // failed) `trayImageFor()` returns the base image and we fall back
    // to tooltip / menu / mac title, which still convey the state.
    const target = trayImageFor(state)
    if (target && !target.isEmpty() && target !== lastTrayImage) {
      tray.setImage(target)
      lastTrayImage = target
    }
  } catch (err) {
    console.error('[tray] failed to apply update state (non-fatal):', err)
  }
}

/**
 * Generate one badged variant per color from the base tray icon.
 * Runs once at tray init time, off the critical path: if it succeeds
 * we re-apply the current updater state so any badge that should
 * already be visible (e.g. operator launches with an update queued)
 * appears as soon as the renders complete. If it fails — sharp's
 * native binding missing on an exotic platform, the icon path
 * unreadable — we log and the tray simply stays bare-iconed; tooltip,
 * menu, and mac title still report the state.
 */
async function prepareTrayBadges(baseIconPath: string, size: number) {
  const colors: BadgeColor[] = ['blue', 'orange', 'green', 'red']
  try {
    const renders = await Promise.all(
      colors.map(c => renderBadgedIcon(baseIconPath, size, c)),
    )
    colors.forEach((c, i) => { trayBadgedImages[c] = renders[i] })
    if (tray && !tray.isDestroyed()) applyTrayState(getUpdateState())
  } catch (err) {
    // Most likely cause is sharp's native binding failing to load
    // (asarUnpack mis-config, libvips ABI mismatch on an exotic
    // distro, missing platform variant). Tray remains bare-iconed;
    // tooltip / menu / mac title still convey update state. Distinct
    // log prefix `[tray-badge-disabled]` is intentional so support can
    // grep launch.log for it without wading through other tray logs.
    console.warn('[tray-badge-disabled] badge pre-render failed (non-fatal, falling back to plain icon):', err)
  }
}

/**
 * Quit-and-install handler shared by every "Restart Now" surface
 * (tray menu, dialog, desktop notification). Pulled into one place so
 * a future change — e.g. holding restarts during a live broadcast —
 * only has to update one call site. `setImmediate` defers the call
 * past the current tick so the click handler can return cleanly
 * before Electron starts tearing the process down.
 */
function quitAndInstallUpdate() {
  void (async () => {
    try {
      const { autoUpdater } = await import('electron-updater')
      setImmediate(() => autoUpdater.quitAndInstall(false, true))
    } catch (err) {
      console.error('[updater] quitAndInstall failed:', err)
    }
  })()
}

/**
 * Operator-initiated mid-broadcast install confirmation.
 *
 * The on-air gate (held tray menu rows, disabled Settings button)
 * deliberately removes the "Restart now" affordance while NDI is
 * sending — an accidental click mid-service tears the source off
 * the air. The override exists for the rare cases where the
 * operator genuinely needs to install RIGHT NOW (security advisory,
 * blocking bug forcing a restart anyway) and is willing to take
 * the broadcast hit.
 *
 * Pops a native warning dialog spelling out the consequence ("drops
 * the NDI feed for ~10s") and only on explicit confirm hands off to
 * the same `quitAndInstallUpdate()` that the off-air "Restart now"
 * paths use. Cancelling leaves the gate in place — the held tray
 * rows / Settings hint stay disabled, NDI keeps sending, and the
 * normal flow resumes when the broadcast ends.
 *
 * The default button is Cancel (defaultId: 1) so an operator who
 * mashes Enter through a stray dialog mid-service doesn't restart
 * by accident.
 */
async function confirmInstallDuringBroadcast(version: string) {
  const choice = await showDialog({
    type: 'warning',
    title: 'Install update during broadcast?',
    message: `Install v${version} now and drop the NDI feed?`,
    detail:
      'Restarting will drop the NDI feed for about 10 seconds while ' +
      'ScriptureLive AI installs the update and relaunches. vMix / OBS ' +
      '/ Wirecast will lose the source for the duration of the restart. ' +
      "\n\nUse this only when you genuinely need to install RIGHT NOW " +
      '(security advisory, blocking bug). For normal updates, wait ' +
      'until the service ends — the update will install on the next ' +
      'clean quit either way.',
    buttons: ['Install now and drop NDI', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
  })
  if (choice.response === 0) {
    quitAndInstallUpdate()
  }
}

// One-shot OS toast when an update finishes downloading. Operators
// who minimize or hide the main window during a live service won't
// see the in-app "Restart to install" banner; the tray icon and
// tooltip already reflect the state, but a proactive notification
// surfaces the news without forcing them to glance at the
// notification area.
//
// `lastNotifiedDownloadedVersion` gates re-fires: electron-updater
// can re-emit `update-downloaded` if the operator triggers another
// check after a download completed, and our own `broadcast()`
// re-sends state to listeners. We only want to pop the toast on the
// transition INTO `downloaded` for a given version — never on every
// redundant rebroadcast, and never on download-progress events
// (which arrive dozens per second).
let lastNotifiedDownloadedVersion: string | null = null
/**
 * True when the operator is actively looking at the main window —
 * window exists, is visible (not hidden to tray), is not minimized,
 * and is the focused window. Used to suppress redundant OS surfaces
 * (like the update-ready toast) when the in-app UI is already in
 * front of the operator. Anything that means "they can't see the
 * app right now" — destroyed, hidden, minimized, backgrounded —
 * returns false so OS prompts still fire.
 */
function isMainWindowVisiblyFocused(): boolean {
  if (!mainWindow || mainWindow.isDestroyed()) return false
  try {
    if (!mainWindow.isVisible()) return false
    if (mainWindow.isMinimized()) return false
    return mainWindow.isFocused()
  } catch {
    return false
  }
}
function notifyUpdateDownloaded(state: UpdateState) {
  if (state.status !== 'downloaded') return
  // Operator opt-out: the kiosk-PC use case where any OS toast is
  // unwelcome (it can pop over a projected congregation feed when
  // the desktop is mirrored). Tray badge / tooltip / mac title and
  // the in-app banner stay live — those are wired through separate
  // `onUpdateState` subscribers and do NOT consult this flag. We
  // also don't bother stashing the state for replay: if the operator
  // has opted out, replaying after an NDI off-air transition would
  // just hit this same early-return.
  if (!desktopUpdateToastEnabled) {
    console.log(`[updater-notify] desktop toast disabled by operator — skipping update-ready toast for v${state.version}`)
    return
  }
  // Hold the OS toast while NDI is on the air. The whole point of
  // this guard is to NOT pop a "Restart Now" surface in the operator's
  // face mid-service. The state is stashed and replayed by
  // `applyNdiAirChange()` the moment NDI stops sending.
  if (ndiOnAir) {
    pendingDownloadedNotification = state
    console.log(`[updater-notify] NDI on-air — holding update-ready toast for v${state.version}`)
    return
  }
  // Skip the OS toast when the operator is already looking at the
  // app — the in-app "Restart to install" banner is the sole prompt
  // they need, and on macOS a Notification Center toast can briefly
  // cover other UI. We only fire when the main window is hidden,
  // minimized, or in the background (i.e. not visibly focused).
  // Deliberately don't set `lastNotifiedDownloadedVersion` here so
  // that a later state rebroadcast (after the operator hides or
  // backgrounds the window) still surfaces the toast — preserving
  // the hide-to-tray behavior the original notification targeted.
  if (isMainWindowVisiblyFocused()) {
    console.log(`[updater-notify] main window focused — skipping update-ready toast for v${state.version} (in-app banner is enough)`)
    return
  }
  if (lastNotifiedDownloadedVersion === state.version) return
  lastNotifiedDownloadedVersion = state.version

  const title = 'Update ready to install'
  const body = `ScriptureLive AI ${state.version} has been downloaded. Click Restart Now to install it, or use the tray icon when you're ready.`

  try {
    if (!Notification.isSupported()) {
      console.log('[updater-notify] desktop notifications unsupported — relying on tray badge / in-app banner')
      return
    }
    const n = new Notification({
      title,
      body,
      icon: resolveTrayIconPath(),
      // macOS-only: action buttons. Windows/Linux ignore this field
      // and the operator gets the same effect by clicking the body
      // of the toast (handled below). Using a single button keeps
      // the surface uncluttered and matches the "Restart now"
      // wording from the in-app banner / dialog.
      actions: [{ type: 'button', text: 'Restart Now' }],
      // Not silent — the operator explicitly opted into this update
      // by clicking Download, and the whole point is to alert them
      // that it's ready. The OS still respects Do Not Disturb.
    })
    n.on('click', () => { quitAndInstallUpdate() })
    n.on('action', () => { quitAndInstallUpdate() })
    n.show()
  } catch (err) {
    console.warn('[updater-notify] failed to show update-ready notification (non-fatal):', err)
  }
}

// Throttle handle for the high-frequency `downloading` updates.
// electron-updater fires download-progress dozens of times per second
// for a multi-megabyte installer; rebuilding the tray menu that often
// would thrash the OS shell. We coalesce to at most ~2 redraws/second
// and always render the final state when status flips to something
// other than `downloading` (so the operator never sees a stale 99%).
let trayThrottleHandle: NodeJS.Timeout | null = null
let trayThrottlePending: UpdateState | null = null
function scheduleTrayUpdate(state: UpdateState) {
  if (state.status === 'downloading') {
    trayThrottlePending = state
    if (trayThrottleHandle) return
    trayThrottleHandle = setTimeout(() => {
      trayThrottleHandle = null
      const pending = trayThrottlePending
      trayThrottlePending = null
      if (pending) applyTrayState(pending)
    }, 500)
    return
  }
  // Non-downloading transitions are rare and important — flush
  // immediately and cancel any queued progress redraw so we don't
  // overwrite "Update ready to install" with a stale "99%".
  if (trayThrottleHandle) {
    clearTimeout(trayThrottleHandle)
    trayThrottleHandle = null
    trayThrottlePending = null
  }
  applyTrayState(state)
}

/**
 * Pin a tray (system notification area) icon while the app runs so
 * operators can trigger Check for Updates… without surfacing the
 * main window — useful when the console is minimized behind the
 * congregation / stage outputs during a live service.
 *
 * Tray creation is best-effort: some Linux desktops without a system
 * tray (e.g. plain GNOME without TopIcons) will throw, and we don't
 * want to take down the whole app over a missing system widget.
 */
function setupTray() {
  try {
    const iconPath = resolveTrayIconPath()
    let image = nativeImage.createFromPath(iconPath)
    if (image.isEmpty()) {
      console.warn('[tray] icon image empty at', iconPath, '— skipping tray setup')
      return
    }
    // Tray slots render at very different physical sizes per platform:
    // 16×16 in Windows / Linux notification areas, ~22pt on a macOS
    // menu bar (Electron handles the macOS scaling, so we keep the
    // 192px source). `badgeSize` matches the size we hand to `Tray`
    // so the colored dot is a consistent fraction of the visible icon.
    const badgeSize = (process.platform === 'win32' || process.platform === 'linux') ? 16 : 192
    if (process.platform === 'win32' || process.platform === 'linux') {
      // Resize so the icon doesn't render as a fuzzy giant in the
      // notification area. macOS template icons are sized differently
      // and we'd want a separate monochrome asset for proper menu-bar
      // rendering, so leave the original image alone there.
      image = image.resize({ width: 16, height: 16, quality: 'best' })
    }
    tray = new Tray(image)
    trayBaseImage = image
    lastTrayImage = image
    // Kick off badge pre-render off the critical path. setupTray must
    // stay sync (it's called from app.whenReady alongside window
    // creation), and the first updater state worth badging arrives
    // 10s+ later when the auto-update check runs — sharp + 4 PNG
    // composites comfortably finish in that window.
    void prepareTrayBadges(iconPath, badgeSize)
    // Seed tooltip / menu / (mac) title from whatever the updater
    // already knows. setupAutoUpdater runs before setupTray, but the
    // first network check is delayed 10s so this is normally `idle`.
    applyTrayState(getUpdateState())
    // Single-click on Windows / double-click on macOS surfaces the main
    // window — matches the convention every other tray-resident app
    // (Slack, Zoom, Discord) uses.
    tray.on('click', () => { void showMainWindow() })
    tray.on('double-click', () => { void showMainWindow() })
    // Keep the tray tooltip / menu / mac title in lockstep with the
    // updater so the operator can glance at the notification area
    // and tell whether an update is being checked, downloading, or
    // ready to install — without opening the menu.
    onUpdateState(scheduleTrayUpdate)
  } catch (err) {
    console.error('[tray] init failed (non-fatal):', err)
    tray = null
  }
}

function buildAppMenu() {
  const isMac = process.platform === 'darwin'
  const checkForUpdatesItem: MenuItemConstructorOptions = {
    label: 'Check for Updates…',
    accelerator: 'CmdOrCtrl+Shift+U',
    click: () => { void handleManualUpdateCheck() },
  }

  // "Website" Help-menu entry. Opens the public marketing site in
  // the operator's default browser via `shell.openExternal` so the
  // link works in both packaged builds and `electron .` dev runs,
  // and so the desktop app never tries to render the site inside its
  // own BrowserWindow (which would mix marketing chrome with the
  // operator console). Mirrors the in-app "Visit website" row in the
  // Help & Updates settings card.
  const websiteItem: MenuItemConstructorOptions = {
    label: 'Website',
    click: () => { void shell.openExternal(WEBSITE_URL) },
  }

  const template: MenuItemConstructorOptions[] = []

  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about' },
        checkForUpdatesItem,
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    })
  }

  template.push(
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    // Help submenu — surfaces the marketing site (Website) and the
    // in-app updater on every platform. Previously skipped on macOS
    // because Check for Updates… already lives under the app menu
    // and the Help entry would have been empty; now that we have a
    // Website link to advertise, render it on macOS too so trial
    // operators can find pricing / contact from the menu bar.
    {
      role: 'help' as const,
      submenu: isMac ? [websiteItem] : [websiteItem, checkForUpdatesItem],
    },
  )

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function broadcastNdiStatus(status: NdiStatus) {
  // v0.7.121 — Renderer-facing normalisation. While the sender is in
  // the operator-initiated linger window (Stop pressed but the NDI
  // sender is held alive on the wire for OBS/vMix continuity), the
  // wire-side `running` is still true, but the UI must show "stopped"
  // so the Stop button visibly toggles off and the Start button
  // becomes available again. Both the panel and the on-air gate (tray
  // / update toast) treat lingering as "not on-air" — receivers see a
  // black frame, the operator's UX correctly says we are off.
  const renderStatus: NdiStatus = status.lingering
    ? { ...status, running: false }
    : status
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('ndi:status', renderStatus)
  }
  applyNdiAirChange(renderStatus.running === true)
}

/**
 * Track NDI on-air transitions and gate update prompts accordingly.
 *
 * `broadcastNdiStatus` is called frequently (every frame batch fires
 * a status push), so this function is idempotent on the running flag —
 * we only act on actual transitions:
 *
 *   • on-air → off-air: the operator just stopped sending. Replay
 *     any deferred OS update-ready toast and re-render the tray with
 *     the normal CTA buttons restored. The renderer's banner / toast
 *     subscribe to `ndi:status` directly and resume on their own.
 *   • off-air → on-air: a service is starting. Re-render the tray
 *     so the disabled "install after broadcast" rows replace the
 *     dangerous Download / Restart actions. No need to dismiss
 *     anything that already shipped — the renderer will hide its
 *     banner / toast on the same status push.
 *
 * Call sites: `broadcastNdiStatus`, which is the single funnel for
 * every NDI lifecycle change in this process.
 */
function applyNdiAirChange(running: boolean) {
  if (running === ndiOnAir) return
  ndiOnAir = running
  // Re-render tray (tooltip, menu, mac title) so the broadcast-safe
  // gate either engages or releases.
  applyTrayState(getUpdateState())
  if (!running && pendingDownloadedNotification) {
    // NDI just went off-air with a queued update toast. Reset the
    // dedupe so the OS notification actually fires (notifyUpdate-
    // Downloaded would otherwise short-circuit on second call), then
    // hand the stashed state back through the same fire path.
    const replay = pendingDownloadedNotification
    pendingDownloadedNotification = null
    lastNotifiedDownloadedVersion = null
    notifyUpdateDownloaded(replay)
  }
}

/**
 * Read the OS-level auto-launch entry for this app and shape it into
 * the renderer's `LaunchAtLoginInfo` contract. Linux returns
 * `supported: false` (Electron's `setLoginItemSettings` is a no-op
 * there per the official docs). Dev builds also return `supported:
 * false` because registering an auto-launch entry from `electron.exe`
 * inside `node_modules` would fire on every login of the developer's
 * machine and point at a path that won't survive `pnpm install`.
 */
function readLaunchAtLogin(): { supported: boolean; openAtLogin: boolean; openAsHidden: boolean; reason?: string } {
  if (process.platform === 'linux') {
    return { supported: false, openAtLogin: false, openAsHidden: false, reason: 'Launch-at-login is not supported on Linux desktops by Electron.' }
  }
  if (!app.isPackaged) {
    return { supported: false, openAtLogin: false, openAsHidden: false, reason: 'Only available in installed builds. The dev build cannot register a stable auto-launch entry.' }
  }
  try {
    const s = app.getLoginItemSettings()
    return { supported: true, openAtLogin: s.openAtLogin, openAsHidden: s.openAsHidden }
  } catch (err) {
    return { supported: false, openAtLogin: false, openAsHidden: false, reason: err instanceof Error ? err.message : String(err) }
  }
}

function setupIpc() {
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    isDesktop: true,
    appUrl: appBaseUrl,
    ndiAvailable: ndi.isAvailable(),
    ndiUnavailableReason: ndi.unavailableReason(),
  }))

  // v0.7.153 — Expose the bundled Next.js server's bound port + the
  // PC's reachable LAN IPv4 addresses so the renderer can build URLs
  // for the "OBS Browser Source" card in the NDI Output panel.
  // appBaseUrl is the loopback URL (http://127.0.0.1:<port>) we use
  // internally; the LAN URLs swap the host for each non-internal IPv4
  // interface so an operator running OBS on a different PC on the
  // same Wi-Fi can paste one of them straight into Browser Source.
  // Returns an empty `lanIps` array on machines with no LAN
  // interfaces (rare, but possible on a fully offline laptop).
  ipcMain.handle('app:get-server-info', () => {
    let port = 0
    try {
      if (appBaseUrl) port = Number(new URL(appBaseUrl).port) || 0
    } catch { /* ignore */ }
    const lanIps: string[] = []
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const os = require('node:os') as typeof import('node:os')
      const ifaces = os.networkInterfaces()
      for (const name of Object.keys(ifaces)) {
        for (const info of ifaces[name] || []) {
          if (info.family === 'IPv4' && !info.internal) {
            lanIps.push(info.address)
          }
        }
      }
    } catch { /* ignore — return empty list */ }
    return {
      port,
      localUrl: appBaseUrl || '',
      lanIps,
    }
  })

  // ── Quit on close (Settings → Startup card) ───────────────────────
  // Lets the operator opt OUT of the new hide-to-tray behavior.
  // Default is false (keep tray-friendly behavior). Persisted to
  // `userData/preferences.json` and applied immediately — no restart
  // required, the next close consults the in-memory flag.
  ipcMain.handle('app:get-quit-on-close', () => ({ value: quitOnClose }))
  ipcMain.handle('app:set-quit-on-close', (_e, value: unknown) => {
    const next = value === true
    try {
      setQuitOnCloseAndPersist(next)
      return { ok: true, value: quitOnClose }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        value: quitOnClose,
      }
    }
  })

  // ── Desktop update-ready toast (Settings → Help & Updates card) ──
  // Operator opt-out for the OS notification fired by
  // `notifyUpdateDownloaded`. Tray badge / tooltip / in-app banner
  // are unaffected — they read from `onUpdateState` directly. Stored
  // alongside `quitOnClose` in `userData/preferences.json` so a
  // single file holds every operator preference. Default is true to
  // preserve the toast behavior shipped with the helper.
  ipcMain.handle('app:get-desktop-update-toast', () => ({
    value: desktopUpdateToastEnabled,
  }))
  ipcMain.handle('app:set-desktop-update-toast', (_e, value: unknown) => {
    const next = value === true
    try {
      setDesktopUpdateToastEnabledAndPersist(next)
      return { ok: true, value: desktopUpdateToastEnabled }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        value: desktopUpdateToastEnabled,
      }
    }
  })

  // ── Launch-at-login (Settings → Startup card) ─────────────────────
  ipcMain.handle('app:get-launch-at-login', () => readLaunchAtLogin())
  ipcMain.handle('app:set-launch-at-login', (_e, openAtLogin: unknown) => {
    const want = openAtLogin === true
    const current = readLaunchAtLogin()
    if (!current.supported) {
      return { ok: false, error: current.reason ?? 'Launch-at-login is not supported on this platform.', info: current }
    }
    try {
      // `openAsHidden: true` + `args: ['--hidden']` together tell the
      // boot path (see `bootHidden` in app.whenReady) to bring the app
      // up tray-only with NDI auto-started, rather than popping the
      // main window in the operator's face on every login. Setting
      // `openAtLogin: false` removes the entry entirely.
      app.setLoginItemSettings({
        openAtLogin: want,
        openAsHidden: want,
        args: want ? ['--hidden'] : [],
      })
      return { ok: true, info: readLaunchAtLogin() }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        info: readLaunchAtLogin(),
      }
    }
  })

  // v0.7.199 — Defensive IPC guards. `ndi.getStatus()` and the stop
  // handler below are called from the renderer at boot and on every
  // operator click of the NDI panel. If the bundled DLL failed to load
  // (corrupt install / missing VC++ runtime / blocked by AV), some
  // internal fields on the NdiService instance are nullable. A renderer
  // call into an unhealthy main-process handler that throws would be
  // surfaced as an `invoke` rejection in the operator's console with no
  // diagnostic. Returning a structured "unavailable" reply lets the UI
  // render the NDI panel in its disabled state with the actual reason
  // string instead of bubbling up an Error to React.
  ipcMain.handle('ndi:status', () => {
    try {
      return ndi.getStatus()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // Shape matches NdiStatus in electron/ndi-service.ts L29 +
      // electron/preload.ts L26 + src/lib/use-electron.ts L5 (all
      // three must stay in sync). Renderer reads NDI availability via
      // appInfo.ndiAvailable (preload.ts L42), so we only need to
      // surface `running:false` + the error string here.
      return {
        running: false,
        frameCount: 0,
        error: ndi.unavailableReason() || message,
      }
    }
  })

  ipcMain.handle('ndi:start', (_e, opts: NdiStartOptions) =>
    serializeNdi(async () => {
      if (!ndi.isAvailable()) {
        return { ok: false, error: ndi.unavailableReason() || 'NDI runtime not available' }
      }
      try {
        // Persistent-stream guard. The renderer fires `ndi:start` on
        // every operator click of the big green button, including the
        // common case where the sender is ALREADY running with the
        // same settings (the auto-start at boot put it on the air).
        // Tearing down the offscreen capture window here kills any
        // playing <video>, makes vMix / OBS lose the source for a
        // beat, and re-acquire — the very flicker we are trying to
        // fix. Short-circuit when nothing has changed.
        // v0.6.6 — extend equality to include layout/transparent/lowerThird.
        // Pre-v0.6.6 the short-circuit only checked source+geometry+fps,
        // so flipping the Transparent toggle WHILE NDI was running would
        // call ndi:start with the same {name,width,height,fps}, hit this
        // branch, and bail out without rebuilding the BrowserWindow with
        // the new transparent flag. Operator's complaint that the toggle
        // "did nothing while broadcasting" was this short-circuit.
        const cur = ndi.getStatus()
        const wantLayout = opts.layout === 'ndi' ? 'ndi' : 'mirror'
        // v0.7.223 — Operator escalation: "NDI output for video background
        // is transparent — shouldn't be so at all." Pre-fix default was
        // `opts.transparent !== false` which meant ANY NDI session
        // defaulted to TRANSPARENT (alpha matte). Receivers that respect
        // alpha (vMix, Wirecast, OBS with alpha-aware composition) then
        // showed the video background as see-through whenever the
        // renderer's compositing produced any non-opaque pixels (which
        // happens on a video element while it is fetching, between
        // frames, or in the letterbox area of a contain-fit video).
        // EW-class behaviour: NDI fullscreen output is OPAQUE by default;
        // transparency is an explicit opt-in feature exclusively for
        // lower-third / overlay workflows where the receiver is doing
        // chromakey-style composition over its own program. We require
        // `opts.transparent === true` (explicit) to enable. The lower-
        // third path below still works because operators that turn on
        // lower-third also explicitly check the transparent toggle.
        const wantTransparent = wantLayout === 'ndi' && opts.transparent === true
        const wantLT = wantLayout === 'ndi' && Boolean(opts.lowerThird?.enabled)
        const wantLTPos: 'top' | 'bottom' =
          opts.lowerThird?.position === 'top' ? 'top' : 'bottom'
        // v0.7.5.1 — extend equality to lower-third height/scale.
        // Without this, an operator dragging the height bucket or
        // scale slider WHILE NDI is broadcasting would re-call
        // ndi:start with the same {name,w,h,fps,transparent,LT,pos}
        // and hit the short-circuit below — leaving the FrameCapture
        // BrowserWindow loading the OLD ?lh=&sc= URL forever.
        const wantLTHeight: 'sm' | 'md' | 'lg' | null = wantLT
          ? (() => {
              const h = (opts.lowerThird as { height?: 'sm' | 'md' | 'lg' } | undefined)?.height
              return h === 'sm' || h === 'md' || h === 'lg' ? h : null
            })()
          : null
        const wantLTScale: number | null = wantLT
          ? (() => {
              const s = (opts.lowerThird as { scale?: number } | undefined)?.scale
              return typeof s === 'number' && s >= 0.5 && s <= 2 ? s : null
            })()
          : null
        if (
          cur.running &&
          frameCapture &&
          frameCaptureFlags &&
          cur.source === (opts.name || 'ScriptureLive AI') &&
          cur.width === opts.width &&
          cur.height === opts.height &&
          cur.fps === opts.fps &&
          frameCaptureFlags.layout === wantLayout &&
          frameCaptureFlags.transparent === wantTransparent &&
          frameCaptureFlags.lowerThird === wantLT &&
          (!wantLT || frameCaptureFlags.lowerThirdPosition === wantLTPos) &&
          (!wantLT || frameCaptureFlags.lowerThirdHeight === wantLTHeight) &&
          (!wantLT || frameCaptureFlags.lowerThirdScale === wantLTScale) &&
          // v0.7.230 — see frameCaptureFlags.forceBgraForObs comment
          // above. Toggle while running MUST trigger rebuild.
          frameCaptureFlags.forceBgraForObs === (opts.forceBgraForObs === true)
        ) {
          broadcastNdiStatus(cur)
          return { ok: true, status: cur }
        }
        // v0.7.194-hotfix.11 Item #3 — Arm NDI frame bridge BEFORE the
        // BrowserWindow destroy+create await chain so Wirecast/OBS/vMix
        // see continuous frames through the rebuild gap. armBridge is
        // a no-op when no sender exists yet (first start of a session).
        ndi.armBridge(3000)
        if (frameCapture) { await frameCapture.stop(); frameCapture = null }
        // v0.7.223 — Pass the resolved transparent flag through to the
        // NDI sender so it can pick BGRX (opaque, EW-class smooth) vs
        // BGRA (alpha matte preserved) at the FourCC level. Without
        // this the sender would always advertise BGRX and the
        // explicit transparent lower-third workflow would lose its
        // alpha channel on the wire.
        // v0.7.230 — forceBgraForObs is plumbed straight through from
        // NdiStartOptions; the panel reads it from settings and passes
        // it on every ndi:start call. main.ts has no business deciding
        // FourCC, so it's a pure forward — ndi-service owns the gate.
        await ndi.start({ ...opts, transparent: wantTransparent })
        frameCapture = new FrameCapture({
          baseUrl: appBaseUrl,
          onFrame: (buf, w, h) => ndi.sendFrame(buf, w, h),
          onStatus: (msg) => broadcastNdiStatus({ ...ndi.getStatus(), captureMessage: msg }),
        })
        const layout = opts.layout === 'ndi' ? 'ndi' : 'mirror'
        // Single text engine: every NDI capture mode now points at
        // the same congregation renderer that the secondary screen
        // and the in-app preview share, so Preview = Output Display
        // = NDI render the SAME slide.content with the SAME font /
        // wrap / fit logic. The legacy `/api/output/ndi` route had
        // its own renderer that hard-truncated long verses to three
        // lines and ignored the operator's typography settings.
        //
        // The `?ndi=1` flag tells the renderer this surface is the
        // NDI feed (independent ndiDisplayMode + force-mute audio).
        // The `?lowerThird=1` / `?transparent=1` / `?position=` flags
        // are the legacy NDI overlay knobs the renderer also honours
        // so vMix / OBS users can still pin a transparent lower-third
        // bar on top of their existing program output.
        const params = new URLSearchParams()
        params.set('ndi', '1')
        let transparent = false
        if (layout === 'ndi') {
          // v0.7.223 — Mirror the explicit-opt-in change at L2307. The
          // URL-side `?transparent=1` flag (which tells the congregation
          // renderer to strip its own background colour) MUST follow the
          // same explicit-opt-in rule as the BrowserWindow's `transparent`
          // attribute. Pre-fix `opts.transparent !== false` defaulted ON,
          // so even when the BrowserWindow was opaque the renderer page
          // was sending a transparent background — Chromium's compositor
          // would composite the renderer's transparent pixels onto the
          // BrowserWindow's opaque black, producing visibly darker /
          // partially-transparent video backgrounds at the receiver.
          // The two flags MUST stay in lockstep: either both ON (full
          // alpha matte for lower-third workflows) or both OFF (opaque
          // fullscreen for normal broadcast).
          transparent = opts.transparent === true
          const lt = opts.lowerThird || {}
          if (transparent) params.set('transparent', '1')
          if (lt.enabled) params.set('lowerThird', '1')
          if (lt.position === 'top') params.set('position', 'top')
          // v0.7.5.1 — Bake the operator's lower-third HEIGHT bucket and
          // SCALE multiplier into the URL itself. This is the fix for the
          // "in-app NDI Live Preview shows small card but vMix/OBS receive
          // an oversized bar" bug: the captured BrowserWindow used to wait
          // for the SSE state push before applying the operator's slider
          // values, so vMix grabbed the FIRST few frames at the renderer's
          // default state (md / 1.0×) — leaving the broadcast feed visibly
          // out of sync with what the iframe preview promised. Now both
          // surfaces carry the same params from the URL on the very first
          // paint and SSE only handles subsequent operator drags.
          const lh = (lt as { height?: 'sm' | 'md' | 'lg' }).height
          if (lh === 'sm' || lh === 'md' || lh === 'lg') params.set('lh', lh)
          const sc = (lt as { scale?: number }).scale
          if (typeof sc === 'number' && sc >= 0.5 && sc <= 2) {
            params.set('sc', String(sc))
          }
        }
        const capturePath = `/api/output/congregation?${params.toString()}`
        await frameCapture.start({
          width: opts.width,
          height: opts.height,
          fps: opts.fps,
          path: capturePath,
          transparent,
        })
        // v0.6.6 — Record what flags this FrameCapture was started
        // with so the next ndi:start can detect operator-toggled
        // changes (transparent ON/OFF, lower-third position swap)
        // and trigger a true rebuild instead of short-circuiting.
        frameCaptureFlags = {
          layout,
          transparent,
          lowerThird: layout === 'ndi' && Boolean(opts.lowerThird?.enabled),
          lowerThirdPosition: opts.lowerThird?.position === 'top' ? 'top' : 'bottom',
          // v0.7.5.1 — persist what we baked into the URL so the next
          // ndi:start can detect operator-dragged changes.
          lowerThirdHeight: wantLTHeight,
          lowerThirdScale: wantLTScale,
          // v0.7.230 — persist the BGRA-compat pick alongside the
          // other build-time flags. See frameCaptureFlags type def.
          forceBgraForObs: opts.forceBgraForObs === true,
        }
        broadcastNdiStatus(ndi.getStatus())
        return { ok: true, status: ndi.getStatus() }
      } catch (err) {
        try { if (frameCapture) await frameCapture.stop() } catch { /* ignore */ }
        frameCapture = null
        frameCaptureFlags = null
        try { await ndi.stop() } catch { /* ignore */ }
        const message = err instanceof Error ? err.message : String(err)
        broadcastNdiStatus({ ...ndi.getStatus(), error: message })
        return { ok: false, error: message }
      }
    })
  )

  ipcMain.handle('ndi:stop', () =>
    serializeNdi(async () => {
      // v0.7.199 — Match the ndi:start guard. If the runtime never
      // loaded there is nothing to stop, but we still want a clean
      // structured reply so the renderer doesn't see an invoke
      // rejection (which would surface as a generic "Disconnect
      // failed" toast). Returning ok:true here is correct: from the
      // operator's perspective "the NDI sender is not running" is the
      // desired post-state and that is exactly what `available=false`
      // already guarantees.
      if (!ndi.isAvailable()) {
        return { ok: true, alreadyStopped: true }
      }
      try {
        // v0.7.103 — LINGER MODE on operator-initiated Disconnect.
        //
        // Pre-v0.7.103 behaviour: this handler called ndi.gracefulStop()
        // which fades to black, then immediately runs send_destroy +
        // NDIlib_destroy. The destroy retracts our mDNS advertisement,
        // tears down the worker threads, and severs every TCP
        // connection downstream NDI receivers had open to us. OBS and
        // vMix react by dropping our source from their lists. If the
        // operator then hits Reconnect, OBS/vMix have already torn
        // down their side — they need a manual re-add, or to be
        // restarted, before they re-acquire our new sender. Operator
        // escalation: "OBS/vMix close before NDI can reconnect".
        //
        // v0.7.103 fix: ndi.lingerStop(200, 60) emits the same brief
        // fade-to-black for downstream visual continuity, then HOLDS
        // the NDI sender alive on the wire for 60 seconds, with the
        // keep-alive ticker pumping a black frame at the configured
        // fps. To OBS/vMix the source remains "live, currently black"
        // — they keep the connection open and the source listed.
        //
        // If the operator hits Reconnect within the 60s window, the
        // ndi:start handler below detects we still have a live sender
        // (persistent-source rule in ndi.start) and reuses it — the
        // linger timer is cancelled at the top of ndi.start, and
        // fresh real frames replace the held black with zero source-
        // acquire flicker on the receiver side.
        //
        // If the operator does not come back within 60s, the linger
        // timer fires and runs full ndi.stop() (send_destroy +
        // NDIlib_destroy + runtime recycle) — same end-state as the
        // pre-v0.7.103 behaviour, just delayed by the grace window.
        //
        // The frame-capture BrowserWindow is still torn down here
        // because (a) we don't want to keep capturing the renderer
        // for a now-off-air feed, and (b) we don't want a stray
        // capture-window frame to "un-black" the held linger frame
        // mid-window. Reconnect inside the linger window will
        // re-create a fresh frame-capture from scratch (see
        // ndi:start above) which is fine — the heavy expense was
        // the NDI sender setup + mDNS round-trip, which we skip.
        //
        // Plain ndi.stop() is reserved for emergency shutdown paths
        // (before-quit, crash) where the 60s linger would block exit
        // and where downstream UX continuity is irrelevant anyway.
        if (frameCapture) { await frameCapture.stop(); frameCapture = null }
        frameCaptureFlags = null
        await ndi.lingerStop(200, 60)
        broadcastNdiStatus(ndi.getStatus())
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    })
  )

  // v0.6.6 — Open Windows "Apps & features" so operators can uninstall
  // the previous ScriptureLive build before installing the new one.
  // Surfaced from the update dialog's "Uninstall first" red banner.
  // shell.openExternal accepts the ms-settings: scheme on Windows 10/11;
  // on Linux/macOS we no-op gracefully so the React handler doesn't
  // throw when the operator clicks the button on a non-Windows host.
  ipcMain.handle('app:open-uninstall', async () => {
    try {
      if (process.platform !== 'win32') {
        return { ok: false, error: 'Uninstall page is Windows-only' }
      }
      await shell.openExternal('ms-settings:appsfeatures')
      return { ok: true }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  })

  // List physical displays so the renderer can show a "send to which screen?" picker
  ipcMain.handle('output:list-displays', () => {
    try {
      const primary = screen.getPrimaryDisplay()
      return screen.getAllDisplays().map((d, i) => ({
        id: d.id,
        label: d.label && d.label.length > 0 ? d.label : `Display ${i + 1}`,
        primary: d.id === primary.id,
        width: d.size.width,
        height: d.size.height,
      }))
    } catch {
      return []
    }
  })

  // ── Hardened kiosk-style output window factory ─────────────────
  // Goal: the output window must look and behave EXACTLY like a vMix /
  // Wirecast / EasyWorship secondary output — not a browser. That means:
  //   - true fullscreen kiosk on whatever display we land on (primary OR
  //     secondary), no taskbar, no title bar, no menu, no chrome
  //   - no right-click context menu (no "Inspect Element" giveaway)
  //   - no dev-tools shortcuts (F12, Ctrl+Shift+I/J/C, Ctrl+U)
  //   - no scrollbars, no text selection, no user zoom
  //   - cursor auto-hides after idle so projectors don't show a pointer
  //   - black backdrop so any letterboxed slide blends into the wall
  //   - Esc cleanly closes the window for the operator
  function createKioskOutput(opts: { displayId?: number; path: string; title: string }) {
    let target = screen.getPrimaryDisplay()
    if (opts.displayId !== undefined) {
      const found = screen.getAllDisplays().find((d) => d.id === opts.displayId)
      if (found) target = found
    } else if (screen.getAllDisplays().length > 1) {
      // No explicit pick → prefer the first non-primary display so the
      // operator's main console monitor stays free for the operator UI.
      const others = screen.getAllDisplays().filter((d) => d.id !== screen.getPrimaryDisplay().id)
      if (others[0]) target = others[0]
    }
    const { x, y, width, height } = target.bounds

    const win = new BrowserWindow({
      x, y, width, height,
      backgroundColor: '#000',
      title: opts.title,
      frame: false,
      autoHideMenuBar: true,
      // ALWAYS fullscreen + kiosk, even on the primary display. This is
      // what stops it from "looking like a browser window" — no chrome
      // of any kind, no taskbar peek, no resize handles.
      fullscreen: true,
      kiosk: true,
      simpleFullscreen: true,
      // (Cursor hiding is handled below via CSS injection — Electron's
      // BrowserWindow doesn't expose a cross-platform autoHideCursor.)
      // Stay above the operator console so a click on the console doesn't
      // bring the projector behind it.
      alwaysOnTop: target.id !== screen.getPrimaryDisplay().id,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        // Disable devtools entirely on production output windows.
        devTools: false,
        // v0.7.194-hotfix.10 — Secondary-screen kiosk MUST decode video
        // at full framerate even when the operator's main console takes
        // focus. Without this, alt-tabbing from the kiosk to the operator
        // UI mid-service causes the projected output to drop frames /
        // stutter — exactly the lag operators report when "the second
        // screen freezes for a second every time I click in the app."
        backgroundThrottling: false,
      },
    })
    win.removeMenu()
    win.setMenuBarVisibility(false)

    // Block dev-tools / view-source / reload key combos. The operator
    // should never accidentally open the inspector mid-service.
    win.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return
      const key = input.key
      // Esc → close the output cleanly.
      if (key === 'Escape') {
        event.preventDefault()
        try { win.close() } catch { /* ignore */ }
        return
      }
      // Block F12, Ctrl+Shift+I/J/C, Ctrl+U, Ctrl+R, F5, Ctrl+P
      const ctrl = input.control || input.meta
      const shift = input.shift
      if (
        key === 'F12' ||
        key === 'F5' ||
        (ctrl && shift && (key === 'I' || key === 'i' || key === 'J' || key === 'j' || key === 'C' || key === 'c')) ||
        (ctrl && (key === 'U' || key === 'u' || key === 'R' || key === 'r' || key === 'P' || key === 'p'))
      ) {
        event.preventDefault()
      }
    })

    // Block the right-click "Inspect Element" menu entirely.
    win.webContents.on('context-menu', (e) => e.preventDefault())

    // Inject CSS that strips scrollbars, text selection, and the
    // browser cursor. This is what kills the last bit of "browser feel" —
    // even if the page has its own scrollbar or selection styles, this
    // wins because it's an !important on the documentElement.
    win.webContents.on('did-finish-load', () => {
      win.webContents.insertCSS(`
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
          background: #000 !important;
          cursor: none !important;
          user-select: none !important;
          -webkit-user-select: none !important;
        }
        ::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
        * { cursor: none !important; }
      `).catch(() => { /* ignore — page may have unloaded */ })
    })

    // Lock pinch-zoom and Ctrl+wheel zoom.
    win.webContents.setVisualZoomLevelLimits(1, 1).catch(() => { /* ignore */ })
    win.webContents.on('zoom-changed', () => {
      win.webContents.setZoomFactor(1)
    })

    // v0.7.89 — protect popout/satellite windows (congregation, stage,
    // NDI preview, etc) with the same crash-mask + auto-reload as the
    // main window. Without this, the chrome-error://chromewebdata
    // "This page couldn't load" page paints in the popout the moment
    // the bundled Next server hiccups, and the operator has no way to
    // recover except closing and reopening the popout.
    installCrashMask(win, `popout:${opts.title || opts.path}`, { showDialogOnGiveUp: false })

    win.loadURL(`${appBaseUrl}${opts.path}`)
    // v0.7.121 — Track open kiosk output windows so screen.on('display-
    // removed') below can re-home them to the primary display when the
    // operator unplugs the secondary monitor mid-service. Without this
    // the kiosk window stays pinned to the now-gone display's bounds
    // and disappears entirely (operator escalation: "anytime i
    // disconnect output display from the other screen from the app,
    // the app output… becomes Blank").
    kioskWindows.add(win)
    // v0.7.247 — tag the kiosk window with its semantic role at
    // creation time. URL-based detection (`webContents.getURL()`
    // matching '/api/output/congregation') races against loadURL —
    // immediately after `kioskWindows.add(win)` the URL is still
    // blank/about:blank and substring counts as zero, so the very
    // first open broadcast would emit `false` and the in-app Live
    // would stay unmuted until another lifecycle event arrived.
    // Tagging avoids the race entirely; URL filtering remains as a
    // belt-and-braces fallback for any future caller that forgets
    // to set the tag.
    ;(win as BrowserWindow & { __outputRole?: string }).__outputRole =
      opts.path.includes('/api/output/congregation') ? 'congregation'
      : opts.path.includes('/api/output/stage') ? 'stage'
      : 'unknown'
    win.on('closed', () => {
      kioskWindows.delete(win)
      // re-broadcast congregation-open whenever a kiosk window
      // closes. The renderer mirrors this into a store flag that
      // mutes the in-app Live <video> so the operator doesn't hear
      // duplicate room audio (console speakers + projector).
      broadcastCongregationOpen()
    })
    // Same broadcast on open — the renderer's audio gating flips
    // true the moment the kiosk window mounts.
    broadcastCongregationOpen()
    return win
  }

  // v0.7.247 — count of OPEN congregation kiosk windows (excludes the
  // stage-display popout — that's an operator monitor, not a broadcast
  // surface, and doesn't carry audio). Sent to every operator
  // BrowserWindow's renderer via webContents.send so the store flag
  // `outputWindowOpen` stays in sync across re-renders. Counts by the
  // `__outputRole === 'congregation'` tag set in createKioskOutput so
  // the result is correct from the very first call even before
  // `loadURL` resolves; falls back to URL substring match for
  // robustness against future un-tagged callers.
  function getCongregationOpen(): boolean {
    for (const w of kioskWindows) {
      if (!w || w.isDestroyed()) continue
      const role = (w as BrowserWindow & { __outputRole?: string }).__outputRole
      if (role === 'congregation') return true
      if (!role) {
        try {
          const url = w.webContents.getURL() || ''
          if (url.includes('/api/output/congregation')) return true
        } catch { /* per-window failure non-fatal */ }
      }
    }
    return false
  }
  function broadcastCongregationOpen() {
    const isOpen = getCongregationOpen()
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w || w.isDestroyed()) continue
      // Skip the kiosk windows themselves — they don't need this flag.
      if (kioskWindows.has(w)) continue
      try { w.webContents.send('output:congregation-open', isOpen) }
      catch { /* renderer may have unloaded */ }
    }
  }
  // v0.7.247 — renderer handshake. The shell calls this on mount to
  // restore the flag after a hot-reload / remount while a congregation
  // kiosk is still open. Without it, the cleanup-on-unmount that sets
  // `outputWindowOpen=false` would strand the flag false until the
  // NEXT kiosk lifecycle event — meaning the in-app Live <video>
  // would unmute and double-feed audio the moment the operator
  // rebuilt the React tree.
  ipcMain.handle('output:get-congregation-open', () => getCongregationOpen())

  // v0.7.121 — Auto-recover kiosk output windows when their host display
  // is unplugged. Without this, the BrowserWindow stays at coordinates
  // belonging to a display that no longer exists and the operator sees
  // a blank room projector / stage display until they restart the app.
  // We simply move every tracked kiosk to the primary display's full
  // bounds and re-assert kiosk + fullscreen. The renderer inside is
  // untouched so SSE state, slide content, etc. all survive.
  screen.on('display-removed', () => {
    try {
      const primary = screen.getPrimaryDisplay()
      const { x, y, width, height } = primary.bounds
      for (const w of Array.from(kioskWindows)) {
        if (!w || w.isDestroyed()) { kioskWindows.delete(w); continue }
        try {
          w.setKiosk(false)
          w.setFullScreen(false)
          w.setBounds({ x, y, width, height })
          w.setKiosk(true)
          w.setFullScreen(true)
          w.show()
        } catch { /* per-window failure is non-fatal */ }
      }
    } catch { /* screen API unavailable on this platform */ }
  })

  ipcMain.handle('output:open-window', (_e, opts?: { displayId?: number }) => {
    if (!appBaseUrl) return { ok: false, error: 'app not ready' }
    createKioskOutput({
      displayId: opts?.displayId,
      path: '/api/output/congregation',
      title: 'ScriptureLive — Congregation Display',
    })
    return { ok: true }
  })

  // Stage-display window: shows current slide, next slide, sermon notes,
  // countdown timer and clock for the speaker on a separate screen.
  ipcMain.handle('output:open-stage', (_e, opts?: { displayId?: number }) => {
    if (!appBaseUrl) return { ok: false, error: 'app not ready' }
    createKioskOutput({
      displayId: opts?.displayId,
      path: '/api/output/stage',
      title: 'ScriptureLive — Stage Display',
    })
    return { ok: true }
  })

  ndi.on('frame', (count) => {
    broadcastNdiStatus({ ...ndi.getStatus(), frameCount: count })
  })
  ndi.on('error', (msg: string) => {
    broadcastNdiStatus({ ...ndi.getStatus(), error: msg })
    // v0.7.14 — Forward NDI native binding errors to the central
    // /api/telemetry/error endpoint so the operator's admin Records
    // dashboard sees them. Anonymous installId only, message + a
    // small "ndi" type tag — no frame data or PII.
    void pingErrorMain({
      errorType: 'ndi_native',
      message: typeof msg === 'string' ? msg : String(msg),
    })
  })
}

// ── Single-instance enforcement ─────────────────────────────────────
// Critical for the launch-at-login flow: when the app auto-starts
// hidden at boot, the operator's natural reaction to "I want to make
// a slide" is to double-click the desktop / Start-menu shortcut.
// Without this lock, that spawns a SECOND process — which loses the
// PORT race against the existing Next server, fails to bind NDI
// (sender name collision), and leaves two tray icons. We want the
// second launch to surface the existing hidden window instead.
//
// Must run BEFORE app.whenReady (well, the lock acquisition can
// safely happen at any time before window creation, but we want the
// duplicate-process branch to exit cleanly without ever firing
// `whenReady`'s heavy startup path — startNextServer, NDI probe,
// updater init are all expensive and pointless in a doomed second
// instance).
// v0.7.194-hotfix.10 — Register the `scripturelive-media://` privileged
// scheme BEFORE app.whenReady so the renderer-side <video> / <img>
// elements can use it from the very first paint. The actual handler is
// installed inside whenReady (below). See guard-rails A/C in CHANGELOG.
// PRIVILEGES rationale:
//   - secure: treated as https-equivalent so it survives mixed-content,
//     CSP "media-src 'self'", and credentialed contexts inside the
//     congregation/NDI BrowserWindows.
//   - supportFetchAPI + stream: enables byte-range fetch() and the
//     streaming Response body the handler returns.
//   - bypassCSP: NDI offscreen + secondary-screen BrowserWindows load
//     /api/output/congregation which sets its own CSP via Next; the
//     custom protocol must not be blocked by the page's media-src.
//   - corsEnabled: lets the HTMLMediaElement do credentialed range
//     requests against the protocol without an Origin mismatch.
//   - standard: makes URLs parse with hostname/pathname semantics so
//     `new URL('scripturelive-media://uploads/<uuid>.mp4').pathname`
//     gives us `/<uuid>.mp4` for the disk-path join below.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'scripturelive-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
      corsEnabled: true,
    },
  },
])

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  // The other (primary) instance will receive a `second-instance`
  // event and surface its window. This process should exit *now* —
  // do NOT proceed into whenReady.
  console.log('[boot] another instance is already running — exiting')
  app.quit()
} else {
  app.on('second-instance', (_event, _argv, _workingDirectory) => {
    // The user (or shell) tried to launch the app again. Surface the
    // existing main window instead of spawning a duplicate. This path
    // also fires when the operator double-clicks the shortcut after
    // an auto-launched (hidden) startup, which is the whole reason
    // the lock exists for this feature.
    showMainWindow().catch((err) => {
      console.error('[single-instance] failed to surface main window:', err)
    })
  })
}

app.whenReady().then(async () => {
  // If we lost the single-instance lock above, app.quit() is in
  // flight — bail out of whenReady before doing any expensive work
  // (Next server boot, NDI probe, updater init) that the doomed
  // second process would just throw away.
  if (!gotSingleInstanceLock) return

  setupFileLogging()

  // v0.7.194-hotfix.10 — Install the `scripturelive-media://` handler.
  // Reads operator-uploaded media DIRECTLY from `userData/uploads/` via
  // Node's streaming fs.createReadStream with proper byte-range support,
  // bypassing the Next.js single-threaded /api/upload route. This kills
  // the lag class where 3-5 concurrent <video> decoders (Preview, Live,
  // NDI in-app preview, NDI offscreen capture window, secondary-screen
  // kiosk) were each pulling the SAME local mp4 over HTTP through one
  // Node event loop — every range request stalled every other range
  // request. With this protocol, each surface reads straight off disk
  // and the OS file cache de-dupes the bytes for free, just like every
  // native player on Windows. The legacy /api/upload HTTP route stays
  // alive for backward compat with operator-pasted OBS Browser-Source
  // URLs from before this hotfix.
  // SECURITY: refuse any path that escapes uploads/ (path traversal).
  // The renderer is sandboxed and we control every call site, but a
  // future maintainer who lets operator-typed text into mediaUrl would
  // otherwise expose the entire userData directory.
  try {
    const uploadsDir = path.join(app.getPath('userData'), 'uploads')
    protocol.handle('scripturelive-media', async (req) => {
      try {
        const u = new URL(req.url)
        // URL shape: scripturelive-media://uploads/<filename>
        // hostname = 'uploads', pathname = '/<filename>'
        const filename = decodeURIComponent(u.pathname.replace(/^\/+/, ''))
        // Reject anything that could escape uploadsDir.
        if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\') || filename.startsWith('.')) {
          return new Response('forbidden', { status: 403 })
        }
        const full = path.join(uploadsDir, filename)
        let stat: fs.Stats
        try {
          stat = await fs.promises.stat(full)
        } catch {
          return new Response('not found', { status: 404 })
        }
        if (!stat.isFile()) return new Response('not a file', { status: 404 })

        const ext = path.extname(filename).toLowerCase()
        const mime =
          ext === '.mp4' || ext === '.m4v' ? 'video/mp4' :
          ext === '.webm' ? 'video/webm' :
          ext === '.mov' ? 'video/quicktime' :
          ext === '.mkv' ? 'video/x-matroska' :
          ext === '.avi' ? 'video/x-msvideo' :
          ext === '.ogv' ? 'video/ogg' :
          ext === '.png' ? 'image/png' :
          ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
          ext === '.gif' ? 'image/gif' :
          ext === '.webp' ? 'image/webp' :
          ext === '.svg' ? 'image/svg+xml' :
          'application/octet-stream'

        const total = stat.size
        const range = req.headers.get('range') || ''
        const m = /bytes=(\d*)-(\d*)/.exec(range)
        const baseHeaders: Record<string, string> = {
          'Content-Type': mime,
          'Accept-Ranges': 'bytes',
          // Operator uploads are content-addressed by uuid filename, so
          // bytes never change for a given URL — immutable + 1-year max-age
          // lets the Chromium net-cache aggressively reuse decoded frames.
          'Cache-Control': 'public, max-age=31536000, immutable',
          // v0.7.194-hotfix.12 — CORS headers are LOAD-BEARING. The
          // renderer-side <video> / <img> elements set crossorigin="anonymous"
          // (required so the NDI frame-capture canvas stays un-tainted by
          // cross-origin pixels — without it, drawImage() throws SecurityError
          // and the NDI sender stops emitting frames). The custom scheme
          // origin (scripturelive-media://) is cross-origin to the page
          // origin (http://localhost:<port>), so Chromium issues a strict
          // CORS request. corsEnabled in registerSchemesAsPrivileged ONLY
          // marks the scheme as CORS-eligible — the handler MUST still send
          // ACAO itself. Pre-hotfix.12 this header was missing, every video
          // silently 4xx'd, v.onerror fired display:none on every surface
          // (Typography preview, NDI preview, Live preview, main Preview/Live
          // columns), and the operator saw the empty Scripture AI placeholder
          // everywhere a video should have been. See GR-A below.
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        }
        if (m) {
          const start = m[1] ? parseInt(m[1], 10) : 0
          let end = m[2] ? parseInt(m[2], 10) : total - 1
          if (end >= total) end = total - 1
          if (start > end || start < 0) {
            return new Response('range not satisfiable', {
              status: 416,
              headers: { 'Content-Range': `bytes */${total}` },
            })
          }
          const stream = fs.createReadStream(full, { start, end })
          const webStream = new ReadableStream({
            start(controller) {
              stream.on('data', (chunk) => controller.enqueue(
                typeof chunk === 'string' ? new TextEncoder().encode(chunk) : new Uint8Array(chunk)
              ))
              stream.on('end', () => controller.close())
              stream.on('error', (err) => controller.error(err))
            },
            cancel() { try { stream.destroy() } catch { /* ignore */ } },
          })
          return new Response(webStream, {
            status: 206,
            headers: {
              ...baseHeaders,
              'Content-Range': `bytes ${start}-${end}/${total}`,
              'Content-Length': String(end - start + 1),
            },
          })
        }
        const stream = fs.createReadStream(full)
        const webStream = new ReadableStream({
          start(controller) {
            stream.on('data', (chunk) => controller.enqueue(
              typeof chunk === 'string' ? new TextEncoder().encode(chunk) : new Uint8Array(chunk)
            ))
            stream.on('end', () => controller.close())
            stream.on('error', (err) => controller.error(err))
          },
          cancel() { try { stream.destroy() } catch { /* ignore */ } },
        })
        // v0.7.196 — Diagnostic log every successful 200 full-file serve so
        // a future debug session can see exactly which files the renderer
        // requested, in what order, and at what time. Range (206) responses
        // are NOT logged to avoid flooding the log on long-running videos
        // that fire 50+ range requests per playback. The 200 path only
        // fires on first probe or small files (images), so 1 log line per
        // media-asset load is the expected volume.
        console.log('[scripturelive-media] 200 serve', filename, 'size=', total)
        return new Response(webStream, {
          status: 200,
          headers: { ...baseHeaders, 'Content-Length': String(total) },
        })
      } catch (err) {
        console.error('[scripturelive-media] handler error:', err)
        return new Response('internal error', { status: 500 })
      }
    })
    console.log('[boot] scripturelive-media:// protocol handler registered, uploadsDir=', uploadsDir)
  } catch (err) {
    console.error('[boot] failed to register scripturelive-media:// handler:', err)
  }
  // Reference `net` so the import isn't tree-shaken — currently unused
  // but kept available for a future fetch-from-disk fallback path.
  void net

  // v0.7.79 — Boot splash. Show ASAP (before any heavy work) so the
  // operator gets instant visual feedback that the click on the icon
  // registered. Suppressed when launched in --hidden mode (auto-
  // launch at login) since no operator is at the keyboard.
  const launchedHidden = process.argv.includes('--hidden')
    || (process.platform === 'win32'
        && (() => { try { return app.getLoginItemSettings().wasOpenedAsHidden === true } catch { return false } })())
  if (!launchedHidden) {
    showSplash()
    setSplashStatus('Initializing…')
  }

  // Hydrate the on-disk preferences (currently just `quitOnClose`)
  // before any window can be created or closed. This way the very
  // first close after launch already honors what the operator chose
  // last session — no IPC round-trip required.
  hydrateQuitOnCloseFromDisk()
  // Same store, different toggle: read the desktop-toast opt-out
  // before the updater fires its first state push so the very first
  // "downloaded" event already honors the operator's choice.
  hydrateDesktopUpdateToastFromDisk()

  // ── Permissions ────────────────────────────────────────────────
  // Auto-grant the renderer the permissions it needs to behave like
  // a real desktop production tool — microphone (live transcription),
  // media playback (preview/live videos), display capture (NDI frame
  // grabber). Without this the Electron Chromium silently denies
  // mic access even after the user clicks Allow at the OS level,
  // which is why transcription stays dead in the packaged app.
  try {
    const allowed = new Set([
      'media',
      'mediaKeySystem',
      'audioCapture',
      'videoCapture',
      'display-capture',
      'fullscreen',
      'clipboard-read',
      'clipboard-sanitized-write',
    ])
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
      cb(allowed.has(permission))
    })
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission))
    // Skip the device-chooser modal (default mic / default camera).
    session.defaultSession.setDevicePermissionHandler(() => true)
  } catch (err) {
    console.error('[permissions] failed to wire permission handlers (non-fatal):', err)
  }

  try {
    buildAppMenu()
  } catch (err) {
    console.error('[menu] init failed (non-fatal):', err)
  }
  try {
    setupIpc()
  } catch (err) {
    closeSplash()
    fatalError('setupIpc', err); app.quit(); return
  }
  // v0.7.72 — Clear Chromium HTTP cache before the embedded Next
  // server boots. The pinned port (47330) means every install of
  // SLAI hits the SAME origin (http://127.0.0.1:47330), so after
  // an auto-update Chromium would happily serve cached HTML from
  // the PREVIOUS build — referencing _next/static/chunks/<hash>.js
  // filenames that no longer exist in the new build's static dir.
  // Result: "This page couldn't load" because every chunk 404s.
  // Clearing the cache once at startup costs ~50ms and guarantees
  // the renderer always pulls a fresh HTML+chunk pair from the
  // freshly-baked server. Safe to run on every launch — Chromium
  // re-populates the cache as the page loads.
  try {
    await session.defaultSession.clearCache()
  } catch (err) {
    console.warn('[boot] session.clearCache failed (non-fatal):', err)
  }
  setSplashStatus('Starting Bible engine…')
  // Whisper a follow-up message a moment later so the operator sees
  // the splash text actually MOVE during the typical 1-3 s server
  // boot — silent text feels just as frozen as a black screen.
  const warmingTimer = setTimeout(() => setSplashStatus('Warming up the worship console…'), 1200)
  try {
    appBaseUrl = await startNextServer()
  } catch (err) {
    clearTimeout(warmingTimer)
    closeSplash()
    fatalError('startNextServer', err); app.quit(); return
  }
  clearTimeout(warmingTimer)
  setSplashStatus('Loading interface…')
  // ── Launch-at-login: hidden boot detection ──────────────────────
  // The OS-registered auto-launch entry was set via
  // `app.setLoginItemSettings({ ... args: ['--hidden'], openAsHidden:
  // true })`. We honor it two ways for robustness:
  //   1. `--hidden` argv marker (works on all platforms; survives
  //      cases where Windows drops `wasOpenedAsHidden` due to a
  //      Group Policy / registry quirk).
  //   2. Windows-specific `wasOpenedAsHidden` flag from the
  //      LoginItemSettings record — set by the OS when the entry
  //      itself was registered with `openAsHidden`.
  // When either is true we still create the BrowserWindow (so the
  // renderer mounts and Next is warm), just with show:false. The
  // tray's "Show Main Window" path already calls `mainWindow.show()`.
  let bootHidden = process.argv.includes('--hidden')
  if (!bootHidden && process.platform === 'win32') {
    try {
      bootHidden = app.getLoginItemSettings().wasOpenedAsHidden === true
    } catch { /* ignore — fall back to argv-only detection */ }
  }
  try {
    await createMainWindow(appBaseUrl, { show: !bootHidden })
    if (bootHidden) console.log('[boot] launched hidden — main window created with show:false, tray-only UI')
  } catch (err) {
    closeSplash()
    fatalError('createMainWindow', err); app.quit(); return
  }
  // v0.7.79 — Tear the splash down NOW. `createMainWindow` awaits
  // `mainWindow.loadURL(url)`, which already resolves on the
  // renderer's `did-finish-load`, so by the time we get here the
  // main UI has finished loading. Attaching a listener here would
  // never fire (the event has already passed) and we'd be stuck
  // waiting on the 10 s safety net while the splash floats on top
  // of the live app — exactly what the operator just hit.
  closeSplash()
  try {
    setupAutoUpdater({
      getMainWindow: () => mainWindow,
      // v0.5.31 — let the updater flip our `isQuitting` flag right
      // before `quitAndInstall()` so the hide-to-tray close handler
      // doesn't veto the install (causing "ScriptureLive AI cannot
      // be closed; please close it manually").
      setIsQuitting: (v: boolean) => { isQuitting = v },
    })
  } catch (err) {
    console.error('[updater] init failed (non-fatal):', err)
  }
  // Pop a one-shot OS toast when an update finishes downloading. Wired
  // here (not inside setupTray) so the notification still fires on the
  // rare desktops where tray init failed — the operator's only signal
  // would otherwise be the in-app banner, which they can't see when
  // the window is hidden during a live service.
  onUpdateState(notifyUpdateDownloaded)
  try {
    setupTray()
  } catch (err) {
    console.error('[tray] init failed (non-fatal):', err)
  }

  // ── NDI sender is OPT-IN as of v0.5.49 ────────────────────────
  // Earlier builds auto-started the NDI sender at app launch so the
  // source appeared on the LAN with no clicks. Customer feedback
  // (April 2026): they don't want the desktop app broadcasting their
  // service to the LAN until they explicitly say so — auto-broadcast
  // pushed slides into vMix / OBS sessions that were preparing
  // unrelated content. The sender now starts ONLY when the operator
  // clicks "Start NDI Output" in the NDI Output panel; the IPC
  // handlers (`ndi:start` / `ndi:stop`) below remain wired to the
  // same FrameCapture pipeline so manual start works identically.
  if (ndi.isAvailable()) {
    console.log('[ndi] runtime detected — sender NOT started (manual start required as of v0.5.49)')
  } else {
    console.log('[ndi] runtime not detected:', ndi.unavailableReason())
  }
})

// ── Shutdown ──────────────────────────────────────────────────────
// Operator complaint: "App still running in Task Manager. Closed should
// mean dead. No ghosts." On Windows, simply calling app.quit() is not
// enough because:
//
//   1. The bundled Next.js standalone server runs in a SEPARATE Node.js
//      child process (spawn(process.execPath, [server.js], …)). When
//      Electron exits, ChildProcess.kill() on Windows only terminates
//      the IMMEDIATE child via TerminateProcess — any worker threads or
//      sub-processes Next spawned become orphaned and keep running.
//      We use `taskkill /pid X /T /F` to nuke the whole process tree.
//
//   2. The native NDI runtime (libndi via koffi) keeps a background
//      thread alive until NDIlib_destroy is called. Without it the
//      Electron process itself can hang on exit.
//
//   3. Async cleanup handlers can race with Electron's quit sequence;
//      a watchdog forces app.exit(0) after 4 s if anything hangs.
//
// shutdown() is idempotent — it runs at most once even if both
// before-quit and window-all-closed fire (which is the normal path).
let shutdownStarted = false
function forceKillNextTree(): void {
  const proc = nextProcess
  nextProcess = null
  if (!proc || !proc.pid) return
  if (process.platform === 'win32') {
    try {
      // /T = kill the entire process tree (Next workers, etc.)
      // /F = force, no graceful shutdown grace period
      // detached + ignored stdio so taskkill survives our exit and
      // doesn't tie us up waiting for it.
      const tk = spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
        detached: true,
      })
      tk.unref()
    } catch { /* fall through to .kill() */ }
  }
  // Always also call the JS-level kill as a belt-and-braces signal
  // (no-op on Windows after taskkill already terminated, but on
  // POSIX dev runs this is the actual kill).
  try { proc.kill('SIGKILL') } catch { /* ignore */ }
}
function shutdown(): void {
  if (shutdownStarted) return
  shutdownStarted = true
  // Watchdog: if anything below hangs (a stuck NDI thread, a koffi
  // call that never returns, etc.), force-terminate the Electron
  // process after 4 s. This guarantees "closed = dead" even if a
  // native binding misbehaves.
  const watchdog = setTimeout(() => {
    try { console.warn('[shutdown] watchdog tripped, forcing app.exit(0)') } catch { /* ignore */ }
    try { app.exit(0) } catch { /* ignore */ }
  }, 4000)
  watchdog.unref?.()

  // Kill the Next.js server tree FIRST so it stops accepting new
  // requests immediately. taskkill is fire-and-forget on Windows.
  forceKillNextTree()

  // Tear down the tray icon synchronously so it disappears from the
  // notification area the moment the operator quits — otherwise the
  // ghost icon lingers until the user mouses over it.
  try { if (tray && !tray.isDestroyed()) tray.destroy() } catch { /* ignore */ }
  tray = null

  // Tear down frame capture + NDI sender. These are async but we
  // intentionally do NOT await them — the watchdog above guarantees
  // exit either way, and waiting risks hanging on a stuck native call.
  void (async () => {
    try { if (frameCapture) await frameCapture.stop() } catch { /* ignore */ }
    frameCapture = null
    try { await ndi.stop() } catch { /* ignore */ }
    // Library-level NDIlib_destroy() — releases the background
    // worker thread the koffi-loaded libndi keeps alive after the
    // sender is destroyed. Without this Electron's main process can
    // hang on exit waiting for that thread to wind down.
    try { ndi.destroy() } catch { /* ignore */ }
    // Destroy any remaining BrowserWindows so Electron sees zero
    // windows and proceeds to exit cleanly.
    try {
      for (const w of BrowserWindow.getAllWindows()) {
        try { if (!w.isDestroyed()) w.destroy() } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  })()
}

app.on('before-quit', () => {
  // Fires for EVERY quit path (Cmd+Q, app.quit(), updater restart,
  // window close). Setting `isQuitting` here is what lets the main
  // window's `close` handler tell "operator clicked the X" (hide to
  // tray) apart from "we're really exiting" (let close happen).
  isQuitting = true
  // Centralising shutdown here means we clean up even when the user
  // uses a code path that bypasses window-all-closed.
  shutdown()
})

app.on('window-all-closed', () => {
  // With hide-to-tray enabled, this event normally won't fire from the
  // operator's X-button click — the main window's `close` handler
  // calls preventDefault() and just hides the window, so it's still
  // technically open. We DO get this event when:
  //   - the operator hit Quit (tray menu / app menu / Cmd+Q): in that
  //     case `isQuitting` is already true and shutdown() is in flight
  //     via before-quit, so we just need to call app.quit() so
  //     Electron's normal exit completes.
  //   - the tray failed to initialize on a desktop with no system tray:
  //     hide-to-tray is bypassed, the close goes through, and we get
  //     here for real. shutdown() + app.quit() — closed = dead.
  //
  // Either way, calling shutdown() (idempotent) + app.quit() is safe.
  // What we must NOT do is quit just because every BrowserWindow is
  // gone but the operator is intentionally running headless from the
  // tray — that path doesn't reach this handler at all (the hidden
  // mainWindow still counts as a window).
  shutdown()
  try { app.quit() } catch { /* ignore */ }
})

app.on('activate', async () => {
  // macOS dock click / dock activation. With hide-to-tray, the main
  // window often EXISTS but is hidden — `showMainWindow` already
  // handles "exists hidden → unhide", "minimized → restore", and
  // "destroyed → recreate" in one place, so route activate through
  // it instead of only recreating when no windows are left.
  if (appBaseUrl) {
    await showMainWindow()
  }
})
