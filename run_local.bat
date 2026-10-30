@echo off
title Mustard Trading Arena - Live Leaderboard
cd /d "%~dp0"
echo Starting Mustard Trading Arena Leaderboard...
python -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload
pause
