@echo off
rem Copies the LIVE FrameX database (Neon) into one file on this computer. It only READS the database.
rem Double-click this file in the Windows folder and answer the questions.
rem
rem It needs the database's connection string from Neon (it starts with postgresql://).
rem That string is typed only in this window: nothing saves it, and it is never shown again.
rem The backup goes to the folder "FrameX-backups" next to the project folder (on the Desktop).
rem It holds customer details: keep it private. Give it a passphrase and keep that passphrase.
title FrameX live database backup
cd /d "%~dp0backend"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install it from https://nodejs.org and run this file again.
  pause
  exit /b 1
)
if not exist node_modules call npm install
echo.
echo  FrameX LIVE database backup (read-only)
echo  ---------------------------------------
echo  Step 1. Open neon.tech, open your project, press "Connect" and copy the
echo          connection string. It starts with  postgresql://
echo          Paste it here with a right-click, then press Enter.
echo.
set "DATABASE_URL="
set /p "DATABASE_URL=  Connection string: "
if not defined DATABASE_URL (
  echo.
  echo  Nothing was pasted. Run this file again.
  pause
  exit /b 1
)
if /i not "%DATABASE_URL:~0,8%"=="postgres" (
  echo.
  echo  That does not start with postgresql://
  echo  Copy only the part that starts with postgresql:// ^(without the word psql and without quotes^).
  set "DATABASE_URL="
  pause
  exit /b 1
)
set "DATABASE_SSL=require"
set "NODE_ENV=development"
cls
echo.
echo  Step 2. Choose a passphrase for the backup file (at least 10 characters) and type it twice.
echo          Nothing shows on the screen while you type. That is normal.
echo          Write it down somewhere safe: the file can't be opened without it.
echo.
call npm run db:backup --silent
set "DATABASE_URL="
echo.
pause
