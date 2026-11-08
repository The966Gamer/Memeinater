@echo off
cd /d "%~dp0"

findstr /C:"PASTE_PROJECT_URL_HERE" www\config.js >nul 2>nul
if not errorlevel 1 (
  echo STOP: open www\config.js and paste your Supabase Project URL first.
  pause
  exit /b 1
)

echo ===== Installing =====
call npm install
if errorlevel 1 ( echo npm install failed. Is Node.js 22 or newer installed? & pause & exit /b 1 )

if not exist android (
  echo ===== Creating Android project =====
  call npx cap add android
  if errorlevel 1 ( echo cap add failed & pause & exit /b 1 )
)

echo ===== Copying app files into Android project =====
call npx cap sync android
if errorlevel 1 ( echo cap sync failed & pause & exit /b 1 )

echo.
echo ===== Opening Android Studio =====
echo Wait for Gradle to finish, then: Build - Build Bundle(s) / APK(s) - Build APK(s)
echo Or run BUILD_APK.bat after Android Studio has opened the project once.
call npx cap open android
pause
