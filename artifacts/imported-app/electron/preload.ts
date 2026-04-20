import { contextBridge, ipcRenderer } from 'electron'

export type NdiLayout = 'mirror' | 'ndi'

export type NdiLowerThirdConfig = {
  enabled?: boolean
  position?: 'top' | 'bottom'
  branding?: string
  accent?: string
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

const api = {
  isDesktop: true as const,
  getInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:info'),
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
  updater: {
    onStatus: (
      cb: (status: { state: 'idle' | 'downloading' | 'ready'; version?: string; percent?: number; bytesPerSecond?: number }) => void,
    ) => {
      const handler = (_e: unknown, status: Parameters<typeof cb>[0]) => cb(status)
      ipcRenderer.on('updater:status', handler)
      return () => ipcRenderer.removeListener('updater:status', handler)
    },
  },
}

contextBridge.exposeInMainWorld('scriptureLive', api)

export type ScriptureLiveApi = typeof api
