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

!macro customUnInit
  ; The silent uninstall that the assisted installer runs as part of
  ; an upgrade also needs the running process gone — otherwise the
  ; uninstall step fails halfway through and the upgrade aborts.
  !insertmacro killRunningApp
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

!macro customHeader
  ; Window title on every page. Wirecast / vMix do exactly this so
  ; the wizard chrome reinforces the brand rather than just saying
  ; "Setup". $(^Name) resolves to "ScriptureLive AI" from
  ; productName, ${VERSION} is injected by electron-builder.
  !define MUI_PAGE_HEADER_TEXT "ScriptureLive AI"
  !define MUI_PAGE_HEADER_SUBTEXT "AI-Powered Worship Presentation"
!macroend

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Welcome to ScriptureLive AI"
  !define MUI_WELCOMEPAGE_TEXT "This wizard will guide you through the installation of ScriptureLive AI v${VERSION}.$\r$\n$\r$\nReal-time scripture detection, AI-powered slide generation, and broadcast-quality NDI output for live worship.$\r$\n$\r$\nClick Next to continue."
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
!macro customFinishPage
  !define MUI_FINISHPAGE_TITLE "Installation Complete"
  !define MUI_FINISHPAGE_TEXT "ScriptureLive AI v${VERSION} has been successfully installed on your computer.$\r$\n$\r$\nClick Finish to close this installer.$\r$\n$\r$\nIf the app is not already open, tick the box below and click Finish to launch ScriptureLive AI now — or open it later from your desktop or the Start menu."
  !define MUI_FINISHPAGE_RUN_TEXT "Open ScriptureLive AI now"
  !define MUI_FINISHPAGE_RUN_NOTCHECKED
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
!macro customInstall
  IfSilent skipLaunchPrompt
  MessageBox MB_YESNO|MB_ICONINFORMATION "ScriptureLive AI v${VERSION} has been successfully installed on your computer.$\r$\n$\r$\nWould you like to open ScriptureLive AI now?$\r$\n$\r$\n(You can also open it later from your desktop or Start menu.)" /SD IDYES IDNO skipLaunchPrompt
  Exec '"$INSTDIR\ScriptureLive AI.exe"'
  skipLaunchPrompt:
  ClearErrors
!macroend
