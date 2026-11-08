@echo off
cd /d "%~dp0"
call npx cap sync android
cd android
call gradlew.bat assembleDebug
echo.
echo APK should be here:
echo %~dp0android\app\build\outputs\apk\debug\app-debug.apk
pause
