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
if not exist node_modules call npm install
call npm start
