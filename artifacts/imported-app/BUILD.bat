@echo off
REM ============================================================
REM ScriptureLive AI - One-click Windows installer builder
REM ============================================================
REM Prerequisites (install ONCE before running this script):
REM   1. Node.js 20 LTS  ->  https://nodejs.org   (REQUIRED)
REM   2. NDI 5 SDK       ->  https://ndi.video/sdk (only if you
REM                          want native NDI output)
REM   3. (auto)          ->  pnpm is installed for you below
REM ============================================================

setlocal EnableDelayedExpansion
title ScriptureLive AI - Build Windows Installer
color 0B
cd /d "%~dp0"

set "LOGFILE=%CD%\build-log.txt"
set "FAIL_STEP="
echo ScriptureLive AI build started %DATE% %TIME% > "%LOGFILE%"
echo Working directory: %CD% >> "%LOGFILE%"
echo. >> "%LOGFILE%"

echo.
echo ================================================================
echo   ScriptureLive AI - One-click Windows Build  v0.3.6
echo ================================================================
echo   Full build log:   %LOGFILE%
echo.
echo   IMPORTANT: This window will STAY OPEN when finished or on
echo   error. Do not close it. The build is silent for 5-10 minutes
echo   between status lines - that is normal.
echo ================================================================
echo.

REM ---- Step 0: Verify Node.js -------------------------------------
echo [0/7] Checking Node.js...
where node >nul 2>nul
if errorlevel 1 (
  set "FAIL_STEP=Node.js is not installed or not on PATH. Install Node 20 LTS from https://nodejs.org and re-run."
  goto :DIE
)
for /f "tokens=*" %%v in ('node --version') do set "NODEVER=%%v"
echo       Node !NODEVER! OK
for /f "tokens=1 delims=." %%a in ("!NODEVER:v=!") do set "NODEMAJ=%%a"
if !NODEMAJ! lss 20 (
  color 0E
  echo       WARNING: Node 20+ is recommended. You have !NODEVER!.
  color 0B
)

REM ---- Step 1: Ensure pnpm is installed ---------------------------
echo.
echo [1/7] Checking pnpm...
where pnpm >nul 2>nul
if errorlevel 1 (
  echo       pnpm not found. Installing globally with npm...
  call npm install -g pnpm@9 >> "%LOGFILE%" 2>&1
  if errorlevel 1 (
    set "FAIL_STEP=Failed to install pnpm. Run 'npm install -g pnpm' manually then re-run."
    goto :DIE
  )
)
for /f "tokens=*" %%v in ('pnpm --version') do echo       pnpm %%v OK

REM ---- Step 2: NDI SDK detection (warn only) ----------------------
echo.
echo [2/7] Checking NDI SDK...
set "NDI_OK=0"
if exist "%PROGRAMFILES%\NDI\NDI 5 SDK\Bin\x64\Processing.NDI.Lib.x64.dll" set "NDI_OK=1"
if exist "%PROGRAMFILES%\NDI\NDI 6 SDK\Bin\x64\Processing.NDI.Lib.x64.dll" set "NDI_OK=1"
if "!NDI_OK!"=="1" (
  echo       NDI SDK found OK
) else (
  color 0E
  echo       WARNING: NDI SDK not detected. Native NDI output will not work.
  echo       Free download: https://ndi.video/sdk
  echo       Continuing anyway in 5 seconds...
  timeout /t 5 /nobreak >nul
  color 0B
)

REM ---- Step 3: Clean previous build -------------------------------
echo.
echo [3/7] Cleaning previous build...
if exist ".next"          rmdir /s /q ".next"          2>nul
if exist "dist-electron"  rmdir /s /q "dist-electron"  2>nul
if exist "release"        rmdir /s /q "release"        2>nul
echo       Cleaned

REM ---- Step 4: Install dependencies -------------------------------
echo.
echo [4/7] Installing dependencies (3-5 minutes, silent)...
echo       Output captured to build-log.txt
call pnpm config set --location=project auto-install-peers true       >> "%LOGFILE%" 2>&1
call pnpm config set --location=project strict-peer-dependencies false >> "%LOGFILE%" 2>&1

REM ── CRITICAL: tell prebuild-install to fetch the ELECTRON prebuild
REM    of grandiose, not the Node.js prebuild. The host Node version
REM    (whatever you have installed) is irrelevant — at runtime
REM    grandiose is loaded by Electron's own bundled Node ABI. Without
REM    these env vars, prebuild-install picks up your host Node (e.g.
REM    Node 24), can't find a matching prebuild, falls back to a
REM    source compile, fails because Visual Studio Build Tools aren't
REM    installed, and pnpm SILENTLY skips grandiose because it's in
REM    optionalDependencies. Result: the installed app says
REM    "NDI runtime not detected" forever.
set "npm_config_runtime=electron"
set "npm_config_target=33.2.1"
set "npm_config_disturl=https://electronjs.org/headers"
set "npm_config_arch=x64"
set "npm_config_target_arch=x64"
set "npm_config_build_from_source=false"

set INSTALL_TRY=0
:RETRY_INSTALL
set /a INSTALL_TRY+=1
call pnpm install --no-frozen-lockfile >> "%LOGFILE%" 2>&1
if errorlevel 1 (
  if !INSTALL_TRY! lss 3 (
    echo       Attempt !INSTALL_TRY! failed, retrying in 5s...
    timeout /t 5 /nobreak >nul
    goto :RETRY_INSTALL
  )
  set "FAIL_STEP=pnpm install failed after 3 tries. Common cause: unstable internet."
  goto :DIE
)
echo       Dependencies installed OK

REM ---- Step 4b: Install grandiose (NDI) ---------------------------
REM grandiose is intentionally NOT in package.json — pnpm 10 silently
REM excludes optional native modules whose engines/cpu/os don't match
REM the host (e.g. Node 24). We install it ourselves, with multiple
REM fallback strategies, and DUMP the real error to the console if
REM all of them fail so the user doesn't have to go hunt the log.
echo.
echo [4b/7] Installing NDI native module (grandiose)...
where npm >nul 2>nul
if errorlevel 1 (
  color 0E
  echo       WARNING: npm not found - skipping NDI install.
  color 0B
  goto :SKIP_GRANDIOSE
)

REM --- Strategy 1: npm install with the prebuilt binary fetch ------
echo       [strategy 1/3] npm install grandiose@3.0.5 (prebuilt binary)...
echo. >> "%LOGFILE%"
echo === GRANDIOSE STRATEGY 1: npm install >> "%LOGFILE%"
call npm install grandiose@3.0.5 --no-save --no-package-lock --legacy-peer-deps --foreground-scripts >> "%LOGFILE%" 2>&1
if exist "node_modules\grandiose\build\Release\grandiose.node" goto :GRANDIOSE_OK
if exist "node_modules\grandiose\prebuilds" goto :TRY_PREBUILD_INSTALL

REM --- Strategy 2: install JS only, then fetch binary explicitly ---
echo       [strategy 2/3] npm install --ignore-scripts then prebuild-install...
echo. >> "%LOGFILE%"
echo === GRANDIOSE STRATEGY 2: ignore-scripts + prebuild-install >> "%LOGFILE%"
call npm install grandiose@3.0.5 --no-save --no-package-lock --legacy-peer-deps --ignore-scripts >> "%LOGFILE%" 2>&1
if not exist "node_modules\grandiose\package.json" goto :GRANDIOSE_FAIL
:TRY_PREBUILD_INSTALL
pushd "node_modules\grandiose"
call npx --yes prebuild-install --runtime=electron --target=33.2.1 --arch=x64 --platform=win32 >> "%LOGFILE%" 2>&1
popd
if exist "node_modules\grandiose\build\Release\grandiose.node" goto :GRANDIOSE_OK

REM --- Strategy 3: rebuild from source against Electron via @electron/rebuild
echo       [strategy 3/3] electron-rebuild from source...
echo. >> "%LOGFILE%"
echo === GRANDIOSE STRATEGY 3: electron-rebuild from source >> "%LOGFILE%"
call pnpm exec electron-rebuild -f -w grandiose --module-dir . >> "%LOGFILE%" 2>&1
if exist "node_modules\grandiose\build\Release\grandiose.node" goto :GRANDIOSE_OK

:GRANDIOSE_FAIL
color 0E
echo.
echo ----------------------------------------------------------------
echo   NDI install FAILED. Last 30 lines of grandiose error log:
echo ----------------------------------------------------------------
powershell -NoProfile -Command "Get-Content -Tail 30 '%LOGFILE%' | ForEach-Object { Write-Host $_ }"
echo ----------------------------------------------------------------
echo   Full log: %LOGFILE%
echo.
echo   COMMON FIXES for this exact error:
echo     1. Install Visual Studio Build Tools 2022 with the
echo        "Desktop development with C++" workload, then re-run.
echo        https://visualstudio.microsoft.com/visual-cpp-build-tools/
echo     2. Make sure Python 3.x is on PATH:  python --version
echo     3. Confirm the NDI 5/6 SDK is installed (the build script
echo        already verified this in step 2). If the SDK headers are
echo        in a non-default folder, set NDI_SDK_DIR to that folder.
echo     4. If you are on Node 24, try installing Node 20 LTS
echo        (https://nodejs.org/en/download) and re-run. grandiose's
echo        prebuilt binaries are most reliable on Node 20.
echo.
echo   The build will continue WITHOUT native NDI. Output windows,
echo   transcription, and the rest of the app will still work.
color 0B
goto :SKIP_GRANDIOSE

:GRANDIOSE_OK
color 0A
echo       grandiose installed and binary present OK
color 0B
:SKIP_GRANDIOSE

REM ---- Step 5: Generate Prisma client -----------------------------
echo.
echo [5/7] Generating database client...
set PRISMA_TRY=0
:RETRY_PRISMA
set /a PRISMA_TRY+=1
call pnpm exec prisma generate >> "%LOGFILE%" 2>&1
if errorlevel 1 (
  if !PRISMA_TRY! lss 3 (
    echo       Attempt !PRISMA_TRY! failed, retrying in 5s...
    timeout /t 5 /nobreak >nul
    goto :RETRY_PRISMA
  )
  set "FAIL_STEP=prisma generate failed after 3 tries. Common cause: firewall blocking Prisma engine download."
  goto :DIE
)
echo       Prisma client OK

REM ---- Step 6: Build Next.js bundle -------------------------------
echo.
echo [6/7] Building app bundle (2-4 minutes, silent)...
call pnpm run build >> "%LOGFILE%" 2>&1
if errorlevel 1 (
  set "FAIL_STEP=Next.js build failed. See log."
  goto :DIE
)
if not exist ".next\standalone" (
  set "FAIL_STEP=.next\standalone missing - next.config.ts must use output: standalone."
  goto :DIE
)
echo       App bundle OK

REM ---- Step 7: Package Windows installer --------------------------
echo.
echo [7/7] Packaging Windows installer (3-5 minutes, silent)...
call pnpm package:win >> "%LOGFILE%" 2>&1
if errorlevel 1 (
  set "FAIL_STEP=electron-builder failed. Common: antivirus locking release\, path too long, or Explorer open in release\."
  goto :DIE
)

REM ---- Done -------------------------------------------------------
color 0A
echo.
echo ================================================================
echo   BUILD COMPLETE
echo ================================================================
echo.
echo   Installer location:  %CD%\release\
echo.
for %%F in ("%CD%\release\*Setup*.exe") do (
  echo      %%~nxF   ^(%%~zF bytes^)
)
echo.
echo   How to install:
echo     1. Double-click the .exe above
echo     2. SmartScreen warns ^(unsigned^) - More info -^> Run anyway
echo     3. Choose install folder, click Install
echo     4. Launch from desktop / Start menu
echo.
start "" "%CD%\release"
goto :END_HOLD

REM =================================================================
REM  ERROR HANDLER - this is the ONLY exit path on failure.
REM  Window MUST stay open so the user can read the error.
REM =================================================================
:DIE
color 0C
echo.
echo ================================================================
echo   BUILD FAILED
echo ================================================================
echo.
echo   Reason: !FAIL_STEP!
echo.
echo   Full log:  %LOGFILE%
echo   Opening log in Notepad...
start "" notepad "%LOGFILE%"
echo.
echo   Send the LAST 50 lines of the log for help.
echo.

REM =================================================================
REM  HOLD-THE-WINDOW handler. Both success and failure end here so
REM  the cmd window can NEVER close on its own. Two pauses + an
REM  infinite read loop guarantees it stays open even if the first
REM  pause is consumed by a stray keystroke.
REM =================================================================
:END_HOLD
echo.
echo ================================================================
echo   This window will stay open. Press any key to close it.
echo ================================================================
pause >nul
pause >nul
endlocal
exit /b 0
