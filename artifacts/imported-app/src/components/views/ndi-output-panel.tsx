'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Wifi, WifiOff, Radio, AlertTriangle, MonitorPlay, Layers, Copy } from 'lucide-react'
import { useNdi } from '@/lib/use-electron'
import { StageDisplayControls } from '@/components/views/stage-display-controls'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const RESOLUTIONS: Record<string, { w: number; h: number; label: string }> = {
  '720p': { w: 1280, h: 720, label: '720p (1280×720)' },
  '1080p': { w: 1920, h: 1080, label: '1080p (1920×1080)' },
}

type Layout = 'mirror' | 'ndi'

export function NdiOutputPanel() {
  const { desktop, status, available, unavailableReason } = useNdi()
  const [name, setName] = useState('ScriptureLive')
  const [resolution, setResolution] = useState<'720p' | '1080p'>('1080p')
  const [fps, setFps] = useState<30 | 60>(30)
  const [busy, setBusy] = useState(false)

  // Layer / overlay options for the dedicated NDI layout
  const [layout, setLayout] = useState<Layout>('mirror')
  const [transparent, setTransparent] = useState(true)
  const [showLowerThird, setShowLowerThird] = useState(true)
  const [ltPosition, setLtPosition] = useState<'top' | 'bottom'>('bottom')
  const [branding, setBranding] = useState('')
  const [accent, setAccent] = useState('22c55e')

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
      const res = await desktop.ndi.start({
        name: name.trim() || 'ScriptureLive',
        width: r.w,
        height: r.h,
        fps,
        layout,
        transparent: layout === 'ndi' ? transparent : false,
        lowerThird: layout === 'ndi'
          ? {
              enabled: showLowerThird,
              position: ltPosition,
              branding: branding.trim(),
              accent,
            }
          : undefined,
      })
      if (!res.ok) {
        toast.error(res.error || 'Failed to start NDI')
      } else {
        toast.success(
          layout === 'ndi'
            ? `Broadcasting "${name}" as keyable NDI layer`
            : `Broadcasting "${name}" on the LAN`,
        )
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

  const handleOpenStage = async () => {
    if (!desktop?.output?.openStageDisplay) {
      // Fall back to opening the stage page in the default browser
      // when running in the dev (browser) environment.
      window.open('/api/output/stage', '_blank', 'noopener')
      return
    }
    const r = await desktop.output.openStageDisplay()
    if (!r.ok) toast.error(r.error || 'Could not open stage display')
  }

  const previewPath = (() => {
    if (layout !== 'ndi') return '/api/output/congregation'
    const params = new URLSearchParams()
    if (transparent) params.set('transparent', '1')
    if (showLowerThird) params.set('lowerThird', '1')
    if (ltPosition === 'top') params.set('position', 'top')
    if (branding.trim()) params.set('branding', branding.trim())
    if (accent) params.set('accent', accent)
    const qs = params.toString()
    return '/api/output/ndi' + (qs ? `?${qs}` : '')
  })()

  const copyPreview = async () => {
    try {
      await navigator.clipboard.writeText(previewPath)
      toast.success('Preview path copied')
    } catch {
      toast.error('Could not copy')
    }
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

        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" /> Broadcast Layer</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              onClick={() => setLayout('mirror')}
              disabled={isRunning}
              className={cn(
                'rounded-md border p-3 text-left transition-colors',
                layout === 'mirror'
                  ? 'bg-primary/10 border-primary/40'
                  : 'bg-muted/30 border-border hover:bg-muted/60',
                isRunning && 'opacity-50 cursor-not-allowed',
              )}
            >
              <div className="text-xs font-semibold mb-0.5">Mirror congregation</div>
              <div className="text-[11px] text-muted-foreground leading-snug">
                Broadcast the same full-screen layout the audience sees on the wireless display.
              </div>
            </button>
            <button
              onClick={() => setLayout('ndi')}
              disabled={isRunning}
              className={cn(
                'rounded-md border p-3 text-left transition-colors',
                layout === 'ndi'
                  ? 'bg-primary/10 border-primary/40'
                  : 'bg-muted/30 border-border hover:bg-muted/60',
                isRunning && 'opacity-50 cursor-not-allowed',
              )}
            >
              <div className="text-xs font-semibold mb-0.5">NDI layer (keyable)</div>
              <div className="text-[11px] text-muted-foreground leading-snug">
                Transparent feed with optional lower-thirds — composite over a camera in vMix / Wirecast.
              </div>
            </button>
          </div>
        </div>

        {layout === 'ndi' && (
          <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-medium">Alpha-channel transparency</div>
                <div className="text-[11px] text-muted-foreground">Send a clean key. Disable to broadcast on a black background.</div>
              </div>
              <button
                onClick={() => setTransparent((v) => !v)}
                disabled={isRunning}
                className={cn(
                  'relative h-5 w-9 rounded-full transition-colors',
                  transparent ? 'bg-emerald-600' : 'bg-muted',
                  isRunning && 'opacity-50 cursor-not-allowed',
                )}
                aria-pressed={transparent}
              >
                <span className={cn(
                  'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform',
                  transparent ? 'translate-x-4' : 'translate-x-0.5',
                )} />
              </button>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-medium">Always show lower-third</div>
                <div className="text-[11px] text-muted-foreground">Render every slide as a lower-third bar instead of full-screen.</div>
              </div>
              <button
                onClick={() => setShowLowerThird((v) => !v)}
                disabled={isRunning}
                className={cn(
                  'relative h-5 w-9 rounded-full transition-colors',
                  showLowerThird ? 'bg-emerald-600' : 'bg-muted',
                  isRunning && 'opacity-50 cursor-not-allowed',
                )}
                aria-pressed={showLowerThird}
              >
                <span className={cn(
                  'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform',
                  showLowerThird ? 'translate-x-4' : 'translate-x-0.5',
                )} />
              </button>
            </div>

            {showLowerThird && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[11px]">Position</Label>
                  <div className="flex gap-1.5">
                    {(['bottom', 'top'] as const).map((p) => (
                      <button
                        key={p}
                        onClick={() => setLtPosition(p)}
                        disabled={isRunning}
                        className={cn(
                          'px-2.5 py-1 rounded-md text-[11px] font-medium border capitalize',
                          ltPosition === p
                            ? 'bg-primary/15 border-primary/30 text-primary'
                            : 'bg-muted border-border text-muted-foreground hover:bg-muted/80',
                          isRunning && 'opacity-50 cursor-not-allowed',
                        )}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px]">Branding label</Label>
                  <Input
                    value={branding}
                    onChange={(e) => setBranding(e.target.value.slice(0, 80))}
                    disabled={isRunning}
                    placeholder="e.g. Sunday Service"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px]">Accent color</Label>
                  <div className="flex items-center gap-2">
                    <span
                      className="h-7 w-7 rounded border border-border"
                      style={{ background: `#${accent}` }}
                    />
                    <Input
                      value={accent}
                      onChange={(e) => setAccent(e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6))}
                      disabled={isRunning}
                      placeholder="22c55e"
                      className="h-8 text-xs font-mono uppercase"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <code className="flex-1 truncate text-[10px] text-muted-foreground bg-background border border-border rounded px-2 py-1 font-mono">
                {previewPath}
              </code>
              <Button onClick={copyPreview} variant="outline" size="sm" className="h-7 px-2 gap-1 text-[11px]">
                <Copy className="h-3 w-3" /> Copy
              </Button>
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
          <Button onClick={handleOpenStage} variant="outline" className="gap-2">
            <MonitorPlay className="h-4 w-4" /> Open Stage Display
          </Button>
        </div>

        <StageDisplayControls />

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Once enabled, your slides appear as an NDI source named <code className="bg-muted px-1 rounded">{name || 'ScriptureLive'}</code> on every machine on your LAN. In <strong>vMix</strong>: Add Input → NDI. In <strong>Wirecast</strong>: Add Source → NDI. In <strong>OBS</strong>: install obs-ndi, then add an NDI Source.
          {layout === 'ndi' && transparent && (
            <> The NDI layer broadcasts with a true alpha channel, so vMix / Wirecast key it cleanly over a camera with no green-screen fringing.</>
          )}
        </p>
      </CardContent>
    </Card>
  )
}
