'use client'

// v0.6.0 — NDI Output panel redesign.
//
// Operator feedback: in v0.5.x we hid the per-feed typography behind
// an "Advanced" disclosure and stacked the live preview ABOVE the
// controls. That meant every operator scrolled past a 16:9 thumbnail
// to reach the buttons they actually use during a service, and the
// real power of the panel (NDI-only typography, ref position, color)
// was hidden behind a chevron that most operators never clicked.
//
// v0.6.0 layout:
//   • Two columns on desktop. Left = ALL controls (always visible,
//     no Advanced disclosure). Right = sticky live preview, shrunk
//     to ~360px so the controls stay center-stage.
//   • On narrow widths the columns collapse to a stack with the
//     preview moved BELOW the controls (operator-first ordering).
//   • Every change still pushes through the same SSE pipeline so
//     the preview iframe updates on the next broadcast tick.

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Wifi, WifiOff, Radio, AlertTriangle, MonitorPlay } from 'lucide-react'
import { useNdi } from '@/lib/use-electron'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'

export function NdiOutputPanel() {
  const { desktop, status, available, unavailableReason } = useNdi()
  const [busy, setBusy] = useState(false)
  const [sourceName, setSourceName] = useState('ScriptureLive AI')

  const ndiDisplayMode = useAppStore((s) => s.settings.ndiDisplayMode)
  const updateSettings = useAppStore((s) => s.updateSettings)

  // Live Display values that NDI controls fall back to when set to
  // "mirror Live". Read once at render so the inheritance hint stays
  // accurate as the operator tweaks Live in another tab.
  const liveFontFamily = useAppStore((s) => s.settings.fontFamily)
  const liveFontSize = useAppStore((s) => s.settings.fontSize)
  const liveTextShadow = useAppStore((s) => s.settings.textShadow)
  const liveTextAlign = useAppStore((s) => s.settings.textAlign)
  const liveTranslation = useAppStore((s) => s.selectedTranslation)

  // NDI-only overrides (undefined = mirror Live).
  const ndiFontFamily = useAppStore((s) => s.settings.ndiFontFamily)
  const ndiFontSize = useAppStore((s) => s.settings.ndiFontSize)
  const ndiTextShadow = useAppStore((s) => s.settings.ndiTextShadow)
  const ndiTextAlign = useAppStore((s) => s.settings.ndiTextAlign)
  const ndiTextScale = useAppStore((s) => s.settings.ndiTextScale)
  const ndiAspectRatio = useAppStore((s) => s.settings.ndiAspectRatio)
  const ndiBibleColor = useAppStore((s) => s.settings.ndiBibleColor)
  const ndiBibleLineHeight = useAppStore((s) => s.settings.ndiBibleLineHeight)
  const ndiRefSize = useAppStore((s) => s.settings.ndiRefSize)
  const ndiRefStyle = useAppStore((s) => s.settings.ndiRefStyle)
  const ndiRefPosition = useAppStore((s) => s.settings.ndiRefPosition)
  const ndiRefScale = useAppStore((s) => s.settings.ndiRefScale)
  const ndiTranslation = useAppStore((s) => s.settings.ndiTranslation)

  const ndiHasOverrides =
    ndiFontFamily !== undefined ||
    ndiFontSize !== undefined ||
    ndiTextShadow !== undefined ||
    ndiTextAlign !== undefined ||
    ndiTextScale !== undefined ||
    ndiAspectRatio !== undefined ||
    ndiBibleColor !== undefined ||
    ndiBibleLineHeight !== undefined ||
    ndiRefSize !== undefined ||
    ndiRefStyle !== undefined ||
    ndiRefPosition !== undefined ||
    ndiRefScale !== undefined ||
    ndiTranslation !== undefined

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
          fps: 60,
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

  const handleResetAllOverrides = () => {
    updateSettings({
      ndiFontFamily: undefined,
      ndiFontSize: undefined,
      ndiTextShadow: undefined,
      ndiTextAlign: undefined,
      ndiTextScale: undefined,
      ndiAspectRatio: undefined,
      ndiBibleColor: undefined,
      ndiBibleLineHeight: undefined,
      ndiRefSize: undefined,
      ndiRefStyle: undefined,
      ndiRefPosition: undefined,
      ndiRefScale: undefined,
      ndiTranslation: undefined,
    })
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

      <CardContent>
        {/* v0.6.0 two-column layout. lg breakpoint = side-by-side;
            below that the controls stack on top of a smaller preview. */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
          {/* ── LEFT COLUMN — controls (always visible) ─────────────── */}
          <div className="space-y-4">
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

            {/* Status + open window */}
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground px-1">
              <div className="flex items-center gap-2">
                {isRunning ? (
                  <>
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    Broadcasting · 1080p60 · {status?.frameCount.toLocaleString() || 0} frames sent
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

            {/* Audio guidance */}
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-[11px] text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Audio:</strong> NDI carries the
              slide visuals only. Route your microphones, music, and video
              playback audio through your existing AV mixer (vMix audio in,
              Wirecast audio source, OBS audio bus) — that&apos;s what keeps
              audio sync rock solid in a live service.
            </div>

            {/* Source name */}
            <div className="rounded-md border border-border bg-muted/10 p-3 space-y-1.5">
              <label className="text-[11px] font-semibold text-foreground">NDI source name</label>
              <input
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value.slice(0, 60))}
                disabled={isRunning}
                className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs disabled:opacity-50"
                placeholder="ScriptureLive AI"
              />
              <p className="text-[10px] text-muted-foreground leading-snug">
                How the source appears in vMix / OBS / NDI Studio Monitor.
                Stop and restart the sender to apply a name change.
              </p>
            </div>

            {/* NDI Display Mode */}
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

              {/* v0.6.3 — Transparent lower-third toggle. Only meaningful
                  when the NDI Display Mode above is set to Lower Third.
                  When ON: vMix / OBS receive a clean alpha matte (text
                  only, no card fill) so they can key the bar over their
                  own program output without a black box around the
                  letters. The in-room projector stays untouched. */}
              {ndiDisplayMode === 'lower-third' && (
                <div className="flex items-center justify-between gap-3 mt-2 pt-2 border-t border-border/40">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-foreground">Transparent lower-third</div>
                    <p className="text-[10px] text-muted-foreground leading-snug">
                      Drops the lower-third card background so vMix / OBS get a clean alpha matte. Text stays opaque.
                    </p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={settings.ndiLowerThirdTransparent === true}
                    onClick={() => updateSettings({
                      ndiLowerThirdTransparent: !settings.ndiLowerThirdTransparent,
                    })}
                    className={cn(
                      'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
                      settings.ndiLowerThirdTransparent
                        ? 'bg-emerald-500/80'
                        : 'bg-muted-foreground/30',
                    )}
                  >
                    <span
                      className={cn(
                        'inline-block h-5 w-5 transform rounded-full bg-background shadow transition-transform',
                        settings.ndiLowerThirdTransparent ? 'translate-x-5' : 'translate-x-0.5',
                      )}
                    />
                  </button>
                </div>
              )}
            </div>

            {/* NDI Typography (always visible — no more Advanced) */}
            <div className="rounded-md border border-border bg-muted/10 p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] font-semibold text-foreground">NDI Typography</div>
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    Independent of Live Display. Leave a control on &ldquo;Mirror Live&rdquo; to inherit.
                  </p>
                </div>
                {ndiHasOverrides && (
                  <button
                    onClick={handleResetAllOverrides}
                    className="text-[10px] text-muted-foreground hover:text-foreground underline"
                  >
                    Reset all
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Font</label>
                  <select
                    value={ndiFontFamily ?? '__inherit__'}
                    onChange={(e) => {
                      const v = e.target.value
                      updateSettings({ ndiFontFamily: v === '__inherit__' ? undefined : v })
                    }}
                    className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs"
                  >
                    <option value="__inherit__">Mirror Live ({liveFontFamily})</option>
                    <option value="sans">Sans-serif</option>
                    <option value="serif">Serif</option>
                    <option value="mono">Monospace</option>
                    <option value="playfair">Playfair</option>
                    <option value="merriweather">Merriweather</option>
                    <option value="lora">Lora</option>
                    <option value="inter">Inter</option>
                    <option value="poppins">Poppins</option>
                    <option value="roboto">Roboto</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Size</label>
                  <select
                    value={ndiFontSize ?? '__inherit__'}
                    onChange={(e) => {
                      const v = e.target.value
                      updateSettings({ ndiFontSize: v === '__inherit__' ? undefined : (v as 'sm' | 'md' | 'lg' | 'xl') })
                    }}
                    className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs"
                  >
                    <option value="__inherit__">Mirror Live ({liveFontSize})</option>
                    <option value="sm">Small</option>
                    <option value="md">Medium</option>
                    <option value="lg">Large</option>
                    <option value="xl">Extra Large</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Drop shadow</label>
                  <select
                    value={ndiTextShadow === undefined ? '__inherit__' : ndiTextShadow ? 'on' : 'off'}
                    onChange={(e) => {
                      const v = e.target.value
                      updateSettings({
                        ndiTextShadow: v === '__inherit__' ? undefined : v === 'on',
                      })
                    }}
                    className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs"
                  >
                    <option value="__inherit__">Mirror Live ({liveTextShadow ? 'On' : 'Off'})</option>
                    <option value="on">On</option>
                    <option value="off">Off</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Align</label>
                  <select
                    value={ndiTextAlign ?? '__inherit__'}
                    onChange={(e) => {
                      const v = e.target.value
                      updateSettings({
                        ndiTextAlign: v === '__inherit__' ? undefined : (v as 'left' | 'center' | 'right' | 'justify'),
                      })
                    }}
                    className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs"
                  >
                    <option value="__inherit__">Mirror Live ({liveTextAlign})</option>
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                    <option value="justify">Justify</option>
                  </select>
                </div>
              </div>
            </div>

            {/* NDI Layout & Bible Body */}
            <div className="rounded-md border border-border bg-muted/10 p-3 space-y-3">
              <div className="text-[11px] font-semibold text-foreground">NDI Layout &amp; Bible Body</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Aspect ratio</label>
                  <select
                    value={ndiAspectRatio ?? '__inherit__'}
                    onChange={(e) => {
                      const v = e.target.value
                      updateSettings({
                        ndiAspectRatio: v === '__inherit__' ? undefined : (v as 'auto' | '16:9' | '4:3' | '21:9'),
                      })
                    }}
                    className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs"
                  >
                    <option value="__inherit__">Mirror Live</option>
                    <option value="auto">Auto (fill)</option>
                    <option value="16:9">16:9</option>
                    <option value="4:3">4:3</option>
                    <option value="21:9">21:9</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Bible color</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={ndiBibleColor ?? '#ffffff'}
                      onChange={(e) => updateSettings({ ndiBibleColor: e.target.value })}
                      className="h-8 w-10 rounded-md border border-border bg-background cursor-pointer"
                    />
                    <input
                      type="text"
                      value={ndiBibleColor ?? ''}
                      placeholder="(mirror Live)"
                      onChange={(e) => {
                        const v = e.target.value.trim()
                        updateSettings({ ndiBibleColor: v.length === 0 ? undefined : v })
                      }}
                      className="flex-1 h-8 rounded-md border border-border bg-background px-2 text-xs font-mono"
                    />
                  </div>
                </div>
                <div className="space-y-1 col-span-2">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                    <span>Bible line-height ({ndiBibleLineHeight?.toFixed(2) ?? 'mirror Live'})</span>
                    {ndiBibleLineHeight !== undefined && (
                      <button
                        onClick={() => updateSettings({ ndiBibleLineHeight: undefined })}
                        className="text-[9px] text-muted-foreground hover:text-foreground underline"
                      >
                        clear
                      </button>
                    )}
                  </label>
                  <input
                    type="range"
                    min="0.9"
                    max="2.5"
                    step="0.05"
                    value={ndiBibleLineHeight ?? 1.4}
                    onChange={(e) => updateSettings({ ndiBibleLineHeight: parseFloat(e.target.value) })}
                    className="w-full accent-emerald-500"
                  />
                </div>
                <div className="space-y-1 col-span-2">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                    <span>Bible text scale ({ndiTextScale?.toFixed(2) ?? 'mirror Live'})</span>
                    {ndiTextScale !== undefined && (
                      <button
                        onClick={() => updateSettings({ ndiTextScale: undefined })}
                        className="text-[9px] text-muted-foreground hover:text-foreground underline"
                      >
                        clear
                      </button>
                    )}
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.05"
                    value={ndiTextScale ?? 1}
                    onChange={(e) => updateSettings({ ndiTextScale: parseFloat(e.target.value) })}
                    className="w-full accent-emerald-500"
                  />
                </div>
              </div>
            </div>

            {/* NDI Reference Label */}
            <div className="rounded-md border border-border bg-muted/10 p-3 space-y-3">
              <div className="text-[11px] font-semibold text-foreground">NDI Reference Label</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Size</label>
                  <select
                    value={ndiRefSize ?? '__inherit__'}
                    onChange={(e) => {
                      const v = e.target.value
                      updateSettings({ ndiRefSize: v === '__inherit__' ? undefined : (v as 'sm' | 'md' | 'lg' | 'xl') })
                    }}
                    className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs"
                  >
                    <option value="__inherit__">Mirror Live</option>
                    <option value="sm">Small</option>
                    <option value="md">Medium</option>
                    <option value="lg">Large</option>
                    <option value="xl">Extra Large</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Style</label>
                  <select
                    value={ndiRefStyle ?? '__inherit__'}
                    onChange={(e) => {
                      const v = e.target.value
                      updateSettings({ ndiRefStyle: v === '__inherit__' ? undefined : (v as 'normal' | 'italic') })
                    }}
                    className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs"
                  >
                    <option value="__inherit__">Mirror Live</option>
                    <option value="normal">Normal</option>
                    <option value="italic">Italic</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Position</label>
                  <select
                    value={ndiRefPosition ?? '__inherit__'}
                    onChange={(e) => {
                      const v = e.target.value
                      updateSettings({
                        ndiRefPosition: v === '__inherit__' ? undefined : (v as 'top' | 'bottom' | 'hidden'),
                      })
                    }}
                    className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs"
                  >
                    <option value="__inherit__">Mirror Live (top)</option>
                    <option value="top">Top</option>
                    <option value="bottom">Bottom</option>
                    <option value="hidden">Hidden</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                    <span>Scale ({ndiRefScale?.toFixed(2) ?? 'mirror'})</span>
                    {ndiRefScale !== undefined && (
                      <button
                        onClick={() => updateSettings({ ndiRefScale: undefined })}
                        className="text-[9px] text-muted-foreground hover:text-foreground underline"
                      >
                        clear
                      </button>
                    )}
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="2"
                    step="0.05"
                    value={ndiRefScale ?? 1}
                    onChange={(e) => updateSettings({ ndiRefScale: parseFloat(e.target.value) })}
                    className="w-full accent-emerald-500"
                  />
                </div>
              </div>
            </div>

            {/* NDI Translation */}
            <div className="rounded-md border border-border bg-muted/10 p-3 space-y-2">
              <div className="text-[11px] font-semibold text-foreground">NDI Translation</div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Translation override</label>
                <input
                  type="text"
                  value={ndiTranslation ?? ''}
                  placeholder={`Mirror Live (${liveTranslation || 'KJV'})`}
                  onChange={(e) => {
                    const v = e.target.value.trim()
                    updateSettings({ ndiTranslation: v.length === 0 ? undefined : v })
                  }}
                  className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs font-mono uppercase"
                />
                <p className="text-[10px] text-muted-foreground leading-snug">
                  Leave blank to use the same translation the operator picked in
                  the Bible search panel.
                </p>
              </div>
            </div>

          </div>

          {/* ── RIGHT COLUMN — sticky compact preview ──────────────── */}
          <div className="lg:sticky lg:top-2 self-start lg:order-last">
            <div className="rounded-md border border-border bg-black overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b border-border bg-muted/30">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">NDI live preview</div>
                <div className="text-[10px] text-muted-foreground/70 hidden sm:block">vMix / OBS view</div>
              </div>
              <div className="relative w-full" style={{ aspectRatio: '16 / 9' }}>
                <iframe
                  src="/api/output/congregation?ndi=1"
                  title="NDI Live Preview"
                  className="absolute inset-0 w-full h-full border-0"
                />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground/80 mt-1.5 px-1 leading-snug">
              Mirrors what vMix / OBS sees. Every change in the controls
              shows up here on the next broadcast tick.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
