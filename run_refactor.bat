@echo off
echo Starting Venus Attendance Refactor App...

cd backend
if not exist node_modules (
    echo Installing Backend Dependencies...
    call npm install
)
start "Venus Backend" cmd /k "npm start"
cd ..

cd frontend
if not exist node_modules (
    echo Installing Frontend Dependencies...
    call npm install
)
start "Venus Frontend" cmd /k "npm run dev"
cd ..

echo App started! Backend: localhost:5000, Frontend: see Vite output (usually localhost:5173)
