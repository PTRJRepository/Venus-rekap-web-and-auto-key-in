# Venus Automation Studio

A modular, visual browser automation platform built with React Flow, Express, and Puppeteer.

## 🚀 Quick Start

1.  **Install Dependencies**:
    ```bash
    cd backend && npm install
    cd ../frontend && npm install
    ```

2.  **Run the Platform**:
    Double-click `run_all.bat`
    OR
    ```bash
    # Terminal 1
    cd backend && npm run dev
    
    # Terminal 2
    cd frontend && npm run dev
    ```

3.  **Open Browser**:
    Go to `http://localhost:5174`

## 🧩 Architecture

-   **Frontend**: React + Vite + React Flow. Used for visually designing automation flows.
-   **Backend**: Express + Puppeteer. Executes the flows designed in the frontend.
-   **Shared**: Common TypeScript types defining the Flow/Node structure.

## 🛠️ Features

-   **Visual Editor**: Drag and drop actions (Navigate, Click, Type, Wait).
-   **Modular Actions**: defined in `backend/src/engine/actions`. Easily add new ones.
-   **Execution**: Runs flows using Puppeteer in a real browser.

## 📁 Project Structure

```
refactor_automation_engine/
├── backend/            # Express Server & Automation Engine
│   ├── src/
│   │   ├── engine/     # Core logic
│   │   └── index.ts    # Entry point
├── frontend/           # React UI
│   ├── src/
│   │   ├── components/ # FlowEditor, Sidebar
│   │   └── App.tsx
├── shared/             # Shared Types
│   └── types/          # automation.ts
└── run_all.bat         # Startup script
```
