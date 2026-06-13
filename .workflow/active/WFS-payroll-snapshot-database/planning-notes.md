# Planning Notes

## User Intent
GOAL: Tambahkan fitur snapshot payroll yang tersimpan di database supaya user dapat memakai data payroll yang sudah dibekukan walaupun Venus atau Millware berubah.

SCOPE: Rancang implementation plan, table schema, API flow, UI controls, and integration points for payroll snapshot mode.

CONTEXT: Planning-only workflow. No production code changes are executed in this session.

## Recent Session Scan
- `WFS-beras-selisih-monthly-allowance` is completed and touched payroll automation concepts, beras shortfall, payroll runner/template, and mapping risk.
- `WFS-fix-sunday-holiday-millware-sync` is still marked planned with high conflict risk around attendance comparison files.
- Current worktree has broad uncommitted changes in payroll backend, automation, and UI files. Treat them as intentional work-in-progress.

## Context Findings
- Backend uses Node.js/Express and has one unified server in `backend/server.js`.
- `backend/services/stagingService.js` provides the closest local database pattern with SQLite under `data/`.
- Payroll live data is assembled by `backend/services/payrollService.js` from Venus payroll tables, `employee_mill`, and Millware comparison data.
- Millware payroll comparison is in `backend/services/payrollComparisonService.js`.
- Automation payload generation is in `backend/services/payrollAutomationService.js`.
- AD reset/difference flows call `fetchPayrollData` from `backend/services/payrollADResetService.js`.
- Payroll export calls `fetchPayrollData` from `backend/services/payrollExportService.js`.
- Frontend payroll display and actions are centralized in `frontend/src/components/PayrollReport.jsx`, while top-level payroll automation handlers are in `frontend/src/App.jsx`.

## Architecture Decision
Use an app-owned snapshot database with normalized header/employee/component tables and JSON raw payload retention. The recommended default is SQLite under `data/payroll_snapshot.db`, matching existing local app-owned staging storage. The schema is intentionally portable to SQL Server if centralized multi-instance storage is required later.

Snapshot mode must return the same data shape as live `/api/payroll` so report rendering, export, automation, and reset logic can reuse existing code paths.

## Conflict Notes
- Do not reformat or rewrite payroll files wholesale.
- Before implementation, run `git diff -- backend/services/payrollService.js backend/services/payrollAutomationService.js backend/services/payrollADResetService.js backend/server.js frontend/src/components/PayrollReport.jsx frontend/src/App.jsx`.
- If existing edits already implement part of this feature, adapt the plan instead of replacing them.
