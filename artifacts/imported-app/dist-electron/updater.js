"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupAutoUpdater = setupAutoUpdater;
exports.openReleasesPage = openReleasesPage;
exports.runManualCheck = runManualCheck;
exports.getUpdateState = getUpdateState;
const electron_1 = require("electron");
const electron_updater_1 = require("electron-updater");
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
let currentState = { status: 'idle' };
let intervalHandle = null;
let getWindow = null;
function broadcast(state) {
    currentState = state;
    const win = getWindow?.();
    if (win && !win.isDestroyed()) {
        win.webContents.send('updater:state', state);
    }
}
function normalizeNotes(info) {
    let notes;
    if (typeof info.releaseNotes === 'string') {
        notes = info.releaseNotes;
    }
    else if (Array.isArray(info.releaseNotes)) {
        notes = info.releaseNotes.map((n) => n?.note).filter(Boolean).join('\n\n');
    }
    return { notes, name: info.releaseName ?? undefined };
}
async function safeCheck() {
    if (currentState.status === 'checking' ||
        currentState.status === 'downloading' ||
        currentState.status === 'downloaded') {
        return;
    }
    try {
        await electron_updater_1.autoUpdater.checkForUpdates();
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        broadcast({ status: 'error', message });
    }
}
function setupAutoUpdater(opts) {
    getWindow = opts.getMainWindow;
    electron_updater_1.autoUpdater.autoDownload = true;
    electron_updater_1.autoUpdater.autoInstallOnAppQuit = true;
    electron_updater_1.autoUpdater.allowDowngrade = false;
    electron_updater_1.autoUpdater.logger = {
        info: (m) => console.log('[updater]', m),
        warn: (m) => console.warn('[updater]', m),
        error: (m) => console.error('[updater]', m),
        debug: (m) => console.log('[updater:debug]', m),
    };
    electron_updater_1.autoUpdater.on('checking-for-update', () => broadcast({ status: 'checking' }));
    electron_updater_1.autoUpdater.on('update-available', (info) => {
        const { notes, name } = normalizeNotes(info);
        broadcast({ status: 'available', version: info.version, releaseNotes: notes, releaseName: name });
    });
    electron_updater_1.autoUpdater.on('update-not-available', (info) => {
        broadcast({ status: 'not-available', version: info.version });
    });
    electron_updater_1.autoUpdater.on('download-progress', (p) => {
        broadcast({
            status: 'downloading',
            percent: p.percent,
            transferred: p.transferred,
            total: p.total,
            bytesPerSecond: p.bytesPerSecond,
        });
    });
    electron_updater_1.autoUpdater.on('update-downloaded', (info) => {
        const { notes, name } = normalizeNotes(info);
        broadcast({ status: 'downloaded', version: info.version, releaseNotes: notes, releaseName: name });
    });
    electron_updater_1.autoUpdater.on('error', (err) => {
        broadcast({ status: 'error', message: err?.message || String(err) });
    });
    electron_1.ipcMain.handle('updater:get-state', () => currentState);
    electron_1.ipcMain.handle('updater:check', async () => {
        await safeCheck();
        return currentState;
    });
    electron_1.ipcMain.handle('updater:install', () => {
        if (currentState.status !== 'downloaded') {
            return { ok: false, error: 'no update downloaded' };
        }
        setImmediate(() => electron_updater_1.autoUpdater.quitAndInstall(false, true));
        return { ok: true };
    });
    // Skip in dev — electron-updater refuses to run unpackaged anyway.
    if (!electron_1.app.isPackaged) {
        broadcast({ status: 'idle' });
        return;
    }
    // Initial check shortly after launch, then on a periodic interval.
    setTimeout(() => { void safeCheck(); }, 10_000);
    intervalHandle = setInterval(() => { void safeCheck(); }, CHECK_INTERVAL_MS);
    electron_1.app.on('before-quit', () => {
        if (intervalHandle) {
            clearInterval(intervalHandle);
            intervalHandle = null;
        }
    });
}
/** Open the GitHub releases page so the user can grab the latest installer manually. */
function openReleasesPage() {
    electron_1.shell.openExternal('https://github.com/nanvilow/scripturelive-ai/releases/latest');
}
/**
 * Run an update check on demand (e.g. from the Help menu) and return the
 * resulting state so callers can surface a one-shot dialog/toast.
 */
async function runManualCheck() {
    await safeCheck();
    return currentState;
}
/** Read the latest cached state without triggering a network check. */
function getUpdateState() {
    return currentState;
}
//# sourceMappingURL=updater.js.map