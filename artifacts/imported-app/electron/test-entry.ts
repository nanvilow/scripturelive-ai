/**
 * Minimal Electron entry point for the close-button E2E test.
 *
 * Loads ONLY what the X-button → hide-to-tray vs quit-on-close
 * behavior actually depends on (a tray icon, a BrowserWindow, the
 * preferences file, and the close handler) — no Next.js server, no
 * NDI sender, no auto-updater. This keeps the test fast, lets it
 * run in a headless container under xvfb-run, and — critically —
 * exercises the SAME `installHideToTrayCloseHandler` and
 * `setQuitOnClose…` code paths that ship to operators in
 * `electron/main.ts`. If a future refactor breaks the real wiring,
 * this entry breaks the same way.
 *
 * The harness (`electron/e2e/close-button.e2e.test.ts`) launches
 * this file via `_electron.launch()` and:
 *   - sets `SL_TEST_USER_DATA_DIR` to a per-test temp directory so
 *     `app.getPath('userData')` is sandboxed and `preferences.json`
 *     starts empty;
 *   - drives `BrowserWindow.close()` from the main process;
 *   - calls the real `app:set-quit-on-close` IPC handler to flip the
 *     toggle and asserts the very next close uses the new value.
 */
import { app, BrowserWindow, Tray, nativeImage, ipcMain } from 'electron'
import path from 'node:path'
import {
  type AppPreferences,
  readPreferences,
  writePreferences,
  installHideToTrayCloseHandler,
} from './preferences'

// Sandbox userData under a per-test temp dir so preferences.json
// reads/writes don't pollute the operator's real userData when we
// run the harness on a development machine. Set BEFORE the first
// `app.getPath('userData')` call.
const sandboxDir = process.env.SL_TEST_USER_DATA_DIR
if (sandboxDir) {
  app.setPath('userData', sandboxDir)
}

// Mirror main.ts state: in-memory flags, plus a tray + main window
// the close handler can hide to.
let isQuitting = false
let quitOnClose = false
let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null

function getPreferencesPath(): string {
  return path.join(app.getPath('userData'), 'preferences.json')
}

function loadAppPreferences(): AppPreferences {
  return readPreferences(getPreferencesPath())
}

function writeAppPreferences(prefs: AppPreferences): void {
  writePreferences(getPreferencesPath(), prefs)
}

function hydrateQuitOnCloseFromDisk(): void {
  quitOnClose = loadAppPreferences().quitOnClose === true
}

function setQuitOnCloseAndPersist(next: boolean): void {
  const prefs = loadAppPreferences()
  prefs.quitOnClose = next
  writeAppPreferences(prefs)
  quitOnClose = next
}

// Real IPC handlers — same channel names as `setupIpc()` in main.ts
// so a renderer (or the test calling `webContents.executeJavaScript`)
// can drive them through preload-style invokes.
ipcMain.handle('app:get-quit-on-close', () => ({ value: quitOnClose }))
// The bundled `<StartupCard />` calls `app:get-launch-at-login` from
// its mount effect even when only the quit-on-close toggle is being
// tested. Return a stable disabled-with-reason payload so the row
// renders the same way it would on Linux / dev builds (matching
// `readLaunchAtLogin` in main.ts) instead of throwing
// "No handler registered" into the test logs.
ipcMain.handle('app:get-launch-at-login', () => ({
  supported: false,
  openAtLogin: false,
  openAsHidden: false,
  reason: 'Launch-at-login is not exercised by the close-button test harness.',
}))
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

// Also expose direct read access to in-memory state for the harness.
// The harness asserts on `quitOnClose` (post-IPC) and `hideCount`
// (every time the close handler intercepted-and-hid).
let hideCount = 0
ipcMain.handle('test:get-state', () => ({
  quitOnClose,
  isQuitting,
  trayAlive: !!tray && !tray.isDestroyed(),
  hideCount,
  windowVisible: !!mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible(),
}))

app.on('before-quit', () => { isQuitting = true })
app.on('window-all-closed', () => { app.quit() })

app.whenReady().then(() => {
  hydrateQuitOnCloseFromDisk()

  // 1×1 transparent PNG — enough for `Tray` to accept under Linux/
  // xvfb without bundling any image asset. We only need
  // `tray.isDestroyed()` to return false for the close handler's
  // `hasLiveTray` check; the visual is irrelevant in the test.
  const TRANSPARENT_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  )
  tray = new Tray(nativeImage.createFromBuffer(TRANSPARENT_PNG))
  tray.setToolTip('ScriptureLive AI (test harness)')

  mainWindow = new BrowserWindow({
    width: 600,
    height: 400,
    show: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
      // Load the test-only preload so the harness can drive
      // `app:set-quit-on-close` etc. through a real
      // `ipcRenderer.invoke` from the renderer — exactly the path
      // the Settings UI uses in production via preload.ts.
      preload: path.join(__dirname, 'test-preload.js'),
    },
  })

  // EXACT same close-handler installer the bundled app uses. If
  // main.ts's wiring regresses, this E2E goes red the same way.
  installHideToTrayCloseHandler(
    mainWindow,
    () => ({
      isQuitting,
      quitOnClose,
      hasLiveTray: !!tray && !tray.isDestroyed(),
    }),
    () => { hideCount += 1 },
  )

  mainWindow.on('closed', () => { mainWindow = null })

  // Pick what to load. By default the harness uses about:blank,
  // which is enough for the IPC-level tests in
  // `electron/e2e/close-button.e2e.test.ts`. When the UI E2E sets
  // `SL_TEST_LOAD_UI=1`, load the StartupCard harness page instead
  // (built by `scripts/build-e2e-ui.mjs`) so the test can drive the
  // real Radix `<Switch>` operators interact with.
  const loadTarget = process.env.SL_TEST_LOAD_UI === '1'
    ? `file://${path.resolve(__dirname, '..', 'dist-electron-ui', 'harness.html')}`
    : 'about:blank'

  // Tell the harness we're ready to receive close events. Printed
  // on stdout so the playwright launcher can wait for it without
  // round-tripping through IPC.
  void mainWindow.loadURL(loadTarget).then(() => {
    console.log('TEST_HARNESS_READY')
  })
})
