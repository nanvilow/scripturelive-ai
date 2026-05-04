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

!macro killRunningApp
  ; Pass 1
  nsExec::Exec 'taskkill /F /T /IM "ScriptureLive AI.exe"'
  Pop $0
  nsExec::Exec 'taskkill /F /T /IM "ScriptureLive-AI.exe"'
  Pop $0
  Sleep 400
  ; Pass 2
  nsExec::Exec 'taskkill /F /T /IM "ScriptureLive AI.exe"'
  Pop $0
  nsExec::Exec 'taskkill /F /T /IM "ScriptureLive-AI.exe"'
  Pop $0
  Sleep 400
  ; Pass 3
  nsExec::Exec 'taskkill /F /T /IM "ScriptureLive AI.exe"'
  Pop $0
  nsExec::Exec 'taskkill /F /T /IM "ScriptureLive-AI.exe"'
  Pop $0
  Sleep 400
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
  Sleep 1500
  ClearErrors
!macroend

!macro customInit
  Sleep 200
  !insertmacro killRunningApp
!macroend

!macro customUnInit
  ; The silent uninstall that oneClick runs as part of an upgrade also
  ; needs the running process gone — otherwise the uninstall step
  ; fails halfway through and the upgrade aborts.
  Sleep 200
  !insertmacro killRunningApp
!macroend
