/**
 * End-to-end coverage for the X-button (hide-to-tray vs quit-on-close)
 * close handler. Spins up a real Electron process via Playwright's
 * `_electron.launch()` against `electron/test-entry.ts`, drives the
 * actual `BrowserWindow.close()` API + the actual
 * `app:set-quit-on-close` IPC handler, and asserts on the actual
 * process lifecycle. If a future refactor in `main.ts` re-introduces
 * the original "X = tear down NDI mid-service" bug — or breaks the
 * "toggle takes effect on the very next close without a restart"
 * contract — these tests go red.
 *
 * Run: `pnpm --filter @workspace/imported-app run test:e2e`. The
 * launcher script installs xvfb-run + the Mesa libgbm path so the
 * Electron binary boots in this Replit nix container.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _electron as electron, type ElectronApplication } from 'playwright'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Repo-relative path to the compiled test entry. Built by the
// `pretest:e2e` script (electron/tsconfig.json → dist-electron/).
const TEST_ENTRY = path.resolve(__dirname, '..', '..', 'dist-electron', 'test-entry.js')

type TestState = {
  quitOnClose: boolean
  isQuitting: boolean
  trayAlive: boolean
  hideCount: number
  windowVisible: boolean
}

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
      // `--no-sandbox` is required when running Electron headlessly
      // under xvfb in the Replit nix container — the SUID sandbox
      // helper is not present.
      '--no-sandbox',
      // Disable the GPU pipeline so a missing libGL doesn't pop a
      // late-init error that distracts from the close-handler test.
      '--disable-gpu',
    ],
    env: {
      ...process.env,
      SL_TEST_USER_DATA_DIR: opts.userDataDir,
      // Keep Electron quiet so vitest's stdout doesn't drown in
      // ALSA / dbus warnings from the headless container.
      ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
    },
    timeout: 30_000,
  })

  // Wait until the harness has actually mounted its window and
  // installed the close handler. `firstWindow()` resolves on the
  // BrowserWindow appearing; we also explicitly wait for about:blank
  // to be loaded so the close event has a real target.
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')

  return app
}

async function readState(app: ElectronApplication): Promise<TestState> {
  // Round-trip through the renderer-exposed `__slTest__.getState`
  // bridge (test-preload.ts → ipcRenderer.invoke('test:get-state')).
  // This drives the same IPC path the production Settings UI uses
  // for `app:get-quit-on-close`, instead of poking ipcMain internals.
  const page = await app.firstWindow()
  return page.evaluate(async () => {
    type TS = {
      quitOnClose: boolean
      isQuitting: boolean
      trayAlive: boolean
      hideCount: number
      windowVisible: boolean
    }
    const bridge = (globalThis as unknown as {
      __slTest__: { getState: () => Promise<TS> }
    }).__slTest__
    if (!bridge) throw new Error('__slTest__ bridge missing on window')
    return bridge.getState()
  }) as Promise<TestState>
}

async function pressCloseButton(app: ElectronApplication): Promise<void> {
  // Drive the *real* close path — `BrowserWindow.close()` on the
  // main process. Playwright's window.close() would close the
  // page/contents instead, which doesn't fire the BrowserWindow
  // 'close' event we're testing.
  await app.evaluate(({ BrowserWindow }) => {
    const wins = BrowserWindow.getAllWindows()
    if (wins[0]) wins[0].close()
  })
}

async function setQuitOnCloseViaIpc(
  app: ElectronApplication,
  next: boolean,
): Promise<{ ok: boolean; value: boolean }> {
  // Use the renderer-side `__slTest__.setQuitOnClose` bridge — same
  // contextBridge → ipcRenderer.invoke('app:set-quit-on-close') path
  // the production Settings toggle calls. This guarantees the test
  // exercises the operator-facing code path end to end, not a
  // private ipcMain handler lookup.
  const page = await app.firstWindow()
  return page.evaluate(async (value: boolean) => {
    const bridge = (globalThis as unknown as {
      __slTest__: {
        setQuitOnClose: (
          v: boolean,
        ) => Promise<{ ok: boolean; value: boolean }>
      }
    }).__slTest__
    if (!bridge) throw new Error('__slTest__ bridge missing on window')
    return bridge.setQuitOnClose(value)
  }, next) as Promise<{ ok: boolean; value: boolean }>
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

describe('hide-to-tray vs quit-on-close (real Electron)', () => {
  let userDataDir = ''
  let app: ElectronApplication | null = null

  beforeEach(() => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-e2e-'))
  })

  afterEach(async () => {
    if (app) {
      try {
        // If the test asserted process exit, the app is already gone
        // and `close()` is a no-op. Otherwise we tear it down here.
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

  it('default (preferences.json missing): pressing X hides the window, app stays alive', async () => {
    app = await launchHarness({ userDataDir })

    // Sanity: hydrated state matches "fresh install" defaults.
    const before = await readState(app)
    expect(before.quitOnClose).toBe(false)
    expect(before.trayAlive).toBe(true)
    expect(before.windowVisible).toBe(true)
    expect(before.hideCount).toBe(0)

    await pressCloseButton(app)

    // Give the close event a tick to propagate through the handler.
    await new Promise((r) => setTimeout(r, 250))

    const after = await readState(app)
    // Window is hidden, not destroyed; the tray is still up; the
    // close handler ran (hideCount incremented). And — critically —
    // the Electron process is still alive (we just successfully
    // round-tripped IPC after the close).
    expect(after.windowVisible).toBe(false)
    expect(after.trayAlive).toBe(true)
    expect(after.hideCount).toBe(1)
    expect(after.isQuitting).toBe(false)
    expect(app.process().exitCode).toBeNull()
  })

  it('quitOnClose: true on disk: pressing X exits the app cleanly on the very first close', async () => {
    app = await launchHarness({
      userDataDir,
      initialPrefs: { quitOnClose: true },
    })

    const before = await readState(app)
    expect(before.quitOnClose).toBe(true)
    expect(before.windowVisible).toBe(true)

    const exitPromise = waitForProcessExit(app, 10_000)
    await pressCloseButton(app)
    const code = await exitPromise

    // Process really exited — no leftover Electron in the way of
    // the next launch. Exit code should be 0 (clean shutdown via
    // window-all-closed → app.quit()).
    expect(code).not.toBe('timeout')
    expect(code).toBe(0)
    // Mark that we've already drained it so afterEach doesn't try
    // to re-evaluate against a dead process.
    app = null
  })

  it('Settings UI → toggle persists AND takes effect on the very next close (no restart)', async () => {
    app = await launchHarness({ userDataDir })
    const prefsPath = path.join(userDataDir, 'preferences.json')

    // 1) Start with default behavior — first X click hides to tray.
    expect((await readState(app)).quitOnClose).toBe(false)
    await pressCloseButton(app)
    await new Promise((r) => setTimeout(r, 250))
    let state = await readState(app)
    expect(state.windowVisible).toBe(false)
    expect(state.hideCount).toBe(1)
    expect(app.process().exitCode).toBeNull()

    // 2) Re-show the window so we have something to close again.
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0]
      w.show()
    })

    // 3) Operator flips the toggle in Settings → fires the real
    //    `app:set-quit-on-close` IPC handler. Assert BOTH effects:
    //    the file on disk changed (so a restart would still pick
    //    up the new value), AND the in-memory flag changed (so the
    //    very next close reflects it).
    const ipcResult = await setQuitOnCloseViaIpc(app, true)
    expect(ipcResult.ok).toBe(true)
    expect(ipcResult.value).toBe(true)

    expect(fs.existsSync(prefsPath)).toBe(true)
    const onDisk = JSON.parse(fs.readFileSync(prefsPath, 'utf8'))
    expect(onDisk.quitOnClose).toBe(true)

    state = await readState(app)
    expect(state.quitOnClose).toBe(true)

    // 4) The very NEXT press of X — same Electron process, no
    //    restart, no second hydration — must really shut the app
    //    down. If a regression makes the close handler stale
    //    against the in-memory flag, the process never exits and
    //    this test times out.
    const exitPromise = waitForProcessExit(app, 10_000)
    await pressCloseButton(app)
    const code = await exitPromise

    expect(code).not.toBe('timeout')
    expect(code).toBe(0)
    app = null
  })

  it('Settings UI → toggling back to false re-arms the hide-to-tray behavior on the very next close', async () => {
    // Start with quitOnClose=true on disk so the in-memory flag
    // hydrates to true at boot.
    app = await launchHarness({
      userDataDir,
      initialPrefs: { quitOnClose: true },
    })
    const prefsPath = path.join(userDataDir, 'preferences.json')
    expect((await readState(app)).quitOnClose).toBe(true)

    // Operator flips the toggle OFF via the real IPC.
    const ipcResult = await setQuitOnCloseViaIpc(app, false)
    expect(ipcResult.ok).toBe(true)
    expect(ipcResult.value).toBe(false)

    const onDisk = JSON.parse(fs.readFileSync(prefsPath, 'utf8'))
    expect(onDisk.quitOnClose).toBe(false)

    // The very next close should hide instead of exit.
    await pressCloseButton(app)
    await new Promise((r) => setTimeout(r, 250))

    const state = await readState(app)
    expect(state.windowVisible).toBe(false)
    expect(state.hideCount).toBe(1)
    expect(app.process().exitCode).toBeNull()
  })
})
