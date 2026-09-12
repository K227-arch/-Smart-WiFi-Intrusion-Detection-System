@echo off
REM SALAMANDA WIDS - Windows Deployment Script
REM Works on Windows 10/11 with Docker Desktop

echo ========================================
echo SALAMANDA WIDS - Deployment
echo ========================================

REM Check if Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo ERROR: Docker is not running!
    echo Please start Docker Desktop and wait for it to fully load.
    pause
    exit /b 1
)

REM Build and start the IDS
echo Building and starting SALAMANDA WIDS...
docker-compose up --build -d

if errorlevel 1 (
    echo ERROR: Failed to start container
    pause
    exit /b 1
)

echo ========================================
echo SALAMANDA WIDS is now running!
echo.
echo Access the dashboard at: http://localhost:3001
echo.
echo Commands:
echo   docker-compose logs -f  (view logs)
echo   docker-compose stop     (stop)
echo   docker-compose restart  (restart)
echo ========================================
pause