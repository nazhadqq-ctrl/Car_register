@echo off
chcp 65001 >nul
title نوێکردنەوەی بنەڕەتی سیستەمی پشکنینی هاتووچۆ - TrafficCheck Update
color 1F

echo ======================================================================
echo    دەستەی هاتووچۆی سلێمانی - هۆبەی پشکنین و تۆمارکردن
echo    نوێکردنەوەی بنەڕەتی سیستەم ڕاستەوخۆ لە داتابەیسی ناوەندی (SQL Server)
echo ======================================================================
echo.

set "TARGET_DIR=C:\TrafficCheck"
if not exist "%TARGET_DIR%" (
    set "TARGET_DIR=%~dp0"
)

cd /d "%TARGET_DIR%"

echo [1/4] وەستاندنی سێرڤەری کۆن (تەنها پرۆسێسی پۆڕتی 3000 و TrafficCheck)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R ":3000 .*LISTENING"') do if not "%%a"=="0" taskkill /F /PID %%a >nul 2>&1
taskkill /F /IM TrafficCheck.exe /T >nul 2>&1
timeout /t 2 /nobreak >nul

echo [2/4] داگرتن و جێبەجێکردنی نوێترین فایلەکان لە داتابەیسی ناوەندی...
set "NODE_CMD=node.exe"
if exist "%TARGET_DIR%\node.exe" (
    set "NODE_CMD=%TARGET_DIR%\node.exe"
)

"%NODE_CMD%" auto-updater.js --force
if %errorlevel% neq 0 (
    echo [!] هەوڵدانەوە بۆ نوێکردنەوە...
    "%NODE_CMD%" auto-updater.js --force
)

echo.
echo [3/4] دڵنیابوونەوە لە نوێبوونەوەی فایلەکان...
if exist "%TARGET_DIR%\server.js" (
    echo   [+] server.js ئامادەیە!
)
if exist "%TARGET_DIR%\db.js" (
    echo   [+] db.js ئامادەیە!
)
if exist "%TARGET_DIR%\public\index.html" (
    echo   [+] public\index.html ئامادەیە!
)
if exist "%TARGET_DIR%\public\login.html" (
    echo   [+] public\login.html ئامادەیە!
)
if exist "%TARGET_DIR%\version.json" (
    echo   [+] version.json ئامادەیە!
)

echo.
echo [4/4] دەستپێکردنەوەی بەرنامە...
if exist "%TARGET_DIR%\TrafficCheck.exe" (
    start "" "%TARGET_DIR%\TrafficCheck.exe"
) else (
    start "" "%NODE_CMD%" server.js
    timeout /t 2 /nobreak >nul
    start "" http://localhost:3000/login.html
)

echo.
echo ======================================================================
echo   پیرۆزە! سیستەمەکە بە سەرکەوتوویی نوێکرایەوە
echo ======================================================================
timeout /t 3
exit
