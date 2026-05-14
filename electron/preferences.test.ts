import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  type AppPreferences,
  readPreferences,
  writePreferences,
  shouldHideOnCloseFromInputs,
} from './preferences'

// ── shared scratch userData dir ─────────────────────────────────
// Mirrors `app.getPath('userData')` in tests by pointing every read
// / write at a per-test temp dir. Cleaned up afterwards so the next
// test sees a brand-new "fresh install" state.
let scratchDir = ''
let prefsPath = ''

beforeEach(() => {
  scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-prefs-'))
  prefsPath = path.join(scratchDir, 'preferences.json')
})

afterEach(() => {
  try {
    fs.rmSync(scratchDir, { recursive: true, force: true })
  } catch {
    // best-effort
  }
})

describe('shouldHideOnCloseFromInputs — close-button decision matrix', () => {
  // Default operator setup mid-service: quitOnClose off (the new
  // tray-friendly behavior), tray icon up, window alive, no
  // explicit-quit code path in flight. THIS is the case where the X
  // button must hide instead of tearing NDI off the air.
  const defaultLiveService = {
    isQuitting: false,
    quitOnClose: false,
    hasLiveTray: true,
    windowAlive: true,
  }

  it('hides to tray under default settings (quitOnClose=false)', () => {
    expect(shouldHideOnCloseFromInputs(defaultLiveService)).toBe(true)
  })

  it('lets the close proceed when quitOnClose=true', () => {
    expect(
      shouldHideOnCloseFromInputs({ ...defaultLiveService, quitOnClose: true }),
    ).toBe(false)
  })

  it('lets the close proceed when an explicit-quit path is in flight', () => {
    expect(
      shouldHideOnCloseFromInputs({ ...defaultLiveService, isQuitting: true }),
    ).toBe(false)
  })

  it('lets the close proceed when there is no live tray', () => {
    // Without a tray icon, hide-to-tray would be a one-way trap —
    // the operator would have no UI affordance to bring the window
    // back. Better to let close → window-all-closed → quit.
    expect(
      shouldHideOnCloseFromInputs({ ...defaultLiveService, hasLiveTray: false }),
    ).toBe(false)
  })

  it('lets the close proceed when the window is already gone', () => {
    expect(
      shouldHideOnCloseFromInputs({ ...defaultLiveService, windowAlive: false }),
    ).toBe(false)
  })

  it('isQuitting wins even if quitOnClose=false (Cmd+Q during a service)', () => {
    expect(
      shouldHideOnCloseFromInputs({
        ...defaultLiveService,
        isQuitting: true,
        quitOnClose: false,
      }),
    ).toBe(false)
  })
})

describe('readPreferences / writePreferences round-trip', () => {
  it('returns {} when the file does not exist (fresh install)', () => {
    expect(readPreferences(prefsPath)).toEqual({})
  })

  it('returns {} for a malformed file instead of throwing', () => {
    fs.writeFileSync(prefsPath, '{ this is not json')
    expect(readPreferences(prefsPath)).toEqual({})
  })

  it('persists quitOnClose across read/write cycles', () => {
    writePreferences(prefsPath, { quitOnClose: true })
    expect(readPreferences(prefsPath).quitOnClose).toBe(true)

    writePreferences(prefsPath, { quitOnClose: false })
    expect(readPreferences(prefsPath).quitOnClose).toBe(false)
  })

  it('creates the parent directory on demand', () => {
    const nested = path.join(scratchDir, 'nested', 'sub', 'preferences.json')
    writePreferences(nested, { quitOnClose: true })
    expect(fs.existsSync(nested)).toBe(true)
    expect(readPreferences(nested).quitOnClose).toBe(true)
  })

  it('preserves unrelated keys when other code only edits one', () => {
    // Both prefs share preferences.json, so the quit-on-close setter
    // must not nuke desktopUpdateToastEnabled (and vice versa). The
    // main-process setters do a read-modify-write, mirrored here.
    writePreferences(prefsPath, { desktopUpdateToastEnabled: false })
    const cur = readPreferences(prefsPath)
    writePreferences(prefsPath, { ...cur, quitOnClose: true })

    const after = readPreferences(prefsPath)
    expect(after.quitOnClose).toBe(true)
    expect(after.desktopUpdateToastEnabled).toBe(false)
  })
})

describe('hide-to-tray vs quit-on-close end-to-end', () => {
  /**
   * Tiny re-implementation of the main-process state machine for
   * `quitOnClose`, scoped to a single test. Mirrors:
   *
   *   - `hydrateQuitOnCloseFromDisk()` (read once at boot)
   *   - `setQuitOnCloseAndPersist()`  (Settings UI → IPC → here)
   *   - `shouldHideOnClose(win)`      (the actual close handler)
   *
   * We deliberately do NOT re-hydrate from disk between toggles —
   * that's the whole point of "takes effect on the very next close
   * without an app restart". If a regression silently re-introduces
   * a per-close re-hydration path that loses the in-memory value,
   * the asserts below still pass — but if a regression makes the
   * close handler ignore the in-memory flag, this test goes red.
   */
  function makeMainProcessState() {
    const initial = readPreferences(prefsPath)
    const state = {
      isQuitting: false,
      quitOnClose: initial.quitOnClose === true,
      hasLiveTray: true,
      windowAlive: true,
    }
    return {
      get quitOnClose() {
        return state.quitOnClose
      },
      /**
       * Simulates `setQuitOnCloseAndPersist(next)` — the function
       * the `app:set-quit-on-close` IPC handler calls when the
       * Settings UI flips the toggle. Read-modify-write so we don't
       * stomp the unrelated `desktopUpdateToastEnabled` key, AND
       * update the live in-memory flag atomically.
       */
      setQuitOnCloseFromSettingsUi(next: boolean) {
        const cur = readPreferences(prefsPath)
        const updated: AppPreferences = { ...cur, quitOnClose: next }
        writePreferences(prefsPath, updated)
        state.quitOnClose = next
      },
      /** Simulates the user clicking the X button on the main window. */
      pressCloseButton(): 'hide' | 'close' {
        return shouldHideOnCloseFromInputs(state) ? 'hide' : 'close'
      },
      /** Simulates the `before-quit` handler firing. */
      beginQuit() {
        state.isQuitting = true
      },
      /** Simulates the tray icon being torn down. */
      destroyTray() {
        state.hasLiveTray = false
      },
    }
  }

  it('default (preferences.json missing): X hides to tray, NDI keeps running', () => {
    // Boot path — no preferences file, just like a brand-new install.
    const main = makeMainProcessState()
    expect(main.quitOnClose).toBe(false)

    // Operator clicks the X button mid-service. The close handler
    // must intercept and hide; the app process (and therefore the
    // NDI sender / tray icon) stays alive. We assert "hide" — if a
    // regression makes this return "close", the original mid-service
    // bug is back.
    expect(main.pressCloseButton()).toBe('hide')
    // Repeat hides should also keep returning hide (no one-shot
    // suppression that drops back to close on the second X click).
    expect(main.pressCloseButton()).toBe('hide')
  })

  it('quitOnClose: true on disk: X shuts the app down cleanly on the very first close', () => {
    // Operator's previous session set the toggle on. The file is the
    // ONLY signal — there's no IPC traffic from the renderer at
    // boot, so the close handler has to honor what's on disk before
    // the first X click.
    writePreferences(prefsPath, { quitOnClose: true })

    const main = makeMainProcessState()
    expect(main.quitOnClose).toBe(true)

    // X = real shutdown. If a regression always returned "hide"
    // here, the operator would be unable to close the app from the
    // main window (the original symptom this preference was added
    // to fix on single-monitor / kiosk setups).
    expect(main.pressCloseButton()).toBe('close')
  })

  it('Settings UI → toggle persists AND takes effect on the very next close (no restart)', () => {
    // Boot fresh — file missing, defaults applied.
    const main = makeMainProcessState()
    expect(main.quitOnClose).toBe(false)
    expect(main.pressCloseButton()).toBe('hide')

    // Operator opens Settings → Startup → flips the toggle ON. This
    // is the IPC path: `app:set-quit-on-close(true)` →
    // `setQuitOnCloseAndPersist(true)`. We assert BOTH effects:
    //   1. preferences.json on disk was updated (so a restart would
    //      pick up the new value).
    //   2. the very next press of X already runs the new behavior,
    //      no restart needed.
    main.setQuitOnCloseFromSettingsUi(true)
    expect(readPreferences(prefsPath).quitOnClose).toBe(true)
    expect(main.pressCloseButton()).toBe('close')

    // Toggle back OFF: same contract — disk updates AND the very
    // next close immediately reverts to hide-to-tray.
    main.setQuitOnCloseFromSettingsUi(false)
    expect(readPreferences(prefsPath).quitOnClose).toBe(false)
    expect(main.pressCloseButton()).toBe('hide')
  })

  it('toggling quit-on-close does not stomp unrelated preferences', () => {
    // The two prefs share preferences.json. If a future refactor
    // changes the setter to overwrite the whole file, the desktop
    // toast pref would silently flip back to its default — exactly
    // the kind of "stale state from disk" bug we want a regression
    // alarm on.
    writePreferences(prefsPath, { desktopUpdateToastEnabled: false })

    const main = makeMainProcessState()
    main.setQuitOnCloseFromSettingsUi(true)

    const after = readPreferences(prefsPath)
    expect(after.quitOnClose).toBe(true)
    expect(after.desktopUpdateToastEnabled).toBe(false)
  })

  it('explicit-quit (Cmd+Q / tray Quit) overrides hide-to-tray even with quitOnClose=false', () => {
    const main = makeMainProcessState()
    expect(main.pressCloseButton()).toBe('hide')

    // The before-quit hook flips isQuitting. After that, the close
    // handler MUST let every window close so the app can actually
    // exit — otherwise Cmd+Q / tray Quit would just hide windows.
    main.beginQuit()
    expect(main.pressCloseButton()).toBe('close')
  })

  it('falls back to closing if the tray was never created / has been destroyed', () => {
    // Hide-to-tray with no tray would strand the operator. The
    // close handler degrades gracefully back to a real close.
    const main = makeMainProcessState()
    main.destroyTray()
    expect(main.pressCloseButton()).toBe('close')
  })
})
