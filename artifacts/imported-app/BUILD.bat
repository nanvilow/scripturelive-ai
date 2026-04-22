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

set "SL_LOG=%CD%\build-log.txt"
set "FAIL_STEP="
echo ScriptureLive AI build started %DATE% %TIME% > "%SL_LOG%"
echo Working directory: %CD% >> "%SL_LOG%"
echo. >> "%SL_LOG%"

echo.
echo ================================================================
echo   ScriptureLive AI - One-click Windows Build  v0.4.2
echo ================================================================
echo   Full build log:   %SL_LOG%
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
  call npm install -g pnpm@9 >> "%SL_LOG%" 2>&1
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

REM --- 2c: Visual Studio Build Tools (any version, 2017+) ----------
REM We use vswhere (ships with VS 2017+) to detect any installation
REM that has the VC++ tools component AND we capture its install
REM path so we can call vcvars64.bat later (Step 4a).
set "VSWHERE=%PROGRAMFILES(X86)%\Microsoft Visual Studio\Installer\vswhere.exe"
set "VS_OK=0"
set "VS_INSTALL="
if exist "!VSWHERE!" (
  for /f "usebackq tokens=*" %%i in (`"!VSWHERE!" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2^>nul`) do (
    if not "%%i"=="" (
      set "VS_OK=1"
      set "VS_INSTALL=%%i"
    )
  )
)
if "!VS_OK!"=="1" (
  echo       Visual Studio C++ Build Tools OK at !VS_INSTALL!
) else (
  set "FAIL_STEP=Visual Studio Build Tools (2022 or 2026) with 'Desktop development with C++' workload is required. Download free from https://visualstudio.microsoft.com/visual-cpp-build-tools/ - tick 'Desktop development with C++' - install ^(~5 GB^) - reboot - re-run BUILD.bat."
  goto :DIE
)

REM --- 2d: Enter the VS Build environment (vcvars64.bat) -----------
REM CRITICAL: this is the entire reason every previous build failed.
REM
REM node-gyp's PowerShell-based VS detection only knows VS 2017/2019/
REM 2022 (versionYear values 15/16/17). VS 2026 reports as version 18
REM and is rejected as "unsupported version: 18". By calling
REM vcvars64.bat ourselves, we set VCINSTALLDIR/INCLUDE/LIB/PATH the
REM way Microsoft's own build automation does. node-gyp then sees
REM "running in VS Command Prompt" and skips its broken auto-detect,
REM using the active environment directly. VS 2026's MSBuild is
REM fully backward-compatible with the VS2022 toolset format.
set "VCVARS=!VS_INSTALL!\VC\Auxiliary\Build\vcvars64.bat"
if not exist "!VCVARS!" (
  set "FAIL_STEP=Found VS at !VS_INSTALL! but vcvars64.bat is missing - the C++ workload is incomplete. Open Visual Studio Installer, click Modify on Build Tools, tick 'Desktop development with C++' (with all default sub-components), apply."
  goto :DIE
)
echo       Loading VS C++ env from vcvars64.bat...
REM Save our log path BEFORE vcvars (it may clobber any var it likes).
set "_SAVE_SL_LOG=%SL_LOG%"
call "!VCVARS!" >> "%SL_LOG%" 2>&1
REM Restore in case vcvars overwrote it.
set "SL_LOG=%_SAVE_SL_LOG%"
if not defined VCINSTALLDIR (
  set "FAIL_STEP=vcvars64.bat ran but VCINSTALLDIR is not set. Re-install VS Build Tools and reboot."
  goto :DIE
)
REM Force gyp to assume VS2022 layout (works for VS2022 AND VS2026).
set "GYP_MSVS_VERSION=2022"
set "npm_config_msvs_version=2022"
echo       VS env loaded. VCINSTALLDIR=!VCINSTALLDIR!

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
call pnpm config set --location=project auto-install-peers true       >> "%SL_LOG%" 2>&1
call pnpm config set --location=project strict-peer-dependencies false >> "%SL_LOG%" 2>&1

REM Tell node-gyp to build for Electron's bundled Node ABI, not host Node.
set "npm_config_runtime=electron"
set "npm_config_target=33.2.1"
set "npm_config_disturl=https://electronjs.org/headers"
set "npm_config_arch=x64"
set "npm_config_target_arch=x64"

set INSTALL_TRY=0
:RETRY_INSTALL
set /a INSTALL_TRY+=1
call pnpm install --no-frozen-lockfile >> "%SL_LOG%" 2>&1
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

REM Use HTTPS tarball, NOT github:user/repo - the github: syntax
REM requires git.exe to be installed; the tarball URL just uses
REM HTTPS so it works on any machine.
set "GRANDIOSE_URL=https://codeload.github.com/Streampunk/grandiose/tar.gz/refs/heads/master"

REM (Step 2d already set up the VS environment with vcvars64.bat,
REM  GYP_MSVS_VERSION=2022, and npm_config_msvs_version=2022. node-gyp
REM  will now skip its broken VS detection and use the active env.)

REM --- Strategy 1: install + native build in one shot --------------
echo       [strategy 1/2] npm install grandiose tarball + source build...
echo. >> "%SL_LOG%"
echo === GRANDIOSE STRATEGY 1: tarball + source build >> "%SL_LOG%"
call npm install "!GRANDIOSE_URL!" --no-save --no-package-lock --legacy-peer-deps --foreground-scripts --build-from-source >> "%SL_LOG%" 2>&1
if exist "node_modules\grandiose\build\Release\grandiose.node" goto :GRANDIOSE_OK

REM --- Strategy 2: install JS only, then electron-rebuild ----------
echo       [strategy 2/2] reinstall --ignore-scripts then electron-rebuild...
echo. >> "%SL_LOG%"
echo === GRANDIOSE STRATEGY 2: ignore-scripts + electron-rebuild >> "%SL_LOG%"
call npm install "!GRANDIOSE_URL!" --no-save --no-package-lock --legacy-peer-deps --ignore-scripts >> "%SL_LOG%" 2>&1
if not exist "node_modules\grandiose\package.json" goto :GRANDIOSE_FAIL
call pnpm exec electron-rebuild -f -w grandiose --module-dir . >> "%SL_LOG%" 2>&1
if exist "node_modules\grandiose\build\Release\grandiose.node" goto :GRANDIOSE_OK

:GRANDIOSE_FAIL
color 0C
echo.
echo ================================================================
echo   NDI native module BUILD FAILED. Last 40 lines of error log:
echo ================================================================
powershell -NoProfile -Command "Get-Content -Tail 40 '%SL_LOG%' | ForEach-Object { Write-Host $_ }"
echo ================================================================
echo   Full log: %SL_LOG%
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
call pnpm exec prisma generate >> "%SL_LOG%" 2>&1
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
call pnpm run build >> "%SL_LOG%" 2>&1
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
call pnpm package:win >> "%SL_LOG%" 2>&1
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
echo   Full log:  %SL_LOG%
echo   Opening log in Notepad...
start "" notepad "%SL_LOG%"
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
