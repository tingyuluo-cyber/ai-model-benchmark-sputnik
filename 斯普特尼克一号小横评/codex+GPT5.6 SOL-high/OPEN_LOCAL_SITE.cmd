@echo off
setlocal
cd /d "%~dp0"
title Sputnik 1 - Local Website

where npm >nul 2>&1
if errorlevel 1 (
  echo Node.js is required to run this website locally.
  echo Install Node.js, then double-click this file again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Preparing the local website for first use...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo Setup failed. Check the message above and try again.
    pause
    exit /b 1
  )
)

echo Starting the local website...
echo Your browser will open automatically at http://localhost:3000
echo Keep this window open while using the website.
echo Press Ctrl+C or close this window to stop it.
start "" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0scripts\open-local.ps1"
call npm run local

if errorlevel 1 (
  echo.
  echo The website could not start. Review the message above.
  pause
)

endlocal
