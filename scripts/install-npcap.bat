@echo off
REM SALAMANDA WIDS — Npcap Installer
REM This script installs Npcap (required for live packet capture on Windows)
REM It must be run as Administrator.

echo.
echo ╔══════════════════════════════════════════════════════╗
echo ║  SALAMANDA WIDS — Installing Npcap Driver           ║
echo ║  Required for live network packet capture           ║
echo ╚══════════════════════════════════════════════════════╝
echo.

REM Check if Npcap is already installed
if exist "C:\Program Files\Npcap\NPFInstall.exe" (
    echo [OK] Npcap is already installed.
    goto :done
)

REM Find the installer
set INSTALLER=%~dp0..\installers\npcap-1.80.exe
if not exist "%INSTALLER%" (
    set INSTALLER=%~dp0npcap-1.80.exe
)
if not exist "%INSTALLER%" (
    echo [ERROR] Npcap installer not found.
    echo Please download from https://npcap.com/dist/npcap-1.80.exe
    pause
    exit /b 1
)

echo Installing Npcap...
echo Please follow the installer prompts.
echo.
start /wait "" "%INSTALLER%"

REM Verify installation
if exist "C:\Program Files\Npcap\NPFInstall.exe" (
    echo.
    echo [OK] Npcap installed successfully!
    echo SALAMANDA can now capture live network packets.
) else (
    echo.
    echo [WARNING] Npcap may not have installed correctly.
    echo Please try running the installer manually from: %INSTALLER%
)

:done
echo.
pause
