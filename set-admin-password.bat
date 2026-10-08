@echo off
rem Sets a new password for the FrameX admin account (or creates an admin account).
rem Double-click this file in the Windows folder (not inside VS Code) and answer the questions.
rem You do NOT need the old password. The password is typed only in this window,
rem is saved scrambled, and is never shown or printed.
title FrameX admin password
cd /d "%~dp0backend"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install it from https://nodejs.org and run this file again.
  pause
  exit /b 1
)
if not exist node_modules call npm install

echo.
echo  FrameX admin password
echo  ---------------------
echo  This window asks 4 small questions. Type each answer and press Enter.
echo  You do NOT need the old password. You choose a new one now.
echo.

rem The database opens for one program at a time, so the backend stops for a moment.
:check
netstat -ano | findstr /R /C:":4000 .*LISTENING" >nul
if errorlevel 1 goto ready
echo  The FrameX backend is running. It has to stop for a moment.
echo  It starts again by itself at the end.
echo.
echo  Press any key to continue.
pause >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "$c = Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { $id = $c.OwningProcess; $top = $id; for ($i = 0; $i -lt 5; $i++) { $p = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $id); if (-not $p) { break }; if ($p.CommandLine -match 'start-backend\.bat') { $top = $id; break }; $id = $p.ParentProcessId }; taskkill /PID $top /T /F | Out-Null }"
ping -n 3 127.0.0.1 >nul
echo.
goto check

:ready
echo  1. Admin name      any name, for example:  FrameX Admin
echo  2. Admin email     the email of your admin account
echo  3. Password        a NEW password: 12 letters and numbers or more
echo                     Nothing shows on the screen while you type. That is normal.
echo  4. Repeat password the same password again
echo.
call npm run admin:create
echo.
echo  If a line above says "Updated admin" or "Created admin", it worked:
echo  log in on the website with that email and your new password, then open admin.html.
echo  If it shows an error, read it and run this file again.
echo.
echo  Press any key to start the backend again.
pause >nul
start "" "%~dp0start-backend.bat"
