# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Venus Attendance Recap is a web application for automating attendance data management and form filling for the Millware HR system. It consists of three main components:

1. **Frontend** - React + TypeScript + Vite application with Material-UI
2. **Backend** - Node.js + Express API server with SQLite storage
3. **Browser Automation Engine** - Puppeteer-based automation for Millware system

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Unified Backend Server (Express, port 3002)                │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Static Files (Express.static → frontend/dist)          │ │
│  │  + API Routes                                          │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
     ↓                                     ↓
  Browser Automation Engine          Frontend Dev Server
  (Puppeteer)                          (Vite, port 5173 only)
                                          ↕ proxy /api → :3002
```

### Unified Server (`/backend`)
- Express server on port **3002** (single source of truth)
- **IN PRODUCTION**: serves both API + static frontend (`/frontend/dist`)
- **IN DEVELOPMENT**: Vite dev server proxies `/api` → `http://127.0.0.1:3002`
- Never hardcode port — use `process.env.PORT || 3002`

### Frontend (`/frontend`)
- React 19 + TypeScript + Vite dev server (port 5173)
- Material-UI for components with dark/light theme support
- Vite proxy: `/api` → `http://127.0.0.1:3002` (ONLY in dev mode)
- Production build goes to `frontend/dist/` — served by backend
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

# Parallel runner for payroll
node parallel-runner.js payroll-ad-input

# Payroll AD delete runner
node payroll-ad-delete-runner.js --all --workers 5
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
SERVER_PROFILE=<profile>         # Server configuration (SERVER_PROFILE_1, SERVER_PROFILE_2, etc.)
NO_ATTENDANCE=true|false         # Enable overtime-only mode
PORT=3002                        # Server port (unified API + static frontend)
```

Automation Engine:
```
HEADLESS=true|false              # Run browser headless
AUTO_CLOSE=true|false            # Auto-close browser after completion
AUTOMATION_INSTANCES=2           # Number of parallel automation engines
ENGINE_START_DELAY=2000          # Delay between engine starts (ms)
BROWSER_KEEPALIVE_INTERVAL=2000  # Keepalive ping interval (ms)
CHROME_MEMORY_LIMIT=512          # Memory limit per instance (MB)
```

## Key Services (`/backend/services/`)

| Service | Purpose |
|---------|---------|
| `attendanceService.js` | Fetch attendance data from Venus HR |
| `payrollService.js` | Fetch payroll data with Venus-Millware comparison |
| `payrollComparisonService.js` | Compare Venus payroll with Millware PR_ADTRANS |
| `payrollAutomationService.js` | Prepare payroll automation data |
| `payrollADResetService.js` | Delete/reset ADTRANS records based on differences |
| `comparisonService.js` | Compare attendance data with Millware PR_TASKREGLN |
| `gateway.js` | Database query executor with fallback support |
| `employeeMillService.js` | Employee mapping between Venus and Millware |
| `payrollComponentMapping.js` | Map Venus components to Millware TaskCodes |

## Key Workflows

### Attendance Data Flow
1. Frontend requests data via `/api/monthly-grid?month=1&year=2025`
2. Backend queries Venus HR database tables:
   - `HR_T_TAMachine_Summary` (attendance)
   - `HR_T_Overtime` (overtime hours)
   - `HR_H_Leave` (leave records)
   - `HR_T_Absence` (absence records)
3. Data returned as grid format with daily attendance per employee

### Payroll Comparison Flow
1. Frontend requests `/api/payroll?month=6&year=2026`
2. Backend fetches Venus payroll from `HR_T_PYWeekly_M` and `HR_T_PYWeekly_DComponent`
3. Backend fetches Millware data from `PR_ADTRANS` and `PR_ADTRANSLN`
4. Comparison uses **PAYROLL_TOLERANCE = 50** rupiah per component
5. Sync status: `isSynced = true` if all components match within tolerance

### AD Reset/Delete Flow
1. User opens ADResetDialog and selects "Selisih Amount"
2. Backend fetches employees with Venus-Millware differences
3. Finds DocIds in `PR_ADTRANS` containing components with differences
4. Writes DocIds to `current_payroll_ad_delete_data.json`
5. Spawns `payroll-ad-delete-runner.js` for browser automation
6. Browser navigates Millware AD Lists and deletes selected records

### Automation Flow
1. User selects employees and triggers automation from frontend
2. Backend saves to `current_data.json` via `saveAutomationData()`
3. Backend spawns `parallel-runner.js` process
4. Runner partitions data and launches multiple engine instances
5. Each engine loads template from `/templates/*.json`
6. Actions executed sequentially (navigate, click, type, wait, etc.)
7. Results logged; failed employees saved to CSV in `logs/emp_failed/`

## Template System

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

### Backend
- `/backend/server.js` - Main Express server with all API routes
- `/backend/services/payrollADResetService.js` - AD delete/reset with amount comparison
- `/backend/services/payrollService.js` - Payroll data fetching with sync status
- `/backend/services/payrollComponentMapping.js` - Component key mapping (TOLERANCE_RUPIAH = 10)
- `/backend/services/gateway.js` - Database query with primary/fallback gateway

### Browser Automation
- `/browser-automation-engine/engine.js` - Core AutomationEngine class
- `/browser-automation-engine/parallel-runner.js` - Multi-engine orchestration
- `/browser-automation-engine/payroll-ad-delete-runner.js` - AD deletion automation
- `/browser-automation-engine/templates/` - Automation workflow definitions
- `/browser-automation-engine/testing_data/` - Input data files (current_data.json, etc.)

### Frontend
- `/frontend/src/App.jsx` - Main app with tabs (Report, Matrix, Comparison, Payroll)
- `/frontend/src/components/ADResetDialog.jsx` - AD deletion dialog
- `/frontend/src/components/PayrollReport.jsx` - Payroll comparison display

## Conventions

- Indonesian language used for UI labels and logging
- Employee filtering: `is_karyawan = false` and `charge_job` containing "STAFF" are excluded
- Naming: PascalCase for React components, camelCase for functions, snake_case for JSON keys
- Date format: `yyyy-MM-dd` for API, locale `id-ID` for display
- Employee IDs: `EmployeeID` (Venus), `PTRJEmployeeID` (Millware/TaskReg)
- Error screenshots saved to `logs/screenshots/` on failure
- **Tolerance**: 50 rupiah for payroll sync (PAYROLL_TOLERANCE in payrollService.js)

## Millware Integration

Target system: `http://millwarep3.rebinmas.com:8003/`
- Login page: `/` (credentials: `adm075/adm075`)
- Task Register form: `/en/PR/trx/frmPrTrxTaskRegisterDet.aspx`
- AD Lists form: `/en/PR/trx/frmPrTrxADLists.aspx`
- Uses `.ui-autocomplete-input.CBOBox` selectors for autocomplete fields

## Payroll Services

### Key Database Tables

**Venus HR (`VenusHR14`):**
- `HR_T_PYWeekly_M` - Payroll header (EmployeeID, PYNumber, PYDate)
- `HR_T_PYWeekly_DComponent` - Payroll components (PYNumber, PYCompCode, PYCompName, CompAmount, PYType, IsTakeHomePay)

**Millware (`db_ptrj_mill`):**
- `PR_ADTRANS` - AD transaction header (ID, DocID, DocDate, DocDesc, EmpCode, EmpName, PhyMonth, PhyYear)
- `PR_ADTRANSLN` - AD line items (MasterID, TaskCode, Amount) - JOIN via `a.ID = b.MasterID`
- `PR_TASKREGLN` - Task register lines for attendance sync

### Component Mapping

| Venus Component | Millware TaskCode | Component Key |
|---------------|-------------------|---------------|
| Tunjangan Jabatan | GA9128 | `jabatan` |
| Tunjangan Masa Kerja | GA9129 | `masaKerja` |
| Tunjangan Beras | AL0012 | `beras` |
| Potongan PPH21 | DEPH21 | `pph21` |
| Potongan SPSI | DE0003 | `spsi` |

### Payroll Automation API
- `GET /api/payroll` - Fetch payroll with Venus-Millware comparison
- `POST /api/payroll/automation/run` - Trigger payroll AD Lists automation
- `POST /api/payroll/automation/stop` - Stop running automation

### AD Reset API
- `GET /api/payroll/ad-reset/amount-differences` - Preview amount differences
- `POST /api/payroll/ad-reset/amount-differences/run` - Run deletion for amount diffs
- `GET /api/payroll/ad-reset/duplicate-doc-ids` - Find duplicate DocIds
- `POST /api/payroll/ad-reset/duplicates/run` - Delete duplicates
- `POST /api/payroll/ad-reset/by-dcoid/run` - Delete by specific DocIds

### Millware AD Lists Integration
- URL: `http://millwarep3.rebinmas.com:8003/en/PR/trx/frmPrTrxADLists.aspx`
- Input page: `frmPrTrxADDets.aspx` (after clicking New)
- Fields: Employee → TaskCode → Amount → Add → Save

## Comparison Service (Sync Validation)

The `comparisonService` compares Venus attendance data with Millware PR_TASKREGLN table:
- `MATCH` = Record exists in Millware with matching hours
- `MISS` = Record missing or mismatched in Millware
- Used for filtering automation to only input missing data
- Query `/api/comparison/compare` for full comparison
- Query `/api/comparison/miss` for only mismatches
