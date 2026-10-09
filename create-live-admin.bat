@echo off
rem Creates (or resets) the admin account of the LIVE FrameX backend (the one on Render / Neon),
rem from this computer. Double-click this file in the Windows folder and answer the questions.
rem
rem It needs the database's connection string from Neon (it starts with postgresql://).
rem That string and the password are typed only in this window. Nothing is saved to a file,
rem and nothing is sent anywhere except to your own database.
rem Your local backend (start-backend.bat) is not touched and can stay open.
title FrameX live admin
cd /d "%~dp0backend"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install it from https://nodejs.org and run this file again.
  pause
  exit /b 1
)
if not exist node_modules call npm install

echo.
echo  FrameX LIVE admin account
echo  -------------------------
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

echo.
echo  Step 2. Answer 4 small questions. Type each answer and press Enter.
echo    1. Admin name      any name, for example:  FrameX Admin
echo    2. Admin email     the email you will log in with
echo    3. Password        12 letters and numbers or more
echo                       Nothing shows on the screen while you type. That is normal.
echo    4. Repeat password the same password again
echo.
call npm run admin:create
set "DATABASE_URL="
echo.
echo  If a line above says "Created admin" or "Updated admin", it worked:
echo  open https://shopframex.in/login.html , log in with that email and password,
echo  then open https://shopframex.in/admin.html
echo  If it shows an error, read it and run this file again.
echo.
pause
