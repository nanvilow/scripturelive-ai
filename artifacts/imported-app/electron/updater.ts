import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater, CancellationToken, UpdateInfo, ProgressInfo } from 'electron-updater'
import { spawn } from 'node:child_process'
import { copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { parallelDownload, formatBytesPerSecond } from './parallel-download'

/**
 * Auto-updater wired to electron-updater.
 *
 * On packaged production builds we ask GitHub Releases (configured under
 * `publish` in electron-builder.yml) whether a newer signed installer is
 * available. If yes, we download it in the background and surface an
 * unobtrusive in-app banner ("Update available — restart to install")
 * via the `updater:state` IPC channel. The check is silent on failure —
 * a church PC without internet should never see a scary update dialog.
 *
 * In dev (`!app.isPackaged`) the updater is a no-op so HMR doesn't
 * thrash the operator console with phantom update banners.
 */

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version: string; releaseNotes?: string; releaseName?: string }
  | { status: 'not-available'; version: string }
  | {
      status: 'downloading'
      percent: number
      transferred: number
      total: number
      bytesPerSecond: number
      // v0.7.17 — populated by the multi-threaded HTTP range downloader
      // (electron/parallel-download.ts). Both optional because the
      // electron-updater fallback path can't supply them.
      parallelism?: number
      etaSeconds?: number
    }
  | {
      status: 'downloaded'
      version: string
      releaseNotes?: string
      releaseName?: string
      // Set after we successfully copy the freshly-downloaded installer
      // onto the operator's Desktop. Undefined while the copy is still
      // in-flight or if it failed (non-fatal — the in-app install path
      // still works from electron-updater's private cache regardless).
      desktopCopyPath?: string
    }
  | { status: 'error'; message: string }

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000
let currentState: UpdateState = { status: 'idle' }
let intervalHandle: NodeJS.Timeout | null = null
let getWindow: (() => BrowserWindow | null) | null = null
// v0.5.31 — main-process callback supplied by main.ts so the updater
// can flip the global `isQuitting` flag right before
// `quitAndInstall()`. Without it the hide-to-tray close handler
// vetoes the close, the app stays alive, and the installer pops
// "ScriptureLive AI cannot be closed; please close it manually".
let setMainIsQuitting: ((v: boolean) => void) | null = null
// v0.5.31 — cancellation token for the in-flight signed download.
// `autoUpdater.downloadUpdate(token)` honours the token and the
// underlying request is aborted as soon as `token.cancel()` fires.
// We hold the live token here so the new `updater:cancel` IPC and
// the renderer "Cancel download" button can reach it.
let activeCancellationToken: CancellationToken | null = null
// v0.7.17 — Cached UpdateInfo from the most recent `update-available`
// event. The fast (parallel) downloader needs it to construct the
// GitHub release asset URL and to verify SHA-512 — electron-updater
// keeps this internally but doesn't expose it via a public getter.
let lastUpdateInfo: UpdateInfo | null = null
// v0.7.17 — AbortController for the in-flight parallel download. We
// expose abort via the same `updater:cancel` IPC the legacy single-
// stream path uses, so the renderer doesn't need to know which path
// it's on. Cleared on success / failure.
let fastDownloadAbort: AbortController | null = null
// v0.7.17 — Path of an installer downloaded by our parallel path.
// When non-null, `updater:install` spawns this file directly (NSIS
// detects the running .exe, prompts to close, then replaces). We need
// this because electron-updater's `quitAndInstall()` only knows about
// installers IT downloaded into its private cache — files we wrote
// ourselves are invisible to it.
let fastDownloadedFile: string | null = null
// In-process listeners for state changes (e.g. tray icon updater).
// Distinct from the renderer broadcast — we want to update OS chrome
// like the tray tooltip even when no main window is alive (background
// tray operation, window closed but app still running).
const stateListeners = new Set<(state: UpdateState) => void>()
// Architect feedback — guards against concurrent downloadUpdate()
// calls (operator double-clicking the popup, popup + Settings card
// firing simultaneously, periodic safeCheck() rebroadcasting
// 'available' mid-click). Set as soon as the IPC handler accepts
// the request; cleared on update-downloaded / error. Status alone
// isn't enough because it stays 'available' until the first
// download-progress event lands.
let downloadInFlight = false

function broadcast(state: UpdateState) {
  currentState = state
  const win = getWindow?.()
  if (win && !win.isDestroyed()) {
    win.webContents.send('updater:state', state)
  }
  for (const listener of stateListeners) {
    try {
      listener(state)
    } catch (err) {
      console.error('[updater] state listener threw (non-fatal):', err)
    }
  }
}

/**
 * Subscribe to update state changes inside the main process.
 * Returns an unsubscribe function. The listener is invoked synchronously
 * on every broadcast — keep it cheap (e.g. tray tooltip / menu rebuild).
 */
export function onUpdateState(listener: (state: UpdateState) => void): () => void {
  stateListeners.add(listener)
  return () => { stateListeners.delete(listener) }
}

function normalizeNotes(info: UpdateInfo): { notes?: string; name?: string } {
  let notes: string | undefined
  if (typeof info.releaseNotes === 'string') {
    notes = info.releaseNotes
  } else if (Array.isArray(info.releaseNotes)) {
    notes = info.releaseNotes.map((n) => n?.note).filter(Boolean).join('\n\n')
  }
  return { notes, name: info.releaseName ?? undefined }
}

/**
 * Translate the raw electron-updater / GitHub error into a short,
 * operator-friendly sentence. The default error includes a 200-line
 * HTTP header dump and a misleading "double check that your
 * authentication token is correct" line that GitHub returns for ANY
 * 404 on the releases.atom endpoint — including the perfectly normal
 * cases of "no releases published yet" and "repo is private".
 *
 * We keep the original message under the hood (the dev console still
 * sees it via the autoUpdater logger) but only surface the friendly
 * version to the renderer so the operator gets a clear next step.
 */
function friendlyUpdateError(raw: string): string {
  const m = (raw || '').toString()
  // v0.5.31 — operator-cancelled download. electron-updater raises
  // either "Cancelled" or "request cancelled" when the
  // CancellationToken fires; surface that as a calm informational
  // message instead of an alarming red error toast.
  if (/cancell?ed/i.test(m) && !/timeout|reset|refused/i.test(m)) {
    return 'Update download cancelled.'
  }
  if (/releases\.atom/.test(m) && /\b404\b/.test(m)) {
    return 'No published releases found yet. Open the Releases page to download the latest installer manually.'
  }
  if (/\b401\b|\b403\b/.test(m) || /authentication token/i.test(m)) {
    return 'GitHub repository requires authentication. Open the Releases page to download manually.'
  }
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(m)) {
    return "Can't reach GitHub. Check your internet connection and try again."
  }
  if (/ETIMEDOUT|ECONNRESET|network timeout/i.test(m)) {
    return 'Update server timed out. Try again in a moment, or open the Releases page.'
  }
  if (/cannot find latest\.yml|HttpError: 404/i.test(m)) {
    return 'No update metadata found on this release. Open the Releases page to download manually.'
  }
  // Trim hideously long messages (electron-updater dumps full HTTP
  // headers) so the toast stays readable. First line + 140 chars max.
  const firstLine = m.split('\n')[0] || m
  return firstLine.length > 140 ? firstLine.slice(0, 137) + '…' : firstLine
}

async function safeCheck() {
  if (
    currentState.status === 'checking' ||
    currentState.status === 'downloading' ||
    currentState.status === 'downloaded'
  ) {
    return
  }
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err)
    broadcast({ status: 'error', message: friendlyUpdateError(raw) })
  }
}

export function setupAutoUpdater(opts: {
  getMainWindow: () => BrowserWindow | null
  // v0.5.31 — passed by main.ts so we can flip `isQuitting=true`
  // right before `quitAndInstall()`. Optional so older callers /
  // tests can still pass just `getMainWindow`.
  setIsQuitting?: (v: boolean) => void
}) {
  getWindow = opts.getMainWindow
  setMainIsQuitting = opts.setIsQuitting ?? null

  // Operator-driven download flow: when a new release is detected we
  // surface an "Update Available — Click To Download" popup in the
  // renderer (see update-notifier.tsx). The download only starts when
  // the operator clicks Download; we never silently consume bandwidth
  // mid-service. autoInstallOnAppQuit stays true so a downloaded
  // update still applies on the next clean quit even if the operator
  // skips the explicit Install Now action.
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowDowngrade = false
  autoUpdater.logger = {
    info: (m: unknown) => console.log('[updater]', m),
    warn: (m: unknown) => console.warn('[updater]', m),
    error: (m: unknown) => console.error('[updater]', m),
    debug: (m: unknown) => console.log('[updater:debug]', m),
  }

  autoUpdater.on('checking-for-update', () => broadcast({ status: 'checking' }))
  autoUpdater.on('update-available', (info: UpdateInfo) => {
    // v0.7.17 — Stash the full UpdateInfo so triggerFastDownload() can
    // build the GitHub release URL and pass the canonical SHA-512 to
    // the parallel downloader. electron-updater holds this internally
    // but offers no public accessor, so caching it here is the only
    // way to keep the fast path consistent with the slow fallback.
    lastUpdateInfo = info
    const { notes, name } = normalizeNotes(info)
    broadcast({ status: 'available', version: info.version, releaseNotes: notes, releaseName: name })
  })
  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    broadcast({ status: 'not-available', version: info.version })
  })
  autoUpdater.on('download-progress', (p: ProgressInfo) => {
    broadcast({
      status: 'downloading',
      percent: p.percent,
      transferred: p.transferred,
      total: p.total,
      bytesPerSecond: p.bytesPerSecond,
    })
  })
  autoUpdater.on('update-downloaded', (info: UpdateInfo & { downloadedFile?: string }) => {
    downloadInFlight = false
    const { notes, name } = normalizeNotes(info)

    // Surface the 'downloaded' state immediately so the in-app
    // install button enables right away. The Desktop copy is a
    // best-effort follow-up — we do NOT block the install flow on it.
    broadcast({
      status: 'downloaded',
      version: info.version,
      releaseNotes: notes,
      releaseName: name,
    })

    // Operator-friendly bonus: drop a copy of the freshly-downloaded
    // setup .exe onto the user's Desktop with a recognisable filename.
    // This gives them a portable installer they can:
    //   - keep as a backup,
    //   - copy to a second church PC over USB,
    //   - re-run after an uninstall without going back to GitHub.
    // electron-updater stores the canonical copy under
    // %LocalAppData%\scripturelive-ai-updater\pending\... which is
    // both buried and gets cleaned up after install, so without this
    // step the operator has no easy way to grab the .exe again.
    //
    // Failures here are intentionally non-fatal: a full Desktop, a
    // locked file from antivirus, or a redirected Desktop folder will
    // log a warning but won't block the install. The install path
    // continues to use the original cache location regardless.
    if (info.downloadedFile) {
      const desktopDir = app.getPath('desktop')
      const destPath = join(desktopDir, `ScriptureLive AI Setup ${info.version}.exe`)
      copyFile(info.downloadedFile, destPath)
        .then(() => {
          console.log('[updater] copied installer to desktop:', destPath)
          // Re-broadcast with the Desktop path now that the copy
          // succeeded so the UI can confirm to the operator. The
          // listener set is idempotent — re-broadcasting an identical
          // 'downloaded' state with one extra field is cheap and
          // safe.
          broadcast({
            status: 'downloaded',
            version: info.version,
            releaseNotes: notes,
            releaseName: name,
            desktopCopyPath: destPath,
          })
        })
        .catch((err: unknown) => {
          console.warn(
            '[updater] could not copy installer to desktop (non-fatal):',
            err instanceof Error ? err.message : err,
          )
        })
    } else {
      console.warn(
        '[updater] update-downloaded event did not include downloadedFile path; skipping desktop copy.',
      )
    }
  })
  autoUpdater.on('error', (err: Error) => {
    downloadInFlight = false
    const raw = err?.message || String(err)
    // v0.5.31 — When the operator clicks Cancel, electron-updater
    // emits an 'error' event with a /cancell?ed/ message. Without
    // this guard that event would race with the explicit `idle`
    // broadcast in `updater:cancel` + `triggerUpdateDownload`'s catch
    // arm, leaving the renderer stuck on a red error banner depending
    // on which broadcast happened to fire last. Treat operator
    // cancellation as a *silent* clean-up: clear the active token,
    // emit a single calm `idle` state, and skip the friendly-error
    // toast entirely. Real network/IO cancellations (timeout / reset
    // / refused) still fall through to the error path.
    if (
      /cancell?ed/i.test(raw) &&
      !/timeout|reset|refused/i.test(raw)
    ) {
      activeCancellationToken = null
      broadcast({ status: 'idle' })
      return
    }
    activeCancellationToken = null
    broadcast({ status: 'error', message: friendlyUpdateError(raw) })
  })

  ipcMain.handle('updater:get-state', () => currentState)
  ipcMain.handle('updater:check', async () => {
    // In dev / unpackaged builds electron-updater refuses to run.
    // Surface a clear actionable status instead of pretending the
    // check ran — otherwise the operator sees the button "do nothing"
    // and assumes it's broken.
    if (!app.isPackaged) {
      const devState: UpdateState = {
        status: 'error',
        message:
          'Update checks only run in the installed desktop build. Open the Releases page to download the latest installer.',
      }
      broadcast(devState)
      return devState
    }
    await safeCheck()
    return currentState
  })
  ipcMain.handle('updater:install', () => {
    if (currentState.status !== 'downloaded') {
      return { ok: false, error: 'no update downloaded' }
    }
    // v0.5.31 — clean install path so the operator never has to
    // dismiss a "ScriptureLive AI cannot be closed" prompt:
    //
    //   1. Flip the global `isQuitting` flag so the hide-to-tray
    //      close handler in `preferences.ts` lets the close go
    //      through instead of vetoing it with `preventDefault()`.
    //   2. Force-destroy every BrowserWindow we opened (operator,
    //      congregation, NDI helper, dev-tools detached). `destroy()`
    //      bypasses the `close` event entirely so nothing can hold
    //      the process hostage.
    //   3. Schedule `quitAndInstall(isSilent=false, isForceRunAfter=true)`
    //      on the next tick so Electron has a clean stack.
    //
    // The combination guarantees the auto-installer can spawn the
    // signed installer and replace the running .exe without operator
    // intervention.
    if (setMainIsQuitting) {
      try { setMainIsQuitting(true) } catch (e) { console.warn('[updater] setIsQuitting threw:', e) }
    }
    for (const w of BrowserWindow.getAllWindows()) {
      try {
        if (!w.isDestroyed()) w.destroy()
      } catch (e) {
        console.warn('[updater] window destroy threw (non-fatal):', e)
      }
    }
    setImmediate(() => {
      // v0.7.17 — When the parallel downloader produced the installer,
      // electron-updater knows nothing about the file (it lives in
      // %TEMP%, not the updater's private cache). Spawn the NSIS
      // installer ourselves and let it replace the .exe normally:
      // detached + unref + immediate app.quit() releases every file
      // lock so the installer's internal close-detection wizard
      // proceeds without operator intervention. We pass `--updated`
      // for parity with electron-updater's launch flags so any
      // post-install hook in the NSIS script that checks for it still
      // sees the same surface.
      if (fastDownloadedFile) {
        try {
          const child = spawn(fastDownloadedFile, ['--updated'], {
            detached: true,
            stdio: 'ignore',
          })
          child.unref()
        } catch (err) {
          console.error('[updater] fast-install spawn failed:', err)
        }
        app.quit()
        return
      }
      try {
        autoUpdater.quitAndInstall(false, true)
      } catch (err) {
        console.error('[updater] quitAndInstall threw:', err)
        // Belt-and-braces: if quitAndInstall failed for some reason,
        // make sure the process at least exits so the operator can
        // re-launch from the Desktop installer copy.
        app.quit()
      }
    })
    return { ok: true }
  })
  // v0.5.31 — Operator-cancellable download.
  // Stops the in-flight signed download by firing the
  // CancellationToken we passed into `downloadUpdate(token)`.
  // electron-updater aborts the underlying HTTP request immediately
  // and emits an 'error' event with `cancelled` in the message,
  // which our error handler normalizes into a friendly toast.
  ipcMain.handle('updater:cancel', () => {
    if (currentState.status !== 'downloading') {
      return { ok: false, error: 'no download in progress' }
    }
    // v0.7.17 — A cancel may target either the parallel downloader
    // (fast path, owns `fastDownloadAbort`) or electron-updater
    // (slow fallback, owns `activeCancellationToken`). Fire whichever
    // is live; in practice only one is set at a time, but we don't
    // gate on which path is active so a cancel is always honoured.
    if (!fastDownloadAbort && !activeCancellationToken) {
      return { ok: false, error: 'no active cancellation token' }
    }
    try {
      if (fastDownloadAbort) {
        fastDownloadAbort.abort()
        fastDownloadAbort = null
      }
      if (activeCancellationToken) {
        activeCancellationToken.cancel()
        activeCancellationToken = null
      }
      // The error event will flip downloadInFlight + broadcast a
      // friendly cancellation message, but reset state proactively
      // so the renderer doesn't see a phantom 'downloading' tail.
      downloadInFlight = false
      broadcast({ status: 'idle' })
      return { ok: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, error: msg }
    }
  })
  // Operator-clicked "Download" path. Only valid when an update has
  // been announced (status === 'available').
  //
  // v0.7.17 — We now route through `triggerFastDownload()` first,
  // which uses a multi-threaded HTTP range downloader against the
  // GitHub Release asset (typically 2–4x faster than electron-
  // updater's single-stream GET on bandwidth-constrained church
  // links). On any failure (server doesn't honour Range, missing
  // metadata, SHA mismatch, network) we fall through to the legacy
  // electron-updater single-stream path so the operator never sees a
  // hard failure they can't recover from.
  //
  // Progress events from BOTH paths flow through the same
  // `updater:state` channel, so the renderer's toast / banner doesn't
  // need to know which path it's on — though the fast path adds
  // optional `parallelism` + `etaSeconds` fields the UI can surface.
  ipcMain.handle('updater:download', () => triggerFastDownload())

  // Skip the periodic check in dev — electron-updater refuses to run
  // unpackaged anyway. Manual checks via the IPC handler still fire
  // (and now return a friendly dev-mode error instead of a no-op).
  if (!app.isPackaged) {
    broadcast({ status: 'idle' })
    return
  }

  // Initial check shortly after launch, then on a periodic interval.
  setTimeout(() => { void safeCheck() }, 10_000)
  intervalHandle = setInterval(() => { void safeCheck() }, CHECK_INTERVAL_MS)

  app.on('before-quit', () => {
    if (intervalHandle) {
      clearInterval(intervalHandle)
      intervalHandle = null
    }
  })
}

/**
 * Run an update check on demand (e.g. from the Help menu) and return the
 * resulting state so callers can surface a one-shot dialog/toast.
 */
export async function runManualCheck(): Promise<UpdateState> {
  await safeCheck()
  return currentState
}

/**
 * Kick off the signed download for an already-detected update. Shared
 * between the IPC handler (renderer toast / Settings card) and the
 * tray menu so every operator-driven download path goes through the
 * same in-flight guard, status check, and error normalization. Safe
 * to call when no update is available — returns a structured result
 * instead of throwing so callers can decide what to surface.
 */
export async function triggerUpdateDownload(): Promise<
  { ok: true; alreadyInProgress?: boolean } | { ok: false; error: string }
> {
  // In-flight guard — blocks the race where a double-click on the
  // toast (or popup-click + Settings-click + tray-click in quick
  // succession) all pass the status check before the first
  // downloadUpdate() has flipped status to 'downloading'. Without
  // this guard electron-updater would happily start parallel
  // downloads.
  if (
    downloadInFlight ||
    currentState.status === 'downloading' ||
    currentState.status === 'downloaded'
  ) {
    return { ok: true, alreadyInProgress: true }
  }
  if (currentState.status !== 'available') {
    return { ok: false, error: 'no update available to download' }
  }
  downloadInFlight = true
  // v0.5.31 — Pass a fresh CancellationToken so the operator's
  // "Cancel download" button can abort the request at any time.
  // Stashed in module scope so the `updater:cancel` IPC handler can
  // reach it, and cleared on success/failure to avoid stale tokens
  // leaking into the next download.
  const token = new CancellationToken()
  activeCancellationToken = token
  try {
    await autoUpdater.downloadUpdate(token)
    // Don't clear downloadInFlight here on success — the
    // update-downloaded event handler clears it. autoUpdater
    // resolves the promise as soon as the download finishes, but
    // we want the guard to bridge any micro-window between
    // resolution and the event fire.
    if (activeCancellationToken === token) activeCancellationToken = null
    return { ok: true }
  } catch (err) {
    downloadInFlight = false
    if (activeCancellationToken === token) activeCancellationToken = null
    const raw = err instanceof Error ? err.message : String(err)
    const friendly = friendlyUpdateError(raw)
    // For an operator-initiated cancel we drop back to 'idle' so
    // the renderer's "Available — Click To Download" popup can
    // re-appear naturally on the next safeCheck() rather than
    // staying stuck on a red error banner.
    if (/cancell?ed/i.test(raw) && !/timeout|reset|refused/i.test(raw)) {
      broadcast({ status: 'idle' })
      return { ok: true, alreadyInProgress: false }
    }
    broadcast({ status: 'error', message: friendly })
    return { ok: false, error: friendly }
  }
}

/**
 * v0.7.17 — Multi-threaded download path.
 *
 * Drives the new `electron/parallel-download.ts` module, which splits
 * the GitHub Release installer into N parallel HTTP Range chunks
 * (default 4) and reassembles + SHA-512-verifies on disk. Typical
 * speed-up vs electron-updater's single GET on a shared 5 Mbps church
 * link: 2–4x. On any failure we transparently fall back to the legacy
 * `triggerUpdateDownload()` so the operator never ends up with no
 * working update path.
 *
 * Wire-up:
 *   - `lastUpdateInfo` (cached in the `update-available` handler)
 *     gives us version, asset filename (`info.path`), expected size
 *     (`info.files[0].size`), and SHA-512 (`info.sha512`).
 *   - The GitHub release tag is `v${version}` per electron-builder's
 *     publish convention; the asset URL pattern is
 *     `https://github.com/${owner}/${repo}/releases/download/${tag}/${asset}`
 *     where owner/repo come from package.json's `repository.url`.
 *   - Progress events broadcast through the same `updater:state`
 *     channel as the legacy path, but include `parallelism` and
 *     `etaSeconds` so the renderer can show "X.X MB/s · ETA Ys · 4 chunks".
 *   - On success we copy the installer to the operator's Desktop
 *     (matches the legacy path's `desktopCopyPath` behaviour) and
 *     stash the temp path in `fastDownloadedFile` so `updater:install`
 *     can spawn it directly.
 */
async function triggerFastDownload(): Promise<
  { ok: true; alreadyInProgress?: boolean } | { ok: false; error: string }
> {
  if (
    downloadInFlight ||
    currentState.status === 'downloading' ||
    currentState.status === 'downloaded'
  ) {
    return { ok: true, alreadyInProgress: true }
  }
  if (currentState.status !== 'available') {
    return { ok: false, error: 'no update available to download' }
  }
  if (!lastUpdateInfo) {
    // No cached info — happens if we somehow reached 'available' state
    // without going through the `update-available` event handler.
    // Fall back to the legacy path which doesn't need this metadata.
    console.warn('[updater] fast download: no cached UpdateInfo, falling back')
    return await triggerUpdateDownload()
  }

  const repo = getRepoFromPackageJson()
  if (!repo) {
    console.warn('[updater] fast download: could not parse repo from package.json, falling back')
    return await triggerUpdateDownload()
  }

  // electron-updater's publish config strips a leading "v" from tags
  // when normalising versions, but the actual GitHub release tag
  // electron-builder creates is `v<semver>`. Match that.
  const tag = `v${lastUpdateInfo.version}`
  const asset = lastUpdateInfo.path
  if (!asset) {
    console.warn('[updater] fast download: UpdateInfo.path missing, falling back')
    return await triggerUpdateDownload()
  }
  const url = `https://github.com/${repo.owner}/${repo.repo}/releases/download/${tag}/${asset}`
  // Belt-and-braces: prefer the per-file metadata from `info.files[0]`
  // if it exists (electron-updater populates it from latest.yml). It
  // matches `info.sha512` in practice but is defensively copied here.
  const expectedSha512 = lastUpdateInfo.files?.[0]?.sha512 || lastUpdateInfo.sha512
  const expectedSize = lastUpdateInfo.files?.[0]?.size

  // Save under %TEMP%\scripturelive-updates\<asset> so a partial
  // download (cancelled mid-way, network drop) doesn't leave junk in
  // the operator's Documents/Desktop folders. The OS cleans %TEMP%
  // periodically, so even a forgotten file eventually disappears.
  const saveDir = join(tmpdir(), 'scripturelive-updates')
  const savePath = join(saveDir, asset)

  downloadInFlight = true
  fastDownloadAbort = new AbortController()
  // Seed an immediate 'downloading' event at 0% so the renderer can
  // swap from the "Available — Click To Download" toast to the
  // progress spinner without waiting for the first byte (the HEAD
  // probe + first chunk request can take 1–2s on a slow link).
  broadcast({
    status: 'downloading',
    percent: 0,
    transferred: 0,
    total: expectedSize ?? 0,
    bytesPerSecond: 0,
    parallelism: 4,
    etaSeconds: Infinity,
  })

  const startedAt = Date.now()
  try {
    const result = await parallelDownload({
      url,
      savePath,
      expectedSha512,
      expectedSize,
      parallelism: 4,
      signal: fastDownloadAbort.signal,
      onProgress: (p) => {
        broadcast({
          status: 'downloading',
          percent: p.percent,
          transferred: p.transferred,
          total: p.total,
          bytesPerSecond: p.bytesPerSecond,
          parallelism: p.parallelism,
          etaSeconds: p.etaSeconds,
        })
      },
    })

    fastDownloadedFile = result.savePath
    downloadInFlight = false
    fastDownloadAbort = null

    const elapsedSec = (Date.now() - startedAt) / 1000
    const avgBps = elapsedSec > 0 ? result.totalBytes / elapsedSec : 0
    console.log(
      `[updater] fast download done: ${(result.totalBytes / 1024 / 1024).toFixed(1)} MB in ${elapsedSec.toFixed(1)}s ` +
        `(avg ${formatBytesPerSecond(avgBps)}, ${result.parallelism} chunk${result.parallelism === 1 ? '' : 's'}, ` +
        `ranged=${result.rangedUsed})`,
    )

    // Mirror the legacy path's behaviour: drop a copy on the operator's
    // Desktop with a friendly filename so they have a portable backup.
    const { notes, name } = normalizeNotes(lastUpdateInfo)
    const version = lastUpdateInfo.version
    let desktopCopyPath: string | undefined
    try {
      const desktopDir = app.getPath('desktop')
      const destPath = join(desktopDir, `ScriptureLive AI Setup ${version}.exe`)
      await copyFile(result.savePath, destPath)
      desktopCopyPath = destPath
      console.log('[updater] copied installer to desktop:', destPath)
    } catch (err) {
      console.warn(
        '[updater] could not copy installer to desktop (non-fatal):',
        err instanceof Error ? err.message : err,
      )
    }

    broadcast({
      status: 'downloaded',
      version,
      releaseNotes: notes,
      releaseName: name,
      desktopCopyPath,
    })
    return { ok: true }
  } catch (err) {
    downloadInFlight = false
    fastDownloadAbort = null
    const raw = err instanceof Error ? err.message : String(err)

    // Operator-cancelled — silent return to idle, same as the legacy
    // path. AbortController.abort() throws either DOMException 'AbortError'
    // or a plain "aborted" message depending on the runtime.
    if (/abort/i.test(raw) || (/cancell?ed/i.test(raw) && !/timeout|reset|refused/i.test(raw))) {
      broadcast({ status: 'idle' })
      return { ok: true, alreadyInProgress: false }
    }

    // Real failure — log it, then fall back to the legacy electron-
    // updater single-stream path. The renderer is still showing our
    // 'downloading' state, but `triggerUpdateDownload()` will fire its
    // own download-progress events that overwrite it cleanly.
    console.warn(
      '[updater] fast download failed, falling back to electron-updater single-stream:',
      raw,
    )
    return await triggerUpdateDownload()
  }
}

/**
 * Parse the GitHub owner/repo from the bundled package.json's
 * `repository.url` field. This is the same source electron-builder
 * uses for its publish target, so the two stay in sync without a
 * second hardcoded constant. Returns null on any parse failure
 * (the caller falls back to the legacy single-stream path).
 */
function getRepoFromPackageJson(): { owner: string; repo: string } | null {
  try {
    // app.getAppPath() points at the asar root in production, which
    // contains the bundled package.json. require() resolves through
    // the asar VFS the same way fs does, so this works in both dev
    // and packaged builds without special-casing.
    const pkgPath = join(app.getAppPath(), 'package.json')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require(pkgPath) as { repository?: string | { url?: string } }
    const url =
      typeof pkg.repository === 'string'
        ? pkg.repository
        : pkg.repository?.url || ''
    // Match HTTPS, SSH, and shorthand:
    //   https://github.com/owner/repo(.git)
    //   git@github.com:owner/repo.git
    //   github:owner/repo
    const m = url.match(/(?:github\.com[/:]|^github:)([^/]+)\/([^/.\s]+)(?:\.git)?\/?$/i)
    if (!m) return null
    return { owner: m[1], repo: m[2] }
  } catch (err) {
    console.warn('[updater] could not parse repo from package.json:', err)
    return null
  }
}

/** Read the latest cached state without triggering a network check. */
export function getUpdateState(): UpdateState {
  return currentState
}
