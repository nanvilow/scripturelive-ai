"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupAutoUpdater = setupAutoUpdater;
exports.runManualCheck = runManualCheck;
exports.getUpdateState = getUpdateState;
const electron_1 = require("electron");
const electron_updater_1 = require("electron-updater");
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
let currentState = { status: 'idle' };
let intervalHandle = null;
let getWindow = null;
// Architect feedback — guards against concurrent downloadUpdate()
// calls (operator double-clicking the popup, popup + Settings card
// firing simultaneously, periodic safeCheck() rebroadcasting
// 'available' mid-click). Set as soon as the IPC handler accepts
// the request; cleared on update-downloaded / error. Status alone
// isn't enough because it stays 'available' until the first
// download-progress event lands.
let downloadInFlight = false;
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
function friendlyUpdateError(raw) {
    const m = (raw || '').toString();
    if (/releases\.atom/.test(m) && /\b404\b/.test(m)) {
        return 'No published releases found yet. Open the Releases page to download the latest installer manually.';
    }
    if (/\b401\b|\b403\b/.test(m) || /authentication token/i.test(m)) {
        return 'GitHub repository requires authentication. Open the Releases page to download manually.';
    }
    if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(m)) {
        return "Can't reach GitHub. Check your internet connection and try again.";
    }
    if (/ETIMEDOUT|ECONNRESET|network timeout/i.test(m)) {
        return 'Update server timed out. Try again in a moment, or open the Releases page.';
    }
    if (/cannot find latest\.yml|HttpError: 404/i.test(m)) {
        return 'No update metadata found on this release. Open the Releases page to download manually.';
    }
    // Trim hideously long messages (electron-updater dumps full HTTP
    // headers) so the toast stays readable. First line + 140 chars max.
    const firstLine = m.split('\n')[0] || m;
    return firstLine.length > 140 ? firstLine.slice(0, 137) + '…' : firstLine;
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
        const raw = err instanceof Error ? err.message : String(err);
        broadcast({ status: 'error', message: friendlyUpdateError(raw) });
    }
}
function setupAutoUpdater(opts) {
    getWindow = opts.getMainWindow;
    // Operator-driven download flow: when a new release is detected we
    // surface an "Update Available — Click To Download" popup in the
    // renderer (see update-notifier.tsx). The download only starts when
    // the operator clicks Download; we never silently consume bandwidth
    // mid-service. autoInstallOnAppQuit stays true so a downloaded
    // update still applies on the next clean quit even if the operator
    // skips the explicit Install Now action.
    electron_updater_1.autoUpdater.autoDownload = false;
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
        downloadInFlight = false;
        const { notes, name } = normalizeNotes(info);
        broadcast({ status: 'downloaded', version: info.version, releaseNotes: notes, releaseName: name });
    });
    electron_updater_1.autoUpdater.on('error', (err) => {
        downloadInFlight = false;
        const raw = err?.message || String(err);
        broadcast({ status: 'error', message: friendlyUpdateError(raw) });
    });
    electron_1.ipcMain.handle('updater:get-state', () => currentState);
    electron_1.ipcMain.handle('updater:check', async () => {
        // In dev / unpackaged builds electron-updater refuses to run.
        // Surface a clear actionable status instead of pretending the
        // check ran — otherwise the operator sees the button "do nothing"
        // and assumes it's broken.
        if (!electron_1.app.isPackaged) {
            const devState = {
                status: 'error',
                message: 'Update checks only run in the installed desktop build. Open the Releases page to download the latest installer.',
            };
            broadcast(devState);
            return devState;
        }
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
    // Operator-clicked "Download" path. Only valid when an update has
    // been announced (status === 'available'). We let electron-updater
    // run the signed download against GitHub Releases; progress events
    // flow through download-progress → broadcast() → the renderer's
    // toast. Returns ok:false (without throwing) on no-op so the toast
    // can show a friendly message.
    electron_1.ipcMain.handle('updater:download', async () => {
        // In-flight guard — blocks the race where a double-click on the
        // toast (or a popup-click + Settings-click in quick succession)
        // both pass the status check before the first downloadUpdate()
        // has flipped status to 'downloading'. Without this guard
        // electron-updater would happily start two parallel downloads.
        if (downloadInFlight ||
            currentState.status === 'downloading' ||
            currentState.status === 'downloaded') {
            return { ok: true, alreadyInProgress: true };
        }
        if (currentState.status !== 'available') {
            return { ok: false, error: 'no update available to download' };
        }
        downloadInFlight = true;
        try {
            await electron_updater_1.autoUpdater.downloadUpdate();
            // Don't clear downloadInFlight here on success — the
            // update-downloaded event handler clears it. autoUpdater
            // resolves the promise as soon as the download finishes, but
            // we want the guard to bridge any micro-window between
            // resolution and the event fire.
            return { ok: true };
        }
        catch (err) {
            downloadInFlight = false;
            const raw = err instanceof Error ? err.message : String(err);
            const friendly = friendlyUpdateError(raw);
            broadcast({ status: 'error', message: friendly });
            return { ok: false, error: friendly };
        }
    });
    // Skip the periodic check in dev — electron-updater refuses to run
    // unpackaged anyway. Manual checks via the IPC handler still fire
    // (and now return a friendly dev-mode error instead of a no-op).
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