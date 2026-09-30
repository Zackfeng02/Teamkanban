@echo off
cd /d "%~dp0"
docker compose up -d --build --wait
if errorlevel 1 (
  echo Startup failed. Check Docker Desktop and docker compose logs.
  pause
  exit /b 1
)
start "" http://localhost:3000/
