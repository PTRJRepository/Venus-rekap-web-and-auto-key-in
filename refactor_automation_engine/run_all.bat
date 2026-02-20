@echo off
echo Starting Venus Automation Engine...

start "Venus Backend" cmd /k "cd backend && npm run dev"
start "Venus Frontend" cmd /k "cd frontend && npm run dev"

echo Backend running on port 5001
echo Frontend running on port 5174
echo Please open http://localhost:5174 in your browser.
