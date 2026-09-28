@echo off
chcp 65001 >nul
title ویزاردی دابەزاندنی سیستمی پشکنینی هاتووچۆ
cd /d "%~dp0"

echo ===================================================
echo   بەڕێوەبەرایەتی هاتووچۆی پارێزگای سلێمانی
echo   دەستپێکردنی ویزاردی دابەزاندنی سیستەمی پشکنین
echo ===================================================

:: Check if running from inside ZIP without extract
if not exist "%~dp0server.js" (
    echo.
    echo [!] ئاگاداری: تکایە سەرەتا هەموو فایلەکان لە زیپ دەربکە (Extract All)
    echo     ئینجا ئەم فایلە بکەرەوە.
    echo.
    pause
    exit /b
)

:: Run the Setup Wizard with Administrator rights if possible
net session >nul 2>&1
if %errorlevel% equ 0 (
    start "" "%~dp0Setup_TrafficCheck.exe"
) else (
    powershell -Command "Start-Process '%~dp0Setup_TrafficCheck.exe' -Verb RunAs" 2>nul || start "" "%~dp0Setup_TrafficCheck.exe"
)

exit
