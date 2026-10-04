@echo off
rem Sets up real email sending from your Gmail account (password-reset and shop-setup emails).
rem Double-click this file and follow the questions. Your details are saved only in backend\.env on this computer.
title FrameX email setup
cd /d "%~dp0backend"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install it from https://nodejs.org and run this file again.
  pause
  exit /b 1
)
if not exist node_modules call npm install

call npm run email:setup
echo.
pause
