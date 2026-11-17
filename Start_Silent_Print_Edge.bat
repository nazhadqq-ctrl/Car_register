@echo off
chcp 65001 >nul
title Car Register - چاپی ڕاستەوخۆ (Edge)

echo ========================================================
echo  دەستپێکردنی سیستمی بەڕێوەبەرایەتی هاتووچۆ (چاپی ڕاستەوخۆ)
echo  Traffic Inspection System - Direct Silent Printing
echo ========================================================
echo.

:: 1. دەستپێکردنی سێرڤەری Node.js بە نوێترین کۆد
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do taskkill /F /PID %%a >nul 2>&1
timeout /t 1 /nobreak >nul
echo [1/2] دەستپێکردنی سێرڤەری سیستەم...
start /b "" node server.js
timeout /t 3 /nobreak >nul

echo [2/2] کردنەوەی پەڕە بە دۆخی Kiosk Printing (بێ کردنەوەی پرنت دایالۆگ)...
echo تکایە دڵنیابە پرنتەرەکەت دیاری کراوە وەک Default Printer لە ویندۆز.

:: 2. دۆزینەوەی مایکرۆسۆفت ئێج لە هەردوو شوێنی ویندۆز 10 و 11
set "EDGE_EXE="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    set "EDGE_EXE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
) else if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    set "EDGE_EXE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
) else if exist "%LocalAppData%\Microsoft\Edge\Application\msedge.exe" (
    set "EDGE_EXE=%LocalAppData%\Microsoft\Edge\Application\msedge.exe"
) else (
    set "EDGE_EXE=msedge"
)

start "" "%EDGE_EXE%" --user-data-dir="%~dp0KioskProfile" --kiosk-printing --no-first-run --no-default-browser-check --disable-background-mode --app=http://localhost:3000/login.html

echo.
echo سیستەم کرایەوە بە سەرکەوتوویی!
exit
