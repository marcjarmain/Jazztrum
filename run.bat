@echo off
cd /d "%~dp0"
where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo Node.js is needed. Install it from https://nodejs.org/ and try again.
  pause
  exit /b 1
)
if not exist node_modules\vite (
  echo Installing Jazztrum dependencies. This may take a few minutes...
  call npm.cmd install
  if errorlevel 1 (
    echo Installation failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)
echo Starting Jazztrum. Keep this window open while you play.
echo Open the Local address shown below in your browser.
call npm.cmd run dev -- --open
pause
