import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { autoUpdater, UpdateInfo, ProgressInfo } from 'electron-updater'

/**
 * Auto-updater wired to electron-updater.
 *
 * On packaged production builds we ask GitHub Releases (configured under
 * `publish` in electron-builder.yml) whether a newer signed installer is
 * available. If yes, we download it in the background and surface an
 * unobtrusive in-app banner ("Update available — restart to install")
 * via the `updater:state` IPC channel. The check is silent on failure —
 * a church PC without internet should never see a scary update dialog.
 *
 * In dev (`!app.isPackaged`) the updater is a no-op so HMR doesn't
 * thrash the operator console with phantom update banners.
 */

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version: string; releaseNotes?: string; releaseName?: string }
  | { status: 'not-available'; version: string }
  | { status: 'downloading'; percent: number; transferred: number; total: number; bytesPerSecond: number }
  | { status: 'downloaded'; version: string; releaseNotes?: string; releaseName?: string }
  | { status: 'error'; message: string }

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000
let currentState: UpdateState = { status: 'idle' }
let intervalHandle: NodeJS.Timeout | null = null
let getWindow: (() => BrowserWindow | null) | null = null

function broadcast(state: UpdateState) {
  currentState = state
  const win = getWindow?.()
  if (win && !win.isDestroyed()) {
    win.webContents.send('updater:state', state)
  }
}

function normalizeNotes(info: UpdateInfo): { notes?: string; name?: string } {
  let notes: string | undefined
  if (typeof info.releaseNotes === 'string') {
    notes = info.releaseNotes
  } else if (Array.isArray(info.releaseNotes)) {
    notes = info.releaseNotes.map((n) => n?.note).filter(Boolean).join('\n\n')
  }
  return { notes, name: info.releaseName ?? undefined }
}

async function safeCheck() {
  if (
    currentState.status === 'checking' ||
    currentState.status === 'downloading' ||
    currentState.status === 'downloaded'
  ) {
    return
  }
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    broadcast({ status: 'error', message })
  }
}

export function setupAutoUpdater(opts: { getMainWindow: () => BrowserWindow | null }) {
  getWindow = opts.getMainWindow

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowDowngrade = false
  autoUpdater.logger = {
    info: (m: unknown) => console.log('[updater]', m),
    warn: (m: unknown) => console.warn('[updater]', m),
    error: (m: unknown) => console.error('[updater]', m),
    debug: (m: unknown) => console.log('[updater:debug]', m),
  }

  autoUpdater.on('checking-for-update', () => broadcast({ status: 'checking' }))
  autoUpdater.on('update-available', (info: UpdateInfo) => {
    const { notes, name } = normalizeNotes(info)
    broadcast({ status: 'available', version: info.version, releaseNotes: notes, releaseName: name })
  })
  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    broadcast({ status: 'not-available', version: info.version })
  })
  autoUpdater.on('download-progress', (p: ProgressInfo) => {
    broadcast({
      status: 'downloading',
      percent: p.percent,
      transferred: p.transferred,
      total: p.total,
      bytesPerSecond: p.bytesPerSecond,
    })
  })
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    const { notes, name } = normalizeNotes(info)
    broadcast({ status: 'downloaded', version: info.version, releaseNotes: notes, releaseName: name })
  })
  autoUpdater.on('error', (err: Error) => {
    broadcast({ status: 'error', message: err?.message || String(err) })
  })

  ipcMain.handle('updater:get-state', () => currentState)
  ipcMain.handle('updater:check', async () => {
    await safeCheck()
    return currentState
  })
  ipcMain.handle('updater:install', () => {
    if (currentState.status !== 'downloaded') {
      return { ok: false, error: 'no update downloaded' }
    }
    setImmediate(() => autoUpdater.quitAndInstall(false, true))
    return { ok: true }
  })

  // Skip in dev — electron-updater refuses to run unpackaged anyway.
  if (!app.isPackaged) {
    broadcast({ status: 'idle' })
    return
  }

  // Initial check shortly after launch, then on a periodic interval.
  setTimeout(() => { void safeCheck() }, 10_000)
  intervalHandle = setInterval(() => { void safeCheck() }, CHECK_INTERVAL_MS)

  app.on('before-quit', () => {
    if (intervalHandle) {
      clearInterval(intervalHandle)
      intervalHandle = null
    }
  })
}

/** Open the GitHub releases page so the user can grab the latest installer manually. */
export function openReleasesPage(): void {
  shell.openExternal('https://github.com/nanvilow/scripturelive-ai/releases/latest')
}

/**
 * Run an update check on demand (e.g. from the Help menu) and return the
 * resulting state so callers can surface a one-shot dialog/toast.
 */
export async function runManualCheck(): Promise<UpdateState> {
  await safeCheck()
  return currentState
}

/** Read the latest cached state without triggering a network check. */
export function getUpdateState(): UpdateState {
  return currentState
}
