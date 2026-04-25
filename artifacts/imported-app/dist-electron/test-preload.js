"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Preload script for the close-button E2E harness only.
 *
 * Re-uses the PRODUCTION `preload.ts` (so `window.scriptureLive` is
 * the exact same bridge the operator-facing Settings UI calls) and
 * additionally exposes a `window.__slTest__` bridge for harness-
 * only state inspection (`test:get-state`). That way:
 *   - The UI E2E (`harness.tsx` mounts the real `<StartupCard />`)
 *     drives the same `window.scriptureLive.quitOnClose.set` chain
 *     operators do — no UI-wiring shortcut.
 *   - The lower-level IPC E2E (`close-button.e2e.test.ts`) can read
 *     the harness's in-memory `quitOnClose` / `hideCount` /
 *     `windowVisible` flags through `__slTest__.getState()` without
 *     poking at private `ipcMain._invokeHandlers`.
 *
 * Loaded via `webPreferences.preload` on the harness BrowserWindow.
 * Kept separate from the production `preload.ts` so the
 * `__slTest__` surface never ships to operators.
 */
require("./preload");
const electron_1 = require("electron");
const testApi = {
    getState: () => electron_1.ipcRenderer.invoke('test:get-state'),
    getQuitOnClose: () => electron_1.ipcRenderer.invoke('app:get-quit-on-close'),
    setQuitOnClose: (value) => electron_1.ipcRenderer.invoke('app:set-quit-on-close', value),
};
electron_1.contextBridge.exposeInMainWorld('__slTest__', testApi);
//# sourceMappingURL=test-preload.js.map