@echo off
REM ============================================================
REM  ScriptureLive AI - One-click Windows installer builder
REM ============================================================
REM  Prerequisites (install ONCE before running this script):
REM    1. Node.js 20 LTS  ->  https://nodejs.org           (REQUIRED)
REM    2. NDI Tools 5/6   ->  https://ndi.video/tools/     (REQUIRED at runtime,
REM                                                         not during build)
REM
REM  NO Visual Studio Build Tools required.
REM  NO Python required.
REM  NO node-gyp / native compilation step.
REM
REM  v0.5.0 switched the NDI binding from grandiose (C++ addon, needs
REM  full VS + Python toolchain) to koffi (FFI, ships precompiled
REM  Electron-compatible .node binary in its npm tarball). Build is
REM  now a plain `pnpm install` -> `next build` -> `electron-builder`.
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
echo   ScriptureLive AI - One-click Windows Build  v0.5.4
echo ================================================================
echo   Full build log:   %SL_LOG%
echo.
echo   This window will STAY OPEN when finished or on error.
echo   The build is silent for 5-10 minutes between status lines.
echo ================================================================
echo.

REM ---- Step 0: Verify Node.js -------------------------------------
echo [0/5] Checking Node.js...
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
echo [1/5] Checking pnpm...
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

REM ---- Step 1b: Inform about NDI Tools (warn only) ----------------
REM NDI is loaded at RUNTIME from C:\Program Files\NDI\NDI 6 Tools\Runtime\.
REM We do NOT need it to be present during the build itself - the koffi
REM binding only resolves the DLL when the user starts the NDI source.
set "NDI_OK=0"
if exist "%PROGRAMFILES%\NDI\NDI 5 Tools\Runtime\Processing.NDI.Lib.x64.dll" set "NDI_OK=1"
if exist "%PROGRAMFILES%\NDI\NDI 6 Tools\Runtime\Processing.NDI.Lib.x64.dll" set "NDI_OK=1"
if exist "%PROGRAMFILES%\NDI\NDI 5 SDK\Bin\x64\Processing.NDI.Lib.x64.dll"   set "NDI_OK=1"
if exist "%PROGRAMFILES%\NDI\NDI 6 SDK\Bin\x64\Processing.NDI.Lib.x64.dll"   set "NDI_OK=1"
if "!NDI_OK!"=="1" (
  echo       NDI runtime DLL found OK
) else (
  color 0E
  echo       WARNING: NDI Tools/Runtime not installed at standard path.
  echo       The app will still build and run, but NDI output will be
  echo       disabled until you install NDI Tools from
  echo       https://ndi.video/tools/   ^(small free download^).
  color 0B
)

REM ---- Step 2: Clean previous build -------------------------------
echo.
echo [2/5] Cleaning previous build...
if exist ".next"          rmdir /s /q ".next"          2>nul
if exist "dist-electron"  rmdir /s /q "dist-electron"  2>nul
if exist "release"        rmdir /s /q "release"        2>nul
echo       Cleaned

REM ---- Step 3: Install dependencies -------------------------------
echo.
echo [3/5] Installing dependencies (3-5 minutes, silent)...
echo       Output captured to build-log.txt
call pnpm config set --location=project auto-install-peers true        >> "%SL_LOG%" 2>&1
call pnpm config set --location=project strict-peer-dependencies false >> "%SL_LOG%" 2>&1

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
  set "FAIL_STEP=pnpm install failed after 3 tries. Common cause: unstable internet or npm registry block."
  goto :DIE
)
echo       Dependencies installed OK

REM Sanity check: koffi must have brought down its precompiled binary.
REM koffi ships build/koffi/win32_x64/koffi.node inside its tarball, so
REM if this is missing the install was corrupted.
set "KOFFI_NODE="
for /f "delims=" %%f in ('dir /b /s "node_modules\koffi\build\koffi\win32_x64\koffi.node" 2^>nul') do set "KOFFI_NODE=%%f"
if not defined KOFFI_NODE (
  for /f "delims=" %%f in ('dir /b /s "node_modules\.pnpm\koffi@*\node_modules\koffi\build\koffi\win32_x64\koffi.node" 2^>nul') do set "KOFFI_NODE=%%f"
)
if not defined KOFFI_NODE (
  set "FAIL_STEP=koffi precompiled binary not found in node_modules. Try deleting node_modules and re-running BUILD.bat. If the problem persists, your antivirus may have quarantined koffi.node."
  goto :DIE
)
echo       koffi binary OK at !KOFFI_NODE!

REM ---- Step 4: Generate Prisma client + build Next.js -------------
echo.
echo [4/5] Building app bundle (3-6 minutes, silent)...
call pnpm exec prisma generate >> "%SL_LOG%" 2>&1
if errorlevel 1 (
  set "FAIL_STEP=prisma generate failed. Common cause: firewall blocking Prisma engine download."
  goto :DIE
)
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

REM ---- Step 5: Package Windows installer --------------------------
echo.
echo [5/5] Packaging Windows installer (3-5 minutes, silent)...
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
