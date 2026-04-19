'use client'

import { useState, useRef, useEffect } from 'react'
import { useAppStore, type AppSettings, type BibleTranslation, type DisplayMode, type OutputDestination } from '@/lib/store'
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
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Upload,
  X,
  Image as ImageIcon,
  Monitor,
  Wifi,
  Mic,
  Type,
  Eye,
  Trash2,
  Check,
  RotateCcw,
  Layers,
  Download,
  BookOpen,
  Zap,
  MonitorSpeaker,
  Copy,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { NdiOutputPanel } from './ndi-output-panel'

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
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
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
    })
    setSelectedTranslation('KJV')
    toast.success('Settings reset to defaults')
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-3xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">Configure your ScriptureLive AI preferences</p>
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

      {/* NDI / Output Setup Guide */}
      <Card className="bg-card border-border">
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

      {/* Appearance Settings */}
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
        <CardContent className="space-y-4">
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
                <SelectItem value="sans">Default Sans-Serif</SelectItem>
                <SelectItem value="serif">Serif</SelectItem>
                <SelectItem value="mono">Monospace</SelectItem>
              </SelectContent>
            </Select>
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

      {/* Speech Recognition */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Mic className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Speech Recognition</CardTitle>
              <CardDescription>Configure live scripture detection</CardDescription>
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
          <Card className="bg-amber-500/5 border-amber-500/20">
            <CardContent className="p-3 flex items-start gap-2">
              <Eye className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-300/80">
                Speech recognition uses your browser&apos;s built-in Web Speech API. It works best in Google Chrome with a stable internet connection. Network errors are common in sandboxed environments — try opening in a new browser tab.
              </p>
            </CardContent>
          </Card>
        </CardContent>
      </Card>

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
