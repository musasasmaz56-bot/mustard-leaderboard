@echo off
title Publish Mustard Leaderboard to GitHub
cd /d "%~dp0"
set "PATH=C:\Users\musas\AppData\Local\Programs\MinGit\cmd;C:\Users\musas\AppData\Local\Microsoft\WinGet\Packages\GitHub.cli_Microsoft.Winget.Source_8wekyb3d8bbwe\bin;%PATH%"

echo ============================================================
echo   MUSTARD LEADERBOARD - 1-CLICK GITHUB REPO CREATOR & PUSHER
echo ============================================================
echo.

echo Checking GitHub authentication...
gh auth status >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Opening browser to log into GitHub...
    gh auth login --web -h github.com -p https
)

echo.
echo Creating GitHub repository and pushing all files...
gh repo create mustard-leaderboard --public --source=. --remote=origin --push

echo.
echo ============================================================
echo   DONE! Repository published to GitHub successfully!
echo ============================================================
pause
