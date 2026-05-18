@echo off
title CRM Inmobiliario - Servidor Completo
cd /d "%~dp0"

echo ============================================
echo     CRM INMOBILIARIO - SERVIDOR COMPLETO
echo ============================================
echo.

echo 1. Verificando dependencias...
if not exist "node_modules" (
    echo    Instalando dependencias del frontend...
    call npm install
)
if not exist "server\node_modules" (
    echo    Instalando dependencias del servidor...
    cd server
    call npm install
    cd ..
)

echo 2. Construyendo frontend...
call npm run build
if %errorlevel% neq 0 (
    echo ERROR al construir el frontend
    pause
    exit /b 1
)

echo 3. Iniciando servidor (API + Frontend)...
echo.
echo    Abre el navegador en: http://localhost:3002
echo    Para salir: Ctrl+C
echo.
node server/index.js

pause
