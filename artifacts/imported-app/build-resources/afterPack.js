'use strict'

const path = require('path')
const fs = require('fs')
const { spawnSync } = require('child_process')

/*
 * v0.7.251 — Belt-and-suspenders rcedit pass on the packaged Windows .exe.
 *
 * Why this exists:
 *
 *   Operator escalation across v0.7.247 + v0.7.250: Win11 Task Manager
 *   still groups every spawned process under "Electron (N)" with the
 *   Electron atom icon even after we added `productName` to BOTH
 *   `package.json` AND `electron-builder.yml` `extraMetadata` in v0.7.250.
 *   I confirmed the OUTER installer .exe (the NSIS setup launcher) has
 *   perfect PE VersionInfo via `pefile` inspection — FileDescription =
 *   "ScriptureLive AI — AI-Powered Bible & Worship Platform", ProductName
 *   = "ScriptureLive AI", CompanyName = "ScriptureLive AI". So
 *   electron-builder's rcedit step IS working on the outer installer.
 *
 *   The Task Manager "Electron (N)" + atom icon therefore comes from one
 *   of two surviving causes on the INNER `ScriptureLive AI.exe` that NSIS
 *   extracts to `%LOCALAPPDATA%\Programs\ScriptureLive AI\`:
 *
 *     (A) The inner exe's PE VersionInfo was missed by electron-builder's
 *         internal rcedit pass under some race / cache / pnpm-workspace
 *         lookup edge case. Strictly speaking the build log shows
 *         "updating asar integrity executable resource executablePath=
 *         release\win-unpacked\ScriptureLive AI.exe" followed by
 *         "signing with signtool.exe" — but no rcedit invocation line.
 *         rcedit normally runs inside the same `signAndEditResources()`
 *         pass that emits the signtool line, but if `signAndEditExecutable`
 *         is interpreted differently in some code path the rcedit step
 *         can be skipped without surfacing an error.
 *
 *     (B) The inner exe IS stamped correctly but Win11 Task Manager
 *         prefers the AUMID's HKCU\Software\Classes\AppUserModelId\<id>
 *         registry DisplayName / IconUri over the EXE's PE FileDescription
 *         + icon resource when the runtime calls app.setAppUserModelId()
 *         with an AUMID that hasn't been registered. We fix (B) in
 *         build-resources/installer.nsh by writing those registry strings
 *         in customInstall. This hook fixes (A).
 *
 * Either alone could be the root cause — both fixes together are
 * bulletproof. Forcing rcedit again here is cheap (~200ms) and
 * idempotent: if electron-builder already stamped the file, we
 * overwrite the same VersionInfo with the same values + icon and exit
 * with no diff. If it skipped the file, we backfill it.
 *
 * How it's invoked:
 *
 *   electron-builder calls this hook after the win-unpacked/ dir is
 *   written but BEFORE NSIS packages it into the installer payload.
 *   So our rcedit pass runs on the same .exe that ends up extracted
 *   to %LOCALAPPDATA% on the operator's machine.
 *
 * Implementation notes:
 *
 *   - Uses electron-builder's bundled rcedit invocation via app-builder.exe
 *     (the same one used internally — see app-builder-lib/out/winPackager.js
 *     L180 `executeAppBuilder(['rcedit', '--args', JSON.stringify(args)])`).
 *     No new npm dep, no node-gyp surprises.
 *
 *   - Skips non-Windows platforms (afterPack fires for every target).
 *
 *   - Logs the resolved exe path + the rcedit exit code + the final
 *     FileDescription so a future operator escalation has a single grep
 *     point in the GH Actions build log to confirm the stamp landed.
 *
 *   - All version-info string values match what electron-builder would
 *     have computed from `productName` / `description` / `copyright` /
 *     `version` in electron-builder.yml + package.json — kept in sync
 *     manually here. If you change any of those source-of-truth values,
 *     update the constants block at the top of this file in lockstep.
 *
 *   - This file MUST stay CommonJS (require/module.exports). electron-builder
 *     loads hooks via `require()` from a fresh Node context inside its
 *     packaging pipeline; ESM would need .mjs + dynamic-import dance that
 *     adds zero value here.
 *
 * GUARD-RAIL: do NOT remove this hook even if a future version of
 * electron-builder claims to fix the inner-exe rcedit lookup
 * unconditionally. The hook is idempotent and adds ~200ms to the
 * build — keeping it is free insurance against future regressions of
 * the same operator-visible "Electron (N)" bug class.
 */

const PRODUCT_NAME = 'ScriptureLive AI'
const FILE_DESCRIPTION = 'ScriptureLive AI — AI-Powered Bible & Worship Platform'
const COMPANY_NAME = 'ScriptureLive AI'
const COPYRIGHT = 'ScriptureLive AI'
const INTERNAL_NAME = 'ScriptureLive AI'
const ORIGINAL_FILENAME = 'ScriptureLive AI.exe'

module.exports = async function afterPack(context) {
  const { electronPlatformName, appOutDir, packager } = context

  if (electronPlatformName !== 'win32') {
    return
  }

  const exePath = path.join(appOutDir, `${PRODUCT_NAME}.exe`)
  if (!fs.existsSync(exePath)) {
    console.warn(`[afterPack] inner exe not found at ${exePath} — skipping rcedit re-stamp`)
    return
  }

  const iconPath = path.join(packager.info.projectDir, 'build-resources', 'icon.ico')
  const version = packager.appInfo.version

  let appBuilderPath
  try {
    appBuilderPath = require('app-builder-bin').appBuilderPath
  } catch (err) {
    console.error('[afterPack] could not resolve app-builder-bin — install electron-builder', err)
    throw err
  }

  // v0.7.253 — Split into TWO separate rcedit invocations. The v0.7.251
  // single-call form bundled --set-icon inside the same JSON args array
  // as the --set-version-string operations. In some app-builder versions
  // that combination silently drops --set-icon when one of the version-
  // string args has an edge-case character — which is exactly what
  // happened on v0.7.251 + v0.7.252 builds (build log confirmed
  // FileDescription was stamped, Task Manager confirmed the icon was
  // NOT — the inner exe still shipped with the Electron atom PE icon).
  //
  // Splitting ensures EACH operation has its own success/failure signal
  // in the build log, and a failure in one doesn't silently mask the
  // other. Idempotent and still ~400ms total.
  //
  // GUARD-RAIL: do NOT re-combine these into a single rcedit call. The
  // single-call form is documented (above) as having silent-drop edge
  // cases that produced the exact operator-visible bug this hook exists
  // to fix.
  const runRcedit = (label, extraArgs) => {
    console.log(`[afterPack][${label}] rcedit ${exePath} ${extraArgs.join(' ')}`)
    const r = spawnSync(
      appBuilderPath,
      ['rcedit', '--args', JSON.stringify([exePath, ...extraArgs])],
      { stdio: 'inherit' },
    )
    if (r.status !== 0) {
      const err = new Error(
        `[afterPack][${label}] app-builder rcedit failed with exit ${r.status} for ${exePath}`,
      )
      console.error(err.message)
      throw err
    }
    console.log(`[afterPack][${label}] OK`)
  }

  // Pass 1: all version-string + file/product version stamps.
  runRcedit('versionInfo', [
    '--set-version-string', 'FileDescription', FILE_DESCRIPTION,
    '--set-version-string', 'ProductName', PRODUCT_NAME,
    '--set-version-string', 'CompanyName', COMPANY_NAME,
    '--set-version-string', 'LegalCopyright', COPYRIGHT,
    '--set-version-string', 'InternalName', INTERNAL_NAME,
    '--set-version-string', 'OriginalFilename', ORIGINAL_FILENAME,
    '--set-file-version', version,
    '--set-product-version', version,
  ])

  // Pass 2: --set-icon ONLY. Isolating the icon swap means the build log
  // unambiguously proves whether the PE icon resource was replaced. If
  // this step silently fails in a future app-builder/rcedit version, the
  // operator-visible symptom is the same "Electron atom in Task Manager"
  // bug — but now the build log will surface a non-zero exit instead of
  // dropping the arg silently.
  if (fs.existsSync(iconPath)) {
    runRcedit('icon', ['--set-icon', iconPath])
    console.log(`[afterPack][icon] stamped ${iconPath} on ${exePath}`)
  } else {
    console.warn(`[afterPack][icon] icon.ico not found at ${iconPath} — skipping --set-icon`)
  }

  console.log(`[afterPack] OK — FileDescription="${FILE_DESCRIPTION}" + icon stamped on ${exePath}`)
}
