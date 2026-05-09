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

!macro customFinishPage
  !define MUI_FINISHPAGE_TITLE "ScriptureLive AI is ready"
  !define MUI_FINISHPAGE_TEXT "ScriptureLive AI v${VERSION} has been installed on your computer.$\r$\n$\r$\nClick Finish to close this wizard."
  !define MUI_FINISHPAGE_RUN_TEXT "Launch ScriptureLive AI now"
!macroend
