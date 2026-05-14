/**
 * UI-driven end-to-end coverage for the X-button (hide-to-tray vs
 * quit-on-close) toggle. Spins up the same Electron harness as
 * `close-button.e2e.test.ts`, but loads the bundled production
 * `<StartupCard />` component (`electron/e2e-ui/harness.tsx`,
 * built by `scripts/build-e2e-ui.mjs`) instead of about:blank.
 *
 * The test then:
 *   1. Locates the rendered Radix `<Switch>` for "When I close the
 *      window, also quit the app" by its aria-label.
 *   2. Waits until the production `useEffect` finishes hydrating
 *      `quitOnClose` from the main process — at which point the
 *      switch becomes enabled.
 *   3. Calls `.click()` on the actual switch.
 *   4. Asserts the switch's `aria-checked` flips, that
 *      `preferences.json` on disk now contains `quitOnClose: true`,
 *      and that the very next `BrowserWindow.close()` actually
 *      exits the process (no restart, no second hydration).
 *
 * If a regression breaks the wiring chain
 *   `<Switch>.onCheckedChange → handleQuitOnCloseToggle →
 *    window.scriptureLive.quitOnClose.set →
 *    ipcRenderer.invoke('app:set-quit-on-close')`
 * this test goes red — even if the lower-level IPC E2E in
 * `close-button.e2e.test.ts` still passes.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _electron as electron, type ElectronApplication } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Pull the aria-label string from the production component itself
// so a copy-edit on the JSX surfaces here (the click target moves
// with it) instead of letting the test silently miss the toggle.
// Imported from the labels-only sibling module so we don't pull
// `@/components/ui/*` aliases into vitest's plain-node loader.
import { QUIT_ON_CLOSE_SWITCH_LABEL } from '../../src/components/views/startup-card-labels'

const TEST_ENTRY = path.resolve(__dirname, '..', '..', 'dist-electron', 'test-entry.js')

async function launchHarness(opts: {
  userDataDir: string
  initialPrefs?: { quitOnClose?: boolean }
}): Promise<ElectronApplication> {
  if (opts.initialPrefs) {
    fs.mkdirSync(opts.userDataDir, { recursive: true })
    fs.writeFileSync(
      path.join(opts.userDataDir, 'preferences.json'),
      JSON.stringify(opts.initialPrefs),
    )
  }

  const app = await electron.launch({
    args: [
      TEST_ENTRY,
      '--no-sandbox',
      '--disable-gpu',
    ],
    env: {
      ...process.env,
      SL_TEST_USER_DATA_DIR: opts.userDataDir,
      // Tells `test-entry.ts` to load the bundled StartupCard
      // harness page (file://dist-electron-ui/harness.html) instead
      // of about:blank, so the Radix `<Switch>` is mounted in the
      // same window the close handler is attached to.
      SL_TEST_LOAD_UI: '1',
      ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
    },
    timeout: 30_000,
  })

  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')

  return app
}

async function pressCloseButton(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    const wins = BrowserWindow.getAllWindows()
    if (wins[0]) wins[0].close()
  })
}

async function waitForProcessExit(
  app: ElectronApplication,
  timeoutMs: number,
): Promise<number | null | 'timeout'> {
  const proc = app.process()
  if (proc.exitCode !== null) return proc.exitCode
  return new Promise<number | null | 'timeout'>((resolve) => {
    const timer = setTimeout(() => resolve('timeout'), timeoutMs)
    proc.once('exit', (code) => {
      clearTimeout(timer)
      resolve(code)
    })
  })
}

describe('Settings UI <StartupCard /> drives quit-on-close (real Electron)', () => {
  let userDataDir = ''
  let app: ElectronApplication | null = null

  beforeEach(() => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-e2e-ui-'))
  })

  afterEach(async () => {
    if (app) {
      try {
        if (app.process().exitCode === null) {
          await app.evaluate(({ app: a }) => a.exit(0))
        }
      } catch {
        // best-effort
      }
      app = null
    }
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true })
    } catch {
      // best-effort
    }
  })

  it('clicking the rendered <Switch> persists to preferences.json AND exits on the very next close', async () => {
    app = await launchHarness({ userDataDir })
    const page = await app.firstWindow()
    const prefsPath = path.join(userDataDir, 'preferences.json')

    // Locate the actual Radix Switch operators see in Settings.
    // The aria-label here is the SAME string baked into
    // `startup-card.tsx` line 1447 — if a renamer tomorrow drops
    // it, this test fails fast with a clear "selector not found"
    // instead of a silent regression.
    const toggle = page.getByLabel(QUIT_ON_CLOSE_SWITCH_LABEL)

    // The switch is `disabled={closeBusy || !quitOnCloseSupported}`
    // and `quitOnCloseSupported` is `isElectron && quitOnClose !== null`.
    // It only becomes enabled after the mount-effect successfully
    // round-trips `app:get-quit-on-close`, which proves the read
    // half of the bridge is wired correctly.
    await toggle.waitFor({ state: 'attached', timeout: 10_000 })
    await page.waitForFunction(
      (label: string) =>
        document.querySelector(`[aria-label="${label}"]`)?.getAttribute('disabled') === null,
      QUIT_ON_CLOSE_SWITCH_LABEL,
      { timeout: 10_000 },
    )

    expect(await toggle.getAttribute('aria-checked')).toBe('false')

    // Click the real toggle. This drives onCheckedChange →
    // handleQuitOnCloseToggle → window.scriptureLive.quitOnClose.set
    // → ipcRenderer.invoke('app:set-quit-on-close', true).
    await toggle.click()

    // Wait for the Settings UI to settle on the new state — same
    // `setQuitOnCloseState(result.value === true)` line operators
    // see in production.
    await page.waitForFunction(
      (label: string) =>
        document.querySelector(`[aria-label="${label}"]`)?.getAttribute('aria-checked') === 'true',
      QUIT_ON_CLOSE_SWITCH_LABEL,
      { timeout: 5_000 },
    )

    // The IPC handler is supposed to persist to disk — same
    // `preferences.json` path the production app writes.
    expect(fs.existsSync(prefsPath)).toBe(true)
    const onDisk = JSON.parse(fs.readFileSync(prefsPath, 'utf8'))
    expect(onDisk.quitOnClose).toBe(true)

    // The very NEXT press of X — same Electron process, no restart
    // — must really shut the app down. This is the contract the
    // task is verifying: a Settings flip takes effect on the very
    // next close.
    const exitPromise = waitForProcessExit(app, 10_000)
    await pressCloseButton(app)
    const code = await exitPromise

    expect(code).not.toBe('timeout')
    expect(code).toBe(0)
    app = null
  })

  it('clicking the <Switch> back to OFF re-arms hide-to-tray on the very next close', async () => {
    // Boot with `quitOnClose: true` already on disk so the toggle
    // hydrates as ON.
    app = await launchHarness({
      userDataDir,
      initialPrefs: { quitOnClose: true },
    })
    const page = await app.firstWindow()
    const prefsPath = path.join(userDataDir, 'preferences.json')

    const toggle = page.getByLabel(QUIT_ON_CLOSE_SWITCH_LABEL)
    await toggle.waitFor({ state: 'attached', timeout: 10_000 })
    await page.waitForFunction(
      (label: string) =>
        document.querySelector(`[aria-label="${label}"]`)?.getAttribute('aria-checked') === 'true',
      QUIT_ON_CLOSE_SWITCH_LABEL,
      { timeout: 10_000 },
    )

    // Operator clicks the rendered switch back to OFF.
    await toggle.click()

    await page.waitForFunction(
      (label: string) =>
        document.querySelector(`[aria-label="${label}"]`)?.getAttribute('aria-checked') === 'false',
      QUIT_ON_CLOSE_SWITCH_LABEL,
      { timeout: 5_000 },
    )

    const onDisk = JSON.parse(fs.readFileSync(prefsPath, 'utf8'))
    expect(onDisk.quitOnClose).toBe(false)

    // Next close hides instead of exiting. We assert the process
    // is still alive after a generous quiet period and read the
    // `__slTest__.getState()` helper to confirm the close handler
    // did intercept (hideCount went up, window is no longer visible).
    await pressCloseButton(app)
    await new Promise((r) => setTimeout(r, 250))

    expect(app.process().exitCode).toBeNull()

    type TS = {
      quitOnClose: boolean
      hideCount: number
      windowVisible: boolean
      trayAlive: boolean
    }
    const state = (await page.evaluate(async () => {
      const bridge = (globalThis as unknown as {
        __slTest__: { getState: () => Promise<TS> }
      }).__slTest__
      return bridge.getState()
    })) as TS

    expect(state.windowVisible).toBe(false)
    expect(state.hideCount).toBe(1)
    expect(state.trayAlive).toBe(true)
  })
})
