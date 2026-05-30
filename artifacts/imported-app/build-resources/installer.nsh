; v0.7.253 — Explicit StdUtils.nsh include (architect nit).
;
; customFinishPage's StartApp Function uses ${StdUtils.ExecShellAsUser}
; to launch the app as the non-elevated user from a potentially-elevated
; installer process. electron-builder's templates currently include
; StdUtils.nsh transitively via multiUser.nsh, so the plugin is
; available — but a future template refactor (e.g. dropping multiUser
; for portable-only flows) could silently break the build. The include
; below is idempotent (NSIS guards against duplicate includes via the
; header file's own !ifndef sentinel) and makes our dependency explicit.
!include StdUtils.nsh

; v0.7.88 — Hardened oneClick / auto-update install over a running app.
;
; History:
;   v0.7.85 — Added customInit + customUnInit macros that taskkill the
;             running app once (200/600 ms sleeps). Worked on most boxes
;             but operators on AV-heavy / OneDrive-synced installs still
;             hit "ScriptureLive AI cannot be closed. Please close it
;             manually and click Retry to continue."
;   v0.7.88 — Root cause was a race: taskkill returns the moment the
;             SIGTERM is delivered, but Windows can take 1–2 s to flush
;             the kernel handle table, and Defender/AV can hold an
;             additional read lock on the freshly-released .exe while
;             it scans. NSIS then tries to overwrite the file before
;             the lock is released and surfaces the "file in use" UI.
;
; Hardening:
;   • Hammer the kill 4 times with 400 ms between attempts. Each
;     iteration uses /F (force) and /T (kill the whole process tree
;     so the spawned Next child + every renderer + GPU/utility helper
;     all die in one shot).
;   • Also kill any node.exe whose window title matches ScriptureLive*
;     in case a future build of the Next child uses node.exe instead
;     of process.execPath. Cheap belt-and-braces.
;   • After the kill loop, sleep 1500 ms to let Windows fully release
;     handles and let AV finish its post-mortem scan. Doubles the
;     previous 600 ms grace.
;   • Wrap each nsExec::Exec in Pop $0 so any non-zero exit code
;     (e.g. "no process found") is silently discarded.
;   • ClearErrors at the end so a transient SetErrors from one of the
;     kills doesn't poison the rest of the install.
;
; All commands here are built into every supported Windows version —
; no extra plugin DLL is bundled into the installer.

; v0.7.122 — Sleep budget trimmed from 3.3 s → 1.4 s of dead time per
;            install/upgrade. Operators reported install was "much
;            longer than it should be" — most of the wall time after
;            v0.7.66's compression:maximum + asar strip work was now
;            spent in these defensive sleeps, not in actual file copy.
;
;            Reasoning for the new values:
;              • 4 taskkill passes at 200 ms (was 400 ms) — Windows
;                normally flushes a process handle in <50 ms; 200 ms
;                between passes still gives a generous 4× safety margin.
;              • Final settle 600 ms (was 1500 ms) — Defender's post-kill
;                scan finishes in ~300-500 ms on every machine we have
;                telemetry for; 600 ms keeps the AV-heavy headroom
;                without burning 0.9 s on every fast box.
;              • customInit / customUnInit pre-sleep removed entirely
;                — there is nothing to wait for BEFORE the first kill.
;
;            If an operator reports "file in use" again, restore the
;            old 1500 ms final sleep first; that single line accounts
;            for 64 % of the savings.
!macro killRunningApp
  ; Pass 1
  nsExec::Exec 'taskkill /F /T /IM "ScriptureLive AI.exe"'
  Pop $0
  nsExec::Exec 'taskkill /F /T /IM "ScriptureLive-AI.exe"'
  Pop $0
  Sleep 200
  ; Pass 2
  nsExec::Exec 'taskkill /F /T /IM "ScriptureLive AI.exe"'
  Pop $0
  nsExec::Exec 'taskkill /F /T /IM "ScriptureLive-AI.exe"'
  Pop $0
  Sleep 200
  ; Pass 3
  nsExec::Exec 'taskkill /F /T /IM "ScriptureLive AI.exe"'
  Pop $0
  nsExec::Exec 'taskkill /F /T /IM "ScriptureLive-AI.exe"'
  Pop $0
  Sleep 200
  ; Pass 4 — also catch any node.exe child whose window title matches
  ; ScriptureLive (covers forks of the bundled Next server that use
  ; node.exe directly instead of the Electron binary).
  nsExec::Exec 'taskkill /F /T /IM "ScriptureLive AI.exe"'
  Pop $0
  nsExec::Exec 'taskkill /F /T /IM "ScriptureLive-AI.exe"'
  Pop $0
  nsExec::Exec 'taskkill /F /FI "WINDOWTITLE eq ScriptureLive*"'
  Pop $0
  ; Settle: let Windows release file handles AND let Defender/AV
  ; finish post-kill scanning before NSIS starts copying files.
  Sleep 600
  ClearErrors
!macroend

!macro customInit
  !insertmacro killRunningApp
!macroend

; v0.7.253 — Suppress the "Choose Installation Options" (per-user / all-users)
; page so the wizard matches the contracted 5-page OBS-parity flow.
;
; Operator escalation after v0.7.252 install: between License and Choose
; Install Location, the installer showed a "Choose Installation Options:
; Who should this application be installed for? Anyone who uses this
; computer / Only for me" page. That page is NOT in the OBS-parity mockup
; — operators learn the install flow from OBS / Wirecast / vMix / Pro
; Presenter, none of which surface this choice.
;
; Root cause: electron-builder's assistedInstaller.nsh template (L18-20)
; inserts PAGE_INSTALL_MODE whenever perMachine is not "true":
;
;   !ifndef INSTALL_MODE_PER_ALL_USERS
;     !insertmacro PAGE_INSTALL_MODE
;   !endif
;
; Our config (electron-builder.yml) is `perMachine: false` (we want a
; clean per-user install with NO UAC prompt), so INSTALL_MODE_PER_ALL_USERS
; is not defined → the page is inserted. Defining INSTALL_MODE_PER_ALL_USERS
; ourselves would skip the page but FORCE all-users mode (requires UAC,
; breaks the no-elevation contract).
;
; Fix: electron-builder exposes an official `customInstallMode` hook
; macro inside the install-mode-page PRE function (see
; node_modules/app-builder-lib/templates/nsis/multiUserUi.nsh L41-65):
;
;   StrCpy $isForceMachineInstall "0"
;   StrCpy $isForceCurrentInstall "0"
;   !ifmacrodef customInstallMode
;     !insertmacro customInstallMode    ; ← our hook fires here
;   !endif
;   ...
;   ${if} $isForceCurrentInstall == "1"
;     !insertmacro setInstallModePerUser
;     Abort                              ; ← skips the rest of the page
;   ${endif}
;
; By setting $isForceCurrentInstall to "1" inside customInstallMode, the
; template's own PRE function calls setInstallModePerUser (matches our
; per-user contract) AND then calls Abort, which tells MUI2 to skip the
; rest of the page → the dialog never renders, the wizard goes straight
; from License to Choose Install Location.
;
; Why this is the right hook:
;   • It is electron-builder's officially documented escape hatch for
;     exactly this situation (forced install mode without UI choice).
;   • It runs INSIDE the PRE function before any UI is created, so we
;     avoid the cosmetic "page flash" that a post-render Abort would
;     produce.
;   • setInstallModePerUser matches our perMachine: false config, so the
;     install location, registry keys, and shortcut targets all land in
;     the same per-user paths they always have. Zero behavioural drift
;     from v0.7.252 — only the page is gone.
;   • The Abort here is the MUI page-skip Abort (NOT the installer-quit
;     Abort) because it's called from inside a PRE callback.
;
; GUARD-RAIL (perMachine + customInstallMode lockstep):
; If electron-builder.yml's `nsis.perMachine` is ever changed from `false`
; to `true` or `"freeChoice"`, this macro MUST be REMOVED — otherwise it
; will force per-user install regardless of the YAML config and operators
; who explicitly want a per-machine install (e.g. multi-user sanctuary
; PCs) will silently get a per-user install. Canonical pre-ship check:
;   rg -n "perMachine|customInstallMode" \
;     artifacts/imported-app/electron-builder.yml \
;     artifacts/imported-app/build-resources/installer.nsh
; If perMachine is `false`, customInstallMode SHOULD be present. If
; perMachine is anything else, customInstallMode MUST be absent.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customUnInit
  ; The silent uninstall that the assisted installer runs as part of
  ; an upgrade also needs the running process gone — otherwise the
  ; uninstall step fails halfway through and the upgrade aborts.
  !insertmacro killRunningApp
!macroend

; v0.7.251 — Register AUMID DisplayName + IconUri + IconBackgroundColor
; in HKCU\Software\Classes\AppUserModelId\<aumid>. Without this, Win11
; Task Manager / taskbar / Start group every process spawned by
; "ScriptureLive AI.exe" under "Electron (N)" with the generic Electron
; atom icon — EVEN AFTER rcedit successfully stamps FileDescription +
; ProductName + icon on the .exe PE resource section. That is because
; Windows 11 Shell prefers the AUMID's registered DisplayName / IconUri
; over the EXE's PE FileDescription / icon when the running process has
; called `app.setAppUserModelId()` at startup (which Electron does — see
; artifacts/imported-app/electron/main.ts L183).
;
; Without an explicit registration, the AUMID `ai.scripturelive.desktop`
; is "live" but anonymous: Windows finds no DisplayName for it and
; renders the AUMID group with the framework defaults baked into Electron
; — literal label "Electron" + the atom icon Chromium embeds as a
; fallback in the v8 snapshot. This is a documented Win10+ Shell
; behaviour, not an Electron bug.
;
; Fix: NSIS writes three values under HKCU on install, deletes them on
; uninstall. The AUMID string MUST match THREE places in lockstep:
;   1. electron/main.ts L183 `app.setAppUserModelId('ai.scripturelive.desktop')`
;   2. electron-builder.yml `appId: ai.scripturelive.desktop`
;   3. The HKCU key path in this macro
; Drifting any one of the three silently re-introduces the "Electron (N)"
; group label.
;
; Per-user scope (HKCU) is intentional — the installer is per-user
; (perMachine: false in electron-builder.yml), so HKLM writes would
; require UAC elevation we deliberately avoid. Each Windows user account
; that installs the app gets their own AUMID registration; uninstall
; cleans up only the current user's keys.
;
; IconUri format: "<absolute path to exe>,<icon resource index>". Index 0
; points at the primary icon group rcedit embedded into the .exe in the
; afterPack hook. Using the EXE itself as the icon source (rather than
; a separate .ico shipped in the install dir) means Windows always shows
; the same icon in Task Manager + taskbar + Start as the .exe file icon
; in Explorer — no risk of those four surfaces ever drifting apart.
;
; IconBackgroundColor is the AARRGGBB hex Windows uses behind the icon
; in tile/jump-list contexts. "00000000" = fully transparent so the icon
; renders against whatever theme background the operator has set. (Some
; vendors use a brand colour here; our icon already has a solid bg
; pixel-baked into the .ico, so transparent is correct.)
!macro customInstall
  WriteRegStr HKCU "Software\Classes\AppUserModelId\ai.scripturelive.desktop" "DisplayName" "ScriptureLive AI"
  WriteRegStr HKCU "Software\Classes\AppUserModelId\ai.scripturelive.desktop" "IconUri" "$INSTDIR\ScriptureLive AI.exe,0"
  WriteRegStr HKCU "Software\Classes\AppUserModelId\ai.scripturelive.desktop" "IconBackgroundColor" "00000000"
!macroend

; v0.7.236 — Operator-initiated clean uninstall (EasyWorship / Wirecast parity).
;
; Operator escalation: "when users uninstall the app delete everything
; that include the app just like other apps do (EasyWorship, Wirecast,
; etc.)". Previously NSIS only removed the program files — Electron's
; user-data folder (`%APPDATA%\ScriptureLive AI\`) and any persisted
; LocalAppData survived uninstall, so a fresh reinstall on the same PC
; loaded the OLD persisted Zustand store / electron-store / SQLite
; back into the new build. Operators saw "most of the fixes didn't
; apply on this PC" because a v0.7.235 binary was running on top of
; v0.7.220-era state objects that lacked fields the new code reads
; (mediaKind, bgBrightness, throttle envelope, etc.).
;
; Fix: customUnInstall macro that prompts the operator on uninstall
; and (default YES) recursively deletes the four canonical user-data
; locations Electron / Next / our SQLite layer write to. The prompt
; matches the language operators already see in EasyWorship's uninstall
; wizard so the affordance is familiar.
;
; CRITICAL: silent uninstall (the /S flag electron-updater sets when
; the auto-updater installs an upgrade) MUST skip the wipe. Otherwise
; EVERY in-app update would erase the operator's saved library, weekly
; schedule, NDI settings, and recent-files list — catastrophic data
; loss on a Sunday morning. `IfSilent skipDataWipe` BEFORE the prompt
; is the load-bearing guard; do not remove it.
;
; Default action when the dialog is shown is YES (wipe). That matches
; the operator's intent — they're uninstalling because they don't want
; the app on this PC anymore. Operators who are about to reinstall a
; different build can click No to keep their state for the next run.
;
; Paths wiped:
;   • $APPDATA\ScriptureLive AI    — Electron userData (electron-store,
;                                    Zustand persist, IndexedDB, Local
;                                    Storage, Service Worker caches,
;                                    Network cookies, GPUCache).
;   • $LOCALAPPDATA\ScriptureLive AI — Code cache, partition data,
;                                      crash dumps, log files written
;                                      by the bundled Next server.
;   • $APPDATA\@workspace\imported-app — pre-v0.7.x namespace; some
;                                        long-time operators still have
;                                        state here from the migration
;                                        window. Cheap to clean.
;   • $LOCALAPPDATA\@workspace\imported-app — same, LocalAppData side.
;
; ClearErrors at the end so a "folder did not exist" error code from
; RMDir on a clean machine doesn't poison the installer exit code and
; trigger Windows' "Uninstall failed" toast.
!macro customUnInstall
  IfSilent skipDataWipe
  MessageBox MB_YESNO|MB_ICONQUESTION "Do you also want to delete your ScriptureLive AI settings, library, saved schedules, and cached data?$\r$\n$\r$\nClick Yes for a complete clean uninstall (recommended if you are not planning to reinstall).$\r$\n$\r$\nClick No to keep your data on this PC for a future reinstall." /SD IDYES IDNO skipDataWipe
    RMDir /r "$APPDATA\ScriptureLive AI"
    RMDir /r "$LOCALAPPDATA\ScriptureLive AI"
    RMDir /r "$APPDATA\@workspace\imported-app"
    RMDir /r "$LOCALAPPDATA\@workspace\imported-app"
  skipDataWipe:
  ; v0.7.251 — Mirror the customInstall AUMID registration: delete the
  ; HKCU\Software\Classes\AppUserModelId\<aumid> key on uninstall so the
  ; orphan registration doesn't outlive the .exe it points to. Safe to
  ; run unconditionally — DeleteRegKey on a missing key is a no-op.
  DeleteRegKey HKCU "Software\Classes\AppUserModelId\ai.scripturelive.desktop"
  ClearErrors
!macroend

; v0.7.126 — Branded MUI2 wizard customisations.
;
; electron-builder's NSIS template already wires up MUI2 with our
; installerHeader.bmp / installerSidebar.bmp / license.txt from
; electron-builder.yml, so we DON'T need to !insertmacro any MUI
; pages here — that would double-define them and crash makensis.
;
; What we DO override:
;   • The wizard window caption shown in the Windows taskbar and on
;     every page header. Default electron-builder caption is just
;     "ScriptureLive AI Setup"; we extend it with the version + a
;     short tagline so operators can tell at a glance whether the
;     installer they double-clicked is the right build.
;   • Header banner sub-text on the Welcome page so it doesn't feel
;     blank. customWelcomePage runs BEFORE the page is shown and
;     pushes a friendlier multi-line description.
;   • Finish-page run-app checkbox text — the default literally
;     reads "&Run ${PRODUCT_NAME}" which collides with our brand
;     casing (we want "Launch ScriptureLive AI"). electron-builder
;     auto-checks the box for us.

; v0.7.251 — customHeader REWRITTEN to fix broken OBS-parity page headers.
;
; Operator escalation after v0.7.250 install: "this is not implementated
; well, as i said step by step" with the OBS reference screenshots
; re-attached. Root cause: the v0.7.126 customHeader macro defined
; MUI_PAGE_HEADER_TEXT + MUI_PAGE_HEADER_SUBTEXT *globally* with the
; intent of "Window title on every page". Those macros are NOT the
; window caption — they are the per-page banner text rendered in the
; header strip ABOVE each page body. By defining them globally and
; never !undef'ing between pages, every MUI2 page (License Information,
; Choose Install Location, Installing) had its default header
; clobbered to "ScriptureLive AI" / "AI-Powered Worship Presentation".
; Operators saw three IDENTICAL-looking page headers — nothing like
; OBS's "License Information" / "Choose Install Location" / "Installing"
; per-page contextual headers.
;
; Fix: stop overriding those macros entirely. MUI2's built-in defaults
; ARE the OBS-parity strings — License page defaults to
; "License Information" / "Please review the license terms before
; installing $(^Name)", Directory page defaults to
; "Choose Install Location" / "Choose the folder in which to install
; $(^Name) ${VERSION}", InstFiles page defaults to "Installing" /
; "Please wait while $(^Name) is being installed". $(^Name) resolves
; to "ScriptureLive AI" via productName, so the language matches OBS
; verbatim with the brand name swapped in. Zero string customisation
; needed — the default MUI2 catalogue IS what OBS uses.
;
; What this macro DOES still own:
;   • Caption — the actual window title bar shown in the Windows
;     taskbar. OBS reads "OBS Studio 32.1.2 Setup"; ours now reads
;     "ScriptureLive AI v${VERSION} Setup". Without this directive
;     electron-builder defaults to "$(^Name) Setup" (no version),
;     which makes it harder for operators to confirm at a glance
;     which build they double-clicked.
;
; What customWelcomePage + customFinishPage own (unchanged from v0.7.249):
;   • Welcome page title + body + checkbox label.
;   • Finish page title + body + checkbox label.
;   Those macros use MUI_WELCOMEPAGE_* / MUI_FINISHPAGE_* — NOT
;   MUI_PAGE_HEADER_* — so they don't leak across pages.
;
; GUARD-RAIL: do NOT add !define MUI_PAGE_HEADER_TEXT or
; MUI_PAGE_HEADER_SUBTEXT to this macro (or anywhere else outside an
; explicit MUI_PAGE_* per-page customisation block). Doing so flattens
; the per-page contextual headers and re-introduces the v0.7.126
; identical-looking-pages bug. If you genuinely need to retitle ONE
; specific page header, define the macro IMMEDIATELY before that
; specific MUI_PAGE_* insertion AND !undef it immediately after.
!macro customHeader
  Caption "ScriptureLive AI v${VERSION} Setup"
  UninstallCaption "ScriptureLive AI v${VERSION} Uninstall"
!macroend

; v0.7.253 — customWelcomePage REWRITTEN to actually insert the Welcome page.
;
; Operator escalation after v0.7.252 install: Win11 installer screenshot
; sequence shows the wizard jumping STRAIGHT from double-click to the
; License page — the OBS-parity Welcome page (sidebar bitmap left,
; "Welcome to ScriptureLive AI" heading right) was MISSING.
;
; Root cause: electron-builder's assistedInstaller.nsh template (see
; node_modules/app-builder-lib/templates/nsis/assistedInstaller.nsh L9-11)
; treats customWelcomePage as a REPLACEMENT for the default welcome page
; insertion, not a "configure-and-still-render" hook:
;
;   !ifmacrodef customWelcomePage
;     !insertmacro customWelcomePage
;   !endif
;   ; ← NOTHING ELSE inserts MUI_PAGE_WELCOME
;
; The pre-v0.7.253 macro only !define'd MUI_WELCOMEPAGE_TITLE +
; MUI_WELCOMEPAGE_TEXT but NEVER called !insertmacro MUI_PAGE_WELCOME,
; so the page was silently swallowed. The !define's configured a page
; that was never created. Every release from v0.7.249 → v0.7.252 shipped
; without a real Welcome page for this reason.
;
; Fix: keep the title/text overrides AND add the missing
; !insertmacro MUI_PAGE_WELCOME at the end of the macro so the page
; actually renders.
;
; GUARD-RAIL (mandatory !insertmacro MUI_PAGE_WELCOME in customWelcomePage):
; if customWelcomePage is defined for ANY reason, it MUST end with
; !insertmacro MUI_PAGE_WELCOME — otherwise the welcome page disappears.
; Same pattern applies to customFinishPage below. Canonical pre-ship grep:
;   rg -n "!insertmacro MUI_PAGE_(WELCOME|FINISH)" artifacts/imported-app/build-resources/installer.nsh
; must return ≥ 2 matches.
!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Welcome to ScriptureLive AI v${VERSION} Setup"
  !define MUI_WELCOMEPAGE_TEXT "This wizard will guide you through the installation of ScriptureLive AI.$\r$\n$\r$\nIt is recommended that you close all other applications before starting, including any previous version of ScriptureLive AI. This will make it possible to update relevant files without having to reboot your computer.$\r$\n$\r$\nClick Next to continue."
  !insertmacro MUI_PAGE_WELCOME
!macroend

; v0.7.139 — Operator request: at the end of install, make it explicit
; that the install is complete AND give a clear choice between
; "open the app now" or "just close the installer (open it later)".
;
; MUI2's Finish page already supports this via the optional run
; checkbox electron-builder injects when `runAfterFinish` is true
; (default). What was missing was clear copy. The defaults read like a
; generic "click Finish to exit" — operators reported they didn't
; realise they could launch the app from here, OR didn't realise they
; could leave it un-launched if they just wanted to install and walk
; away (e.g. installing on a sanctuary PC ahead of Sunday).
;
; The new copy:
;   • TITLE confirms install actually completed (was the operator's
;     #1 ask — "inform users anytime the app is completely installed").
;   • TEXT spells out the two choices:
;       1. Leave the box ticked and click Finish to launch now.
;       2. Untick the box and click Finish to just close the installer
;          (the desktop / Start menu shortcut will still open the app
;          later).
;   • RUN_TEXT is the checkbox label itself, kept short so it fits.
;
; Keep all four lines on a single MUI_FINISHPAGE_TEXT call — NSIS
; concatenates $\r$\n into wizard line breaks.
;
; v0.7.143 — Run-checkbox now starts UNCHECKED (`MUI_FINISHPAGE_RUN_NOTCHECKED`).
; v0.7.142 added a `customInstall` MessageBox that fires BEFORE this
; Finish page and lets operators launch the app immediately if they
; click Yes. If we left the Finish-page run-checkbox ticked by default
; (the original v0.7.139 behaviour), an operator who clicked Yes in
; the MessageBox would see the app launch, then click Finish and
; trigger a SECOND launch — Electron's single-instance lock catches
; the duplicate but the renderer briefly flickers and operators get
; confused by the "double window" effect (architect review v0.7.142).
;
; New flow:
;   • MessageBox Yes → app launches now → Finish page checkbox shown
;     unchecked → click Finish → no second launch. ✓
;   • MessageBox No → app does NOT launch → Finish page checkbox
;     shown unchecked → operator can still tick it as a backup if
;     they change their mind. ✓
;   • Silent (/S) → no MessageBox, no Finish page, app handled by
;     auto-updater IPC. ✓
; v0.7.249 — Finish page matches OBS / Wirecast / Pro Presenter:
; "Completed Setup" title, single confirmation paragraph, run-checkbox
; CHECKED by default (the mid-flow customInstall MessageBox was
; removed in v0.7.249 to restore the OBS-style 5-page linear flow
; — Welcome → License → Install Location → Installing → Completed —
; so the Finish-page checkbox is now the ONLY launch affordance and
; SHOULD be ticked by default). Operators who want to install-only
; can simply untick before clicking Finish.
; v0.7.253 — customFinishPage REWRITTEN to actually insert the Finish page
; AND wire up the launch checkbox.
;
; Operator escalation (same v0.7.252 install screenshot sequence): the
; last page shown was a stripped-down "Installation Complete" with only
; a Close button — NO sidebar bitmap, NO "Launch ScriptureLive AI"
; checkbox, NO Finish button. That's not the MUI Finish page at all —
; it's the InstFiles page sitting on screen after the progress bar
; hits 100% because the Finish page was never inserted.
;
; Root cause: same as customWelcomePage. The electron-builder
; assistedInstaller.nsh template (L47-64) treats customFinishPage as a
; full REPLACEMENT for the default finish page block:
;
;   !ifmacrodef customFinishPage
;     !insertmacro customFinishPage
;   !else
;     ...defines StartApp Function...
;     !define MUI_FINISHPAGE_RUN
;     !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
;     !insertmacro MUI_PAGE_FINISH
;   !endif
;
; When customFinishPage is defined, the !else branch is SKIPPED — so we
; don't get StartApp, we don't get the run-checkbox define, and we don't
; get the MUI_PAGE_FINISH insertion. The pre-v0.7.253 macro only set
; title/text/run-text strings and assumed the template would do the
; insertion — but it doesn't.
;
; Fix: reproduce the template's !else branch INSIDE this macro, plus our
; custom title/text strings:
;   • StartApp Function (verbatim from the template's !else branch — same
;     ${if} ${isUpdated} / StdUtils.ExecShellAsUser as the default)
;   • MUI_FINISHPAGE_RUN + MUI_FINISHPAGE_RUN_FUNCTION (wires the run
;     checkbox to StartApp)
;   • Our branded title/text/run-text overrides
;   • !insertmacro MUI_PAGE_FINISH at the end — the missing line
;
; The checkbox starts CHECKED by default (no MUI_FINISHPAGE_RUN_NOTCHECKED)
; — matches the v0.7.249 contract: with the mid-flow customInstall
; MessageBox removed, the Finish-page checkbox is the ONLY launch
; affordance and SHOULD be ticked by default. Operators who want to
; install-only can untick before clicking Finish.
;
; GUARD-RAIL (mandatory !insertmacro MUI_PAGE_FINISH + StartApp in customFinishPage):
; if customFinishPage is defined, the macro MUST contain BOTH the StartApp
; Function AND !insertmacro MUI_PAGE_FINISH — otherwise the launch checkbox
; either doesn't render OR renders without a working launch handler.
; StdUtils.ExecShellAsUser is the only correct way to launch the app as
; the non-elevated user from a potentially-elevated installer process;
; do not replace with Exec/ExecWait/ExecShell — those would re-launch
; the app with the installer's elevated token and break NDI capture
; (which requires the operator's non-elevated session token).
; v0.7.263 — Operator escalation: "i want it so that when the installer
; is finished, it should pop up from minimize so that users will know
; it is finished."
;
; Long install runs (especially upgrades — killRunningApp + AV scan +
; 200 MB asar copy can take 30-90 s on a sanctuary PC) tempt operators
; to minimize the installer window and tab away to another task. Pre-fix
; the Finish page renders normally but the installer window stays
; minimized in the taskbar — operators don't notice it's done and the
; PC sits idle on a finished install for minutes.
;
; Fix: hook MUI_PAGE_CUSTOMFUNCTION_SHOW on the Finish page to:
;   1. ShowWindow(SW_RESTORE) — un-minimize if minimized (no-op if not).
;   2. SetForegroundWindow — bring the wizard to the top of the z-order.
;   3. FlashWindow — taskbar attention flash as a fallback because
;      Win10/11 frequently denies SetForegroundWindow requests from a
;      process that didn't own the foreground at the moment of the
;      call (foreground-lock policy). The flash always works — it's
;      the same yellow/orange highlight Outlook uses for new-mail
;      notifications.
;
; $HWNDPARENT is the NSIS main wizard window handle.
; SW_RESTORE = 9 (un-minimize and restore prior size/position).
; FlashWindow second arg "1" = flash once (TRUE for the BOOL bInvert
; parameter, the simplest API). For sustained flashing we'd use
; FlashWindowEx with a FLASHWINFO struct — overkill for a one-shot
; "install done" notification.
;
; All three calls are silently ignored if the process is /S (silent
; installer), since MUI_PAGE_FINISH itself doesn't render in silent
; mode → FinishPageShow never runs.
!macro customFinishPage
  Function StartApp
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 ""
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd

  Function FinishPageShow
    ; Un-minimize if operator tabbed away during the file-copy step.
    System::Call "user32::ShowWindow(p $HWNDPARENT, i 9)"
    ; Try to steal foreground (may be denied by Win10/11 foreground-lock).
    System::Call "user32::SetForegroundWindow(p $HWNDPARENT)"
    ; Taskbar flash — always works, draws the operator's eye even when
    ; SetForegroundWindow was denied.
    System::Call "user32::FlashWindow(p $HWNDPARENT, i 1)"
  FunctionEnd

  !define MUI_FINISHPAGE_TITLE "Completed Setup"
  !define MUI_FINISHPAGE_TEXT "ScriptureLive AI v${VERSION} has been installed on your computer.$\r$\n$\r$\nClick Finish to close Setup."
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !define MUI_FINISHPAGE_RUN_TEXT "Launch ScriptureLive AI v${VERSION}"
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW FinishPageShow
  !insertmacro MUI_PAGE_FINISH
!macroend

; v0.7.142 — Operator follow-up (screenshot https://imgur.com/a/iB0bQ2K):
; "inform users anytime the app is completely installed on their PC then
; you add an option if they want to open it or close the installer after
; installation."
;
; v0.7.139 already wired up the MUI Finish page with the right copy + a
; "Open ScriptureLive AI now" run-checkbox. But two real-world install
; flows can suppress or skip past that page so operators never see it:
;
;   1. **Auto-updater silent install.** When the in-app updater fires the
;      installer with /S (silent), MUI's Finish page is suppressed
;      entirely — no notification, app just relaunches. Operators
;      reported feeling like the update "did nothing".
;   2. **Click-through flow.** Some operators dismiss the Finish page
;      without reading (it looks like a generic "Setup wizard finished"
;      screen), miss the run-checkbox state, and end up unsure whether
;      the app actually installed.
;
; Belt-and-braces fix: fire an explicit MessageBox right after the file
; copy succeeds, BEFORE the Finish page renders. It is unmissable
; (modal, ICONINFORMATION, "Installed! Open now?" Yes/No), it works for
; both fresh installs AND user-initiated updates, and operators get
; instant confirmation that the new version is on disk.
;
; We deliberately:
;   • Skip the prompt on silent installs (`IfSilent skipPrompt`) so the
;     auto-updater can still relaunch the app without freezing on a
;     dialog the user can't see. The auto-updater path already shows
;     its own in-app "Update installed, restart?" affordance via the
;     `<UpdateAvailableDialog>` IPC channel — we don't double-prompt.
;   • Use Exec (not ExecShell) so the new instance inherits a clean
;     env and doesn't get confused by the installer's elevated token.
;     The installer is per-user (perMachine: false in
;     electron-builder.yml), so no UAC step needed.
;   • Quote the path because `Program Files\…` always contains spaces.
;   • ClearErrors at the end so a "user said No" doesn't poison the
;     installer exit code.
; v0.7.249 — customInstall MessageBox REMOVED.
;
; v0.7.142 added a mid-flow MessageBox that fired between file-copy and
; the Finish page asking "Installed! Open now? Yes/No". It worked, but
; it broke the linear OBS-style 5-page flow operators have learned from
; every other broadcast tool they use (OBS, Wirecast, vMix, Pro
; Presenter, EasyWorship) — Welcome → License → Install Location →
; Installing → Completed. The interrupt-modal felt amateurish next to
; that lineage and confused operators who clicked through it expecting
; the Finish page (operator screenshot escalation: "the popup before
; the finish screen feels like an installer glitch").
;
; The Finish page already provides an unmissable launch affordance via
; MUI's run-checkbox (now CHECKED by default in customFinishPage), so
; the MessageBox was redundant. Silent / auto-updater installs were
; already handled by IfSilent skipPrompt — no behavioural change there.
;
; The customInit / customUnInit killRunningApp hooks are unaffected;
; this only removes the post-install MessageBox.
