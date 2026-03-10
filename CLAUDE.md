# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Venus Attendance Recap is a web application for automating attendance data management and form filling for the Millware HR system. It consists of three main components:

1. **Frontend** - React + TypeScript + Vite application with Material-UI
2. **Backend** - Node.js + Express API server with SQLite storage
3. **Browser Automation Engine** - Puppeteer-based automation for Millware system

## Architecture

```
Frontend (React/Vite) → Backend (Express) → Automation Engine (Puppeteer) → Millware System
```

### Frontend (`/frontend`)
- React 19 with TypeScript, served by Vite dev server (port 5173)
- Material-UI for components with dark/light theme support
- API proxy configured to `/api` → `http://127.0.0.1:5000`

### Backend (`/backend`)
- Express server on port 5000 (or `PORT` env var)
- Services pattern: `attendanceService`, `automationService`, `comparisonService`, `exportService`, `employeeMillService`, `validationService`, `payrollService`, `payrollComparisonService`, `payrollAutomationService`
- SQLite for local staging data (`employee_mill` table, staging data)
- Fetches data from external Venus HR database via gateway
- External API uses token-based authentication (`API_TOKEN_QUERY`)
- Employee mapping uses dual-server connection:
  - `ptrj_employee_id` from `SERVER_PROFILE_1` + `extend_db_ptrj` database (`employee_mill` table)
  - `charge_job` from `SERVER_PROFILE_1` + `VenusHR14` database (HR_M_EmployeePI table)

### Browser Automation Engine (`/browser-automation-engine`)
- Puppeteer-based with modular action system
- Template-driven workflows defined in `/templates/*.json`
- Supports parallel execution via `parallel-runner.js`
- Uses `current_data.json` as fixed input file for automation
- Chrome profiles in `chrome_data/engine_N/` for parallel instances

## Build and Run Commands

### Frontend
```bash
cd frontend
npm install
npm run dev      # Start Vite dev server (port 5173)
npm run build    # Production build to dist/
npm run lint     # ESLint
```

### Backend
```bash
cd backend
npm install
npm run dev      # Auto-reload with --watch flag
npm start        # Production mode
```

### Browser Automation Engine
```bash
cd browser-automation-engine
npm install

# Run a template directly
node index.js <template-name>

# Example:
node index.js template-flow
```

### Full Stack Development
Run backend and frontend in parallel:
```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd frontend && npm run dev
```

## Environment Variables

Backend (`.env` in `/backend`):
```
API_TOKEN_QUERY=<token>          # Venus HR API authentication
GITHUB_TOKEN=<token>             # GitHub access token
SERVER_PROFILE=<profile>         # Server configuration
NO_ATTENDANCE=true|false         # Enable overtime-only mode
PORT=5000                        # Server port
```

Automation Engine (also uses backend `.env`):
```
HEADLESS=true|false              # Run browser headless
AUTO_CLOSE=true|false            # Auto-close browser after completion
AUTOMATION_INSTANCES=2           # Number of parallel automation engines
ENGINE_START_DELAY=2000          # Delay between engine starts (ms)
BROWSER_KEEPALIVE_INTERVAL=2000  # Keepalive ping interval (ms)
CHROME_MEMORY_LIMIT=512          # Memory limit per instance (MB)
```

## Key Workflows

### Attendance Data Flow
1. Frontend requests data via `/api/monthly-grid?month=1&year=2025`
2. Backend queries Venus HR database tables:
   - `HR_T_TAMachine_Summary` (attendance)
   - `HR_T_Overtime` (overtime hours)
   - `HR_H_Leave` (leave records)
   - `HR_T_Absence` (absence records)
3. Data returned as grid format with daily attendance per employee

### Automation Flow
1. User selects employees and triggers automation from frontend
2. Backend saves to `current_data.json` via `saveAutomationData()`
3. Backend spawns `parallel-runner.js` process
4. Runner partitions data and launches multiple engine instances
5. Each engine loads template from `/templates/*.json`
6. Actions executed sequentially (navigate, click, type, wait, etc.)
7. Results logged; failed employees saved to CSV in `logs/emp_failed/`

### Template System
Templates are JSON files in `/browser-automation-engine/templates/`:
```json
{
  "name": "Template Name",
  "description": "Description",
  "dataFile": "testing_data/current_data.json",
  "steps": [
    { "action": "navigate", "params": { "url": "..." } },
    { "action": "typeInput", "params": { "selector": "#id", "value": "${variable}" } },
    { "action": "click", "params": { "selector": "#btn" } }
  ]
}
```

Variable substitution: `${employee.name}`, `${context.data}`, etc.

### Running Templates via parallel-runner.js
```bash
# Default: attendance-input-loop template
node parallel-runner.js

# Specific template
node parallel-runner.js payroll-ad-input
```

### Available Actions (in `actions/index.js`)
- `navigate` - Navigate to URL
- `typeInput` - Type text into selector
- `click` - Click element
- `select` - Select dropdown option
- `waitForElement` - Wait for element to appear
- `wait` - Wait for duration (ms)
- `loop` - Loop over array data
- `forceInput` - Bypass validation and force input
- And more - see `actions/index.js`

## Important File Locations

- `/backend/server.js` - Main Express server with all API routes
- `/backend/services/automationService.js` - Automation trigger and data preparation
- `/backend/services/comparisonService.js` - Venus vs Millware comparison logic
- `/backend/services/payrollAutomationService.js` - Payroll automation data preparation
- `/browser-automation-engine/engine.js` - Core AutomationEngine class
- `/browser-automation-engine/parallel-runner.js` - Multi-engine orchestration
- `/browser-automation-engine/templates/` - Automation workflow definitions
- `/browser-automation-engine/testing_data/current_data.json` - Attendance input data
- `/browser-automation-engine/testing_data/current_payroll_data.json` - Payroll input data

## Development Testing

Testing scripts are located in `_dev_utils/tests/`:
```bash
# Test API endpoints
node _dev_utils/tests/test_api_endpoints.js

# Test frontend UI and data flow
node _dev_utils/tests/test_frontend_ui.js
```

## Frontend Components

- `/frontend/src/App.jsx` - Main app with tabs (Report, Matrix, Comparison, Payroll)
- `/frontend/src/components/PayrollReport.jsx` - Payroll comparison display
- `/frontend/src/components/OvertimeReport.jsx` - Overtime filtering and display
- `/frontend/src/components/AutomationDialog.jsx` - Attendance automation trigger
- `/frontend/src/components/ComparisonDialog.jsx` - Comparison results dialog

## Conventions

- Indonesian language used for UI labels and logging
- Employee filtering: `is_karyawan = false` and `charge_job` containing "STAFF" are excluded from the employee list
- Naming: PascalCase for React components, camelCase for functions, snake_case for JSON keys
- Date format: `yyyy-MM-dd` for API, locale `id-ID` for display
- Employee IDs: `EmployeeID` (Venus), `PTRJEmployeeID` (Millware/TaskReg)
- Error screenshots saved to `logs/screenshots/` on failure

## Millware Integration

Target system: `http://millwarep3.rebinmas.com:8003/`
- Login page: `/` (credentials: `adm075/adm075`)
- Task Register form: `/en/PR/trx/frmPrTrxTaskRegisterDet.aspx`
- Uses `.ui-autocomplete-input.CBOBox` selectors for autocomplete fields
- Radio buttons for Overtime Type (OT=0 Regular, OT=1 Overtime)

## Comparison Service (Sync Validation)

The `comparisonService` compares Venus attendance data with Millware PR_TASKREGLN table:
- `MATCH` = Record exists in Millware with matching hours
- `MISS` = Record missing or mismatched in Millware
- Used for filtering automation to only input missing data
- Query `/api/comparison/compare` for full comparison
- Query `/api/comparison/miss` for only mismatches

## Payroll Services

- `/backend/services/payrollService.js` - Fetches payroll data from Venus HR (HR_T_PYWeekly_M, HR_T_PYWeekly_DComponent)
- `/backend/services/payrollComparisonService.js` - Compares Venus payroll with Millware PR_ADTRANS
- `/backend/services/payrollAutomationService.js` - Prepares payroll automation data (MISS components only)
- Uses TaskDesc matching to map Venus components to Millware ADCode (TaskCode)

### Payroll Automation API
- `POST /api/payroll/automation/run` - Trigger payroll AD Lists automation
- `POST /api/payroll/automation/stop` - Stop running automation
- Template: `payroll-ad-input.json` - Inputs tunjangan/potongan to AD Lists

### Millware AD Lists Integration
- URL: `http://millwarep3.rebinmas.com:8003/en/PR/trx/frmPrTrxADLists.aspx`
- Input page: `frmPrTrxADDets.aspx` (after clicking New)
- Fields: Employee → ADCode (TaskCode) → Amount → Add → Save
