@echo off
title AEGIS Platform Launcher
echo ============================================================
echo   AEGIS: Autonomous Financial Crime Intelligence System
echo ============================================================
echo.
echo [1/2] Checking Python backend dependencies...
python -c "import pandas, numpy, xgboost, networkx, sklearn; print('  [OK] Python AI and Graph Engine verified.')" 2>nul
if %errorlevel% neq 0 (
    echo   [!] Installing/Verifying Python dependencies...
    pip install -r backend\requirements.txt
)

echo.
echo [2/2] Launching Frontend and Integrated Backend Server...
echo   URL: http://localhost:8080/
echo.
cd /d "%~dp0frontend\frontend"
cmd /c "npm run dev"
pause
