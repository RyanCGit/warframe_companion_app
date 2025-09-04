@echo off
cd /d "%~dp0"
echo Starting Warframe Market Tracker...
echo Please wait while the application loads...
npm start >nul 2>&1
if errorlevel 1 (
    echo.
    echo Error starting the application. Running with verbose output:
    npm start
    pause
) else (
    echo Application closed.
)