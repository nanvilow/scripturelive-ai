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
  ndi: {
    getStatus: () => Promise<NdiStatus>
    start: (opts: { name: string; width: number; height: number; fps: number }) =>
      Promise<{ ok: boolean; status?: NdiStatus; error?: string }>
    stop: () => Promise<{ ok: boolean; error?: string }>
    onStatus: (cb: (s: NdiStatus) => void) => () => void
  }
  output: {
    openWindow: () => Promise<{ ok: boolean; error?: string }>
  }
}

declare global {
  interface Window {
    scriptureLive?: ScriptureLiveDesktop
  }
}

export function useDesktop(): ScriptureLiveDesktop | null {
  const [api, setApi] = useState<ScriptureLiveDesktop | null>(null)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.scriptureLive?.isDesktop) {
      setApi(window.scriptureLive)
    }
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
