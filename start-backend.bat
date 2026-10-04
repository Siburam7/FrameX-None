@echo off
rem Starts the FrameX backend (accounts, password reset, shops, nearby search) on http://localhost:4000
rem Double-click this file and keep the window open while you use the website.
rem It is an ordinary program on your computer: it does not need Claude, VS Code or any other tool to be open.
title FrameX backend
cd /d "%~dp0backend"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install it from https://nodejs.org and run this file again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing the backend's packages. This happens only once...
  call npm install
  if errorlevel 1 (
    echo The install failed. Check your internet connection and run this file again.
    pause
    exit /b 1
  )
)

echo.
echo Starting the FrameX backend. Keep this window open. Press Ctrl+C to stop.
echo The lines below say whether email and SMS are really configured.
echo.
call npm start
echo.
echo The backend has stopped. If you see "address already in use", it is already running in another window.
pause
