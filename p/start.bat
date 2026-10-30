@echo off
title Pixel Art Converter
cd /d "%~dp0"

echo Запуск Pixel Art Converter...

:: Проверка наличия Node.js
where node >nul 2>nul
if %ERRORLEVEL% equ 0 (
    node server.js
    goto :eof
)

:: Если Node.js не найден, пробуем Python
where python >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo Запуск через Python...
    start http://localhost:8000
    python -m http.server 8000
    goto :eof
)

echo.
echo [!] Для запуска ES6-модулей нужен веб-сервер.
echo Установите Node.js или Python, либо откройте папку через расширение Live Server в VS Code.
pause
