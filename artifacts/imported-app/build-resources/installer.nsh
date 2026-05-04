; v0.7.85 — Custom NSIS hooks so a oneClick install over the top of a
; running ScriptureLive AI works without forcing the operator to
; uninstall first.
;
; ROOT CAUSE of the "must uninstall before update" complaint:
;   electron-builder's default oneClick installer assumes the previous
;   version is NOT running. ScriptureLive AI lives in the system tray
;   and also spawns a child Next.js process from the same .exe, so on
;   most operator machines BOTH the main window process AND the child
;   server process are alive when the new installer runs. NSIS then
;   fails to overwrite "ScriptureLive AI.exe" / app.asar / the native
;   modules and aborts with a generic "installation failed" dialog.
;
; Fix: hook into NSIS's standard customInit (fires once at installer
; start, BEFORE any files are touched) and customUnInit (fires at the
; start of every uninstall, including the silent uninstall the
; oneClick upgrade path runs internally) and forcibly terminate every
; ScriptureLive AI process. We use taskkill, which is built into every
; supported Windows version (no extra plugin DLL bundled into the
; installer). /F = force, /T = kill the whole process tree (catches
; the spawned Next child + any helpers), /IM matches by image name.
; Errors are swallowed (SetErrors discarded with ClearErrors) — if no
; process is running the kill is a no-op and the install proceeds
; normally.

!macro customInit
  ; Wait briefly so a tray icon clicked seconds ago has time to settle.
  Sleep 200
  nsExec::Exec 'taskkill /F /T /IM "ScriptureLive AI.exe"'
  Pop $0 ; discard exit code
  ; Belt-and-braces: also match the legacy product name in case an
  ; older install used a slightly different exe filename.
  nsExec::Exec 'taskkill /F /T /IM "ScriptureLive-AI.exe"'
  Pop $0
  ; Give Windows a moment to release the file handles before NSIS
  ; starts copying.
  Sleep 600
  ClearErrors
!macroend

!macro customUnInit
  ; The silent uninstall that oneClick runs as part of an upgrade also
  ; needs the running process gone — otherwise the uninstall step
  ; fails halfway through and the upgrade aborts.
  Sleep 200
  nsExec::Exec 'taskkill /F /T /IM "ScriptureLive AI.exe"'
  Pop $0
  nsExec::Exec 'taskkill /F /T /IM "ScriptureLive-AI.exe"'
  Pop $0
  Sleep 600
  ClearErrors
!macroend
