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
REM   What this does, top to bottom:
REM     0/7 Verify Node 20+
REM     1/7 Install / verify pnpm
REM     2/7 Detect NDI SDK (warn-only)
REM     3/7 Clean previous build artifacts
REM     4/7 pnpm install (3 retries on flaky networks)
REM     5/7 Generate Prisma client (3 retries)
REM     6/7 Build the Next.js production bundle
REM     7/7 Compile Electron main process + package signed installer
REM ============================================================

setlocal EnableDelayedExpansion
title ScriptureLive AI - Build Windows Installer
color 0B
cd /d "%~dp0"

set "LOGFILE=%CD%\build-log.txt"
echo ScriptureLive AI build started %DATE% %TIME% > "%LOGFILE%"
echo Working directory: %CD% >> "%LOGFILE%"
echo. >> "%LOGFILE%"

echo.
echo ================================================================
echo   ScriptureLive AI - One-click Windows Build
echo   v0.3.0 - includes auto-scroll, sermon transcript cleanup,
echo            mic input meter, strict audio meter and more.
echo ================================================================
echo   Full build log:   %LOGFILE%
echo ================================================================
echo.

REM ---- Step 0: Verify Node.js -------------------------------------
echo [0/7] Checking Node.js...
where node >nul 2>nul
if errorlevel 1 (
  color 0C
  echo.
  echo ERROR: Node.js is not installed or not on PATH.
  echo Install Node.js 20 LTS from https://nodejs.org then re-run this script.
  echo.
  pause
  exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do (
  set "NODEVER=%%v"
  echo       Node !NODEVER! OK
)
REM Node 20+ check (major version)
for /f "tokens=1 delims=." %%a in ("!NODEVER:v=!") do set "NODEMAJ=%%a"
if !NODEMAJ! lss 20 (
  color 0E
  echo       WARNING: Node 20 LTS or newer is recommended. You have !NODEVER!.
  set /p CONT="Continue anyway? (y/N): "
  if /I not "!CONT!"=="y" exit /b 1
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
    color 0C
    echo.
    echo ERROR: Failed to install pnpm. Run "npm install -g pnpm" manually.
    echo See log: %LOGFILE%
    pause
    exit /b 1
  )
) else (
  for /f "tokens=*" %%v in ('pnpm --version') do echo       pnpm %%v OK
)

REM ---- Step 2: Verify NDI SDK -------------------------------------
echo.
echo [2/7] Checking NDI SDK...
set "NDI_OK=0"
if exist "%PROGRAMFILES%\NDI\NDI 5 SDK\Bin\x64\Processing.NDI.Lib.x64.dll" set "NDI_OK=1"
if exist "%PROGRAMFILES%\NDI\NDI 6 SDK\Bin\x64\Processing.NDI.Lib.x64.dll" set "NDI_OK=1"
if "!NDI_OK!"=="1" (
  echo       NDI SDK found OK
) else (
  color 0E
  echo       WARNING: NDI SDK not detected at the standard install path.
  echo       Native NDI output will not work without it.
  echo       Download free from https://ndi.video/sdk
  echo.
  set /p CONT="Continue without NDI? (y/N): "
  if /I not "!CONT!"=="y" exit /b 1
  color 0B
)

REM ---- Step 3: Clean previous build artifacts ---------------------
echo.
echo [3/7] Cleaning previous build...
if exist ".next"          rmdir /s /q ".next"          2>nul
if exist "dist-electron"  rmdir /s /q "dist-electron"  2>nul
if exist "release"        rmdir /s /q "release"        2>nul
echo       Cleaned .next, dist-electron, release

REM ---- Step 4: Install dependencies (with auto-retry) -------------
echo.
echo [4/7] Installing dependencies (this takes 3-5 minutes)...
echo       Output is being captured to build-log.txt ...
set INSTALL_TRY=0
:RETRY_INSTALL
set /a INSTALL_TRY+=1
call pnpm install >> "%LOGFILE%" 2>&1
if errorlevel 1 (
  if !INSTALL_TRY! lss 3 (
    echo       Attempt !INSTALL_TRY! failed (network glitch?), retrying in 5 seconds...
    timeout /t 5 /nobreak >nul
    goto RETRY_INSTALL
  )
  color 0C
  echo.
  echo ERROR: pnpm install failed after 3 attempts. See log: %LOGFILE%
  echo Common cause: unstable internet. Try a different network and re-run.
  pause
  exit /b 1
)
echo       Dependencies installed OK

REM ---- Step 5: Generate Prisma client (with auto-retry) -----------
echo.
echo [5/7] Generating database client...
set PRISMA_TRY=0
:RETRY_PRISMA
set /a PRISMA_TRY+=1
call pnpm exec prisma generate >> "%LOGFILE%" 2>&1
if errorlevel 1 (
  if !PRISMA_TRY! lss 3 (
    echo       Attempt !PRISMA_TRY! failed (network glitch?), retrying in 5 seconds...
    timeout /t 5 /nobreak >nul
    goto RETRY_PRISMA
  )
  color 0C
  echo ERROR: prisma generate failed after 3 attempts. See log: %LOGFILE%
  echo Common cause: unstable internet downloading the Prisma engine.
  pause
  exit /b 1
)
echo       Prisma client OK

REM ---- Step 6: Build Next.js bundle -------------------------------
echo.
echo [6/7] Building app bundle (2-4 minutes)...
echo       Output is being captured to build-log.txt ...
call pnpm run build >> "%LOGFILE%" 2>&1
if errorlevel 1 (
  color 0C
  echo ERROR: Next.js build failed. See log: %LOGFILE%
  start notepad "%LOGFILE%"
  pause
  exit /b 1
)
if not exist ".next\standalone" (
  color 0C
  echo ERROR: .next\standalone is missing after build.
  echo This means next.config.ts is not set to "output: standalone".
  pause
  exit /b 1
)
echo       App bundle OK

REM ---- Step 7: Compile Electron + package installer ---------------
echo.
echo [7/7] Packaging Windows installer (3-5 minutes)...
echo       Output is being captured to build-log.txt ...
call pnpm package:win >> "%LOGFILE%" 2>&1
if errorlevel 1 (
  color 0C
  echo.
  echo ================================================================
  echo ERROR: electron-builder failed.
  echo ================================================================
  echo The complete error message has been saved to:
  echo    %LOGFILE%
  echo.
  echo Please open that file in Notepad and send me the LAST 50 lines.
  echo Common causes:
  echo   - Antivirus blocking files in release\
  echo   - Path too long - move folder to C:\SL  (shorter name)
  echo   - File Explorer open in release\ folder - close it
  echo.
  echo Opening the log now...
  start notepad "%LOGFILE%"
  pause
  exit /b 1
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
echo   Files produced:
for %%F in ("%CD%\release\*Setup*.exe") do (
  echo      %%~nxF   ^(%%~zF bytes^)
)
echo.
echo   How to install on this PC:
echo     1. Double-click the .exe above
echo     2. Windows SmartScreen may warn (the build is unsigned).
echo        Click "More info" -^> "Run anyway"
echo     3. Choose install folder when prompted
echo     4. Launch "ScriptureLive AI" from the desktop or Start menu
echo.
echo   Opening release folder...
start "" "%CD%\release"
echo.
pause
endlocal
