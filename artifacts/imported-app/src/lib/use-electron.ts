'use client'

import { useEffect, useState } from 'react'

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

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version: string; releaseNotes?: string; releaseName?: string }
  | { status: 'not-available'; version: string }
  | { status: 'downloading'; percent: number; transferred: number; total: number; bytesPerSecond: number }
  | { status: 'downloaded'; version: string; releaseNotes?: string; releaseName?: string }
  | { status: 'error'; message: string }

export type ScriptureLiveDesktop = {
  isDesktop: true
  getInfo: () => Promise<{
    version: string
    platform: NodeJS.Platform
    isDesktop: true
    appUrl: string
    ndiAvailable: boolean
    ndiUnavailableReason?: string
  }>
  updater: {
    getState: () => Promise<UpdateState>
    check: () => Promise<UpdateState>
    install: () => Promise<{ ok: boolean; error?: string }>
    download?: () => Promise<{ ok: boolean; error?: string; alreadyInProgress?: boolean }>
    cancel?: () => Promise<{ ok: boolean; error?: string }>
    onState: (cb: (s: UpdateState) => void) => () => void
  }
  ndi: {
    getStatus: () => Promise<NdiStatus>
    start: (opts: {
      name: string
      width: number
      height: number
      fps: number
      layout?: 'mirror' | 'ndi'
      transparent?: boolean
      lowerThird?: {
        enabled?: boolean
        position?: 'top' | 'bottom'
        branding?: string
        accent?: string
        // v0.7.5.1 — Operator's bucket + scale, baked into the captured
        // BrowserWindow URL so vMix/OBS render the right size on frame 1.
        height?: 'sm' | 'md' | 'lg'
        scale?: number
      }
    }) => Promise<{ ok: boolean; status?: NdiStatus; error?: string }>
    stop: () => Promise<{ ok: boolean; error?: string }>
    onStatus: (cb: (s: NdiStatus) => void) => () => void
  }
  output: {
    openWindow: (opts?: { displayId?: number }) => Promise<{ ok: boolean; error?: string }>
    listDisplays?: () => Promise<Array<{ id: number; label: string; primary: boolean; width: number; height: number }>>
    openStageDisplay?: (opts?: { displayId?: number }) => Promise<{ ok: boolean; error?: string }>
  }
}

export function useDesktop(): ScriptureLiveDesktop | null {
  const [api, setApi] = useState<ScriptureLiveDesktop | null>(null)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const bridge = (window as unknown as { scriptureLive?: ScriptureLiveDesktop }).scriptureLive
    if (bridge?.isDesktop) setApi(bridge)
  }, [])
  return api
}

export function useNdi() {
  const desktop = useDesktop()
  const [status, setStatus] = useState<NdiStatus | null>(null)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [unavailableReason, setUnavailableReason] = useState<string | undefined>()

  useEffect(() => {
    if (!desktop) return
    let unsub: (() => void) | undefined
    desktop.getInfo().then((info) => {
      setAvailable(info.ndiAvailable)
      setUnavailableReason(info.ndiUnavailableReason)
    })
    desktop.ndi.getStatus().then(setStatus)
    unsub = desktop.ndi.onStatus(setStatus)
    return () => { if (unsub) unsub() }
  }, [desktop])

  return { desktop, status, available, unavailableReason }
}
