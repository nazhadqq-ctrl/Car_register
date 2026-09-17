@echo off
chcp 65001 >nul
title Car Register - چاپی ڕاستەوخۆ (Chrome)

echo ========================================================
echo  دەستپێکردنی سیستمی بەڕێوەبەرایەتی هاتووچۆ (چاپی ڕاستەوخۆ)
echo  Traffic Inspection System - Direct Silent Printing
echo ========================================================
echo.

:: 1. تاقیکردنەوەی ئایا سێرڤەر کار دەکات
netstat -ano | findstr :3000 >nul
if %errorlevel% neq 0 (
    echo [1/2] سێرڤەری Node.js دەستپێدەکات...
    start /b "" node server.js
    timeout /t 3 /nobreak >nul
) else (
    echo [1/2] سێرڤەری Node.js لە پێشترەوە چالاکە.
)

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

start "" "%CHROME_EXE%" --kiosk-printing --app=http://localhost:3000

echo.
echo سیستەم کرایەوە بە سەرکەوتوویی!
exit
