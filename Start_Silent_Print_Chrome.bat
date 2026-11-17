@echo off
chcp 65001 >nul
title Car Register - چاپی ڕاستەوخۆ (Chrome)

echo ========================================================
echo  دەستپێکردنی سیستمی بەڕێوەبەرایەتی هاتووچۆ (چاپی ڕاستەوخۆ)
echo  Traffic Inspection System - Direct Silent Printing
echo ========================================================
echo.

:: 1. دەستپێکردنی سێرڤەری Node.js بە نوێترین کۆد (وەستاندنی تەنها پرۆسێسی LISTENING لەسەر پۆڕتی 3000)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R ":3000 .*LISTENING"') do if not "%%a"=="0" taskkill /F /PID %%a >nul 2>&1
timeout /t 1 /nobreak >nul
echo [1/2] دەستپێکردنی سێرڤەری سیستەم...
start /b "" node server.js
timeout /t 3 /nobreak >nul

echo [2/2] کردنەوەی Google Chrome بە دۆخی Kiosk Printing (بێ کردنەوەی پرنت دایالۆگ)...

:: 2. دۆزینەوەی Chrome لە ویندۆز 10 و 11
set "CHROME_EXE="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    set "CHROME_EXE=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    set "CHROME_EXE=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
) else if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
    set "CHROME_EXE=%LocalAppData%\Google\Chrome\Application\chrome.exe"
) else (
    set "CHROME_EXE=chrome"
)

if not exist "%LocalAppData%\TrafficCheck\KioskProfile" mkdir "%LocalAppData%\TrafficCheck\KioskProfile" >nul 2>&1
start "" "%CHROME_EXE%" --user-data-dir="%LocalAppData%\TrafficCheck\KioskProfile" --kiosk-printing --no-first-run --no-default-browser-check --disable-background-mode --app=http://localhost:3000/login.html

echo.
echo سیستەم کرایەوە بە سەرکەوتوویی!
exit
