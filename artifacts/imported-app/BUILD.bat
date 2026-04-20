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

echo.
echo ================================================================
echo   ScriptureLive AI - One-click Windows Build
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
  call npm install -g pnpm
  if errorlevel 1 (
    color 0C
    echo.
    echo ERROR: Failed to install pnpm. Run "npm install -g pnpm" manually.
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
call pnpm install
if errorlevel 1 (
  color 0C
  echo.
  echo ERROR: pnpm install failed. Scroll up to see the error.
  pause
  exit /b 1
)
echo       Dependencies installed OK

REM ---- Step 4: Generate Prisma client -----------------------------
echo.
echo [4/6] Generating database client...
call pnpm exec prisma generate
if errorlevel 1 (
  color 0C
  echo ERROR: prisma generate failed.
  pause
  exit /b 1
)
echo       Prisma client OK

REM ---- Step 5: Build Next.js bundle -------------------------------
echo.
echo [5/6] Building app bundle (2-4 minutes)...
call pnpm run build
if errorlevel 1 (
  color 0C
  echo ERROR: Next.js build failed.
  pause
  exit /b 1
)
echo       App bundle OK

REM ---- Step 6: Build Windows installer ----------------------------
echo.
echo [6/6] Packaging Windows installer (5-8 minutes - native NDI compile)...
call pnpm package:win
if errorlevel 1 (
  color 0C
  echo.
  echo ERROR: electron-builder failed. Common causes:
  echo   - NDI SDK not installed (re-check step 2)
  echo   - Antivirus blocking files in dist\
  echo   - Long path - move folder to C:\ScriptureLive
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
echo   Installer is in:  %CD%\dist\
echo.
dir /b dist\*.exe 2>nul
echo.
echo   Double-click the .exe to install ScriptureLive AI.
echo   (Windows SmartScreen may warn - click "More info" -^> "Run anyway")
echo.
echo   Opening dist folder...
start "" "%CD%\dist"
echo.
pause
endlocal
