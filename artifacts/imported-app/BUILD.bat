@echo off
REM ============================================================
REM ScriptureLive AI - One-click Windows installer builder
REM ============================================================
REM Prerequisites (install ONCE before running this script):
REM   1. Node.js 20 LTS  ->  https://nodejs.org
REM   2. NDI 5 SDK       ->  https://ndi.video/sdk
REM   3. (auto)          ->  pnpm is installed for you below
REM ============================================================

setlocal EnableDelayedExpansion
title ScriptureLive AI - Build Windows Installer
color 0B
cd /d "%~dp0"

set "LOGFILE=%CD%\build-log.txt"
echo. > "%LOGFILE%"

echo.
echo ================================================================
echo   ScriptureLive AI - One-click Windows Build
echo ================================================================
echo   Full log will be saved to:
echo   %LOGFILE%
echo ================================================================
echo.

REM ---- Step 0: Verify Node.js ------------------------------------
echo [0/6] Checking Node.js...
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
for /f "tokens=*" %%v in ('node --version') do echo       Node %%v OK

REM ---- Step 1: Ensure pnpm is installed ---------------------------
echo.
echo [1/6] Checking pnpm...
where pnpm >nul 2>nul
if errorlevel 1 (
  echo       pnpm not found. Installing globally with npm...
  call npm install -g pnpm >> "%LOGFILE%" 2>&1
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
echo [2/6] Checking NDI 5 SDK...
if exist "%PROGRAMFILES%\NDI\NDI 5 SDK\Bin\x64\Processing.NDI.Lib.x64.dll" (
  echo       NDI 5 SDK found OK
) else if exist "%PROGRAMFILES%\NDI\NDI 6 SDK\Bin\x64\Processing.NDI.Lib.x64.dll" (
  echo       NDI 6 SDK found OK
) else (
  color 0E
  echo       WARNING: NDI SDK not detected at the standard install path.
  echo       Native NDI output will not work without it.
  echo       Download free from https://ndi.video/sdk
  echo.
  set /p CONT="Continue anyway? (y/N): "
  if /I not "!CONT!"=="y" exit /b 1
  color 0B
)

REM ---- Step 3: Install dependencies -------------------------------
echo.
echo [3/6] Installing dependencies (this takes 3-5 minutes)...
echo       Output is being captured to build-log.txt ...
call pnpm install >> "%LOGFILE%" 2>&1
if errorlevel 1 (
  color 0C
  echo.
  echo ERROR: pnpm install failed. See log: %LOGFILE%
  pause
  exit /b 1
)
echo       Dependencies installed OK

REM ---- Step 4: Generate Prisma client -----------------------------
echo.
echo [4/6] Generating database client...
call pnpm exec prisma generate >> "%LOGFILE%" 2>&1
if errorlevel 1 (
  color 0C
  echo ERROR: prisma generate failed. See log: %LOGFILE%
  pause
  exit /b 1
)
echo       Prisma client OK

REM ---- Step 5: Build Next.js bundle -------------------------------
echo.
echo [5/6] Building app bundle (2-4 minutes)...
echo       Output is being captured to build-log.txt ...
call pnpm run build >> "%LOGFILE%" 2>&1
if errorlevel 1 (
  color 0C
  echo ERROR: Next.js build failed. See log: %LOGFILE%
  pause
  exit /b 1
)
echo       App bundle OK

REM ---- Step 6: Build Windows installer ----------------------------
echo.
echo [6/6] Packaging Windows installer (3-5 minutes)...
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
dir /b release\*.exe 2>nul
echo.
echo   Double-click the .exe to install ScriptureLive AI.
echo   (Windows SmartScreen may warn - click "More info" -^> "Run anyway")
echo.
echo   Opening release folder...
start "" "%CD%\release"
echo.
pause
endlocal
