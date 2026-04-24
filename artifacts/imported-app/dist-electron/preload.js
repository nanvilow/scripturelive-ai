"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const api = {
    isDesktop: true,
    getInfo: () => electron_1.ipcRenderer.invoke('app:info'),
    updater: {
        getState: () => electron_1.ipcRenderer.invoke('updater:get-state'),
        check: () => electron_1.ipcRenderer.invoke('updater:check'),
        install: () => electron_1.ipcRenderer.invoke('updater:install'),
        // Opens the GitHub Releases page in the user's default browser
        // via the main-process shell so the Settings card always has a
        // working fallback when the auto-updater can't talk to GitHub
        // (404, auth, missing latest.yml, dev build, etc.).
        openReleasesPage: () => electron_1.ipcRenderer.invoke('updater:open-releases'),
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
    whisper: {
        isAvailable: () => electron_1.ipcRenderer.invoke('whisper:is-available'),
        transcribe: (wavBuffer, language) => electron_1.ipcRenderer.invoke('whisper:transcribe', wavBuffer, language || 'en'),
        // Returns a structured snapshot of the whisper-bundle (binary +
        // model + every file shipped beside them) plus the result of a
        // live `whisper-cli --help` probe so the Settings panel can show
        // the operator exactly why Base Mode is or isn't working. See
        // electron/whisper-service.ts → diagnose().
        diagnose: () => electron_1.ipcRenderer.invoke('whisper:diagnose'),
    },
    output: {
        openWindow: (opts) => electron_1.ipcRenderer.invoke('output:open-window', opts),
        listDisplays: () => electron_1.ipcRenderer.invoke('output:list-displays'),
        openStageDisplay: (opts) => electron_1.ipcRenderer.invoke('output:open-stage', opts),
    },
};
electron_1.contextBridge.exposeInMainWorld('scriptureLive', api);
//# sourceMappingURL=preload.js.map