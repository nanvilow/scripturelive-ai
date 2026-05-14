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
import './preload'
import { contextBridge, ipcRenderer } from 'electron'

export type TestState = {
  quitOnClose: boolean
  isQuitting: boolean
  trayAlive: boolean
  hideCount: number
  windowVisible: boolean
}

const testApi = {
  getState: (): Promise<TestState> => ipcRenderer.invoke('test:get-state'),
  getQuitOnClose: (): Promise<{ value: boolean }> =>
    ipcRenderer.invoke('app:get-quit-on-close'),
  setQuitOnClose: (
    value: boolean,
  ): Promise<{ ok: boolean; error?: string; value: boolean }> =>
    ipcRenderer.invoke('app:set-quit-on-close', value),
}

contextBridge.exposeInMainWorld('__slTest__', testApi)

export type ScriptureLiveTestApi = typeof testApi
