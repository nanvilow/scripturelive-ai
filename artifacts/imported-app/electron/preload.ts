import { contextBridge, ipcRenderer } from 'electron'

export type NdiLayout = 'mirror' | 'ndi'

export type NdiLowerThirdConfig = {
  enabled?: boolean
  position?: 'top' | 'bottom'
  branding?: string
  accent?: string
  // v0.7.5.1 — Operator's bucket + scale, baked into the captured
  // BrowserWindow URL so vMix/OBS render the right size on frame 1.
  height?: 'sm' | 'md' | 'lg'
  scale?: number
}

export type NdiStartOptions = {
  name: string
  width: number
  height: number
  fps: number
  layout?: NdiLayout
  transparent?: boolean
  lowerThird?: NdiLowerThirdConfig
}

export type NdiStatus = {
  running: boolean
  source?: string
  width?: number
  height?: number
  fps?: number
  frameCount: number
  error?: string
  captureMessage?: string
}

export type AppInfo = {
  version: string
  platform: NodeJS.Platform
  isDesktop: true
  appUrl: string
  ndiAvailable: boolean
  ndiUnavailableReason?: string
}

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version: string; releaseNotes?: string; releaseName?: string }
  | { status: 'not-available'; version: string }
  | { status: 'downloading'; percent: number; transferred: number; total: number; bytesPerSecond: number }
  | { status: 'downloaded'; version: string; releaseNotes?: string; releaseName?: string }
  | { status: 'error'; message: string }

export type LaunchAtLoginInfo = {
  /**
   * `false` when the OS doesn't support launch-at-login (Linux, where
   * Electron's `setLoginItemSettings` is a no-op) OR when running in
   * dev. Renderer should disable / hide the toggle in that case.
   */
  supported: boolean
  openAtLogin: boolean
  openAsHidden: boolean
  /** Human-readable explanation when `supported` is false. */
  reason?: string
}

const api = {
  isDesktop: true as const,
  getInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:info'),
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
    openUninstall: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('app:open-uninstall'),
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
    get: (): Promise<LaunchAtLoginInfo> =>
      ipcRenderer.invoke('app:get-launch-at-login'),
    set: (openAtLogin: boolean): Promise<{ ok: boolean; error?: string; info: LaunchAtLoginInfo }> =>
      ipcRenderer.invoke('app:set-launch-at-login', openAtLogin),
  },
  /**
   * Operator preference: when ON, the X button on the main window
   * runs the normal shutdown path instead of hiding to the tray.
   * Persisted in `userData/preferences.json` by the main process and
   * applied to the very next close — no app restart required.
   */
  quitOnClose: {
    get: (): Promise<{ value: boolean }> =>
      ipcRenderer.invoke('app:get-quit-on-close'),
    set: (value: boolean): Promise<{ ok: boolean; error?: string; value: boolean }> =>
      ipcRenderer.invoke('app:set-quit-on-close', value),
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
    get: (): Promise<{ value: boolean }> =>
      ipcRenderer.invoke('app:get-desktop-update-toast'),
    set: (value: boolean): Promise<{ ok: boolean; error?: string; value: boolean }> =>
      ipcRenderer.invoke('app:set-desktop-update-toast', value),
  },
  updater: {
    getState: (): Promise<UpdateState> => ipcRenderer.invoke('updater:get-state'),
    check: (): Promise<UpdateState> => ipcRenderer.invoke('updater:check'),
    // Triggers the actual download once the operator clicks the
    // "Update Available — Click To Download" popup. Backed by
    // autoUpdater.downloadUpdate() in the main process. Progress is
    // pushed through the same updater:state channel as everything
    // else, so the renderer just listens to onState() to update the
    // toast description with percent.
    download: (): Promise<{ ok: boolean; error?: string; alreadyInProgress?: boolean }> =>
      ipcRenderer.invoke('updater:download'),
    install: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('updater:install'),
    // v0.5.31 — operator-cancellable download. Aborts the in-flight
    // signed download via the CancellationToken passed into
    // `downloadUpdate()` and broadcasts an 'idle' state so the
    // available-update popup can re-appear naturally.
    cancel: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('updater:cancel'),
    onState: (cb: (s: UpdateState) => void): (() => void) => {
      const handler = (_e: unknown, state: UpdateState) => cb(state)
      ipcRenderer.on('updater:state', handler)
      return () => { ipcRenderer.removeListener('updater:state', handler) }
    },
  },
  ndi: {
    getStatus: (): Promise<NdiStatus> => ipcRenderer.invoke('ndi:status'),
    start: (opts: NdiStartOptions): Promise<{ ok: boolean; status?: NdiStatus; error?: string }> =>
      ipcRenderer.invoke('ndi:start', opts),
    stop: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('ndi:stop'),
    onStatus: (cb: (status: NdiStatus) => void) => {
      const handler = (_e: unknown, status: NdiStatus) => cb(status)
      ipcRenderer.on('ndi:status', handler)
      return () => ipcRenderer.removeListener('ndi:status', handler)
    },
  },
  output: {
    openWindow: (
      opts?: { displayId?: number },
    ): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('output:open-window', opts),
    listDisplays: (): Promise<
      Array<{ id: number; label: string; primary: boolean; width: number; height: number }>
    > => ipcRenderer.invoke('output:list-displays'),
    openStageDisplay: (
      opts?: { displayId?: number },
    ): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('output:open-stage', opts),
  },
}

contextBridge.exposeInMainWorld('scriptureLive', api)

export type ScriptureLiveApi = typeof api
