@echo off
chcp 65001 >nul
title Car Register - چاپی ڕاستەوخۆ (Edge)

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

start "" "%EDGE_EXE%" --kiosk-printing --app=http://localhost:3000

echo.
echo سیستەم کرایەوە بە سەرکەوتوویی!
exit
