'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Wifi, WifiOff, Radio, AlertTriangle, MonitorPlay, ChevronDown } from 'lucide-react'
import { useNdi } from '@/lib/use-electron'
import { StageDisplayControls } from '@/components/views/stage-display-controls'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'

/**
 * One-click NDI panel.
 *
 * Design philosophy: the desktop app auto-starts the NDI sender at launch
 * with sensible defaults (1080p / 30fps, source name "ScriptureLive AI"),
 * so by the time this panel renders, the source is usually already live
 * on the LAN and visible in vMix / Wirecast / OBS / NDI Studio Monitor.
 *
 * The panel surfaces a single big toggle to stop or restart the sender,
 * a status indicator, and a small "Advanced" disclosure for power users
 * who need to override the source name. Everything else (resolution,
 * frame rate, lower-third overlays) is gone — those choices belong in
 * the AV switcher, not in the slides app.
 */
export function NdiOutputPanel() {
  const { desktop, status, available, unavailableReason } = useNdi()
  const [busy, setBusy] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [sourceName, setSourceName] = useState('ScriptureLive AI')
  // NDI-only display mode — independent from the secondary-screen
  // `displayMode`. Lets the operator run the projector at Full Screen
  // while feeding vMix/OBS a Lower Third (v0.5.5 spec).
  const ndiDisplayMode = useAppStore((s) => s.settings.ndiDisplayMode)
  const updateSettings = useAppStore((s) => s.updateSettings)

  if (!desktop) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">NDI Output</CardTitle>
              <CardDescription>Available in the desktop app</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground leading-relaxed">
            Native NDI broadcasting requires the ScriptureLive AI desktop
            app on Windows. Download the installer from the team Drive and
            run it on the same LAN as your vMix / Wirecast / OBS machine —
            the source appears automatically the moment the app launches.
          </div>
        </CardContent>
      </Card>
    )
  }

  const isRunning = !!status?.running
  const ndiOk = available !== false

  const handleToggle = async () => {
    if (!desktop) return
    setBusy(true)
    try {
      if (isRunning) {
        const res = await desktop.ndi.stop()
        if (!res.ok) toast.error(res.error || 'Failed to stop NDI')
        else toast.success('NDI output stopped')
      } else {
        const res = await desktop.ndi.start({
          name: sourceName.trim() || 'ScriptureLive AI',
          width: 1920,
          height: 1080,
          fps: 30,
        })
        if (!res.ok) toast.error(res.error || 'Failed to start NDI')
        else toast.success(`Broadcasting "${sourceName}" on the LAN`)
      }
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
            <Radio className={cn('h-5 w-5', isRunning ? 'text-emerald-500' : 'text-muted-foreground')} />
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                NDI Output
                {isRunning && (
                  <Badge variant="default" className="bg-emerald-600 text-[10px] gap-1">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> ON AIR
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs">
                {isRunning
                  ? `Live on the LAN as "${status?.source || sourceName}"`
                  : ndiOk
                  ? 'Tap the button to start broadcasting'
                  : 'NDI runtime not detected'}
              </CardDescription>
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
              Install <a href="https://ndi.video/tools/" target="_blank" rel="noopener noreferrer" className="underline">NDI Tools</a> (free)
              from the official site, then restart the desktop app. NDI Tools provides the runtime that lets vMix, Wirecast, and OBS see this source on the network.
            </div>
          </div>
        )}

        {/* The one button. */}
        <Button
          onClick={handleToggle}
          disabled={busy || !ndiOk}
          className={cn(
            'w-full h-14 text-base font-semibold gap-3 transition-colors',
            isRunning
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white',
          )}
        >
          {isRunning ? (
            <><WifiOff className="h-5 w-5" /> Stop NDI Output</>
          ) : (
            <><Wifi className="h-5 w-5" /> Start NDI Output</>
          )}
        </Button>

        {/* Status + frame counter */}
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground px-1">
          <div className="flex items-center gap-2">
            {isRunning ? (
              <>
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Broadcasting · 1080p30 · {status?.frameCount.toLocaleString() || 0} frames sent
              </>
            ) : (
              <>
                <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/50" />
                Sender stopped
              </>
            )}
          </div>
          <Button onClick={handleOpenWindow} variant="ghost" size="sm" className="h-7 text-[11px] gap-1.5">
            <MonitorPlay className="h-3.5 w-3.5" /> Open Congregation Window
          </Button>
        </div>

        {status?.error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/5 p-2 text-xs text-red-300">
            Error: {status.error}
          </div>
        )}

        {/* Audio guidance — pros mix audio in the AV switcher, not via NDI */}
        <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-[11px] text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Audio:</strong> NDI carries the
          slide visuals only. Route your microphones, music, and video
          playback audio through your existing AV mixer (vMix audio in,
          Wirecast audio source, OBS audio bus) — that&apos;s what keeps
          audio sync rock solid in a live service.
        </div>

        {/* NDI Display Mode — independent of the projector's displayMode */}
        <div className="rounded-md border border-border/60 bg-muted/10 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-semibold text-foreground">NDI Display Mode</div>
              <p className="text-[10px] text-muted-foreground leading-snug">
                Affects the NDI feed only. Your secondary screen stays on its own mode.
              </p>
            </div>
            <div className="flex gap-1 shrink-0">
              <button
                onClick={() => updateSettings({ ndiDisplayMode: 'full' })}
                className={cn(
                  'h-7 px-2.5 rounded-md border text-[10px] uppercase tracking-wider transition-colors',
                  ndiDisplayMode === 'full'
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                    : 'border-border bg-background hover:bg-muted/40 text-muted-foreground',
                )}
              >
                Full Screen
              </button>
              <button
                onClick={() => updateSettings({ ndiDisplayMode: 'lower-third' })}
                className={cn(
                  'h-7 px-2.5 rounded-md border text-[10px] uppercase tracking-wider transition-colors',
                  ndiDisplayMode === 'lower-third'
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                    : 'border-border bg-background hover:bg-muted/40 text-muted-foreground',
                )}
              >
                Lower Third
              </button>
            </div>
          </div>
        </div>

        {/* Advanced disclosure */}
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showAdvanced && 'rotate-180')} />
          Advanced
        </button>

        {showAdvanced && (
          <div className="rounded-md border border-border bg-muted/10 p-3 space-y-2">
            <div className="space-y-1.5">
              <label className="text-[11px] text-muted-foreground">NDI source name</label>
              <input
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value.slice(0, 60))}
                disabled={isRunning}
                className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs disabled:opacity-50"
                placeholder="ScriptureLive AI"
              />
              <p className="text-[10px] text-muted-foreground">
                How the source appears in vMix / OBS / NDI Studio Monitor.
                Stop and restart the sender to apply a name change.
              </p>
            </div>
          </div>
        )}

        <StageDisplayControls />
      </CardContent>
    </Card>
  )
}
