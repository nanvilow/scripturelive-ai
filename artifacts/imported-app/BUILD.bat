@echo off
REM ============================================================
REM ScriptureLive AI - One-click Windows installer builder
REM ============================================================
REM Prerequisites (install ONCE before running this script):
REM   1. Node.js 20 LTS  ->  https://nodejs.org   (REQUIRED)
REM   2. NDI 5 or 6 SDK  ->  https://ndi.video/sdk
REM      (only if you want native NDI output - not strictly
REM       required because grandiose ships its own NDI libs,
REM       but recommended for the NDI Tools / Studio Monitor)
REM   3. Visual Studio Build Tools 2022 with "Desktop
REM      development with C++" workload  (REQUIRED for NDI)
REM      https://visualstudio.microsoft.com/visual-cpp-build-tools/
REM   4. Python 3.x on PATH              (REQUIRED for NDI)
REM      https://www.python.org/downloads/
REM   5. (auto)          ->  pnpm is installed for you below
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
echo   ScriptureLive AI - One-click Windows Build  v0.3.7
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

REM ---- Step 2: NDI build prerequisites (Python + VS Build Tools) --
echo.
echo [2/7] Checking NDI build prerequisites...

REM --- 2a: NDI SDK (warn only - grandiose ships its own libs) ------
set "NDI_OK=0"
if exist "%PROGRAMFILES%\NDI\NDI 5 SDK\Bin\x64\Processing.NDI.Lib.x64.dll" set "NDI_OK=1"
if exist "%PROGRAMFILES%\NDI\NDI 6 SDK\Bin\x64\Processing.NDI.Lib.x64.dll" set "NDI_OK=1"
if "!NDI_OK!"=="1" (
  echo       NDI SDK found OK
) else (
  echo       NDI SDK not found ^(OK - grandiose ships its own NDI libs^)
)

REM --- 2b: Python 3.x (REQUIRED for grandiose source compile) ------
set "PY_OK=0"
where python >nul 2>nul
if not errorlevel 1 (
  for /f "tokens=*" %%v in ('python --version 2^>^&1') do set "PYVER=%%v"
  echo       !PYVER! OK
  set "PY_OK=1"
)
if "!PY_OK!"=="0" (
  set "FAIL_STEP=Python 3.x is required to compile the NDI native module. Install from https://www.python.org/downloads/ - tick 'Add Python to PATH' - then re-run BUILD.bat."
  goto :DIE
)

REM --- 2c: Visual Studio Build Tools 2022 with C++ workload --------
REM We use vswhere (ships with VS 2017+) to detect any installation
REM that has the VC++ tools component.
set "VSWHERE=%PROGRAMFILES(X86)%\Microsoft Visual Studio\Installer\vswhere.exe"
set "VS_OK=0"
if exist "!VSWHERE!" (
  for /f "usebackq tokens=*" %%i in (`"!VSWHERE!" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2^>nul`) do (
    if not "%%i"=="" set "VS_OK=1"
  )
)
if "!VS_OK!"=="1" (
  echo       Visual Studio C++ Build Tools OK
) else (
  set "FAIL_STEP=Visual Studio Build Tools 2022 with 'Desktop development with C++' workload is required to compile the NDI native module. Download the FREE installer from https://visualstudio.microsoft.com/visual-cpp-build-tools/ - in the installer, check 'Desktop development with C++' - install ^(~5 GB^) - reboot - then re-run BUILD.bat."
  goto :DIE
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

REM Tell node-gyp to build for Electron's bundled Node ABI, not host Node.
set "npm_config_runtime=electron"
set "npm_config_target=33.2.1"
set "npm_config_disturl=https://electronjs.org/headers"
set "npm_config_arch=x64"
set "npm_config_target_arch=x64"

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

REM ---- Step 4b: Install grandiose (NDI native module) -------------
REM IMPORTANT FACTS (verified 2026-04):
REM   * grandiose on npm is ABANDONED at v0.0.4 with the OLD API
REM   * the API our ndi-service.ts uses lives ONLY on the GitHub
REM     master branch (v0.1.0-unreleased)
REM   * master uses pkg-prebuilds: tries a prebuilt binary first,
REM     falls back to node-gyp rebuild (compile from source)
REM   * grandiose ships its OWN NDI .dll/.lib/.h - no NDI SDK needed
REM     for compile, only Python + VS Build Tools (verified above)
echo.
echo [4b/7] Installing NDI native module (grandiose) from GitHub...
echo       This compiles a small C++ module - takes 1-2 minutes.

REM --- Strategy 1: install + native build in one shot --------------
echo       [strategy 1/2] npm install github:Streampunk/grandiose...
echo. >> "%LOGFILE%"
echo === GRANDIOSE STRATEGY 1: github master + source build >> "%LOGFILE%"
call npm install github:Streampunk/grandiose --no-save --no-package-lock --legacy-peer-deps --foreground-scripts --build-from-source >> "%LOGFILE%" 2>&1
if exist "node_modules\grandiose\build\Release\grandiose.node" goto :GRANDIOSE_OK

REM --- Strategy 2: install JS only, then electron-rebuild ----------
echo       [strategy 2/2] reinstall --ignore-scripts then electron-rebuild...
echo. >> "%LOGFILE%"
echo === GRANDIOSE STRATEGY 2: ignore-scripts + electron-rebuild >> "%LOGFILE%"
call npm install github:Streampunk/grandiose --no-save --no-package-lock --legacy-peer-deps --ignore-scripts >> "%LOGFILE%" 2>&1
if not exist "node_modules\grandiose\package.json" goto :GRANDIOSE_FAIL
call pnpm exec electron-rebuild -f -w grandiose --module-dir . >> "%LOGFILE%" 2>&1
if exist "node_modules\grandiose\build\Release\grandiose.node" goto :GRANDIOSE_OK

:GRANDIOSE_FAIL
color 0C
echo.
echo ================================================================
echo   NDI native module BUILD FAILED. Last 40 lines of error log:
echo ================================================================
powershell -NoProfile -Command "Get-Content -Tail 40 '%LOGFILE%' | ForEach-Object { Write-Host $_ }"
echo ================================================================
echo   Full log: %LOGFILE%
echo.
echo   Both Python and VS Build Tools were detected, so the most
echo   likely causes are:
echo     * VS Build Tools is installed but missing the C++ workload.
echo       Re-open the Visual Studio Installer, click Modify on
echo       "Build Tools 2022", and tick "Desktop development with C++".
echo     * Python is installed but node-gyp picks the wrong version.
echo       Run:  npm config set python "C:\Path\To\python.exe"
echo     * Antivirus/Defender blocked the .node file. Try excluding
echo       this folder from real-time scanning and re-run.
echo.
set "FAIL_STEP=NDI native module compile failed. See log above."
goto :DIE

:GRANDIOSE_OK
color 0A
echo       grandiose compiled and binary present OK
color 0B

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

:END_HOLD
echo.
echo ================================================================
echo   This window will stay open. Press any key to close it.
echo ================================================================
pause >nul
pause >nul
endlocal
exit /b 0
