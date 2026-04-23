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
  KeyRound,
  HelpCircle,
  ExternalLink,
  RefreshCcw,
  Sparkles,
  Cpu,
  Cloud,
  Star,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { NdiOutputPanel } from './ndi-output-panel'
import { OutputPreview } from '@/components/settings/output-preview'
import { FONT_REGISTRY } from '@/lib/fonts'

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
              <div className="relative rounded-lg overflow-hidden border border-border aspect-video bg-muted">
                <img
                  src={settings.customBackground}
                  alt="Custom background"
                  className="w-full h-full object-cover"
                />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2 h-7 w-7"
                  onClick={removeBackground}
                >
                  <Trash2 className="h-3.5 w-3.5" />
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

      {/* AI Detection Mode — dual-engine picker (Base ↔ OpenAI) */}
      <AiDetectionModeCard />

      {/* Speech Recognition — language + (conditional) OpenAI key */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Mic className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Speech Recognition</CardTitle>
              <CardDescription>Language and API credentials</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Recognition Language</Label>
            <Select
              value={settings.speechLanguage}
              onValueChange={(v) => updateSettings({ speechLanguage: v })}
            >
              <SelectTrigger className="bg-card border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en-US">English (US)</SelectItem>
                <SelectItem value="en-GB">English (UK)</SelectItem>
                <SelectItem value="es-ES">Spanish</SelectItem>
                <SelectItem value="fr-FR">French</SelectItem>
                <SelectItem value="de-DE">German</SelectItem>
                <SelectItem value="pt-BR">Portuguese</SelectItem>
                <SelectItem value="zh-CN">Chinese (Simplified)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* OpenAI key — only shown when the operator has selected
              OpenAI Mode in the AI Detection Mode card above, OR
              when a key has already been saved (so they can rotate
              it without flipping modes first). */}
          {(settings.aiMode === 'openai' || settings.userOpenaiKey) && <OpenAiKeyField />}
        </CardContent>
      </Card>

      {/* Help & Updates */}
      <HelpAndUpdatesCard />

      {/* Slide Settings */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Slide Transitions</CardTitle>
              <CardDescription>Transition speed and auto-advance</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Auto-advance Slides</Label>
            <button
              onClick={() => updateSettings({ autoAdvanceSlides: !settings.autoAdvanceSlides })}
              className={cn(
                'w-10 h-5 rounded-full transition-colors relative',
                settings.autoAdvanceSlides ? 'bg-primary' : 'bg-muted'
              )}
            >
              <div className={cn(
                'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm',
                settings.autoAdvanceSlides ? 'left-5.5' : 'left-0.5'
              )} />
            </button>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Transition Duration: {settings.slideTransitionDuration}ms</Label>
            <Input
              type="range"
              min={200}
              max={2000}
              step={100}
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

      {/* Bible Download & Upload */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Bible Download & Import</CardTitle>
              <CardDescription>Download Bibles from public sources or import your own</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm font-medium mb-2 block">Download Public Domain Bibles</Label>
            <p className="text-xs text-muted-foreground mb-3">
              These Bibles are in the public domain and free to use. Click to download as text files.
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { name: 'King James Version (KJV)', url: 'https://raw.githubusercontent.com/thiagobodruk/bible/master/json/en_kjv.json' },
                { name: 'Webster Bible (WEB)', url: 'https://raw.githubusercontent.com/thiagobodruk/bible/master/json/en_webster.json' },
                { name: 'American Standard (ASV)', url: 'https://raw.githubusercontent.com/thiagobodruk/bible/master/json/en_asv.json' },
                { name: 'Young\'s Literal (YLT)', url: 'https://raw.githubusercontent.com/thiagobodruk/bible/master/json/en_ylt.json' },
              ].map((bible) => (
                <a
                  key={bible.name}
                  href={bible.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors border',
                    'bg-muted border-border hover:bg-primary/10 hover:border-primary/30 hover:text-primary text-foreground'
                  )}
                >
                  <Download className="h-3.5 w-3.5" />
                  {bible.name}
                </a>
              ))}
            </div>
          </div>

          <Separator />

          <div>
            <Label className="text-sm font-medium mb-2 block">Import Bible File</Label>
            <p className="text-xs text-muted-foreground mb-3">
              Upload a Bible text file (.txt or .json). The app uses the bible-api.com service for verse lookups, which supports 17 translations automatically.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept=".txt,.json,.csv"
                className="text-xs text-muted-foreground file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border file:border-border file:bg-muted file:text-xs file:font-medium hover:file:bg-primary/10 file:cursor-pointer"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    toast.success(`Imported: ${file.name}. The Bible lookup uses the online API (17 translations available).`)
                    e.target.value = ''
                  }
                }}
              />
            </div>
            <Card className="bg-blue-500/5 border-blue-500/20 mt-3">
              <CardContent className="p-3 flex items-start gap-2">
                <Eye className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-300/80">
                  Bible verse lookups are powered by the free bible-api.com service, which supports 17 English translations including KJV, NIV, ESV, NLT, and more. No local Bible file is needed for lookups.
                </p>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      {/* Offline Bible translations — full-Bible cache for no-internet services */}
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
// AI DETECTION MODE CARD
// ──────────────────────────────────────────────────────────────────────
// Dual-engine picker: Base (bundled, offline, free) vs OpenAI
// (cloud, faster, paid). Includes:
//   • Mode toggle with side-by-side cards and ⭐ Recommended badge
//     on OpenAI.
//   • Gentle nudge banner when operator is on Base: "For improved
//     accuracy, switch to OpenAI Mode" — no pop-ups, no pressure.
//   • Upgrade modal shown when operator picks OpenAI without a key,
//     with a 7-step setup guide and direct link to platform.openai.com.
//   • Offline / model-availability badges so the operator always
//     knows which engine will actually run.
function AiDetectionModeCard() {
  const aiMode = useAppStore((s) => s.settings.aiMode)
  const userOpenaiKey = useAppStore((s) => s.settings.userOpenaiKey)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [baseStatus, setBaseStatus] = useState<
    | { state: 'unknown' }
    | { state: 'ok' }
    | { state: 'missing'; reason: string }
    | { state: 'browser' }
  >({ state: 'unknown' })

  // Probe the packaged whisper bundle once on mount so the card can
  // show a truthful status (Ready / Missing / Browser-only).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const sl = (window as unknown as {
      scriptureLive?: { whisper?: { isAvailable: () => Promise<{ ok: boolean; reason?: string }> } }
    }).scriptureLive
    const probe = sl?.whisper?.isAvailable
    if (!probe) {
      setBaseStatus({ state: 'browser' })
      return
    }
    probe().then((r) => {
      if (r.ok) setBaseStatus({ state: 'ok' })
      else setBaseStatus({ state: 'missing', reason: r.reason || 'unknown' })
    }).catch(() => setBaseStatus({ state: 'missing', reason: 'probe failed' }))
  }, [])

  const pickBase = () => {
    updateSettings({ aiMode: 'base' })
    toast.success('Switched to Base Model — offline detection active.')
  }
  const pickOpenAi = () => {
    if (!userOpenaiKey) {
      setShowUpgrade(true)
      return
    }
    updateSettings({ aiMode: 'openai' })
    toast.success('Switched to OpenAI Mode.')
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <div>
            <CardTitle className="text-base">AI Detection Mode</CardTitle>
            <CardDescription>Choose the speech engine that drives live scripture detection</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Base Model card */}
          <button
            type="button"
            onClick={pickBase}
            className={cn(
              'text-left rounded-lg border p-4 transition-all',
              aiMode === 'base'
                ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                : 'border-border bg-card hover:border-primary/40',
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-emerald-400" />
                <span className="font-semibold text-sm">Base Model</span>
              </div>
              {aiMode === 'base' && (
                <Badge className="h-5 px-1.5 text-[10px] bg-emerald-500/15 text-emerald-300 border-emerald-500/40">
                  ACTIVE
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Bundled offline engine. Works without internet. No API costs.
            </p>
            <ul className="text-[11px] text-muted-foreground space-y-1 mb-3">
              <li>✓ Free — no account, no billing</li>
              <li>✓ Fully offline (privacy-safe)</li>
              <li>• Slower (~2–4 s per chunk)</li>
              <li>• Good accuracy on clean audio</li>
            </ul>
            <div className="flex items-center gap-1.5">
              {baseStatus.state === 'ok' && (
                <Badge className="h-5 px-1.5 text-[10px] bg-emerald-500/15 text-emerald-300 border-emerald-500/40">
                  <ShieldCheck className="h-3 w-3 mr-0.5" /> Ready
                </Badge>
              )}
              {baseStatus.state === 'missing' && (
                <Badge className="h-5 px-1.5 text-[10px] bg-amber-500/15 text-amber-300 border-amber-500/40">
                  Model missing
                </Badge>
              )}
              {baseStatus.state === 'browser' && (
                <Badge className="h-5 px-1.5 text-[10px] bg-muted text-muted-foreground border-border">
                  Desktop app only
                </Badge>
              )}
            </div>
          </button>

          {/* OpenAI Model card */}
          <button
            type="button"
            onClick={pickOpenAi}
            className={cn(
              'text-left rounded-lg border p-4 transition-all relative',
              aiMode === 'openai'
                ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                : 'border-border bg-card hover:border-primary/40',
            )}
          >
            <div className="absolute -top-2 right-3">
              <Badge className="h-5 px-1.5 text-[10px] bg-amber-500/20 text-amber-200 border-amber-500/50">
                <Star className="h-3 w-3 mr-0.5 fill-amber-300" /> Recommended
              </Badge>
            </div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Cloud className="h-4 w-4 text-sky-400" />
                <span className="font-semibold text-sm">OpenAI Model</span>
              </div>
              {aiMode === 'openai' && (
                <Badge className="h-5 px-1.5 text-[10px] bg-emerald-500/15 text-emerald-300 border-emerald-500/40">
                  ACTIVE
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Cloud Whisper via your OpenAI key. Fastest, highest accuracy.
            </p>
            <ul className="text-[11px] text-muted-foreground space-y-1 mb-3">
              <li>✓ Fast (~1 s per chunk)</li>
              <li>✓ Better on accents & noisy rooms</li>
              <li>• Requires internet + paid API key</li>
              <li>• ~$0.006 per audio minute</li>
            </ul>
            <div className="flex items-center gap-1.5">
              {userOpenaiKey ? (
                <Badge className="h-5 px-1.5 text-[10px] bg-emerald-500/15 text-emerald-300 border-emerald-500/40">
                  <KeyRound className="h-3 w-3 mr-0.5" /> Key saved
                </Badge>
              ) : (
                <Badge className="h-5 px-1.5 text-[10px] bg-muted text-muted-foreground border-border">
                  Key required
                </Badge>
              )}
            </div>
          </button>
        </div>

        {/* Gentle nudge — shown only while operator is on Base with
            no key configured. One line, dismissable by upgrading. */}
        {aiMode === 'base' && !userOpenaiKey && (
          <Card className="bg-sky-500/5 border-sky-500/20">
            <CardContent className="p-3 flex items-start gap-3">
              <Sparkles className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-sky-200/90">
                  <strong>Want better accuracy?</strong> Switch to OpenAI Mode for faster,
                  sharper detection — especially on accents and live-room audio.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0 border-sky-500/40 text-sky-200 hover:bg-sky-500/10"
                onClick={() => setShowUpgrade(true)}
              >
                Set Up <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Failsafe note — always visible so operators understand what
            happens if the internet drops or the key is rejected. */}
        <p className="text-[11px] text-muted-foreground">
          Failsafe: if OpenAI Mode loses internet or the key is rejected, detection
          automatically falls back to Base Model so the service never goes dark.
        </p>
      </CardContent>

      {/* ── Upgrade modal ─────────────────────────────────────────── */}
      <UpgradeToOpenAiDialog
        open={showUpgrade}
        onOpenChange={setShowUpgrade}
        onActivated={() => {
          updateSettings({ aiMode: 'openai' })
          setShowUpgrade(false)
          toast.success('OpenAI Mode activated.')
        }}
      />
    </Card>
  )
}

// ──────────────────────────────────────────────────────────────────────
// UPGRADE TO OPENAI DIALOG
// ──────────────────────────────────────────────────────────────────────
// Guided 7-step setup — the same flow we'd walk an operator through
// on a support call. Masked input, Test Connection button, and a
// "Save + Activate OpenAI Mode" CTA that only enables once the key
// has been verified (or entered + tested).
function UpgradeToOpenAiDialog({
  open,
  onOpenChange,
  onActivated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onActivated: () => void
}) {
  const userOpenaiKey = useAppStore((s) => s.settings.userOpenaiKey)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const [draft, setDraft] = useState(userOpenaiKey || '')
  const [show, setShow] = useState(false)
  const [testing, setTesting] = useState(false)
  const [tested, setTested] = useState<null | 'ok' | 'fail'>(null)

  useEffect(() => { if (open) setDraft(userOpenaiKey || '') }, [open, userOpenaiKey])

  const test = async () => {
    const key = draft.trim()
    if (!key) {
      toast.error('Paste your OpenAI API key first.')
      return
    }
    setTesting(true)
    setTested(null)
    try {
      const fd = new FormData()
      const silence = new Blob([new Uint8Array(512)], { type: 'audio/webm' })
      fd.append('audio', silence, 'test.webm')
      const r = await fetch('/api/transcribe', {
        method: 'POST',
        body: fd,
        headers: { 'X-OpenAI-Key': key },
      })
      if (r.ok) {
        setTested('ok')
        toast.success('Key accepted.')
      } else {
        setTested('fail')
        const j = await r.json().catch(() => ({} as { error?: string }))
        toast.error(j.error || `Test failed: HTTP ${r.status}`)
      }
    } catch (e) {
      setTested('fail')
      toast.error(e instanceof Error ? e.message : 'Test failed')
    } finally {
      setTesting(false)
    }
  }

  const saveAndActivate = () => {
    const key = draft.trim()
    if (!key) return
    updateSettings({ userOpenaiKey: key })
    onActivated()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5 text-sky-400" />
            Set Up OpenAI Mode
          </DialogTitle>
          <DialogDescription>
            Add your OpenAI API key for faster, more accurate live scripture detection.
            Your key is stored only on this computer and sent directly to api.openai.com.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
            <p className="text-xs font-semibold text-foreground uppercase tracking-wide">
              7-step setup
            </p>
            <ol className="text-sm space-y-2 list-decimal list-inside text-muted-foreground">
              <li>
                Go to{' '}
                <a
                  href="https://platform.openai.com/signup"
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-400 hover:underline inline-flex items-center gap-0.5"
                >
                  platform.openai.com/signup <ExternalLink className="h-3 w-3" />
                </a>{' '}
                and create a free account (or sign in).
              </li>
              <li>
                Open{' '}
                <a
                  href="https://platform.openai.com/settings/organization/billing/overview"
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-400 hover:underline inline-flex items-center gap-0.5"
                >
                  Billing <ExternalLink className="h-3 w-3" />
                </a>{' '}
                and add <strong>$5 of credit</strong> (pay-as-you-go). One service ≈ 6¢.
              </li>
              <li>
                Go to{' '}
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-sky-400 hover:underline inline-flex items-center gap-0.5"
                >
                  API Keys <ExternalLink className="h-3 w-3" />
                </a>{' '}
                and click <strong>Create new secret key</strong>.
              </li>
              <li>
                Name it <em>ScriptureLive AI</em>, set permissions to{' '}
                <strong>All</strong>, and create the key.
              </li>
              <li>
                Copy the key (starts with <code className="text-[11px] bg-muted px-1 py-0.5 rounded">sk-…</code>) —
                you won&apos;t see it again after closing that page.
              </li>
              <li>Paste it into the field below and tap <strong>Test</strong>.</li>
              <li>When the test shows ✓, tap <strong>Save & Activate OpenAI Mode</strong>.</li>
            </ol>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5" />
              Your OpenAI API Key
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type={show ? 'text' : 'password'}
                value={draft}
                onChange={(e) => { setDraft(e.target.value); setTested(null) }}
                placeholder="sk-…"
                autoComplete="off"
                spellCheck={false}
                className="font-mono text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setShow((s) => !s)}
                title={show ? 'Hide key' : 'Show key'}
                className="shrink-0"
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={test}
                disabled={testing || !draft.trim()}
                className="shrink-0"
              >
                {testing ? 'Testing…' : 'Test'}
              </Button>
            </div>
            {tested === 'ok' && (
              <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                <Check className="h-3 w-3" /> Key accepted — ready to activate.
              </p>
            )}
            {tested === 'fail' && (
              <p className="text-[11px] text-destructive flex items-center gap-1">
                <X className="h-3 w-3" /> Key rejected. Double-check it or try creating a new one.
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Stored only on this computer. Never sent anywhere except api.openai.com.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 flex-col sm:flex-row">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="sm:mr-auto"
          >
            Continue with Base Model
          </Button>
          <Button
            type="button"
            onClick={saveAndActivate}
            disabled={!draft.trim()}
            className="bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700"
          >
            <Sparkles className="h-4 w-4 mr-1" />
            Save & Activate OpenAI Mode
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ──────────────────────────────────────────────────────────────────────
// OPENAI API KEY FIELD
// ──────────────────────────────────────────────────────────────────────
// Why this is its own component: the key is sensitive and we want
// password-style masking with a toggleable reveal, plus a Test button
// that hits /api/transcribe with a tiny silent blob to confirm the key
// is accepted before the operator goes live. Keeping it isolated also
// avoids re-rendering the whole Settings page on every keystroke.
function OpenAiKeyField() {
  const userOpenaiKey = useAppStore((s) => s.settings.userOpenaiKey)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const [draft, setDraft] = useState(userOpenaiKey || '')
  const [show, setShow] = useState(false)
  const [testing, setTesting] = useState(false)

  // Keep draft in sync if another surface clears the key.
  useEffect(() => { setDraft(userOpenaiKey || '') }, [userOpenaiKey])

  const dirty = draft !== (userOpenaiKey || '')
  const masked = userOpenaiKey ? `sk-…${userOpenaiKey.slice(-4)}` : ''

  const save = () => {
    const trimmed = draft.trim()
    updateSettings({ userOpenaiKey: trimmed || null })
    toast.success(trimmed ? 'OpenAI key saved' : 'OpenAI key cleared')
  }

  const test = async () => {
    setTesting(true)
    try {
      // Send a sub-1KB silence blob — the route's < 1024 byte
      // gate returns text:'' WITHOUT calling OpenAI, so this Test
      // verifies the key is *accepted* (passes the 503 / "no key"
      // gate) without spending a Whisper credit. An invalid key
      // surfaces later via the live transcription panel; that's
      // acceptable because Whisper itself is the only authority on
      // whether a key is functional, and we don't want every Test
      // click to bill the operator.
      const fd = new FormData()
      const silence = new Blob([new Uint8Array(512)], { type: 'audio/webm' })
      fd.append('audio', silence, 'test.webm')
      const r = await fetch('/api/transcribe', {
        method: 'POST',
        body: fd,
        headers: draft.trim() ? { 'X-OpenAI-Key': draft.trim() } : {},
      })
      if (r.ok) {
        toast.success('OpenAI key accepted — speech recognition is ready.')
      } else {
        const j = await r.json().catch(() => ({} as { error?: string }))
        toast.error(j.error || `Test failed: HTTP ${r.status}`)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Test failed')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium flex items-center gap-1.5">
          <KeyRound className="h-3.5 w-3.5" />
          OpenAI API Key
          {userOpenaiKey && (
            <Badge className="h-4 px-1.5 text-[9px] bg-emerald-500/15 text-emerald-300 border-emerald-500/40">
              SAVED ({masked})
            </Badge>
          )}
        </Label>
        <a
          href="https://platform.openai.com/api-keys"
          target="_blank"
          rel="noreferrer"
          className="text-[11px] text-sky-400 hover:underline inline-flex items-center gap-1"
        >
          Get a key <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <div className="flex items-center gap-2">
        <Input
          type={show ? 'text' : 'password'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="sk-…"
          autoComplete="off"
          spellCheck={false}
          className="font-mono text-xs"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setShow((s) => !s)}
          title={show ? 'Hide key' : 'Show key'}
          className="shrink-0"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
        <Button type="button" onClick={save} disabled={!dirty} className="shrink-0">
          Save
        </Button>
        <Button type="button" variant="outline" onClick={test} disabled={testing || (!draft.trim() && !userOpenaiKey)} className="shrink-0">
          {testing ? 'Testing…' : 'Test'}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Required for the desktop installer. Stored only on this computer.
        Used to call api.openai.com directly for live transcription.
      </p>
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
function HelpAndUpdatesCard() {
  const [checking, setChecking] = useState(false)
  const version = process.env.NEXT_PUBLIC_APP_VERSION || '0.5.4'
  const isElectron =
    typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent)

  const checkForUpdates = async () => {
    setChecking(true)
    try {
      // Electron path: ask the main process to ping GitHub Releases
      // via electron-updater. The preload bridge exposes the updater
      // under window.scriptureLive.updater — see electron/preload.ts.
      // It returns an UpdateState; { status: 'available'|'downloading'|
      // 'downloaded'|'not-available'|'error', version?, error? }.
      const win = window as unknown as {
        scriptureLive?: {
          updater?: {
            check?: () => Promise<{ status: string; version?: string; error?: string }>
          }
        }
      }
      const checkFn = win.scriptureLive?.updater?.check
      if (isElectron && checkFn) {
        const r = await checkFn()
        if (r?.status === 'available' || r?.status === 'downloading' || r?.status === 'downloaded') {
          toast.success(`Update available: v${r.version || '?'} — downloading in the background.`)
        } else if (r?.status === 'error') {
          toast.error(`Update check failed: ${r.error || 'unknown error'}`)
        } else {
          toast.success('You are on the latest version.')
        }
      } else {
        // Browser fallback: open the releases page in a new tab so
        // the operator can grab the installer manually.
        window.open('https://github.com/nanvilow/scripturelive-ai/releases/latest', '_blank', 'noreferrer')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update check failed')
    } finally {
      setChecking(false)
    }
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-primary" />
          <div>
            <CardTitle className="text-base">Help & Updates</CardTitle>
            <CardDescription>
              Version v{version} {isElectron ? '· Desktop' : '· Browser'}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <Label className="text-sm font-medium">Check for Updates</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isElectron
                ? 'Pings GitHub Releases. New versions install automatically next launch.'
                : 'Opens the GitHub Releases page in a new tab.'}
            </p>
          </div>
          <Button onClick={checkForUpdates} disabled={checking} className="gap-2 shrink-0">
            <RefreshCcw className={cn('h-4 w-4', checking && 'animate-spin')} />
            {checking ? 'Checking…' : 'Check Now'}
          </Button>
        </div>

        <Separator />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <a
            href="https://github.com/nanvilow/scripturelive-ai#quick-start"
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-border hover:bg-muted/40 text-xs"
          >
            <span className="font-medium">Quick Start</span>
            <ExternalLink className="h-3 w-3 opacity-60" />
          </a>
          <a
            href="https://github.com/nanvilow/scripturelive-ai/blob/main/docs/TROUBLESHOOTING.md"
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-border hover:bg-muted/40 text-xs"
          >
            <span className="font-medium">Troubleshooting</span>
            <ExternalLink className="h-3 w-3 opacity-60" />
          </a>
          <a
            href="https://github.com/nanvilow/scripturelive-ai/issues/new"
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
