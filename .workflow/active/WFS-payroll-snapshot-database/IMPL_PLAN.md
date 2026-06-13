# Implementation Plan: Payroll Snapshot Database

## 1. Requirements Summary

Build a payroll snapshot feature so users can freeze payroll comparison data for a month/year and later choose to use that frozen data instead of recalculating from current Venus and Millware data.

The user goal is stability: if Venus payroll, employee mapping, or Millware AD/Task Register data changes later, snapshot mode must still show and automate using the saved values.

Primary requirements:
- Save payroll snapshots to database.
- Store employee-level payroll data related to Venus and Millware identifiers.
- Provide an option to use live data or snapshot data.
- Keep schema systematic, professional, and maintainable.
- Preserve current `/api/payroll` response shape for the existing UI.
- Ensure export, automation, beras input, and AD reset can use the same selected source.

## 2. Architecture Decisions

### Storage

Recommended default: create `data/payroll_snapshot.db` using SQLite, with a new service `backend/services/payrollSnapshotService.js`.

Reasoning:
- Snapshot is application-owned historical state, not source-system data.
- Existing project already uses SQLite for app-owned staging data.
- Snapshot must remain available even when Venus/Millware/gateway data changes or is unavailable.
- The schema can be migrated to SQL Server later with minimal table changes.

If multi-server shared access is required, the same schema can be created in `extend_db_ptrj`, but that should be an explicit deployment decision because it adds gateway/SQL Server write dependency.

### Data Model

Use normalized tables plus raw JSON retention:
- Header table for snapshot metadata and active selection.
- Employee table for frozen employee identity and mapping.
- Component table for normalized Venus-vs-Millware component values and sync status.
- Raw source table for optional original payload slices and audit/debugging.
- Event table for create/activate/delete/use audit.

Snapshot employee/component rows should be immutable after capture. User-editable metadata should stay in `payroll_snapshots` fields such as `label`, `notes`, `status`, and `is_active`.

### Source Selection

Refactor payroll fetching to support:

```js
fetchPayrollData(month, year, {
  source: 'live' | 'snapshot',
  snapshotId: null,
  useActiveSnapshot: false
})
```

Rules:
- `source: 'live'` keeps current behavior.
- `source: 'snapshot'` loads only from snapshot DB.
- If `snapshotId` is omitted in snapshot mode, use active snapshot for the period.
- Snapshot response includes `sourceInfo` metadata but keeps `data` and `analysis` compatible.

### API Shape

Add endpoints:

```txt
GET    /api/payroll?month=6&year=2026&source=live
GET    /api/payroll?month=6&year=2026&source=snapshot&snapshotId=<id>
GET    /api/payroll/snapshots?month=6&year=2026
POST   /api/payroll/snapshots
GET    /api/payroll/snapshots/:snapshotId
PATCH  /api/payroll/snapshots/:snapshotId
POST   /api/payroll/snapshots/:snapshotId/activate
DELETE /api/payroll/snapshots/:snapshotId
```

`POST /api/payroll/snapshots` captures current live payroll result for a period:

```json
{
  "month": 6,
  "year": 2026,
  "label": "Payroll Juni 2026 sebelum input beras",
  "notes": "Captured before Millware AD correction",
  "setActive": true
}
```

## 3. Proposed Schema

SQLite DDL target. Use `TEXT` UUID primary keys for portability with existing Node services.

### `payroll_snapshots`

Snapshot header and lifecycle metadata.

```sql
CREATE TABLE IF NOT EXISTS payroll_snapshots (
  id TEXT PRIMARY KEY,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL,
  label TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  is_active INTEGER NOT NULL DEFAULT 0,
  source_type TEXT NOT NULL DEFAULT 'live_capture',
  captured_at TEXT NOT NULL,
  captured_by TEXT,
  employee_count INTEGER NOT NULL DEFAULT 0,
  component_count INTEGER NOT NULL DEFAULT 0,
  venus_total_netpay REAL NOT NULL DEFAULT 0,
  millware_total_netpay REAL NOT NULL DEFAULT 0,
  netpay_diff REAL NOT NULL DEFAULT 0,
  payload_hash TEXT,
  comparison_config_json TEXT,
  source_info_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_payroll_snapshots_period
  ON payroll_snapshots(period_year, period_month, deleted_at);

CREATE INDEX IF NOT EXISTS idx_payroll_snapshots_active
  ON payroll_snapshots(period_year, period_month, is_active, deleted_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_snapshots_one_active_period
  ON payroll_snapshots(period_year, period_month)
  WHERE is_active = 1 AND deleted_at IS NULL;
```

### `payroll_snapshot_employees`

Frozen payroll employee identity and summary values.

```sql
CREATE TABLE IF NOT EXISTS payroll_snapshot_employees (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  row_order INTEGER NOT NULL DEFAULT 0,
  venus_employee_id TEXT NOT NULL,
  ptrj_employee_id TEXT,
  employee_name TEXT NOT NULL,
  charge_job TEXT,
  is_karyawan INTEGER,
  py_numbers_json TEXT,
  gaji_pokok REAL NOT NULL DEFAULT 0,
  tunjangan_total REAL NOT NULL DEFAULT 0,
  potongan_total REAL NOT NULL DEFAULT 0,
  upah_bersih REAL NOT NULL DEFAULT 0,
  has_millware INTEGER NOT NULL DEFAULT 0,
  is_synced INTEGER NOT NULL DEFAULT 0,
  sync_status TEXT NOT NULL DEFAULT 'UNKNOWN',
  employee_payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (snapshot_id) REFERENCES payroll_snapshots(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_payroll_snapshot_employees_snapshot
  ON payroll_snapshot_employees(snapshot_id, row_order);

CREATE INDEX IF NOT EXISTS idx_payroll_snapshot_employees_venus
  ON payroll_snapshot_employees(snapshot_id, venus_employee_id);

CREATE INDEX IF NOT EXISTS idx_payroll_snapshot_employees_ptrj
  ON payroll_snapshot_employees(snapshot_id, ptrj_employee_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_snapshot_employees_unique
  ON payroll_snapshot_employees(snapshot_id, venus_employee_id);
```

### `payroll_snapshot_components`

Normalized component comparison rows for each employee.

```sql
CREATE TABLE IF NOT EXISTS payroll_snapshot_components (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  snapshot_employee_id TEXT NOT NULL,
  component_key TEXT NOT NULL,
  component_label TEXT NOT NULL,
  component_type TEXT NOT NULL,
  venus_amount REAL NOT NULL DEFAULT 0,
  millware_amount REAL NOT NULL DEFAULT 0,
  diff_amount REAL NOT NULL DEFAULT 0,
  abs_diff_amount REAL NOT NULL DEFAULT 0,
  tolerance REAL NOT NULL DEFAULT 50,
  status TEXT NOT NULL,
  missing_in TEXT,
  is_missing_component INTEGER NOT NULL DEFAULT 0,
  is_automatable INTEGER NOT NULL DEFAULT 0,
  ad_code TEXT,
  ad_code_desc TEXT,
  venus_component_codes_json TEXT,
  venus_component_names_json TEXT,
  millware_task_codes_json TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (snapshot_id) REFERENCES payroll_snapshots(id) ON DELETE CASCADE,
  FOREIGN KEY (snapshot_employee_id) REFERENCES payroll_snapshot_employees(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_payroll_snapshot_components_snapshot
  ON payroll_snapshot_components(snapshot_id, component_key, status);

CREATE INDEX IF NOT EXISTS idx_payroll_snapshot_components_employee
  ON payroll_snapshot_components(snapshot_employee_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_snapshot_components_unique
  ON payroll_snapshot_components(snapshot_employee_id, component_key);
```

### `payroll_snapshot_raw_sources`

Optional raw-source retention for traceability and future repair scripts.

```sql
CREATE TABLE IF NOT EXISTS payroll_snapshot_raw_sources (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  source_system TEXT NOT NULL,
  source_table TEXT,
  source_key TEXT,
  payload_hash TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (snapshot_id) REFERENCES payroll_snapshots(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_payroll_snapshot_raw_sources_snapshot
  ON payroll_snapshot_raw_sources(snapshot_id, source_system, source_table);
```

### `payroll_snapshot_events`

Audit trail for operational actions.

```sql
CREATE TABLE IF NOT EXISTS payroll_snapshot_events (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT,
  event_type TEXT NOT NULL,
  actor TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (snapshot_id) REFERENCES payroll_snapshots(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payroll_snapshot_events_snapshot
  ON payroll_snapshot_events(snapshot_id, created_at);
```

## 4. Task Breakdown

### IMPL-1: Add payroll snapshot database service

Create `backend/services/payrollSnapshotService.js` with schema initialization, transaction helpers, snapshot CRUD, active snapshot selection, capture from payroll result, and conversion back to current payroll response shape.

Key public functions:
- `initPayrollSnapshotDB()`
- `createPayrollSnapshot({ month, year, label, notes, payrollResult, setActive })`
- `listPayrollSnapshots(month, year)`
- `getPayrollSnapshot(snapshotId)`
- `getActivePayrollSnapshot(month, year)`
- `activatePayrollSnapshot(snapshotId)`
- `softDeletePayrollSnapshot(snapshotId)`
- `buildPayrollResultFromSnapshot(snapshotId)`

### IMPL-2: Refactor payroll source selection

Update `backend/services/payrollService.js` so live payroll logic remains intact, but `fetchPayrollData` can route to live or snapshot source by options. Add `sourceInfo` metadata.

### IMPL-3: Add backend API routes and startup initialization

Update `backend/server.js` to initialize the snapshot DB and expose snapshot endpoints. Extend `/api/payroll` to accept source/snapshot query parameters.

### IMPL-4: Propagate snapshot source to export, automation, beras, and AD reset

Update downstream services and routes so selected payroll source is consistently used:
- payroll export
- payroll automation
- beras automation
- AD reset amount difference logic

### IMPL-5: Add frontend snapshot controls

Update payroll UI with compact controls:
- Live/Snapshot segmented selector.
- Snapshot dropdown for selected period.
- Capture snapshot button.
- Active snapshot badge.
- Refresh/reload behavior that does not silently switch sources.

Propagate selected source to payroll automation/export/reset actions.

### IMPL-6: Add tests and verification

Add focused Node tests for snapshot service and source selection. Run focused tests and build verification.

## 5. Implementation Strategy

Recommended execution: sequential.

Reason:
- Schema and service create the contract.
- Payroll source selection depends on the service.
- API depends on the source contract.
- Downstream automation/export/reset and frontend depend on API behavior.
- Tests should cover the final integrated source behavior.

## 6. Risk Assessment

High conflict risk:
- The worktree is dirty in many payroll-related files.
- Existing beras automation changes overlap with snapshot source propagation.

Mitigation:
- Start with additive files first.
- Inspect diffs before editing existing files.
- Keep source options additive and backward compatible.
- Preserve existing response shape.

Data risk:
- Snapshot may store large raw payloads if every row is duplicated as JSON.

Mitigation:
- Store normalized employee/component fields for queries.
- Store raw payload only once per employee or source slice, not repeated per component.

Behavior risk:
- Automation could accidentally use live data when UI displays snapshot data.

Mitigation:
- Include `source` and `snapshotId` in every payroll action request.
- Add tests proving snapshot automation preparation uses snapshot payload and does not call live query mocks.

## 7. Acceptance Criteria

- User can capture current payroll data for a selected month/year as a named snapshot.
- User can list and select snapshots for the selected period.
- User can mark one snapshot active per period.
- `/api/payroll` returns live data by default and frozen data when snapshot mode is requested.
- Snapshot mode does not query Venus or Millware.
- Payroll export uses the selected source.
- Payroll automation and beras automation use the selected source.
- AD reset amount-difference preview/run can use selected source when requested.
- UI clearly shows whether data is Live or Snapshot.
- Existing live payroll behavior remains backward compatible.
- Focused backend tests pass.
