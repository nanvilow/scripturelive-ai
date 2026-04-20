import { app, BrowserWindow, dialog, shell } from 'electron'

/**
 * Auto-updater wired to electron-updater.
 *
 * On packaged production builds we ask GitHub Releases (configured
 * under `publish` in electron-builder.yml) whether a newer signed
 * installer is available. If yes, we download it in the background
 * and prompt the operator to restart when it's ready. The check is
 * silent on failure — a church PC without internet should never see
 * a scary update dialog.
 *
 * In dev (`!app.isPackaged`) the updater is a no-op so HMR doesn't
 * thrash the operator console with phantom update banners.
 */
export function initAutoUpdater(getMainWindow: () => BrowserWindow | null): void {
  if (!app.isPackaged) return

  // Lazy-require so dev installs without electron-updater still work.
  let autoUpdater: typeof import('electron-updater').autoUpdater
  try {
    autoUpdater = require('electron-updater').autoUpdater
  } catch {
    console.warn('[updater] electron-updater not installed; skipping auto-update')
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowDowngrade = false

  autoUpdater.on('error', (err) => {
    console.warn('[updater] error:', err?.message || err)
  })

  autoUpdater.on('update-available', (info) => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('updater:status', { state: 'downloading', version: info.version })
    }
  })

  autoUpdater.on('update-not-available', () => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('updater:status', { state: 'idle' })
    }
  })

  autoUpdater.on('download-progress', (p) => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('updater:status', {
        state: 'downloading',
        percent: Math.round(p.percent),
        bytesPerSecond: p.bytesPerSecond,
      })
    }
  })

  autoUpdater.on('update-downloaded', async (info) => {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('updater:status', { state: 'ready', version: info.version })
    }
    const result = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'ScriptureLive AI Update',
      message: `Version ${info.version} is ready to install.`,
      detail: 'Restart the app to apply the update. Your live output will stop briefly.',
    })
    if (result.response === 0) {
      setImmediate(() => autoUpdater.quitAndInstall(false, true))
    }
  })

  // Initial check shortly after launch, then every 6 hours.
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((e) => {
      console.warn('[updater] initial check failed:', e?.message || e)
    })
  }, 15_000)

  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => undefined)
  }, 6 * 60 * 60 * 1000)
}

/** Open the GitHub releases page so the user can grab the latest installer manually. */
export function openReleasesPage(): void {
  shell.openExternal('https://github.com/wassmedia/scripturelive-ai/releases/latest')
}
