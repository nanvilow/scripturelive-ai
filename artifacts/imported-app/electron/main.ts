import { app, BrowserWindow, Menu, MenuItemConstructorOptions, Tray, nativeImage, ipcMain, shell, screen, dialog, session, Notification } from 'electron'
import path from 'node:path'
import { spawn, ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import fs from 'node:fs'
import { NdiService, NdiStartOptions as NdiServiceStartOptions, NdiStatus } from './ndi-service'

let logFilePath = ''
function setupFileLogging() {
  try {
    const dir = app.getPath('userData')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    logFilePath = path.join(dir, 'launch.log')
    const stream = fs.createWriteStream(logFilePath, { flags: 'w' })
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
    process.on('uncaughtException', (err) => { console.error('uncaughtException', err) })
    process.on('unhandledRejection', (err) => { console.error('unhandledRejection', err) })
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
  }
}
import { FrameCapture } from './frame-capture'
import { setupAutoUpdater, runManualCheck, getUpdateState, onUpdateState, triggerUpdateDownload, type UpdateState } from './updater'
import { renderBadgedIcon, type BadgeColor } from './tray-badges'

// ── Replit-hosted speech-to-text proxy ────────────────────────────────
// The bundled Next.js standalone server in this Electron app forwards
// every /api/transcribe request to this URL. The OpenAI key never lives
// on the customer's PC — it sits as an env secret on the Replit
// deployment that serves this URL. To rotate the deployment URL,
// change this constant, run `pnpm version` + the build/push workflow,
// and ship.
const DEFAULT_TRANSCRIBE_PROXY_URL =
  'https://scripturelive.replit.app/api/transcribe'

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
app.commandLine.appendSwitch('enable-features', 'WebSpeechAPI,SpeechSynthesisAPI,WebRTC-Audio-Red-For-Opus')
app.commandLine.appendSwitch('enable-speech-dispatcher')
// Auto-grant getUserMedia for the bundled origin so the mic doesn't
// need a per-session prompt the user has to click through.
app.commandLine.appendSwitch('use-fake-ui-for-media-stream')
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

const ndi = new NdiService()
let frameCapture: FrameCapture | null = null
let mainWindow: BrowserWindow | null = null
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
      HOSTNAME: '127.0.0.1',
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
  nextProcess.on('exit', (code) => {
    console.log(`[next] process exited with code ${code}`)
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

async function createMainWindow(url: string) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0a0a0a',
    icon: process.platform === 'win32'
      ? path.join(process.resourcesPath, 'app', '.next', 'standalone', 'artifacts', 'imported-app', 'public', 'icon-512.png')
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
    },
    title: 'ScriptureLive AI',
    autoHideMenuBar: true,
  })
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target)
    return { action: 'deny' }
  })
  // Hide-to-tray on close. The operator complaint we're solving:
  // closing the main console window during a live service used to
  // call shutdown(), which killed the Next.js server and the NDI
  // sender mid-broadcast. Now the X button just hides the window —
  // NDI keeps flowing, the bundled Next server keeps serving the
  // congregation/stage outputs, and the auto-updater keeps running.
  // The operator brings it back from the tray.
  //
  // Three carve-outs let the app actually exit:
  //   1. `isQuitting` is true — set by `before-quit`, fires for
  //      every explicit Quit path (tray menu, app menu / Cmd+Q,
  //      updater restart, fatal errors that call app.quit()).
  //   2. No tray exists (e.g. tray init failed on a Linux desktop
  //      without a system tray). Without a way back into the app,
  //      hide-to-tray would be a one-way trap, so let close happen
  //      and `window-all-closed` will quit cleanly.
  //   3. The window is being destroyed during shutdown.
  mainWindow.on('close', (event) => {
    if (isQuitting) return
    if (!tray || tray.isDestroyed()) return
    if (!mainWindow || mainWindow.isDestroyed()) return
    event.preventDefault()
    try { mainWindow.hide() } catch { /* ignore */ }
    void maybeShowTrayHint()
  })
  mainWindow.on('closed', () => { mainWindow = null })
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
  return line ? `ScriptureLive AI — ${line}` : 'ScriptureLive AI'
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
  if (state.status === 'available') {
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
      click: () => {
        void (async () => {
          const { autoUpdater } = await import('electron-updater')
          setImmediate(() => autoUpdater.quitAndInstall(false, true))
        })()
      },
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
    // Help menu only appears on non-Mac platforms. On macOS the
    // Check for Updates… item already lives under the app menu, and
    // since "View Releases on GitHub" was removed (browser redirect,
    // conflicts with the in-app update flow), the Help submenu would
    // be empty on Mac. Skipping it altogether avoids a blank menu.
    ...(isMac
      ? []
      : [{
          role: 'help' as const,
          submenu: [checkForUpdatesItem],
        }]),
  )

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function broadcastNdiStatus(status: NdiStatus) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('ndi:status', status)
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

  ipcMain.handle('ndi:status', () => ndi.getStatus())

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
        const cur = ndi.getStatus()
        if (
          cur.running &&
          frameCapture &&
          cur.source === (opts.name || 'ScriptureLive AI') &&
          cur.width === opts.width &&
          cur.height === opts.height &&
          cur.fps === opts.fps
        ) {
          broadcastNdiStatus(cur)
          return { ok: true, status: cur }
        }
        if (frameCapture) { await frameCapture.stop(); frameCapture = null }
        await ndi.start(opts)
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
          transparent = opts.transparent !== false
          const lt = opts.lowerThird || {}
          if (transparent) params.set('transparent', '1')
          if (lt.enabled) params.set('lowerThird', '1')
          if (lt.position === 'top') params.set('position', 'top')
        }
        const capturePath = `/api/output/congregation?${params.toString()}`
        await frameCapture.start({
          width: opts.width,
          height: opts.height,
          fps: opts.fps,
          path: capturePath,
          transparent,
        })
        broadcastNdiStatus(ndi.getStatus())
        return { ok: true, status: ndi.getStatus() }
      } catch (err) {
        try { if (frameCapture) await frameCapture.stop() } catch { /* ignore */ }
        frameCapture = null
        try { await ndi.stop() } catch { /* ignore */ }
        const message = err instanceof Error ? err.message : String(err)
        broadcastNdiStatus({ ...ndi.getStatus(), error: message })
        return { ok: false, error: message }
      }
    })
  )

  ipcMain.handle('ndi:stop', () =>
    serializeNdi(async () => {
      try {
        if (frameCapture) { await frameCapture.stop(); frameCapture = null }
        await ndi.stop()
        broadcastNdiStatus(ndi.getStatus())
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    })
  )

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

    win.loadURL(`${appBaseUrl}${opts.path}`)
    return win
  }

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
  })
}

app.whenReady().then(async () => {
  setupFileLogging()

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
    fatalError('setupIpc', err); app.quit(); return
  }
  try {
    appBaseUrl = await startNextServer()
  } catch (err) {
    fatalError('startNextServer', err); app.quit(); return
  }
  try {
    await createMainWindow(appBaseUrl)
  } catch (err) {
    fatalError('createMainWindow', err); app.quit(); return
  }
  try {
    setupAutoUpdater({ getMainWindow: () => mainWindow })
  } catch (err) {
    console.error('[updater] init failed (non-fatal):', err)
  }
  try {
    setupTray()
  } catch (err) {
    console.error('[tray] init failed (non-fatal):', err)
  }

  // ── Auto-start NDI sender ─────────────────────────────────────
  // The whole point of "one-click NDI" is that the user shouldn't have
  // to click anything. As soon as the app is up and the NDI runtime is
  // present, fire up the sender on its own with sensible defaults so
  // the source appears in vMix / Wirecast / OBS / NDI Studio Monitor
  // immediately on the LAN. The user can stop it from the NDI panel
  // if they don't want it.
  if (ndi.isAvailable()) {
    try {
      await ndi.start({ name: 'ScriptureLive AI', width: 1920, height: 1080, fps: 30 })
      frameCapture = new FrameCapture({
        baseUrl: appBaseUrl,
        onFrame: (buf, w, h) => ndi.sendFrame(buf, w, h),
        onStatus: (msg) => broadcastNdiStatus({ ...ndi.getStatus(), captureMessage: msg }),
      })
      await frameCapture.start({
        width: 1920,
        height: 1080,
        fps: 30,
        // ?ndi=1 → renderer treats this as the NDI surface and uses
        // settings.ndiDisplayMode (Full / Lower Third) instead of the
        // projector's displayMode, so the operator's choice in
        // Settings → NDI actually takes effect.
        path: '/api/output/congregation?ndi=1',
        transparent: false,
      })
      broadcastNdiStatus(ndi.getStatus())
      console.log('[ndi] auto-started sender "ScriptureLive AI" @ 1080p30')
    } catch (err) {
      console.error('[ndi] auto-start failed (non-fatal):', err)
      try { if (frameCapture) await frameCapture.stop() } catch { /* ignore */ }
      frameCapture = null
      try { await ndi.stop() } catch { /* ignore */ }
    }
  } else {
    console.log('[ndi] runtime not detected — sender not auto-started:', ndi.unavailableReason())
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
