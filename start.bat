@echo off
setlocal
title Will's Tech Store
cd /d "%~dp0backend"

echo.
echo  ============================================
echo    Will's Tech Store  -  starting up
echo  ============================================
echo.

REM 1. Node.js
where node >nul 2>nul
if errorlevel 1 (
  echo  [!] Node.js is not installed.
  echo      Download the LTS version from https://nodejs.org , install it, then run start.bat again.
  echo.
  pause
  exit /b 1
)

REM 2. Settings file, secrets and the Neon connection string (asks only when needed)
call node scripts\setup-env.js
if errorlevel 1 ( pause & exit /b 1 )

REM 3. Dependencies (first run, or when package.json changed)
if not exist "node_modules" (
  echo  Installing dependencies - this takes about a minute the first time...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo  [!] npm install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

REM 4. Database: connect to Neon, create/update tables, add starter data once
call node scripts\prepare.js
if errorlevel 1 ( pause & exit /b 1 )

REM 5. Open the site in your browser a few seconds after the server starts
start "" /b cmd /c "ping 127.0.0.1 -n 5 >nul & start http://localhost:4000"

echo.
echo  --------------------------------------------
echo    Store:  http://localhost:4000
echo    Admin:  http://localhost:4000/admin-login.html
echo    Stop:   press Ctrl+C
echo  --------------------------------------------
echo.
call npm start

echo.
echo  Server stopped.
pause
