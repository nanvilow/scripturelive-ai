'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Wifi, WifiOff, Radio, AlertTriangle, MonitorPlay } from 'lucide-react'
import { useNdi } from '@/lib/use-electron'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const RESOLUTIONS: Record<string, { w: number; h: number; label: string }> = {
  '720p': { w: 1280, h: 720, label: '720p (1280×720)' },
  '1080p': { w: 1920, h: 1080, label: '1080p (1920×1080)' },
}

export function NdiOutputPanel() {
  const { desktop, status, available, unavailableReason } = useNdi()
  const [name, setName] = useState('ScriptureLive')
  const [resolution, setResolution] = useState<'720p' | '1080p'>('1080p')
  const [fps, setFps] = useState<30 | 60>(30)
  const [busy, setBusy] = useState(false)

  if (!desktop) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Native NDI Output</CardTitle>
              <CardDescription>One-click NDI sender, like EasyWorship</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <MonitorPlay className="h-4 w-4 text-primary" />
              Available in the desktop app
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Native NDI broadcasting requires the ScriptureLive AI desktop app
              (Windows or macOS) running on the same local network as your
              vMix / Wirecast / OBS machine. Download the desktop installer to
              get one-click NDI sending — no screen capture needed.
            </p>
            <p className="text-[11px] text-muted-foreground">
              In the browser, use the wireless display URL above and capture it
              with NDI Tools / OBS instead.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const isRunning = !!status?.running
  const ndiOk = available !== false

  const handleStart = async () => {
    if (!desktop) return
    setBusy(true)
    try {
      const r = RESOLUTIONS[resolution]
      const res = await desktop.ndi.start({ name: name.trim() || 'ScriptureLive', width: r.w, height: r.h, fps })
      if (!res.ok) {
        toast.error(res.error || 'Failed to start NDI')
      } else {
        toast.success(`Broadcasting "${name}" on the LAN`)
      }
    } finally {
      setBusy(false)
    }
  }

  const handleStop = async () => {
    if (!desktop) return
    setBusy(true)
    try {
      const res = await desktop.ndi.stop()
      if (!res.ok) toast.error(res.error || 'Failed to stop NDI')
      else toast.success('NDI broadcast stopped')
    } finally {
      setBusy(false)
    }
  }

  const handleOpenWindow = async () => {
    if (!desktop) return
    await desktop.output.openWindow()
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Radio className={cn('h-5 w-5', isRunning ? 'text-emerald-500' : 'text-primary')} />
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                Native NDI Output
                {isRunning && <Badge variant="default" className="bg-emerald-600 text-[10px] gap-1">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> ON AIR
                </Badge>}
              </CardTitle>
              <CardDescription>One-click NDI sender on your LAN — no screen capture</CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {!ndiOk && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-300/90 leading-relaxed">
              <strong>NDI runtime not detected.</strong>{' '}
              {unavailableReason ? <span className="opacity-80">({unavailableReason})</span> : null}
              <br />
              Install <a href="https://ndi.video/tools/" target="_blank" rel="noopener noreferrer" className="underline">NDI Tools</a> (free) on this machine, then restart the desktop app. NDI Tools provides the runtime that lets vMix, Wirecast, and OBS see this source on the network.
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Source Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={isRunning} placeholder="ScriptureLive" />
            <p className="text-[10px] text-muted-foreground">Appears in vMix / OBS / NDI Studio Monitor.</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Resolution</Label>
            <div className="flex gap-2">
              {(Object.keys(RESOLUTIONS) as ('720p' | '1080p')[]).map((k) => (
                <button key={k} onClick={() => setResolution(k)} disabled={isRunning}
                  className={cn('px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
                    resolution === k ? 'bg-primary/15 border-primary/30 text-primary' : 'bg-muted border-border text-muted-foreground hover:bg-muted/80',
                    isRunning && 'opacity-50 cursor-not-allowed')}>
                  {RESOLUTIONS[k].label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Frame Rate</Label>
            <div className="flex gap-2">
              {[30, 60].map((f) => (
                <button key={f} onClick={() => setFps(f as 30 | 60)} disabled={isRunning}
                  className={cn('px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
                    fps === f ? 'bg-primary/15 border-primary/30 text-primary' : 'bg-muted border-border text-muted-foreground hover:bg-muted/80',
                    isRunning && 'opacity-50 cursor-not-allowed')}>
                  {f} fps
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-muted/30">
              {isRunning ? (
                <><Wifi className="h-4 w-4 text-emerald-500" /><span className="text-xs">Broadcasting · {status?.frameCount.toLocaleString()} frames</span></>
              ) : (
                <><WifiOff className="h-4 w-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">Stopped</span></>
              )}
            </div>
          </div>
        </div>

        {status?.error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/5 p-2 text-xs text-red-300">
            Error: {status.error}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {isRunning ? (
            <Button onClick={handleStop} disabled={busy} variant="destructive" className="gap-2">
              <WifiOff className="h-4 w-4" /> Stop NDI
            </Button>
          ) : (
            <Button onClick={handleStart} disabled={busy || !ndiOk} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              <Wifi className="h-4 w-4" /> Enable NDI
            </Button>
          )}
          <Button onClick={handleOpenWindow} variant="outline" className="gap-2">
            <MonitorPlay className="h-4 w-4" /> Open Congregation Window
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Once enabled, your slides appear as an NDI source named <code className="bg-muted px-1 rounded">{name || 'ScriptureLive'}</code> on every machine on your LAN. In <strong>vMix</strong>: Add Input → NDI. In <strong>Wirecast</strong>: Add Source → NDI. In <strong>OBS</strong>: install obs-ndi, then add an NDI Source.
        </p>
      </CardContent>
    </Card>
  )
}
