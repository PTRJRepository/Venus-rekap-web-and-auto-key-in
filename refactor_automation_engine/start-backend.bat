@echo off
echo ════════════════════════════════════════════════════
echo   Venus Automation Studio - Backend Server
echo ════════════════════════════════════════════════════
echo.

cd /d "%~dp0backend"

if not exist node_modules (
    echo [1/2] Installing dependencies...
    call npm install
) else (
    echo [skip] Dependencies already installed
)

echo.
echo [2/2] Starting server on port 5001...
echo.
echo ℹ️  Server will run at: http://localhost:5001
echo ℹ️  Templates folder: %~dp0templates
echo ℹ️  Using tsx (TypeScript execution)
echo.
echo Press Ctrl+C to stop the server
echo ════════════════════════════════════════════════════
echo.

call npx tsx src/index.ts

pause
