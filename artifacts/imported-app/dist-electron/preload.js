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