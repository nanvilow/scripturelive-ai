"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const api = {
    isDesktop: true,
    getInfo: () => electron_1.ipcRenderer.invoke('app:info'),
    /**
     * v0.6.6 — Open the Windows "Apps & features" Settings page so the
     * operator can uninstall the previous ScriptureLive build before
     * installing a new one. The update dialog surfaces a button that
     * calls this. We deliberately do NOT auto-uninstall via NSIS hook:
     * uninstalling the running app would tear down its own activation
     * data and the operator might have just generated a new MoMo
     * payment ref. Manual prompt + open-Settings is the safer flow.
     */
    app: {
        openUninstall: () => electron_1.ipcRenderer.invoke('app:open-uninstall'),
    },
    /**
     * Launch-at-login (a.k.a. "start with Windows"). The renderer-side
     * Settings toggle in src/components/views/settings.tsx calls these.
     * Both reads and writes go through Electron's
     * `app.getLoginItemSettings()` / `app.setLoginItemSettings()`. The
     * setter passes `args: ['--hidden']` and `openAsHidden: true` so
     * the boot path knows to skip showing the main window — the app
     * comes up directly into the system tray with NDI auto-started.
     */
    launchAtLogin: {
        get: () => electron_1.ipcRenderer.invoke('app:get-launch-at-login'),
        set: (openAtLogin) => electron_1.ipcRenderer.invoke('app:set-launch-at-login', openAtLogin),
    },
    /**
     * Operator preference: when ON, the X button on the main window
     * runs the normal shutdown path instead of hiding to the tray.
     * Persisted in `userData/preferences.json` by the main process and
     * applied to the very next close — no app restart required.
     */
    quitOnClose: {
        get: () => electron_1.ipcRenderer.invoke('app:get-quit-on-close'),
        set: (value) => electron_1.ipcRenderer.invoke('app:set-quit-on-close', value),
    },
    /**
     * Operator preference: when OFF, the OS-level "Update ready to
     * install" toast (fired by main-process `notifyUpdateDownloaded`)
     * is suppressed. Tray badge / tooltip and the in-app banner stay
     * intact. Useful on kiosk / projection PCs where any OS notification
     * can pop over the congregation feed when the desktop is mirrored.
     * Persisted in `userData/preferences.json` alongside `quitOnClose`.
     */
    desktopUpdateToast: {
        get: () => electron_1.ipcRenderer.invoke('app:get-desktop-update-toast'),
        set: (value) => electron_1.ipcRenderer.invoke('app:set-desktop-update-toast', value),
    },
    updater: {
        getState: () => electron_1.ipcRenderer.invoke('updater:get-state'),
        check: () => electron_1.ipcRenderer.invoke('updater:check'),
        // Triggers the actual download once the operator clicks the
        // "Update Available — Click To Download" popup. Backed by
        // autoUpdater.downloadUpdate() in the main process. Progress is
        // pushed through the same updater:state channel as everything
        // else, so the renderer just listens to onState() to update the
        // toast description with percent.
        download: () => electron_1.ipcRenderer.invoke('updater:download'),
        install: () => electron_1.ipcRenderer.invoke('updater:install'),
        // v0.5.31 — operator-cancellable download. Aborts the in-flight
        // signed download via the CancellationToken passed into
        // `downloadUpdate()` and broadcasts an 'idle' state so the
        // available-update popup can re-appear naturally.
        cancel: () => electron_1.ipcRenderer.invoke('updater:cancel'),
        // v0.7.26 — Background auto-download opt-out. The main process
        // schedules a parallel download 60s after `update-available`
        // fires so the installer is on disk before the operator clicks
        // Download. Calling setAutoDownload(false) cancels any pending
        // timer and prevents the next one from being scheduled for the
        // rest of the session. Resets to true on app restart.
        getAutoDownload: () => electron_1.ipcRenderer.invoke('updater:get-auto-download'),
        setAutoDownload: (enabled) => electron_1.ipcRenderer.invoke('updater:set-auto-download', enabled),
        onState: (cb) => {
            const handler = (_e, state) => cb(state);
            electron_1.ipcRenderer.on('updater:state', handler);
            return () => { electron_1.ipcRenderer.removeListener('updater:state', handler); };
        },
    },
    ndi: {
        getStatus: () => electron_1.ipcRenderer.invoke('ndi:status'),
        start: (opts) => electron_1.ipcRenderer.invoke('ndi:start', opts),
        stop: () => electron_1.ipcRenderer.invoke('ndi:stop'),
        onStatus: (cb) => {
            const handler = (_e, status) => cb(status);
            electron_1.ipcRenderer.on('ndi:status', handler);
            return () => electron_1.ipcRenderer.removeListener('ndi:status', handler);
        },
    },
    output: {
        openWindow: (opts) => electron_1.ipcRenderer.invoke('output:open-window', opts),
        listDisplays: () => electron_1.ipcRenderer.invoke('output:list-displays'),
        openStageDisplay: (opts) => electron_1.ipcRenderer.invoke('output:open-stage', opts),
    },
};
electron_1.contextBridge.exposeInMainWorld('scriptureLive', api);
//# sourceMappingURL=preload.js.map