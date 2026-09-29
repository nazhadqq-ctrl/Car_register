@echo off
chcp 65001 >nul
title نوێکردنەوەی سیستەمی پشکنینی هاتووچۆ - TrafficCheck Update v1.4.1
color 1F

echo ======================================================================
echo    دەستەی هاتووچۆی سلێمانی - هۆبەی پشکنین و تۆمارکردن
echo    نوێکردنەوەی خۆکاری سیستم بۆ نوێترین وەشانی فەرمی لە گیت هاب
echo ======================================================================
echo.

set "TARGET_DIR=C:\TrafficCheck"
if not exist "%TARGET_DIR%" (
    set "TARGET_DIR=%~dp0"
)

echo [1/4] وەستاندنی سێرڤەری کۆن...
taskkill /F /IM node.exe /T >nul 2>&1
taskkill /F /IM TrafficCheck.exe /T >nul 2>&1
timeout /t 2 /nobreak >nul

echo [2/4] داگرتنی نوێترین فایلەکان لە گیت هابەوە...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$repo = 'https://raw.githubusercontent.com/nazhadqq-ctrl/Car_register/main';" ^
    "$files = @('auto-updater.js','server.js','db.js','version.json','package.json','TrafficCheck.exe','Start_Silent_Print_Chrome.bat','Start_Silent_Print_Edge.bat','public/index.html','public/login.html','public/preview_gomrg.html','Update_TrafficCheck.bat');" ^
    "foreach($f in $files){" ^
    "  $dest = Join-Path '%TARGET_DIR%' $f;" ^
    "  $dir = Split-Path $dest -Parent;" ^
    "  if(-not (Test-Path $dir)){ New-Item -ItemType Directory -Path $dir -Force | Out-Null };" ^
    "  Write-Host '  -> داگرتنی ' $f '...';" ^
    "  try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile($repo + '/' + $f + '?t=' + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds(), $dest); Write-Host '     [OK]' -ForegroundColor Green } catch { Write-Host '     [!] هەڵە: ' $_.Exception.Message -ForegroundColor Red }" ^
    "}"

echo.
echo [3/4] دڵنیابوونەوە لە تەواوی فایلەکان...
if exist "%TARGET_DIR%\auto-updater.js" (
    echo   [+] auto-updater.js ئامادەیە!
)
if exist "%TARGET_DIR%\server.js" (
    echo   [+] server.js نوێکرایەوە!
)
if exist "%TARGET_DIR%\db.js" (
    echo   [+] db.js نوێکرایەوە!
)
if exist "%TARGET_DIR%\public\index.html" (
    echo   [+] public\index.html نوێکرایەوە!
)
if exist "%TARGET_DIR%\public\login.html" (
    echo   [+] public\login.html نوێکرایەوە!
)

echo.
echo [4/4] دەستپێکردنەوەی بەرنامە...
if exist "%TARGET_DIR%\TrafficCheck.exe" (
    start "" "%TARGET_DIR%\TrafficCheck.exe"
) else (
    cd /d "%TARGET_DIR%"
    start "" node.exe server.js
    timeout /t 2 /nobreak >nul
    start "" http://localhost:3000/login.html
)

echo.
echo ======================================================================
echo   پیرۆزە! سیستەمەکە نوێکرایەوە بۆ وەشانی نوێ v1.4.1
echo ======================================================================
timeout /t 3
exit
