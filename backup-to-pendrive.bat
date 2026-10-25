@echo off
rem Copies the LIVE FrameX database (Neon) straight onto the backup pen drive. It only READS the database.
rem The same as backup-live-db.bat, but the locked file goes to the pen drive named BETA-BACKUP,
rem in its "FrameX Backup" folder (made if it isn't there), not to the Desktop. The file name carries the date and
rem time: framex-db-live-YYYYMMDD-HHMM.fxdb (framex-db-live-20261024-1912.fxdb = 24 Oct 2026, 7:12 PM).
rem Double-click this file in the Windows folder (in the project folder) and answer the two questions.
rem The connection string is typed only in this window: nothing saves it. Keep the passphrase in Bitwarden.
title FrameX live database backup to the pen drive
setlocal

rem Find the pen drive by its name, whatever letter Windows gave it this time
set "PEN="
for %%L in (D E F G H I J K L M N O P Q R S T U V W X Y Z) do (
  if not defined PEN (
    vol %%L: 2>nul | find /i "BETA-BACKUP" >nul && set "PEN=%%L:"
  )
)
if not defined PEN (
  echo.
  echo  The backup pen drive ^(BETA-BACKUP^) was not found.
  echo  Plug it in, wait until it shows in This PC, then run this file again.
  echo.
  pause
  exit /b 1
)

rem Straight into the pen drive's "FrameX Backup" folder; the date and time are in the file's own name
set "OUT=%PEN%\FrameX Backup"

cd /d "%~dp0backend"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install it from https://nodejs.org and run this file again.
  pause
  exit /b 1
)
if not exist node_modules call npm install
echo.
echo  FrameX LIVE database backup to the pen drive (read-only)
echo  --------------------------------------------------------
echo  The file will be saved in:  %OUT%
echo.
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
echo  Saving to: %OUT%
echo.
echo  Step 2. Choose a passphrase for the backup file (at least 10 characters) and type it twice.
echo          Nothing shows on the screen while you type. That is normal.
echo          Keep it in Bitwarden: the file can't be opened without it.
echo.
call npm run db:backup --silent -- --out "%OUT%"
set "DATABASE_URL="
echo.
echo  When it says the backup was written, you can Eject the pen drive in This PC.
echo.
pause
