import { app, BrowserWindow, Menu, MenuItemConstructorOptions, ipcMain, shell, screen, dialog, session } from 'electron'
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
import { setupAutoUpdater, runManualCheck, getUpdateState, openReleasesPage } from './updater'

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
let nextProcess: ChildProcess | null = null
let appBaseUrl = ''
let ndiTransition: Promise<unknown> = Promise.resolve()

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

async function startNextServer(): Promise<string> {
  if (isDev) {
    return process.env.NEXT_DEV_URL || 'http://localhost:3000'
  }

  const port = await getFreePort()
  const dbPath = getUserDbPath()
  const standaloneDir = path.join(process.resourcesPath, 'app', '.next', 'standalone')
  const serverEntry = path.join(standaloneDir, 'server.js')

  if (!fs.existsSync(serverEntry)) {
    throw new Error(`Next standalone server missing at ${serverEntry}`)
  }

  nextProcess = spawn(process.execPath, [serverEntry], {
    cwd: standaloneDir,
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      NODE_ENV: 'production',
      DATABASE_URL: `file:${dbPath}`,
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
      ? path.join(process.resourcesPath, 'app', '.next', 'standalone', 'public', 'icon-512.png')
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
  await mainWindow.loadURL(url)
  mainWindow.on('closed', () => { mainWindow = null })
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
    await showDialog({
      type: 'info',
      title: 'Check for Updates',
      message: 'Update available',
      detail: `Version ${state.version} is downloading in the background. You'll be prompted to restart when it's ready.`,
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
    const choice = await showDialog({
      type: 'warning',
      title: 'Check for Updates',
      message: "Couldn't check for updates",
      detail: `${state.message}\n\nYou can download the latest installer from the releases page instead.`,
      buttons: ['Open releases page', 'OK'],
      defaultId: 1,
      cancelId: 1,
    })
    if (choice.response === 0) openReleasesPage()
  }
}

function buildAppMenu() {
  const isMac = process.platform === 'darwin'
  const checkForUpdatesItem: MenuItemConstructorOptions = {
    label: 'Check for Updates…',
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
    {
      role: 'help',
      submenu: [
        ...(isMac ? [] : [checkForUpdatesItem, { type: 'separator' } as MenuItemConstructorOptions]),
        {
          label: 'View Releases on GitHub',
          click: () => { openReleasesPage() },
        },
      ],
    },
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
        if (frameCapture) { await frameCapture.stop(); frameCapture = null }
        await ndi.start(opts)
        frameCapture = new FrameCapture({
          baseUrl: appBaseUrl,
          onFrame: (buf, w, h) => ndi.sendFrame(buf, w, h),
          onStatus: (msg) => broadcastNdiStatus({ ...ndi.getStatus(), captureMessage: msg }),
        })
        const layout = opts.layout === 'ndi' ? 'ndi' : 'mirror'
        let capturePath = '/api/output/congregation'
        let transparent = false
        if (layout === 'ndi') {
          transparent = opts.transparent !== false
          const lt = opts.lowerThird || {}
          const params = new URLSearchParams()
          if (transparent) params.set('transparent', '1')
          if (lt.enabled) params.set('lowerThird', '1')
          if (lt.position === 'top') params.set('position', 'top')
          if (lt.branding) params.set('branding', lt.branding.slice(0, 80))
          if (lt.accent) params.set('accent', lt.accent.replace(/[^0-9a-fA-F]/g, '').slice(0, 6))
          const qs = params.toString()
          capturePath = '/api/output/ndi' + (qs ? `?${qs}` : '')
        }
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
        path: '/api/output/congregation',
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

app.on('window-all-closed', async () => {
  try { if (frameCapture) await frameCapture.stop() } catch { /* ignore */ }
  try { await ndi.stop() } catch { /* ignore */ }
  if (nextProcess) {
    try { nextProcess.kill() } catch { /* ignore */ }
  }
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0 && appBaseUrl) {
    await createMainWindow(appBaseUrl)
  }
})
