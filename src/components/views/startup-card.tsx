'use client'

import { useEffect, useState } from 'react'
import { Power } from 'lucide-react'
import { toast } from 'sonner'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'

import { QUIT_ON_CLOSE_SWITCH_LABEL } from './startup-card-labels'

// Re-export so existing call sites can keep importing from
// `./startup-card`. The single source of truth lives in
// `./startup-card-labels` (no UI imports) so the close-button UI
// E2E can read it under vitest's plain-node loader.
export { QUIT_ON_CLOSE_SWITCH_LABEL }

type LaunchAtLoginInfo = {
  supported: boolean
  openAtLogin: boolean
  openAsHidden: boolean
  reason?: string
}

type ScriptureLiveLaunchBridge = {
  launchAtLogin?: {
    get?: () => Promise<LaunchAtLoginInfo>
    set?: (v: boolean) => Promise<{ ok: boolean; error?: string; info: LaunchAtLoginInfo }>
  }
  quitOnClose?: {
    get?: () => Promise<{ value: boolean }>
    set?: (v: boolean) => Promise<{ ok: boolean; error?: string; value: boolean }>
  }
}

/**
 * Settings card for "Launch at startup" + "When I close the window,
 * also quit the app". When launch-at-login is enabled, the OS auto-
 * launch entry is registered with `--hidden` + `openAsHidden:true` so
 * the app comes up tray-only with NDI already running. The
 * quit-on-close toggle changes the close-button behavior — OFF (the
 * default) hides to the system tray, ON fully quits the app.
 *
 * Extracted from `settings.tsx` so the close-button E2E harness can
 * mount JUST this card (via `electron/e2e-ui/harness.tsx`) without
 * pulling in the full Settings tree (zustand store, bible-api,
 * ndi-output-panel, fonts, etc.). The UI E2E asserts that toggling
 * the rendered Radix `<Switch>` here actually round-trips through
 * `window.scriptureLive.quitOnClose.set` → IPC → preferences.json,
 * catching any future regression in the UI wiring layer.
 */
export function StartupCard() {
  const [info, setInfo] = useState<LaunchAtLoginInfo | null>(null)
  const [busy, setBusy] = useState(false)
  // Quit-on-close (close-button behavior) preference. `null` while
  // we're still reading it from the main process; in the browser
  // preview this stays `null` and the row renders disabled with an
  // explanation, mirroring how launch-at-login behaves.
  const [quitOnClose, setQuitOnCloseState] = useState<boolean | null>(null)
  const [closeBusy, setCloseBusy] = useState(false)
  const isElectron =
    typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent)

  useEffect(() => {
    if (!isElectron) {
      setInfo({
        supported: false,
        openAtLogin: false,
        openAsHidden: false,
        reason: 'Launch-at-login is only available in the desktop app.',
      })
      return
    }
    const bridge = (window as unknown as { scriptureLive?: ScriptureLiveLaunchBridge })
      .scriptureLive
    let cancelled = false
    bridge?.launchAtLogin?.get?.()
      .then((res) => { if (!cancelled) setInfo(res) })
      .catch((err) => {
        if (cancelled) return
        setInfo({
          supported: false,
          openAtLogin: false,
          openAsHidden: false,
          reason: err instanceof Error ? err.message : 'Could not read launch-at-login state.',
        })
      })
    bridge?.quitOnClose?.get?.()
      .then((res) => { if (!cancelled) setQuitOnCloseState(res.value === true) })
      .catch(() => { /* leave as null → row renders disabled */ })
    return () => { cancelled = true }
  }, [isElectron])

  const handleToggle = async (next: boolean) => {
    const bridge = (window as unknown as { scriptureLive?: ScriptureLiveLaunchBridge })
      .scriptureLive
    const setter = bridge?.launchAtLogin?.set
    if (!setter) return
    setBusy(true)
    try {
      const result = await setter(next)
      setInfo(result.info)
      if (!result.ok) {
        toast.error(result.error ?? 'Failed to update launch-at-login.')
        return
      }
      toast.success(
        next
          ? 'ScriptureLive AI will start automatically when you log in.'
          : 'Launch at startup turned off.',
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update launch-at-login.')
    } finally {
      setBusy(false)
    }
  }

  const handleQuitOnCloseToggle = async (next: boolean) => {
    const bridge = (window as unknown as { scriptureLive?: ScriptureLiveLaunchBridge })
      .scriptureLive
    const setter = bridge?.quitOnClose?.set
    if (!setter) return
    setCloseBusy(true)
    try {
      const result = await setter(next)
      setQuitOnCloseState(result.value === true)
      if (!result.ok) {
        toast.error(result.error ?? 'Failed to update close-button behavior.')
        return
      }
      toast.success(
        next
          ? 'Closing the window will quit ScriptureLive AI.'
          : 'Closing the window will keep ScriptureLive AI running in the tray.',
      )
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to update close-button behavior.',
      )
    } finally {
      setCloseBusy(false)
    }
  }

  const supported = info?.supported === true
  const checked = info?.openAtLogin === true
  // The quit-on-close toggle is meaningful in both packaged and
  // dev Electron builds (it just changes how the close handler
  // behaves), so unlike launch-at-login we only gate it on the
  // electron context — not on app.isPackaged.
  const quitOnCloseSupported = isElectron && quitOnClose !== null

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Power className="h-5 w-5 text-primary" />
          <div>
            <CardTitle className="text-base">Startup &amp; Shutdown</CardTitle>
            <CardDescription>
              When ScriptureLive AI starts, and what happens when you close the window
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <Label className="text-sm font-medium">Launch at startup</Label>
            <p className="text-xs mt-0.5 text-muted-foreground">
              {info === null
                ? 'Checking…'
                : supported
                  ? 'When on, ScriptureLive AI starts in the system tray when you log in — NDI is already running before you double-click anything. Click the tray icon to bring up the main window.'
                  : (info.reason ?? 'Not available on this system.')}
            </p>
          </div>
          <Switch
            checked={checked}
            disabled={busy || !supported}
            onCheckedChange={handleToggle}
            aria-label="Launch ScriptureLive AI when the computer boots"
          />
        </div>

        <Separator />

        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <Label className="text-sm font-medium">When I close the window, also quit the app</Label>
            <p className="text-xs mt-0.5 text-muted-foreground">
              {!isElectron
                ? 'This setting is only available in the desktop app.'
                : quitOnClose === null
                  ? 'Checking…'
                  : 'Off (recommended) keeps ScriptureLive AI running in the system tray when you click the X button — NDI and the secondary screen stay live. Turn ON if you want the X button to fully quit the app and free its memory (single-monitor setups, kiosks).'}
            </p>
          </div>
          <Switch
            checked={quitOnClose === true}
            disabled={closeBusy || !quitOnCloseSupported}
            onCheckedChange={handleQuitOnCloseToggle}
            aria-label={QUIT_ON_CLOSE_SWITCH_LABEL}
          />
        </div>
      </CardContent>
    </Card>
  )
}
