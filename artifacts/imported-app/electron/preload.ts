import { contextBridge, ipcRenderer } from 'electron'
import type { WhisperDiagnostics } from './whisper-service'

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

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version: string; releaseNotes?: string; releaseName?: string }
  | { status: 'not-available'; version: string }
  | { status: 'downloading'; percent: number; transferred: number; total: number; bytesPerSecond: number }
  | { status: 'downloaded'; version: string; releaseNotes?: string; releaseName?: string }
  | { status: 'error'; message: string }

const api = {
  isDesktop: true as const,
  getInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:info'),
  updater: {
    getState: (): Promise<UpdateState> => ipcRenderer.invoke('updater:get-state'),
    check: (): Promise<UpdateState> => ipcRenderer.invoke('updater:check'),
    install: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('updater:install'),
    // Opens the GitHub Releases page in the user's default browser
    // via the main-process shell so the Settings card always has a
    // working fallback when the auto-updater can't talk to GitHub
    // (404, auth, missing latest.yml, dev build, etc.).
    openReleasesPage: (): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('updater:open-releases'),
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
  whisper: {
    isAvailable: (): Promise<{ ok: boolean; reason?: string }> =>
      ipcRenderer.invoke('whisper:is-available'),
    transcribe: (wavBuffer: ArrayBuffer, language?: string): Promise<{ ok: boolean; text?: string; error?: string }> =>
      ipcRenderer.invoke('whisper:transcribe', wavBuffer, language || 'en'),
    // Returns a structured snapshot of the whisper-bundle (binary +
    // model + every file shipped beside them) plus the result of a
    // live `whisper-cli --help` probe so the Settings panel can show
    // the operator exactly why Base Mode is or isn't working. See
    // electron/whisper-service.ts → diagnose().
    diagnose: (): Promise<{ ok: boolean; diagnostics?: WhisperDiagnostics; error?: string }> =>
      ipcRenderer.invoke('whisper:diagnose'),
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
export type { WhisperDiagnostics } from './whisper-service'
