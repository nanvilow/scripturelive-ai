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

/**
 * Translate the raw electron-updater / GitHub error into a short,
 * operator-friendly sentence. The default error includes a 200-line
 * HTTP header dump and a misleading "double check that your
 * authentication token is correct" line that GitHub returns for ANY
 * 404 on the releases.atom endpoint — including the perfectly normal
 * cases of "no releases published yet" and "repo is private".
 *
 * We keep the original message under the hood (the dev console still
 * sees it via the autoUpdater logger) but only surface the friendly
 * version to the renderer so the operator gets a clear next step.
 */
function friendlyUpdateError(raw: string): string {
  const m = (raw || '').toString()
  if (/releases\.atom/.test(m) && /\b404\b/.test(m)) {
    return 'No published releases found yet. Open the Releases page to download the latest installer manually.'
  }
  if (/\b401\b|\b403\b/.test(m) || /authentication token/i.test(m)) {
    return 'GitHub repository requires authentication. Open the Releases page to download manually.'
  }
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(m)) {
    return "Can't reach GitHub. Check your internet connection and try again."
  }
  if (/ETIMEDOUT|ECONNRESET|network timeout/i.test(m)) {
    return 'Update server timed out. Try again in a moment, or open the Releases page.'
  }
  if (/cannot find latest\.yml|HttpError: 404/i.test(m)) {
    return 'No update metadata found on this release. Open the Releases page to download manually.'
  }
  // Trim hideously long messages (electron-updater dumps full HTTP
  // headers) so the toast stays readable. First line + 140 chars max.
  const firstLine = m.split('\n')[0] || m
  return firstLine.length > 140 ? firstLine.slice(0, 137) + '…' : firstLine
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
    const raw = err instanceof Error ? err.message : String(err)
    broadcast({ status: 'error', message: friendlyUpdateError(raw) })
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
    const raw = err?.message || String(err)
    broadcast({ status: 'error', message: friendlyUpdateError(raw) })
  })

  ipcMain.handle('updater:get-state', () => currentState)
  ipcMain.handle('updater:check', async () => {
    // In dev / unpackaged builds electron-updater refuses to run.
    // Surface a clear actionable status instead of pretending the
    // check ran — otherwise the operator sees the button "do nothing"
    // and assumes it's broken.
    if (!app.isPackaged) {
      const devState: UpdateState = {
        status: 'error',
        message:
          'Update checks only run in the installed desktop build. Open the Releases page to download the latest installer.',
      }
      broadcast(devState)
      return devState
    }
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
  // Lets the renderer's Settings card open the Releases page in the
  // user's default browser. Used as the "always works" fallback when
  // the auto-updater check returns a 404 / auth error / no metadata.
  ipcMain.handle('updater:open-releases', () => {
    openReleasesPage()
    return { ok: true }
  })

  // Skip the periodic check in dev — electron-updater refuses to run
  // unpackaged anyway. Manual checks via the IPC handler still fire
  // (and now return a friendly dev-mode error instead of a no-op).
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
