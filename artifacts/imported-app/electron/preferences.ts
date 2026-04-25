import fs from 'node:fs'
import path from 'node:path'

/**
 * On-disk operator preferences shared by the main process. Every
 * field is optional so a fresh install / a brand-new key added in a
 * future release just falls through to the in-code default — never a
 * "missing field" crash. Lives at `userData/preferences.json`.
 */
export type AppPreferences = {
  /**
   * When true, the X button on the main window runs the normal
   * shutdown path. When false (default), the X button hides to tray
   * so NDI / the bundled Next server / the secondary screen all keep
   * running mid-service. See `shouldHideOnCloseFromInputs`.
   */
  quitOnClose?: boolean
  /**
   * When false, `notifyUpdateDownloaded` skips firing the OS toast.
   * Tray badge / tooltip / in-app banner are NOT affected. Default
   * is true (toast on) to preserve the legacy behavior operators
   * originally opted into.
   */
  desktopUpdateToastEnabled?: boolean
}

/**
 * Read preferences from the given path. Missing file ⇒ `{}`.
 * Malformed JSON / unreadable file ⇒ `{}` (best-effort, never
 * throws). Pure other than the filesystem read.
 */
export function readPreferences(filePath: string): AppPreferences {
  try {
    if (!fs.existsSync(filePath)) return {}
    const raw = fs.readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object') return parsed as AppPreferences
  } catch {
    // best-effort: defaults
  }
  return {}
}

/**
 * Write preferences to the given path. Creates the parent directory
 * on demand. Throws on filesystem errors so the caller (typically an
 * IPC handler) can surface a real error to the renderer instead of
 * silently dropping the operator's choice.
 */
export function writePreferences(filePath: string, prefs: AppPreferences): void {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(prefs, null, 2))
}

/**
 * Inputs for `shouldHideOnCloseFromInputs`. Pulled out so the
 * decision can be unit-tested without a real `BrowserWindow` /
 * `Tray` / live `app` instance.
 */
export type CloseDecisionInputs = {
  /** True when an explicit-quit code path is in flight (tray menu
   *  Quit, app menu / Cmd+Q, updater restart, fatal error → app.quit()).
   *  Set by the `before-quit` handler in main.ts. */
  isQuitting: boolean
  /** Operator preference from Settings → Startup. True ⇒ X button
   *  runs the normal shutdown path. */
  quitOnClose: boolean
  /** True when the tray icon exists and isn't destroyed. Without a
   *  tray, hide-to-tray would be a one-way trap. */
  hasLiveTray: boolean
  /** True when the target BrowserWindow exists and isn't destroyed. */
  windowAlive: boolean
}

/**
 * Pure decision function for the X-button close handler. Returns
 * true ⇒ caller should `event.preventDefault()` and hide the window
 * to tray. Returns false ⇒ caller should let the close proceed.
 *
 * Order matches the original inline checks in main.ts so any
 * regression in the close handler shows up here first.
 */
export function shouldHideOnCloseFromInputs(inputs: CloseDecisionInputs): boolean {
  if (inputs.isQuitting) return false
  if (inputs.quitOnClose) return false
  if (!inputs.hasLiveTray) return false
  if (!inputs.windowAlive) return false
  return true
}

/**
 * Duck-typed `BrowserWindow` for the close-handler installer. We
 * deliberately avoid importing `electron` here so the unit-test file
 * (`preferences.test.ts`) can keep running under plain Node — the
 * real `BrowserWindow` from Electron satisfies this shape.
 */
export interface HideableWindow {
  on(event: 'close', listener: (event: { preventDefault(): void }) => void): unknown
  hide(): unknown
  isDestroyed(): boolean
}

/**
 * Wires up the X-button → hide-to-tray vs really-close behavior on a
 * window. Lives here (instead of inline in main.ts) so the bundled
 * Electron app and the Electron-based E2E harness install the SAME
 * handler code — no risk of the test version drifting away from
 * what ships to operators.
 *
 * @param win        The window whose `close` event we're attaching to.
 * @param getInputs  Factory the handler calls at fire time. Returns
 *                   the live values for `isQuitting`, `quitOnClose`,
 *                   and `hasLiveTray` — the handler always supplies
 *                   `windowAlive` itself from the passed-in window.
 *                   Calling at fire time (not at install time) is
 *                   what makes "toggling takes effect on the very
 *                   next close without a restart" actually work.
 * @param onHide     Optional side-effect to run after a successful
 *                   hide (e.g. the first-time tray-hint notification).
 */
export function installHideToTrayCloseHandler(
  win: HideableWindow,
  getInputs: () => Omit<CloseDecisionInputs, 'windowAlive'>,
  onHide?: () => void,
): void {
  win.on('close', (event) => {
    const inputs: CloseDecisionInputs = {
      ...getInputs(),
      windowAlive: !win.isDestroyed(),
    }
    if (!shouldHideOnCloseFromInputs(inputs)) return
    event.preventDefault()
    try { win.hide() } catch { /* ignore — window may have been torn down */ }
    onHide?.()
  })
}
