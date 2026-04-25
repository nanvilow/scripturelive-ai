'use client'

import { useState, useRef, useEffect } from 'react'
import { useAppStore, type AppSettings, type BibleTranslation, type DisplayMode, type OutputDestination } from '@/lib/store'
import { BibleOfflineDownloads } from '@/components/settings/bible-downloads'
import { TRANSLATIONS_INFO } from '@/lib/bible-api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Upload,
  X,
  Image as ImageIcon,
  Monitor,
  Wifi,
  Mic,
  Type,
  Eye,
  EyeOff,
  Trash2,
  Check,
  RotateCcw,
  Layers,
  Download,
  BookOpen,
  Zap,
  MonitorSpeaker,
  Copy,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  HelpCircle,
  ExternalLink,
  RefreshCcw,
  Power,
  Radio,
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { NdiOutputPanel } from './ndi-output-panel'
import { StartupCard } from './startup-card'
import { OutputPreview } from '@/components/settings/output-preview'
import { FONT_REGISTRY } from '@/lib/fonts'
import { quickStartUrl, troubleshootingUrl, newIssueUrl } from '@/lib/github-repo'
import { useNdi } from '@/lib/use-electron'

export function SettingsView() {
  const { settings, updateSettings, setSelectedTranslation } = useAppStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  // Resolve absolute URL on the client after hydration to avoid a server/client
  // mismatch (the server has no window.location.origin).
  const [congregationOutputUrl, setCongregationOutputUrl] = useState('/api/output/congregation')
  useEffect(() => {
    setCongregationOutputUrl(
      new URL('/api/output/congregation', window.location.origin).toString()
    )
  }, [])

  const handleUploadBackground = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    try {
      // Stream the file as a raw body — see /api/upload (it supports
      // up to 3 GB this way and never buffers the whole upload).
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'X-Filename': file.name,
          'X-File-Size': String(file.size),
        },
        body: file,
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Upload failed')
      }

      const data = await response.json()
      updateSettings({ customBackground: data.url })
      toast.success('Background uploaded successfully')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload background')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removeBackground = () => {
    updateSettings({ customBackground: null })
    toast.success('Background removed')
  }

  const resetSettings = () => {
    updateSettings({
      defaultTranslation: 'KJV',
      displayMode: 'full',
      outputDestination: 'window',
      customBackground: null,
      lowerThirdPosition: 'bottom',
      lowerThirdHeight: 'md',
      autoAdvanceSlides: false,
      slideTransitionDuration: 500,
      slideTransitionStyle: 'fade',
      fontFamily: 'sans',
      fontSize: 'lg',
      textShadow: true,
      showReferenceOnOutput: true,
      congregationScreenTheme: 'minimal',
      speechLanguage: 'en-US',
      autoGoLiveOnDetection: false,
      autoGoLiveOnLookup: false,
      displayRatio: 'fill',
      textScale: 1,
      // Reset the NDI-only display mode alongside the projector's so
      // the "Reset to defaults" button returns the feed to a clean
      // Full Screen state (v0.5.5 additions).
      ndiDisplayMode: 'full',
      // Reference typography overrides (Bug #5): clearing these to
      // undefined re-couples the reference label to the body
      // typography defaults above — matching a fresh install.
      referenceFontFamily: undefined,
      referenceFontSize: undefined,
      referenceTextShadow: undefined,
      referenceTextScale: undefined,
      referenceTextAlign: undefined,
    })
    setSelectedTranslation('KJV')
    toast.success('Settings reset to defaults')
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-4xl space-y-6">
      {/* Modernised header — gradient hero card with logo + reset action,
          matching the polished look of the rest of the live console. */}
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-primary/10 via-background to-violet-500/10 px-5 py-5 md:px-7 md:py-6">
        <div className="absolute inset-0 pointer-events-none opacity-40 [background-image:radial-gradient(circle_at_top_right,rgba(99,102,241,.18),transparent_60%)]" />
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <div className="h-11 w-11 rounded-full bg-white flex items-center justify-center overflow-hidden shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="" className="h-full w-full object-contain" />
            </div>
            <div className="leading-tight">
              <h2 className="text-2xl font-bold text-foreground tracking-tight">Settings</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Tune Bible defaults, output mode, theming, and live presentation behavior.
              </p>
              <p className="text-[11px] text-muted-foreground/70 mt-1">
                Powered by WassMedia (+233246798526)
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={resetSettings}
            className="gap-1.5 self-start md:self-auto"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to defaults
          </Button>
        </div>
      </div>

      {/* Bible Settings */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Bible Settings</CardTitle>
              <CardDescription>Default translation and display options</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Default Bible Translation</Label>
            <Select
              value={settings.defaultTranslation}
              onValueChange={(v) => {
                updateSettings({ defaultTranslation: v as BibleTranslation })
                setSelectedTranslation(v)
              }}
            >
              <SelectTrigger className="bg-card border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TRANSLATIONS_INFO).map(([key, info]) => (
                  <SelectItem key={key} value={key}>
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{info.name}</span>
                      <span className="text-muted-foreground text-xs">— {info.full}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Show Reference on Output Screen</Label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => updateSettings({ showReferenceOnOutput: true })}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-colors border',
                  settings.showReferenceOnOutput
                    ? 'bg-primary/15 border-primary/30 text-primary'
                    : 'bg-muted border-border text-muted-foreground hover:bg-muted/80'
                )}
              >
                <Check className="h-3 w-3 inline mr-1" />
                Show
              </button>
              <button
                onClick={() => updateSettings({ showReferenceOnOutput: false })}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-colors border',
                  !settings.showReferenceOnOutput
                    ? 'bg-primary/15 border-primary/30 text-primary'
                    : 'bg-muted border-border text-muted-foreground hover:bg-muted/80'
                )}
              >
                Hide
              </button>
            </div>
          </div>

          {/* Item #15 follow-up — toggle for the full-screen
              "Reconnecting…" overlay on the secondary screen. Off by
              default for clean stage projection; flip on when
              troubleshooting a flaky network so a real outage isn't
              silent. */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Show "Reconnecting…" overlay on secondary screen</Label>
            <p className="text-[11px] text-muted-foreground -mt-1">
              When the link to the second screen drops, paint a full-screen "Reconnecting…" message instead of freezing on the last frame. Leave off for a clean stage projection during services.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => updateSettings({ showReconnectingOverlay: true })}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-colors border',
                  settings.showReconnectingOverlay
                    ? 'bg-primary/15 border-primary/30 text-primary'
                    : 'bg-muted border-border text-muted-foreground hover:bg-muted/80'
                )}
              >
                <Check className="h-3 w-3 inline mr-1" />
                Show
              </button>
              <button
                onClick={() => updateSettings({ showReconnectingOverlay: false })}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-colors border',
                  !settings.showReconnectingOverlay
                    ? 'bg-primary/15 border-primary/30 text-primary'
                    : 'bg-muted border-border text-muted-foreground hover:bg-muted/80'
                )}
              >
                Hide
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Display Settings */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Monitor className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Display & Output</CardTitle>
              <CardDescription>Configure output display mode and destination</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* WYSIWYG preview — mirrors the secondary screen / NDI feed
              so operators can see display-mode + position changes
              instantly without opening the projector. Updates live as
              they tweak any setting. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <OutputPreview mode="full" label="Preview (Full Screen)" />
            <OutputPreview mode="lower-third" label="Preview (Lower Third)" />
          </div>
          <Separator className="my-2" />
          <div className="space-y-2">
            <Label className="text-sm font-medium">Display Mode</Label>
            <div className="flex flex-wrap gap-2">
              {([
                { value: 'full' as DisplayMode, label: 'Full Screen', desc: 'Full slide display' },
                { value: 'lower-third' as DisplayMode, label: 'Lower Third', desc: 'Bottom bar overlay' },
                { value: 'lower-third-black' as DisplayMode, label: 'Lower Third (Black)', desc: 'Black bg overlay' },
              ]).map((mode) => (
                <button
                  key={mode.value}
                  onClick={() => updateSettings({ displayMode: mode.value })}
                  className={cn(
                    'flex flex-col items-start rounded-lg px-3 py-2.5 transition-colors border min-w-[140px]',
                    settings.displayMode === mode.value
                      ? 'bg-primary/10 border-primary/30'
                      : 'bg-muted/30 border-border hover:bg-muted/50'
                  )}
                >
                  <span className="text-xs font-medium">{mode.label}</span>
                  <span className="text-[10px] text-muted-foreground">{mode.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {settings.displayMode.startsWith('lower-third') && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Lower Third Position</Label>
              <div className="flex gap-2">
                {(['bottom', 'top'] as const).map((pos) => (
                  <button
                    key={pos}
                    onClick={() => updateSettings({ lowerThirdPosition: pos })}
                    className={cn(
                      'px-3 py-1.5 rounded-md text-xs font-medium transition-colors border capitalize',
                      settings.lowerThirdPosition === pos
                        ? 'bg-primary/15 border-primary/30 text-primary'
                        : 'bg-muted border-border text-muted-foreground hover:bg-muted/80'
                    )}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </div>
          )}

          {settings.displayMode.startsWith('lower-third') && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Lower Third Height</Label>
              <div className="flex gap-2">
                {([
                  { value: 'sm' as const, label: 'Small' },
                  { value: 'md' as const, label: 'Medium' },
                  { value: 'lg' as const, label: 'Large' },
                ]).map((h) => (
                  <button
                    key={h.value}
                    onClick={() => updateSettings({ lowerThirdHeight: h.value })}
                    className={cn(
                      'px-3 py-1.5 rounded-md text-xs font-medium transition-colors border',
                      settings.lowerThirdHeight === h.value
                        ? 'bg-primary/15 border-primary/30 text-primary'
                        : 'bg-muted border-border text-muted-foreground hover:bg-muted/80'
                    )}
                  >
                    {h.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Separator />

          <div className="space-y-2">
            <Label className="text-sm font-medium">Output Destination</Label>
            <div className="flex flex-wrap gap-2">
              {([
                { value: 'window' as OutputDestination, label: 'Window', desc: 'New browser window', icon: <Monitor className="h-3.5 w-3.5" /> },
                { value: 'ndi' as OutputDestination, label: 'NDI / Wireless', desc: 'Share display wirelessly', icon: <Wifi className="h-3.5 w-3.5" /> },
                { value: 'both' as OutputDestination, label: 'Both', desc: 'Window + wireless', icon: <Layers className="h-3.5 w-3.5" /> },
              ]).map((dest) => (
                <button
                  key={dest.value}
                  onClick={() => updateSettings({ outputDestination: dest.value })}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2.5 transition-colors border min-w-[140px]',
                    settings.outputDestination === dest.value
                      ? 'bg-primary/10 border-primary/30'
                      : 'bg-muted/30 border-border hover:bg-muted/50'
                  )}
                >
                  {dest.icon}
                  <div className="text-left">
                    <span className="text-xs font-medium block">{dest.label}</span>
                    <span className="text-[10px] text-muted-foreground">{dest.desc}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <Separator />

          {/* ── Secondary screen sizing — operator-facing ratio picker
              that the congregation display honors instantly. */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Secondary Screen Ratio</Label>
            <div className="flex flex-wrap gap-2">
              {([
                { value: 'fill' as const, label: 'Fill Screen', desc: 'Use full window' },
                { value: '16:9' as const, label: '16:9', desc: 'Broadcast / NDI' },
                { value: '4:3' as const, label: '4:3', desc: 'Legacy projector' },
                { value: '21:9' as const, label: '21:9', desc: 'Ultrawide stage' },
              ]).map((r) => (
                <button
                  key={r.value}
                  onClick={() => updateSettings({ displayRatio: r.value })}
                  className={cn(
                    'flex flex-col items-start rounded-lg px-3 py-2.5 transition-colors border min-w-[130px]',
                    settings.displayRatio === r.value
                      ? 'bg-primary/10 border-primary/30'
                      : 'bg-muted/30 border-border hover:bg-muted/50'
                  )}
                >
                  <span className="text-xs font-medium">{r.label}</span>
                  <span className="text-[10px] text-muted-foreground">{r.desc}</span>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">
              Applied to the secondary screen instantly — no refresh needed.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center justify-between">
              <span>Text Size on Secondary Screen</span>
              <span className="text-[11px] font-mono text-primary">
                {Math.round((settings.textScale ?? 1) * 100)}%
              </span>
            </Label>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              value={settings.textScale ?? 1}
              onChange={(e) => updateSettings({ textScale: parseFloat(e.target.value) })}
              className="w-full h-2 rounded-full bg-muted accent-primary cursor-pointer"
            />
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <button
                onClick={() => updateSettings({ textScale: 0.75 })}
                className="hover:text-foreground transition-colors"
              >
                Smaller
              </button>
              <button
                onClick={() => updateSettings({ textScale: 1 })}
                className="hover:text-foreground transition-colors"
              >
                100%
              </button>
              <button
                onClick={() => updateSettings({ textScale: 1.5 })}
                className="hover:text-foreground transition-colors"
              >
                Larger
              </button>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label className="text-sm font-medium">Congregation Screen Theme</Label>
            <div className="flex flex-wrap gap-2">
              {['minimal', 'worship', 'sermon', 'easter', 'christmas', 'praise'].map((theme) => (
                <button
                  key={theme}
                  onClick={() => updateSettings({ congregationScreenTheme: theme })}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-xs font-medium transition-colors border capitalize',
                    settings.congregationScreenTheme === theme
                      ? 'bg-primary/15 border-primary/30 text-primary'
                      : 'bg-muted border-border text-muted-foreground hover:bg-muted/80'
                  )}
                >
                  {theme}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Native NDI (desktop app) */}
      <NdiOutputPanel />

      {/* Setup guide intentionally removed — NDI is one-click via the
          panel above. No external NDI Tools install or browser
          screen-capture step is needed in the desktop app. */}
      {false && (
      <Card className="bg-card border-border hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <MonitorSpeaker className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">NDI / vMix / Wirecast Output Guide</CardTitle>
              <CardDescription>How to send live output to your production software</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center">1</div>
              <div>
                <p className="text-sm font-medium">Start the Output Service</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Go to <strong>Live Presenter</strong> and click the <strong>Output</strong> button. Or set the Output Destination to &quot;NDI / Wireless&quot; or &quot;Both&quot; above.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center">2</div>
              <div className="flex-1">
                <p className="text-sm font-medium">Open the Congregation Display</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Open this URL in a browser (it receives live updates via SSE, no extra service needed):
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <code className="flex-1 px-2 py-1.5 rounded bg-muted text-[10px] font-mono truncate block">
                    {congregationOutputUrl}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px] gap-1 shrink-0"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(congregationOutputUrl)
                        toast.success('URL copied!')
                      } catch {
                        toast.error('Failed to copy')
                      }
                    }}
                  >
                    <Copy className="h-3 w-3" /> Copy
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Make this browser window fullscreen (F11). This is what will be captured as NDI.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center">3</div>
              <div>
                <p className="text-sm font-medium">Install NDI Tools (Free)</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Download and install <strong>NDI Tools</strong> from{' '}
                  <a href="https://ndi.video/tools/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    ndi.video/tools
                  </a>. This includes &quot;NDI Screen Capture&quot; which captures any window as an NDI source.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center">4</div>
              <div>
                <p className="text-sm font-medium">Capture the Browser Window as NDI</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Open <strong>NDI Screen Capture</strong>, select the congregation browser window from the list. It will appear as an NDI source named &quot;Screen Capture&quot; or similar.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-bold flex items-center justify-center">5</div>
              <div>
                <p className="text-sm font-medium">Add NDI Source in vMix / Wirecast</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  In <strong>vMix</strong>: Add Input → NDI → select &quot;Screen Capture&quot; from the list.<br />
                  In <strong>Wirecast</strong>: Add Source → NDI → select the screen capture source.<br />
                  The live slides will now appear in your production!
                </p>
              </div>
            </div>
          </div>

          <Separator />

          <Card className="bg-blue-500/5 border-blue-500/20">
            <CardContent className="p-3 flex items-start gap-2">
              <Eye className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-300/80 leading-relaxed">
                <strong>Troubleshooting:</strong> If the NDI source doesn&apos;t appear, make sure the congregation browser window is visible and fullscreen. NDI Screen Capture captures visible displays/windows. The output uses Server-Sent Events (SSE), so no separate WebSocket service or extra port is needed.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-amber-500/5 border-amber-500/20">
            <CardContent className="p-3 flex items-start gap-2">
              <Wifi className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-300/80 leading-relaxed">
                <strong>Wireless display:</strong> Open the congregation URL on any browser that can reach this app, then capture that screen with NDI Tools, AirPlay, Chromecast, OBS, vMix, or Wirecast. For a private local network install, use your machine&apos;s local IP plus <code className="bg-amber-500/20 px-1 rounded">/api/output/congregation</code>.
              </p>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
      )}

      {/* Appearance Settings — controls on the left, live typography
          preview on the right (per the spec: the preview lives next to
          the controls so operators can iterate without leaving the
          card). On narrow screens the preview drops below the controls. */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Type className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Typography & Appearance</CardTitle>
              <CardDescription>Font size, style, and text effects</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Font Size on Output</Label>
            <div className="flex gap-2">
              {([
                { value: 'sm' as const, label: 'Small' },
                { value: 'md' as const, label: 'Medium' },
                { value: 'lg' as const, label: 'Large' },
                { value: 'xl' as const, label: 'Extra Large' },
              ]).map((s) => (
                <button
                  key={s.value}
                  onClick={() => updateSettings({ fontSize: s.value })}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-xs font-medium transition-colors border',
                    settings.fontSize === s.value
                      ? 'bg-primary/15 border-primary/30 text-primary'
                      : 'bg-muted border-border text-muted-foreground hover:bg-muted/80'
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Text Alignment ─────────────────────────────────────
              Operators asked for the same left / center / right /
              justify control they have in EasyWorship. Selection is
              broadcast to the secondary screen + NDI in real time. */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Text Alignment</Label>
            <div className="flex gap-1.5 p-1 rounded-md bg-muted w-fit border border-border">
              {([
                { value: 'left' as const, Icon: AlignLeft, label: 'Align left' },
                { value: 'center' as const, Icon: AlignCenter, label: 'Align center' },
                { value: 'right' as const, Icon: AlignRight, label: 'Align right' },
                { value: 'justify' as const, Icon: AlignJustify, label: 'Justify' },
              ]).map(({ value, Icon, label }) => {
                const active = (settings.textAlign ?? 'center') === value
                return (
                  <button
                    key={value}
                    title={label}
                    aria-label={label}
                    onClick={() => updateSettings({ textAlign: value })}
                    className={cn(
                      'h-8 w-9 inline-flex items-center justify-center rounded transition-colors border',
                      active
                        ? 'bg-amber-500/20 border-amber-500/50 text-amber-200'
                        : 'bg-transparent border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Text Shadow Effect</Label>
            <button
              onClick={() => updateSettings({ textShadow: !settings.textShadow })}
              className={cn(
                'w-10 h-5 rounded-full transition-colors relative',
                settings.textShadow ? 'bg-primary' : 'bg-muted'
              )}
            >
              <div className={cn(
                'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm',
                settings.textShadow ? 'left-5.5' : 'left-0.5'
              )} />
            </button>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Font Family</Label>
            <Select
              value={settings.fontFamily}
              onValueChange={(v) => updateSettings({ fontFamily: v })}
            >
              <SelectTrigger className="bg-card border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['Sans-serif', 'Serif', 'Display', 'Monospace'] as const).map((group) => {
                  const items = FONT_REGISTRY.filter((f) => f.group === group)
                  if (!items.length) return null
                  return (
                    <SelectGroup key={group}>
                      <SelectLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
                        {group}
                      </SelectLabel>
                      {items.map((f) => (
                        <SelectItem key={f.key} value={f.key}>
                          <span style={{ fontFamily: f.stack }}>{f.label}</span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )
                })}
              </SelectContent>
            </Select>
          </div>

          {/* ── Reference Text (Bug #5) ───────────────────────────
              Independent typography controls for the verse reference
              label (e.g. "John 3:16"). Each control reads the
              effective value (reference override OR body fallback)
              so existing operators see no visual change until they
              explicitly customise the reference style. */}
          <div className="pt-2 mt-2 border-t border-border space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Reference Text</Label>
              {(settings.referenceFontFamily !== undefined ||
                settings.referenceFontSize !== undefined ||
                settings.referenceTextShadow !== undefined ||
                settings.referenceTextScale !== undefined ||
                settings.referenceTextAlign !== undefined) && (
                <button
                  onClick={() =>
                    updateSettings({
                      referenceFontFamily: undefined,
                      referenceFontSize: undefined,
                      referenceTextShadow: undefined,
                      referenceTextScale: undefined,
                      referenceTextAlign: undefined,
                    })
                  }
                  className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                  title="Reset reference text to follow body settings"
                >
                  Reset to body
                </button>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Reference Font Size</Label>
              <div className="flex gap-2">
                {([
                  { value: 'sm' as const, label: 'Small' },
                  { value: 'md' as const, label: 'Medium' },
                  { value: 'lg' as const, label: 'Large' },
                  { value: 'xl' as const, label: 'Extra Large' },
                ]).map((s) => {
                  const active =
                    (settings.referenceFontSize ?? settings.fontSize) === s.value
                  return (
                    <button
                      key={s.value}
                      onClick={() => updateSettings({ referenceFontSize: s.value })}
                      className={cn(
                        'px-3 py-1.5 rounded-md text-xs font-medium transition-colors border',
                        active
                          ? 'bg-primary/15 border-primary/30 text-primary'
                          : 'bg-muted border-border text-muted-foreground hover:bg-muted/80',
                      )}
                    >
                      {s.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center justify-between">
                <span>Reference Text Scale</span>
                <span className="text-[11px] font-mono text-primary">
                  {Math.round((settings.referenceTextScale ?? settings.textScale ?? 1) * 100)}%
                </span>
              </Label>
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.05}
                value={settings.referenceTextScale ?? settings.textScale ?? 1}
                onChange={(e) =>
                  updateSettings({ referenceTextScale: parseFloat(e.target.value) })
                }
                className="w-full h-2 rounded-full bg-muted accent-primary cursor-pointer"
              />
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <button
                  onClick={() => updateSettings({ referenceTextScale: 0.75 })}
                  className="hover:text-foreground transition-colors"
                >
                  Smaller
                </button>
                <button
                  onClick={() => updateSettings({ referenceTextScale: 1 })}
                  className="hover:text-foreground transition-colors"
                >
                  100%
                </button>
                <button
                  onClick={() => updateSettings({ referenceTextScale: 1.5 })}
                  className="hover:text-foreground transition-colors"
                >
                  Larger
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Reference Alignment</Label>
              <div className="flex gap-1.5 p-1 rounded-md bg-muted w-fit border border-border">
                {([
                  { value: 'left' as const, Icon: AlignLeft, label: 'Align left' },
                  { value: 'center' as const, Icon: AlignCenter, label: 'Align center' },
                  { value: 'right' as const, Icon: AlignRight, label: 'Align right' },
                  { value: 'justify' as const, Icon: AlignJustify, label: 'Justify' },
                ]).map(({ value, Icon, label }) => {
                  const active =
                    (settings.referenceTextAlign ?? settings.textAlign ?? 'center') === value
                  return (
                    <button
                      key={value}
                      title={label}
                      aria-label={`Reference ${label.toLowerCase()}`}
                      onClick={() => updateSettings({ referenceTextAlign: value })}
                      className={cn(
                        'h-8 w-9 inline-flex items-center justify-center rounded transition-colors border',
                        active
                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-200'
                          : 'bg-transparent border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Reference Text Shadow</Label>
              <button
                onClick={() =>
                  updateSettings({
                    referenceTextShadow: !(settings.referenceTextShadow ?? settings.textShadow),
                  })
                }
                className={cn(
                  'w-10 h-5 rounded-full transition-colors relative',
                  (settings.referenceTextShadow ?? settings.textShadow) ? 'bg-primary' : 'bg-muted',
                )}
              >
                <div
                  className={cn(
                    'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm',
                    (settings.referenceTextShadow ?? settings.textShadow) ? 'left-5.5' : 'left-0.5',
                  )}
                />
              </button>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Reference Font Family</Label>
              <Select
                value={settings.referenceFontFamily ?? settings.fontFamily}
                onValueChange={(v) => updateSettings({ referenceFontFamily: v })}
              >
                <SelectTrigger className="bg-card border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['Sans-serif', 'Serif', 'Display', 'Monospace'] as const).map((group) => {
                    const items = FONT_REGISTRY.filter((f) => f.group === group)
                    if (!items.length) return null
                    return (
                      <SelectGroup key={group}>
                        <SelectLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
                          {group}
                        </SelectLabel>
                        {items.map((f) => (
                          <SelectItem key={f.key} value={f.key}>
                            <span style={{ fontFamily: f.stack }}>{f.label}</span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          </div>

          {/* Right column — live typography preview that mirrors the
              broadcast renderer. Sticks to the top so it stays in
              view as the operator scrolls the controls on narrow
              viewports; on desktop the grid keeps it parallel. */}
          <div className="space-y-3 md:sticky md:top-2 self-start">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
              Preview (Typography)
            </div>
            <OutputPreview
              mode="full"
              sample={{
                reference: 'Romans 8:34',
                text:
                  'Who is he that condemneth? It is Christ that died, yea rather, that is risen again, who is even at the right hand of God, who also maketh intercession for us.',
              }}
            />
            <OutputPreview
              mode="lower-third"
              sample={{
                reference: 'John 3:16',
                text:
                  'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.',
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Background Upload */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Custom Background</CardTitle>
              <CardDescription>Upload a background image for Bible display and slides</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {settings.customBackground ? (
            <div className="space-y-3">
              {/* v0.5.4 T010 — Custom background preview was previously a
                  full-width 16:9 hero that dwarfed the Settings card.
                  Operators complained they had to scroll past it to reach
                  other controls. Capped to a compact 240px thumbnail so
                  it behaves like a confirmation chip rather than a banner. */}
              <div className="relative rounded-lg overflow-hidden border border-border aspect-video bg-muted max-w-[240px]">
                <img
                  src={settings.customBackground}
                  alt="Custom background"
                  className="w-full h-full object-cover"
                />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-1.5 right-1.5 h-6 w-6"
                  onClick={removeBackground}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">Active</Badge>
                <span className="text-xs text-muted-foreground truncate">{settings.customBackground}</span>
              </div>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border rounded-lg p-8 flex flex-col items-center justify-center cursor-pointer hover:border-primary/30 hover:bg-muted/30 transition-colors"
            >
              {isUploading ? (
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              ) : (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm font-medium text-foreground">Click to upload background</p>
                  <p className="text-xs text-muted-foreground mt-1">PNG, JPEG, or WebP (max 10MB)</p>
                </>
              )}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleUploadBackground}
            className="hidden"
          />
        </CardContent>
      </Card>

      {/* Speech Recognition — language only (engine is cloud-only,
          managed centrally — no per-operator key configuration). */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Mic className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Speech Recognition</CardTitle>
              <CardDescription>Live scripture detection — English, Bible-references-only</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label className="text-sm font-medium">Recognition Language</Label>
            <div className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2">
              <span className="text-sm">English</span>
              <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
                English-only
              </Badge>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
              Scripture detection is tuned for English Bible references and quotations.
              Multi-language support is planned for a future release.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Help & Updates */}
      <HelpAndUpdatesCard />

      {/* Startup (launch-at-login) — only meaningful in the desktop
          build; the card renders a disabled-with-explanation state in
          the browser preview rather than disappearing entirely so the
          settings page layout doesn't shift between contexts. */}
      <StartupCard />

      {/* Slide Settings */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Slide Transitions</CardTitle>
              <CardDescription>How slides change on the live output</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Transition Style</Label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { v: 'cut',  label: 'Cut',  hint: 'Instant swap' },
                { v: 'fade', label: 'Fade', hint: 'Smooth crossfade' },
              ] as const).map(opt => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => updateSettings({ slideTransitionStyle: opt.v })}
                  className={cn(
                    'rounded-md border px-3 py-2 text-left transition-colors',
                    (settings.slideTransitionStyle || 'fade') === opt.v
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:bg-muted/50'
                  )}
                >
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="text-[11px] text-muted-foreground">{opt.hint}</div>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Applies to the live output (secondary screen / NDI). Cut switches slides instantly; Fade crossfades over the duration below.
            </p>
          </div>

          <div className={cn('space-y-2', (settings.slideTransitionStyle || 'fade') === 'cut' && 'opacity-50 pointer-events-none')}>
            <Label className="text-sm font-medium">Fade Duration: {settings.slideTransitionDuration}ms</Label>
            <Input
              type="range"
              min={100}
              max={2000}
              step={50}
              value={settings.slideTransitionDuration}
              onChange={(e) => updateSettings({ slideTransitionDuration: parseInt(e.target.value) })}
              className="w-full"
            />
          </div>
        </CardContent>
      </Card>

      {/* Auto Go-Live Settings */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Auto Go-Live</CardTitle>
              <CardDescription>Automatically send verses to the live presenter</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Auto Go-Live on Scripture Detection</Label>
              <p className="text-xs text-muted-foreground mt-0.5">When a verse is detected during speech, automatically send it live</p>
            </div>
            <button
              onClick={() => updateSettings({ autoGoLiveOnDetection: !settings.autoGoLiveOnDetection })}
              className={cn(
                'w-10 h-5 rounded-full transition-colors relative shrink-0',
                settings.autoGoLiveOnDetection ? 'bg-primary' : 'bg-muted'
              )}
            >
              <div className={cn(
                'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm',
                settings.autoGoLiveOnDetection ? 'left-5.5' : 'left-0.5'
              )} />
            </button>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Auto Go-Live on Bible Lookup</Label>
              <p className="text-xs text-muted-foreground mt-0.5">When you look up a verse, automatically send it to the presenter</p>
            </div>
            <button
              onClick={() => updateSettings({ autoGoLiveOnLookup: !settings.autoGoLiveOnLookup })}
              className={cn(
                'w-10 h-5 rounded-full transition-colors relative shrink-0',
                settings.autoGoLiveOnLookup ? 'bg-primary' : 'bg-muted'
              )}
            >
              <div className={cn(
                'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm',
                settings.autoGoLiveOnLookup ? 'left-5.5' : 'left-0.5'
              )} />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Offline Bible translations — full-Bible cache for no-internet
          services. The old "Bible Download & Import" card was removed
          (operator feedback v0.5.x): the public-domain JSON links were
          confusing because they downloaded raw files the app didn't
          ingest, and the file-upload widget only flashed a toast — it
          never actually imported anything. The offline-translations
          panel below already covers the real use case (caching whole
          translations into the local DB), so the misleading card was
          replaced rather than fixed. */}
      <BibleOfflineDownloads />

      {/* Reset */}
      <div className="flex justify-end">
        <Button variant="outline" className="gap-2" onClick={resetSettings}>
          <RotateCcw className="h-4 w-4" />
          Reset All Settings
        </Button>
      </div>
    </div>
  )
}


// ──────────────────────────────────────────────────────────────────────
// HELP & UPDATES CARD
// ──────────────────────────────────────────────────────────────────────
// Surfaces three operator-grade affordances:
//   • App version (read from package.json baked in at build time)
//   • Check for updates (Electron auto-updater path; in browser we
//     just open the GitHub releases page)
//   • Help links — quickstart, troubleshooting, project repo
// Shape of the updater state broadcast by electron/updater.ts. Mirrors
// the UpdateState union exported from there + preload.ts. Kept inline
// to avoid a cross-package type import (settings.tsx is a renderer
// module that must compile in the browser too).
type UpdaterState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version: string }
  | { status: 'not-available'; version: string }
  | { status: 'downloading'; percent: number }
  | { status: 'downloaded'; version: string }
  | { status: 'error'; message: string }

type ScriptureLiveUpdaterBridge = {
  getInfo?: () => Promise<{ version?: string }>
  updater?: {
    getState?: () => Promise<UpdaterState>
    check?: () => Promise<UpdaterState>
    download?: () => Promise<{ ok: boolean; error?: string; alreadyInProgress?: boolean }>
    install?: () => Promise<{ ok: boolean; error?: string }>
    onState?: (cb: (s: UpdaterState) => void) => () => void
  }
  // Operator preference for the OS-level "Update ready to install"
  // toast. Lives on the same `scriptureLive` bridge as the updater
  // so the Help & Updates card can read/write it without pulling in
  // a second bridge type. Kept local to mirror preload.ts.
  desktopUpdateToast?: {
    get?: () => Promise<{ value: boolean }>
    set?: (value: boolean) => Promise<{ ok: boolean; error?: string; value: boolean }>
  }
}

// `StartupCard` is implemented in `./startup-card` so it can be
// mounted by the close-button E2E harness in isolation, without
// pulling in the rest of this file's tree (zustand store, bible
// downloads, NDI panel, fonts, etc.). Imported at the top of this
// module.

function HelpAndUpdatesCard() {
  const [checking, setChecking] = useState(false)
  // Installed version: trust the main process (app.getVersion()) over
  // any baked-in env var. The env var is unreliable in production
  // because Next builds don't see package.json at runtime when bundled
  // inside Electron. Falls back to env var, then to package version.
  const [appVersion, setAppVersion] = useState<string>(
    process.env.NEXT_PUBLIC_APP_VERSION || '0.5.6',
  )
  const [state, setState] = useState<UpdaterState>({ status: 'idle' })
  // Operator preference: pop a desktop notification when an update is
  // ready. `null` while we're still reading it from the main process
  // (or when running in a browser preview, where the bridge is
  // absent); the row renders disabled with an explanation in that
  // state, mirroring how launch-at-login behaves.
  const [desktopToastOn, setDesktopToastOn] = useState<boolean | null>(null)
  const [toastBusy, setToastBusy] = useState(false)
  const isElectron =
    typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent)
  // While NDI is on the air we hold update prompts (download / install)
  // because either button tears the running source off the air mid-
  // service. The check itself + background download still run, so the
  // operator just sees the prompt re-appear the moment they stop the
  // sender. Mirrors the same gating used by the floating UpdateBanner
  // — keeping both surfaces consistent.
  const { status: ndiStatus } = useNdi()
  const onAir = ndiStatus?.running === true

  // Pull the real installed version from the Electron main process and
  // seed the updater state so the card shows accurate info on first
  // paint — without forcing the user to click Check Now.
  useEffect(() => {
    if (!isElectron) return
    const bridge = (window as unknown as { scriptureLive?: ScriptureLiveUpdaterBridge })
      .scriptureLive
    if (!bridge) return
    let cancelled = false
    bridge.getInfo?.().then((info) => {
      if (!cancelled && info?.version) setAppVersion(info.version)
    }).catch(() => { /* ignore — fall back to baked-in version */ })
    bridge.updater?.getState?.().then((s) => {
      if (!cancelled && s) setState(s)
    }).catch(() => { /* ignore */ })
    // Hydrate the desktop-toast opt-out so the row renders with the
    // current persisted value instead of flashing the default. If the
    // bridge is missing or the call rejects we leave it as `null` so
    // the toggle stays disabled with the "checking…" copy.
    bridge.desktopUpdateToast?.get?.().then((res) => {
      if (!cancelled) setDesktopToastOn(res.value === true)
    }).catch(() => { /* ignore — row renders disabled */ })
    // Subscribe to background update-state pushes (the updater also
    // checks on a 4h interval and on launch). This keeps the card in
    // sync without polling.
    const off = bridge.updater?.onState?.((s) => { if (!cancelled) setState(s) })
    return () => {
      cancelled = true
      if (off) off()
    }
  }, [isElectron])

  const checkForUpdates = async () => {
    setChecking(true)
    // Optimistic: flip to 'checking' immediately so the operator sees
    // a loading state even before the IPC round-trip resolves.
    setState({ status: 'checking' })
    try {
      const bridge = (window as unknown as { scriptureLive?: ScriptureLiveUpdaterBridge })
        .scriptureLive
      const checkFn = bridge?.updater?.check
      if (isElectron && checkFn) {
        const r = await checkFn()
        setState(r)
        if (r.status === 'available') {
          // The "Update Available — Click To Download" popup is
          // surfaced by UpdateNotifier in response to the same
          // updater:state event, so we don't need a duplicate toast
          // here. Just nudge the operator to look at the popup.
          toast.message(`Update available: v${r.version}`, {
            description: 'See the popup in the corner — click Download to get it.',
            duration: 6000,
          })
        } else if (r.status === 'downloading') {
          toast.info('Update is already downloading…')
        } else if (r.status === 'downloaded') {
          toast.success(`Update v${r.version} ready — see the popup to restart & install.`)
        } else if (r.status === 'not-available') {
          toast.success(`You're on the latest version (v${appVersion}).`)
        } else if (r.status === 'checking') {
          toast.info('Already checking for updates…')
        } else if (r.status === 'error') {
          // No browser fallback button — the user wants this stay
          // entirely in-app. Show the friendly message and let the
          // operator try Check Now again when they have connectivity.
          toast.error(`Update check failed: ${r.message}`, { duration: 8000 })
        } else {
          toast.info('Update checks are only available in the installed desktop build.')
        }
      } else {
        // Browser preview — there's no installer to download, so just
        // tell the operator to install the desktop build.
        toast.info('Install the desktop build to receive automatic updates.')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Update check failed'
      setState({ status: 'error', message: msg })
      toast.error(msg, { duration: 8000 })
    } finally {
      setChecking(false)
    }
  }

  // One-click download from the Settings card itself, mirroring the
  // notifier popup. Used by the "Download Update" button that appears
  // when state.status === 'available'.
  const downloadUpdateNow = async () => {
    const bridge = (window as unknown as { scriptureLive?: ScriptureLiveUpdaterBridge })
      .scriptureLive
    const downloadFn = bridge?.updater?.download
    if (!downloadFn) return
    try {
      const r = await downloadFn()
      if (!r.ok) {
        toast.error(`Could not start download: ${r.error || 'unknown error'}`)
      }
      // Progress + completion toasts are handled by UpdateNotifier
      // via the updater:state channel — no need to duplicate here.
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Download failed')
    }
  }

  const handleDesktopToastToggle = async (next: boolean) => {
    const bridge = (window as unknown as { scriptureLive?: ScriptureLiveUpdaterBridge })
      .scriptureLive
    const setter = bridge?.desktopUpdateToast?.set
    if (!setter) return
    setToastBusy(true)
    try {
      const result = await setter(next)
      setDesktopToastOn(result.value === true)
      if (!result.ok) {
        toast.error(result.error ?? 'Failed to update notification preference.')
        return
      }
      toast.success(
        next
          ? 'A desktop notification will pop when an update is ready.'
          : 'Desktop update notifications turned off — the tray badge and in-app banner still appear.',
      )
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to update notification preference.',
      )
    } finally {
      setToastBusy(false)
    }
  }

  const installUpdateNow = async () => {
    const bridge = (window as unknown as { scriptureLive?: ScriptureLiveUpdaterBridge })
      .scriptureLive
    const installFn = bridge?.updater?.install
    if (!installFn) return
    const r = await installFn()
    if (!r.ok) toast.error(`Could not install: ${r.error || 'unknown error'}`)
  }

  // Human-readable status line shown under the version row. Single
  // source of truth so the card never disagrees with the toasts.
  const statusLine = (() => {
    if (!isElectron) {
      return 'Browser preview — install the desktop build to receive automatic updates.'
    }
    switch (state.status) {
      case 'available':
        return `Update available: v${state.version} (you have v${appVersion}). Click Download Update to get it.`
      case 'downloading':
        return `Downloading update… ${Math.max(0, Math.min(100, Math.round(state.percent || 0)))}%`
      case 'downloaded':
        return `Update v${state.version} ready — restart to install.`
      case 'not-available':
        return `You're on the latest version (v${appVersion}).`
      case 'checking':
        return 'Checking GitHub Releases…'
      case 'error':
        return `Last check failed: ${state.message}`
      case 'idle':
      default:
        return `Installed: v${appVersion}. Click Check Now to query GitHub Releases.`
    }
  })()

  // Pick the right primary action: when an update is downloaded we
  // surface "Restart & Install"; when one is available we surface
  // "Download Update"; when downloading we show progress; otherwise
  // we show "Check Now". This keeps every Updates action in-app —
  // there is no longer any button that opens a browser.
  const showInstall = state.status === 'downloaded'
  const showDownload = state.status === 'available'
  const isDownloading = state.status === 'downloading'
  const isAvailable = state.status === 'available' || state.status === 'downloading'
  const isCurrent = state.status === 'not-available'

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-primary" />
          <div>
            <CardTitle className="text-base">Help & Updates</CardTitle>
            <CardDescription>
              Version v{appVersion} {isElectron ? '· Desktop' : '· Browser'}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <Label className="text-sm font-medium">Check for Updates</Label>
            <p
              className={cn(
                'text-xs mt-0.5',
                state.status === 'error'
                  ? 'text-destructive'
                  : isAvailable || showInstall
                    ? 'text-primary'
                    : isCurrent
                      ? 'text-emerald-500'
                      : 'text-muted-foreground',
              )}
            >
              {statusLine}
            </p>
          </div>
          {showInstall ? (
            // Install tears down the running NDI sender, so we hold
            // the button while on-air and surface the reason via a
            // tooltip pointing at the badge below. The shared
            // `Tooltip` primitive already wraps in a TooltipProvider
            // internally — no need for a local one.
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={cn(onAir && 'cursor-not-allowed')}>
                  <Button
                    onClick={installUpdateNow}
                    disabled={onAir}
                    className="gap-2 shrink-0"
                    aria-describedby={onAir ? 'updates-onair-badge' : undefined}
                  >
                    <RefreshCcw className="h-4 w-4" />
                    Restart &amp; Install
                  </Button>
                </span>
              </TooltipTrigger>
              {onAir && (
                <TooltipContent>
                  On-air — stop the NDI sender, then click Restart &amp; Install.
                </TooltipContent>
              )}
            </Tooltip>
          ) : showDownload ? (
            // One-click download — same behaviour as the notifier
            // popup's Download button. Stays entirely inside the app
            // (no browser hand-off). Held while on-air so that a
            // surprise installer prompt doesn't pop mid-service.
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={cn(onAir && 'cursor-not-allowed')}>
                  <Button
                    onClick={downloadUpdateNow}
                    disabled={onAir}
                    className="gap-2 shrink-0"
                    aria-describedby={onAir ? 'updates-onair-badge' : undefined}
                  >
                    <RefreshCcw className="h-4 w-4" />
                    Download Update
                  </Button>
                </span>
              </TooltipTrigger>
              {onAir && (
                <TooltipContent>
                  On-air — stop the NDI sender, then click Download Update.
                </TooltipContent>
              )}
            </Tooltip>
          ) : isDownloading ? (
            <Button disabled className="gap-2 shrink-0">
              <RefreshCcw className="h-4 w-4 animate-spin" />
              Downloading…
            </Button>
          ) : (
            <Button onClick={checkForUpdates} disabled={checking} className="gap-2 shrink-0">
              <RefreshCcw className={cn('h-4 w-4', checking && 'animate-spin')} />
              {checking ? 'Checking…' : 'Check Now'}
            </Button>
          )}
        </div>

        {/*
          On-air status badge — explains why the Download / Install
          buttons above are grayed out when an update is pending and
          NDI is currently broadcasting. Disappears the moment NDI
          stops (the `useNdi` subscription pushes a fresh status and
          this card re-renders). Only shown when there is something
          to install — no point cluttering the card during idle /
          checking / not-available states.
        */}
        {onAir && (showDownload || showInstall || isDownloading) && (
          <div
            id="updates-onair-badge"
            role="status"
            aria-live="polite"
            className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2"
          >
            <Radio className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
            <div className="flex-1 text-xs leading-snug">
              <span className="font-medium text-amber-600 dark:text-amber-400">
                On-air — install after broadcast.
              </span>{' '}
              <span className="text-muted-foreground">
                Update prompts are held while NDI is broadcasting so a restart
                doesn&apos;t tear the source off the air. Stop the sender and the
                button will re-enable on its own.
              </span>
              {/*
                Manual override for the rare cases where the operator
                genuinely needs to install RIGHT NOW (security advisory,
                blocking bug forcing a restart anyway) and is willing to
                take the broadcast hit. Only offered when an installer is
                actually staged on disk (`showInstall` ⇔ status ===
                'downloaded') — for available / downloading the operator
                has to wait for the download to finish first. The
                AlertDialog confirmation is the guard that stops an
                accidental click from tearing the source off the air; on
                explicit confirm we hand off to the same install IPC that
                the off-air "Restart & Install" button uses.
              */}
              {showInstall && state.status === 'downloaded' && (
                <div className="mt-1.5">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button
                        type="button"
                        className="text-xs font-medium text-amber-700 underline underline-offset-2 hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200"
                      >
                        Install anyway…
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Install v{state.version} now and drop the NDI feed?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          Restarting will drop the NDI feed for about 10
                          seconds while ScriptureLive AI installs the update
                          and relaunches. vMix / OBS / Wirecast will lose the
                          source for the duration of the restart.
                          <br />
                          <br />
                          Use this only when you genuinely need to install
                          RIGHT NOW (security advisory, blocking bug). For
                          normal updates, wait until the service ends — the
                          update will install on the next clean quit either
                          way.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={installUpdateNow}>
                          Install now and drop NDI
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </div>
          </div>
        )}

        <Separator />

        {/*
          Operator toggle for the OS-level "Update ready to install"
          toast. Off → suppress just the desktop notification while
          leaving the tray badge / tooltip and the in-app banner
          intact (those are wired through separate update-state
          subscribers in the main process). Disabled-with-explanation
          in the browser preview, mirroring how launch-at-login and
          quit-on-close behave.
        */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <Label className="text-sm font-medium">
              Pop a desktop notification when an update is ready
            </Label>
            <p className="text-xs mt-0.5 text-muted-foreground">
              {!isElectron
                ? 'This setting is only available in the desktop app.'
                : desktopToastOn === null
                  ? 'Checking…'
                  : 'On (recommended) shows a system toast the moment an update finishes downloading. Turn OFF on a kiosk PC where the desktop is mirrored — the tray badge and the in-app banner still update so you never miss it.'}
            </p>
          </div>
          <Switch
            checked={desktopToastOn === true}
            disabled={toastBusy || !isElectron || desktopToastOn === null}
            onCheckedChange={handleDesktopToastToggle}
            aria-label="Pop a desktop notification when an update is ready"
          />
        </div>

        <Separator />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <a
            href={quickStartUrl()}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-border hover:bg-muted/40 text-xs"
          >
            <span className="font-medium">Quick Start</span>
            <ExternalLink className="h-3 w-3 opacity-60" />
          </a>
          <a
            href={troubleshootingUrl()}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-border hover:bg-muted/40 text-xs"
          >
            <span className="font-medium">Troubleshooting</span>
            <ExternalLink className="h-3 w-3 opacity-60" />
          </a>
          <a
            href={newIssueUrl()}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-border hover:bg-muted/40 text-xs"
          >
            <span className="font-medium">Report a Bug</span>
            <ExternalLink className="h-3 w-3 opacity-60" />
          </a>
        </div>
      </CardContent>
    </Card>
  )
}
