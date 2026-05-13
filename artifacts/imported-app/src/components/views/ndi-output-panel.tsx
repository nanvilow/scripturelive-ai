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

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Wifi, WifiOff, Radio, MonitorPlay, Copy, Check, Globe, Monitor } from 'lucide-react'
import { useNdi, useDesktop } from '@/lib/use-electron'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/lib/store'
import QRCode from 'qrcode'

export function NdiOutputPanel() {
  // v0.7.146 — `unavailableReason` is no longer destructured because the amber
  // "NDI runtime not detected" card that displayed it has been removed (the
  // DLL is now bundled, so the card never fired in practice). `available` is
  // still consumed below to compute `ndiOk`, which keeps the Start button
  // disabled in the pathological case of a corrupted bundled DLL.
  const { desktop, status, available } = useNdi()
  const [busy, setBusy] = useState(false)
  const [sourceName, setSourceName] = useState('ScriptureLive AI')

  // v0.7.153 — OBS Browser Source URL card state. Fetched once on
  // mount via the new app:get-server-info IPC. The card renders the
  // localhost URL (always safe — same-PC OBS) plus a row per
  // discovered LAN IPv4 (cross-PC OBS via Browser Source — the
  // zero-plugin alternative to NDI). QR data URL is generated for
  // the FIRST LAN URL so a phone or second PC can scan it.
  const desktopBridge = useDesktop()
  const [serverInfo, setServerInfo] = useState<{
    port: number
    localUrl: string
    lanIps: string[]
  } | null>(null)
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!desktopBridge?.getServerInfo) return
    let cancelled = false
    desktopBridge.getServerInfo().then((info) => {
      if (!cancelled) setServerInfo(info)
    }).catch(() => { /* leave null — card just falls back to copy-only */ })
    return () => { cancelled = true }
  }, [desktopBridge])
  // Build the OBS Browser Source URLs. We always send `?transparent=1`
  // so OBS receives a clean alpha matte (verse text only, no card
  // backdrop) — the operator can layer it over their service program
  // bus the same way they would an NDI feed.
  const buildObsUrl = (host: string, port: number) =>
    `http://${host}:${port}/api/output/congregation?transparent=1`
  // v0.7.157 — Browser-side fallback so the card NEVER disappears.
  // Pre-v0.7.157 the OBS Browser Source URL card was conditionally
  // rendered only when the Electron IPC `app:get-server-info` had
  // populated `serverInfo`. In the web build (no IPC bridge), in
  // dev when the renderer mounts before the IPC is ready, OR when
  // the bundled server bound port=0, the entire card silently
  // disappeared and operators reported "the OBS card is missing".
  // Now we ALWAYS render the card. When real Electron server info
  // is present we use it (preferred — gives the operator a stable
  // 127.0.0.1:<port> URL plus per-LAN-IP rows). Otherwise we fall
  // back to whatever the renderer can see in window.location, which
  // is correct for web-build users and for Electron renderers that
  // happened to load before IPC settled.
  const browserFallbackUrl =
    typeof window !== 'undefined' && window.location?.origin
      ? `${window.location.origin}/api/output/congregation?transparent=1`
      : null
  const localObsUrl = serverInfo && serverInfo.port > 0
    ? buildObsUrl('127.0.0.1', serverInfo.port)
    : browserFallbackUrl
  const lanObsUrls = serverInfo && serverInfo.port > 0
    ? serverInfo.lanIps.map((ip) => ({ ip, url: buildObsUrl(ip, serverInfo.port) }))
    : []
  const usingBrowserFallback =
    !(serverInfo && serverInfo.port > 0) && !!browserFallbackUrl
  // Generate QR for the first LAN URL (most useful — phone can scan
  // it to verify OBS-on-second-PC reachability before wiring it up).
  // Loopback URL gets no QR (a phone scanning 127.0.0.1 would hit
  // ITSELF, which is never what the operator wants).
  useEffect(() => {
    const target = lanObsUrls[0]?.url
    if (!target) { setQrDataUrl(null); return }
    let cancelled = false
    QRCode.toDataURL(target, { width: 180, margin: 1, color: { dark: '#0f172a', light: '#ffffff' } })
      .then((url) => { if (!cancelled) setQrDataUrl(url) })
      .catch(() => { if (!cancelled) setQrDataUrl(null) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lanObsUrls[0]?.url])
  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopiedUrl(url)
      toast.success('URL copied — paste it into OBS Browser Source')
      setTimeout(() => setCopiedUrl((c) => (c === url ? null : c)), 2000)
    } catch {
      toast.error('Could not copy. Select the URL and press Ctrl+C.')
    }
  }

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
  const ndiLowerThirdTransparent = useAppStore((s) => s.settings.ndiLowerThirdTransparent)
  // v0.6.6 — share the projector's lowerThirdPosition for the NDI band
  // too. There is no separate ndiLowerThirdPosition in the store; the
  // projector and NDI feed have always rendered the band at the same
  // top/bottom edge so the NDI BrowserWindow follows the same setting.
  const lowerThirdPosition = useAppStore((s) => s.settings.lowerThirdPosition)
  // v0.6.4 — operator-tunable size multiplier for the NDI lower-third
  // bar. Scales font sizes + box width on the NDI surface only so the
  // broadcast feed can be tuned (smaller for vMix overlays, bigger for
  // full-screen NDI) without disturbing the in-room projection.
  const ndiLowerThirdScale = useAppStore((s) => s.settings.ndiLowerThirdScale)

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

  // v0.6.6.1 — CRITICAL ORDERING. These hooks (useRef + 2 useEffect)
  // MUST run unconditionally on every render, BEFORE the
  // `if (!desktop) return` early return below. v0.6.6 placed them
  // after the early return, which crashed the renderer the moment
  // `desktop` flipped from undefined → defined (Electron preload
  // landing): hook count jumped from 0 → 3 between two renders and
  // React aborted with "Rendered more hooks than during the previous
  // render" → the entire BrowserWindow showed Chromium's "This page
  // couldn't load" page, and the operator could not open Settings
  // (which renders this component) at all.
  //
  // v0.6.8 — Restart triggers now include `ndiDisplayMode` so flipping
  // Full ↔ Lower-Third while broadcasting tears down the BrowserWindow
  // and rebuilds with `?lowerThird=` flipped. Pre-v0.6.8 the displayMode
  // change only flipped the toggle in the panel UI; the running NDI
  // BrowserWindow kept its old URL because the restart effect only
  // watched `ndiLowerThirdTransparent` and `lowerThirdPosition`.
  //
  // The Restart-on-Toggle behaviour itself is unchanged in shape: when
  // the operator changes any NDI-relevant setting while NDI is
  // broadcasting, we re-issue ndi.start with the new flags so main.ts
  // (whose short-circuit equality check was extended in v0.6.6 to
  // include layout/transparent/lowerThird) tears down the BrowserWindow
  // and rebuilds with the new flags. The ref guard prevents a
  // self-induced loop from the resulting ndi:status push.
  const restartGuardRef = useRef<string>('')
  const isRunningForEffect = !!status?.running
  // v0.7.11 — REVERTED v0.7.5.1's "restart on every slider tick" rule.
  // Operators reported a visible flash on vMix / OBS every time they
  // dragged the lower-third height or NDI scale slider — which they
  // do constantly while fine-tuning the bar live on air. Root cause:
  // every 0.05 step on the slider wrote a new value to the store, the
  // effect saw `lowerThirdHeightSetting` / `ndiLowerThirdScale` change
  // in its dep list, and called `desktop.ndi.start({...})` which tears
  // down the BrowserWindow and rebuilds it. The BrowserWindow takes
  // ~150-400 ms to reach steady state, during which the NDI source
  // emits a black/empty frame — that's the flash receivers saw.
  //
  // The renderer already receives `lowerThirdHeight` and
  // `ndiLowerThirdScale` via the SSE settings push (see route.ts
  // settingsRenderKey: `lh`, `ndLtSc`) and re-paints in <50 ms with no
  // window churn. So the BrowserWindow only needs to restart when a
  // setting actually changes its FOUNDATIONAL flags — display mode
  // (lower-third vs full-screen, which flips the `lowerThird.enabled`
  // capture flag) and source name (which renames the NDI sender on the
  // wire). Slider drags now flow through SSE only — silent, frame-
  // perfect, no receiver flash.
  //
  // The first-paint URL params (lh / sc) are still baked at start time
  // in `handleToggle` below so the BrowserWindow's very first frame
  // already shows the operator's latest values; from then on SSE owns
  // updates. The renderer's FORCE_LH / FORCE_SC priority was also
  // flipped (route.ts lines 854 / 871) so live SSE state always wins
  // over the now-stale URL params after first arrival.
  const lowerThirdHeightSetting = useAppStore((s) => s.settings.lowerThirdHeight)
  useEffect(() => {
    if (!isRunningForEffect || !desktop) return
    const want = `${ndiDisplayMode}:${lowerThirdPosition}:${sourceName.trim()}`
    if (restartGuardRef.current === want) return
    if (restartGuardRef.current === '') {
      // First settle — record what's already on the wire so the next
      // operator change is what triggers a restart, not the initial
      // mount after they hit Start.
      restartGuardRef.current = want
      return
    }
    restartGuardRef.current = want
    void desktop.ndi.start({
      name: sourceName.trim() || 'ScriptureLive AI',
      width: 1920,
      height: 1080,
      fps: 60,
      layout: 'ndi',
      // v0.6.8 — ALWAYS broadcast NDI as alpha-keyed (transparent
      // surrounding area). NDI is fundamentally an overlay format
      // intended for compositing in vMix/OBS/Wirecast — opaque NDI
      // defeats the entire purpose. The operator's per-box
      // `ndiLowerThirdTransparent` toggle still controls whether the
      // lower-third card itself keeps its themed gradient backdrop;
      // that decision is now read from the store directly by the
      // renderer (see route.ts line 845) so the toggle no longer
      // needs to be plumbed through to the BrowserWindow URL.
      transparent: true,
      lowerThird: {
        // v0.6.8 — Honour the operator's display-mode pick. When they
        // choose Full Screen the renderer now actually renders
        // full-screen on the NDI feed; when Lower-Third the bar
        // appears. Pre-v0.6.8 this was hardcoded to true so flipping
        // to Full had zero effect on vMix/OBS receivers.
        enabled: ndiDisplayMode === 'lower-third',
        position: lowerThirdPosition === 'top' ? 'top' : 'bottom',
        // v0.7.5.1 — bake the bucket + scale into the URL too (see
        // FORCE_LH / FORCE_SC notes in route.ts and main.ts). v0.7.11:
        // these are now ONLY used for the very first frame after a
        // start/restart; SSE then takes over (see comment block above).
        height: lowerThirdHeightSetting,
        scale: typeof ndiLowerThirdScale === 'number' ? ndiLowerThirdScale : 1,
      },
    }).catch(() => { /* surfaced by the ndi:status broadcast */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunningForEffect, desktop, ndiDisplayMode, lowerThirdPosition, sourceName])

  // Reset the guard when NDI stops so the first toggle after the next
  // Start does the right thing (record-then-skip).
  useEffect(() => {
    if (!isRunningForEffect) restartGuardRef.current = ''
  }, [isRunningForEffect])

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

  const isRunning = isRunningForEffect
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
        // v0.6.6 — pass layout + transparent + lowerThird so main.ts
        // wires the BrowserWindow with `transparent:true` and
        // `backgroundColor:'#00000000'` and forwards the ?transparent=1
        // / ?lowerThird=1 query params to the renderer. Pre-v0.6.6 only
        // {name, width, height, fps} was passed, layout fell back to
        // 'mirror', the entire transparent block in main.ts:1440 was
        // skipped, and the BrowserWindow was always created opaque
        // black — so vMix/Wirecast/OBS receivers showed a black frame
        // with text floating on it instead of an alpha matte.
        //
        // v0.6.8 — `transparent` is now always true (NDI is always
        // alpha-keyed by design) and `lowerThird.enabled` follows
        // `ndiDisplayMode`. See the restart-effect block above for the
        // full rationale.
        const res = await desktop.ndi.start({
          name: sourceName.trim() || 'ScriptureLive AI',
          width: 1920,
          height: 1080,
          fps: 60,
          layout: 'ndi',
          transparent: true,
          lowerThird: {
            enabled: ndiDisplayMode === 'lower-third',
            position: lowerThirdPosition === 'top' ? 'top' : 'bottom',
            // v0.7.5.1 — same first-paint URL params as the restart effect.
            height: lowerThirdHeightSetting,
            scale: typeof ndiLowerThirdScale === 'number' ? ndiLowerThirdScale : 1,
          },
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
                  : 'Tap the button to start broadcasting'}
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
            {/* v0.7.146 — The amber "NDI runtime not detected" card
                that lived here in v0.7.145 is GONE. The NDI runtime
                DLL now ships INSIDE the installer (extraResources in
                electron-builder.yml + bundled-first DLL search in
                electron/ndi-service.ts findNdiDll), so ndiOk is
                effectively always true on every customer PC — same
                behaviour as Wirecast / vMix / OBS / Resolume. The
                only way ndiOk is false post-v0.7.146 is a corrupted
                install or a 32-bit OS (which we don't support);
                in that pathological case the Stop/Start button
                below is still disabled via `disabled={busy || !ndiOk}`,
                which is a quieter and accurate failure mode. */}

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

            {/* v0.7.153 — OBS Browser Source URL card.
                Zero-plugin alternative to NDI for OBS users:
                instead of installing the DistroAV / obs-ndi plugin
                + NDI Runtime, an operator can drop one URL into OBS's
                built-in Browser Source and get the verse-only feed
                with full transparency. The localhost URL works for
                same-PC OBS (the most common Nigeria-customer setup).
                LAN URLs work for OBS on a second PC on the same Wi-Fi
                — Next.js is now bound to 0.0.0.0 (see startNextServer
                in electron/main.ts). */}
            {/* v0.7.157 — Card now ALWAYS renders. See browserFallbackUrl
                comment above buildObsUrl for the rationale. */}
            <div className="rounded-md border border-sky-500/30 bg-sky-500/5 p-3 space-y-2.5">
                <div className="flex items-start gap-2">
                  <Globe className="h-4 w-4 text-sky-300 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold text-foreground">
                      OBS Browser Source URL
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-snug">
                      Use this if your OBS doesn&apos;t have the NDI plugin.
                      In OBS click <strong>+</strong> → <strong>Browser</strong>
                      , paste a URL below, set width <strong>1920</strong> and
                      height <strong>1080</strong>, click <strong>OK</strong>.
                      You&apos;ll see only the Bible verse — no app interface.
                    </p>
                    {usingBrowserFallback && (
                      <p className="text-[10px] text-amber-300/90 leading-snug pt-1">
                        Showing the URL of the page you&apos;re viewing right
                        now (fallback). For LAN URLs to a second PC, run the
                        Windows desktop app — it auto-detects every LAN IP on
                        this machine and lists one Browser Source URL per
                        interface.
                      </p>
                    )}
                  </div>
                </div>

                {localObsUrl && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      <Monitor className="h-3 w-3" />
                      Same PC as ScriptureLive AI
                    </div>
                    <div className="flex items-stretch gap-1.5">
                      <input
                        readOnly
                        value={localObsUrl}
                        onFocus={(e) => e.currentTarget.select()}
                        className="flex-1 min-w-0 h-8 rounded-md border border-border bg-background px-2 text-[11px] font-mono"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleCopyUrl(localObsUrl)}
                        className="h-8 shrink-0 px-2 gap-1.5 text-[11px]"
                      >
                        {copiedUrl === localObsUrl
                          ? <><Check className="h-3.5 w-3.5 text-emerald-400" /> Copied</>
                          : <><Copy className="h-3.5 w-3.5" /> Copy</>
                        }
                      </Button>
                    </div>
                  </div>
                )}

                {lanObsUrls.length === 0 && !usingBrowserFallback && (
                  <p className="text-[10px] text-amber-300/90 leading-snug">
                    No LAN IPv4 interfaces detected on this PC. The localhost
                    URL above still works for OBS on the SAME PC. To stream
                    to OBS on another PC, connect this PC to a Wi-Fi or wired
                    network and reopen this panel.
                  </p>
                )}
                {lanObsUrls.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      <Wifi className="h-3 w-3" />
                      OBS on another PC (same Wi-Fi)
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                      <div className="space-y-1.5 min-w-0">
                        {lanObsUrls.map(({ ip, url }) => (
                          <div key={ip} className="flex items-stretch gap-1.5">
                            <input
                              readOnly
                              value={url}
                              onFocus={(e) => e.currentTarget.select()}
                              className="flex-1 min-w-0 h-8 rounded-md border border-border bg-background px-2 text-[11px] font-mono"
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleCopyUrl(url)}
                              className="h-8 shrink-0 px-2 gap-1.5 text-[11px]"
                              title={`LAN IP ${ip}`}
                            >
                              {copiedUrl === url
                                ? <><Check className="h-3.5 w-3.5 text-emerald-400" /> Copied</>
                                : <><Copy className="h-3.5 w-3.5" /> Copy</>
                              }
                            </Button>
                          </div>
                        ))}
                        <p className="text-[10px] text-muted-foreground leading-snug pt-0.5">
                          If OBS doesn&apos;t load these from another PC, allow
                          ScriptureLive AI through Windows Firewall (Private
                          network) on this machine.
                        </p>
                      </div>
                      {qrDataUrl && (
                        <div className="flex flex-col items-center gap-1 shrink-0">
                          <img
                            src={qrDataUrl}
                            alt="QR code for the OBS Browser Source LAN URL"
                            className="h-[120px] w-[120px] rounded border border-border bg-white"
                          />
                          <span className="text-[9px] text-muted-foreground uppercase tracking-wider">
                            Scan to verify
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
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
                    aria-checked={ndiLowerThirdTransparent === true}
                    onClick={() => updateSettings({
                      ndiLowerThirdTransparent: !ndiLowerThirdTransparent,
                    })}
                    className={cn(
                      'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
                      ndiLowerThirdTransparent
                        ? 'bg-emerald-500/80'
                        : 'bg-muted-foreground/30',
                    )}
                  >
                    <span
                      className={cn(
                        'inline-block h-5 w-5 transform rounded-full bg-background shadow transition-transform',
                        ndiLowerThirdTransparent ? 'translate-x-5' : 'translate-x-0.5',
                      )}
                    />
                  </button>
                </div>
              )}

              {/* v0.6.4 — Lower-third SIZE multiplier for the NDI feed.
                  The in-room projector and Live Display preview ignore
                  this — only the NDI surface (vMix/OBS) honours it.
                  Lets operators shrink the bar to a thin caption for
                  vMix overlay work, or balloon it for full-screen NDI
                  receivers, without touching the in-room look. */}
              {ndiDisplayMode === 'lower-third' && (
                <div className="mt-2 pt-2 border-t border-border/40 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="ndi-lt-scale" className="text-[11px] font-semibold text-foreground cursor-pointer">
                      Lower-third size
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
                        {(typeof ndiLowerThirdScale === 'number' ? ndiLowerThirdScale : 1).toFixed(2)}×
                      </span>
                      {typeof ndiLowerThirdScale === 'number' && ndiLowerThirdScale !== 1 && (
                        <button
                          type="button"
                          onClick={() => updateSettings({ ndiLowerThirdScale: 1 })}
                          className="text-[10px] text-muted-foreground hover:text-foreground underline"
                          title="Reset to 1.00× (default — sits inside the bottom band, doesn't cover the preacher)"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>
                  <input
                    id="ndi-lt-scale"
                    type="range"
                    min={0.5}
                    max={2}
                    step={0.05}
                    value={typeof ndiLowerThirdScale === 'number' ? ndiLowerThirdScale : 1}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      // v0.7.3 — Default is 1.0× (was 2.0× in v0.7.0,
                      // which the operator's broadcast frame showed
                      // was way too large). Always store the raw
                      // slider value so the renderer never falls back
                      // to the legacy 1.0 path; the box-fit clamp
                      // only kicks in when ndiLtScale is a number.
                      updateSettings({ ndiLowerThirdScale: v })
                    }}
                    className="w-full h-1.5 cursor-pointer accent-emerald-500"
                  />
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    Drag to scale the lower-third frame and text on the NDI feed (0.5× thinnest, 2.0× largest). Live preview below updates immediately.
                  </p>
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
              {/* v0.7.9 — TRUE WYSIWYG NDI preview. Pre-v0.7.9 the iframe
                  filled the small ~360px-wide panel slot, which meant its
                  internal viewport was ~360x202 px while the FrameCapture
                  BrowserWindow that vMix/OBS actually receive runs at the
                  native NDI resolution (1920x1080). The renderer's CSS
                  uses `max-width: 68rem` on the .lt-box and a clamp(min,
                  cqw/cqh, max) for font size — both of which produce
                  DIFFERENT visual proportions at 360x202 vs 1920x1080:

                    • At 360x202 the bar fills ~88% of the iframe (max-width
                      never kicks in) and the font hits the cqw/cqh middle
                      term, so the preview looks "tight and thin".
                    • At 1920x1080 the bar caps at 1088px (~57% of the
                      frame) and the font hits the 2rem MAX cap of the
                      clamp, so OBS shows a SHORTER but TALLER-feeling bar
                      with much bigger text — matching the operator's
                      "OBS bar is oversized" complaint.

                  The fix: render the iframe at the EXACT native NDI
                  viewport (1920x1080 here matches the width/height passed
                  to ndi.start), then CSS-scale it down with `transform:
                  scale()` to fit the panel's 16:9 container. The internal
                  layout calculates against the same pixel dimensions that
                  vMix/OBS will see, the visual scale-down is purely
                  optical, and the operator now gets a literal pixel-for-
                  pixel preview of the broadcast feed. */}
              <NdiPreviewSurface
                ndiDisplayMode={ndiDisplayMode}
                lowerThirdPosition={lowerThirdPosition}
                lowerThirdHeightSetting={lowerThirdHeightSetting}
                ndiLowerThirdScale={ndiLowerThirdScale}
              />
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

// v0.7.9 — WYSIWYG NDI preview surface. Renders /api/output/congregation
// at the EXACT native NDI viewport (NATIVE_W x NATIVE_H, defaults to
// 1920x1080 to match the width/height passed to ndi.start) and shrinks
// it visually with `transform: scale()` so the panel container can be
// any size. The renderer's CSS layout (max-width:68rem cap, container-
// query font clamps) computes against the SAME pixel dimensions vMix /
// OBS receive, so what the operator sees here is literally a scaled-
// down copy of the broadcast feed — no more "preview shows tight bar
// but OBS shows huge oversized bar" surprises.
type NdiPreviewSurfaceProps = {
  ndiDisplayMode: string
  lowerThirdPosition: string
  lowerThirdHeightSetting: string
  ndiLowerThirdScale: number | undefined
}

function NdiPreviewSurface(props: NdiPreviewSurfaceProps): React.JSX.Element {
  const NATIVE_W = 1920
  const NATIVE_H = 1080
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState<number>(1)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    // Recompute scale whenever the panel container resizes (column
    // collapse, side-rail open/close, browser zoom). ResizeObserver
    // is supported on every Electron / modern browser the desktop app
    // ships with, so no fallback path needed.
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width
        if (w > 0) setScale(w / NATIVE_W)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // v0.7.11 — Freeze the iframe src AFTER MOUNT so it never reloads in
  // response to slider drags. Pre-fix the iframe's `src` (and `key`)
  // included `lowerThirdHeightSetting` and `ndiLowerThirdScale`, so
  // every 0.05 step on the operator's scale slider unmounted +
  // remounted the iframe — visible as a hard "blank-then-paint" flash
  // in the preview pane (and matched a parallel BrowserWindow restart
  // flash on the actual NDI feed; see the restart-effect block above).
  // The renderer inside the iframe receives `lowerThirdHeight` and
  // `ndiLowerThirdScale` via the SSE settings push (settingsRenderKey:
  // `lh`, `ndLtSc`) and re-paints in <50 ms with no reload, so the
  // initial URL params are only needed for the first frame. Only the
  // foundational mode (lower-third vs full-screen, position) reloads
  // the iframe from scratch — anything else flows through SSE.
  const initialSrcRef = useRef<string | null>(null)
  const src = (() => {
    const p = new URLSearchParams()
    p.set('ndi', '1')
    // v0.7.159 — DO NOT pass `transparent=1` here. The actual NDI capture
    // (a hidden FrameCapture BrowserWindow elsewhere in the Electron main
    // process) keeps `transparent=1` so OBS / vMix get a clean alpha
    // matte. THIS surface is the operator's WYSIWYG preview pane: they
    // want to see the user's configured background image / video behind
    // the lower-third bar, not a transparent void that flashes white
    // through to the parent card. Dropping the param tells the renderer
    // to paint customBackground, exactly like Settings PREVIEW does.
    if (props.ndiDisplayMode === 'lower-third') {
      p.set('lowerThird', '1')
      if (props.lowerThirdPosition === 'top') p.set('position', 'top')
      if (
        props.lowerThirdHeightSetting === 'sm' ||
        props.lowerThirdHeightSetting === 'md' ||
        props.lowerThirdHeightSetting === 'lg'
      ) {
        p.set('lh', props.lowerThirdHeightSetting)
      }
      if (
        typeof props.ndiLowerThirdScale === 'number' &&
        props.ndiLowerThirdScale >= 0.5 &&
        props.ndiLowerThirdScale <= 2
      ) {
        p.set('sc', String(props.ndiLowerThirdScale))
      }
    }
    return `/api/output/congregation?${p.toString()}`
  })()

  // The iframe's effective src: latest computed value if mode/position
  // changed (intentional reload), otherwise the frozen first src.
  const stableKey = `ndi-preview:${props.ndiDisplayMode}:${props.lowerThirdPosition}`
  const lastKeyRef = useRef<string>(stableKey)
  if (lastKeyRef.current !== stableKey) {
    lastKeyRef.current = stableKey
    initialSrcRef.current = src
  } else if (initialSrcRef.current === null) {
    initialSrcRef.current = src
  }
  const stableSrc = initialSrcRef.current

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden bg-black"
      style={{ aspectRatio: '16 / 9' }}
    >
      {/* v0.7.11 — Wrap the iframe in a sized div that owns the
          transform. The iframe itself fills its parent (100%/100%) so
          its inner viewport is unambiguously NATIVE_W × NATIVE_H — no
          chance of the browser deciding to use the visually-scaled
          dimensions for layout. Critically, this also means cqw / cqh
          container queries inside the renderer resolve against the
          SAME pixel box they will in the FrameCapture BrowserWindow,
          so the .7rem clamp-floor never kicks in (which was the root
          cause of "preview text looks oversized vs broadcast"). */}
      <div
        style={{
          width: NATIVE_W,
          height: NATIVE_H,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          position: 'absolute',
          top: 0,
          left: 0,
        }}
      >
        <iframe
          key={stableKey}
          src={stableSrc}
          title="NDI Live Preview"
          style={{
            border: 0,
            display: 'block',
            width: '100%',
            height: '100%',
            background: 'transparent',
          }}
          allowTransparency
        />
      </div>
    </div>
  )
}
