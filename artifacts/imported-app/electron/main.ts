import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'node:path'
import { spawn, ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import fs from 'node:fs'
import { NdiService, NdiStartOptions as NdiServiceStartOptions, NdiStatus } from './ndi-service'

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

const isDev = !app.isPackaged
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

  nextProcess.stdout?.on('data', (b) => process.stdout.write(`[next] ${b}`))
  nextProcess.stderr?.on('data', (b) => process.stderr.write(`[next:err] ${b}`))
  nextProcess.on('exit', (code) => {
    if (code !== 0 && !app.isReady()) app.quit()
  })

  // Wait for server readiness
  const url = `http://127.0.0.1:${port}`
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/api/output?format=json`)
      if (res.ok) return url
    } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('Next server failed to start')
}

async function createMainWindow(url: string) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    title: 'ScriptureLive AI',
  })
  mainWindow.removeMenu()
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target)
    return { action: 'deny' }
  })
  await mainWindow.loadURL(url)
  mainWindow.on('closed', () => { mainWindow = null })
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

  ipcMain.handle('output:open-window', () => {
    if (!appBaseUrl) return { ok: false, error: 'app not ready' }
    const win = new BrowserWindow({
      width: 1280, height: 720, backgroundColor: '#000',
      title: 'ScriptureLive — Congregation Display',
      autoHideMenuBar: true,
    })
    win.removeMenu()
    win.loadURL(`${appBaseUrl}/api/output/congregation`)
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
  setupIpc()
  try {
    appBaseUrl = await startNextServer()
  } catch (err) {
    console.error('[main] Failed to start Next server:', err)
    app.quit()
    return
  }
  await createMainWindow(appBaseUrl)
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
