@echo off
REM ============================================================
REM ScriptureLive AI - Quick fix for an interrupted build
REM ============================================================
REM Use this if your previous BUILD.bat run got stuck after the
REM "Ignored build scripts" warning from pnpm. It tells pnpm to
REM ACTUALLY run the install scripts for Electron / Prisma /
REM sharp / SWC, then resumes the build from Step 5 onward.
REM ============================================================

setlocal EnableDelayedExpansion
title ScriptureLive AI - Fix and Continue
color 0B
cd /d "%~dp0"
set "LOGFILE=%CD%\build-log.txt"

echo.
echo ================================================================
echo   ScriptureLive AI - Fix and Continue
echo ================================================================
echo.

echo [1/4] Approving install scripts that pnpm 10 blocked by default...
call pnpm config set --location=project auto-install-peers true >> "%LOGFILE%" 2>&1
call pnpm config set --location=project strict-peer-dependencies false >> "%LOGFILE%" 2>&1
echo       Done

echo.
echo [2/4] Re-running install so the native binaries actually download...
call pnpm install --no-frozen-lockfile >> "%LOGFILE%" 2>&1
if errorlevel 1 (
  color 0C
  echo ERROR: pnpm install failed. See log: %LOGFILE%
  start notepad "%LOGFILE%"
  pause
  exit /b 1
)
echo       Done

echo.
echo [3/4] Forcing rebuild of native modules (Electron, Prisma, sharp)...
call pnpm rebuild electron prisma @prisma/client @prisma/engines sharp >> "%LOGFILE%" 2>&1
if not exist "node_modules\electron\dist\electron.exe" (
  color 0C
  echo ERROR: Electron binary STILL missing.
  echo This means a firewall is blocking github.com downloads.
  echo Try a different network ^(home wifi / phone hotspot^) and re-run.
  start notepad "%LOGFILE%"
  pause
  exit /b 1
)
echo       All native binaries present

echo.
echo [4/4] Resuming the main build from Step 5 onward...
call BUILD.bat
endlocal
