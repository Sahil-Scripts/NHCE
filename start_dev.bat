@echo off
echo ========================================
echo  AEGIS Dev Server Launcher
echo  Node heap: 8GB  |  Port: 8080
echo ========================================
set NODE_OPTIONS=--max-old-space-size=8192
cd /d %~dp0frontend\frontend
npm run dev
