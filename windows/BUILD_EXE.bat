@echo off
cd /d "%~dp0"
findstr /C:"PASTE_PROJECT_URL_HERE" ..\www\config.js >nul 2>nul
if not errorlevel 1 (
  echo STOP: open ..\www\config.js and paste your Supabase Project URL first.
  pause
  exit /b 1
)
if exist www rmdir /s /q www
xcopy "..\www" "www" /E /I /Y >nul
call npm install
if errorlevel 1 ( echo npm install failed. Is Node.js installed? & pause & exit /b 1 )
call npm run build
if errorlevel 1 ( echo build failed, copy the error and send it to Claude & pause & exit /b 1 )
echo.
echo DONE. Your app is in the dist folder: a single .exe, no install needed.
echo Send that .exe to your friends.
pause
