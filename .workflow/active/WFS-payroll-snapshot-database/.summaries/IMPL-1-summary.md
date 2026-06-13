## Summary
Added `backend/services/payrollSnapshotService.js` with SQLite schema initialization, transactional snapshot capture, list/get/update/activate/delete helpers, and reconstruction back to payroll response shape.

## Files Modified
- `backend/services/payrollSnapshotService.js`

## Key Decisions
- Stored snapshots in app-owned `data/payroll_snapshot.db`.
- Preserved full employee payload JSON for compatibility and normalized component rows for maintenance/querying.
- Used soft delete and one-active-snapshot-per-period uniqueness.

## Tests
- `node --test backend\services\payrollSnapshotService.test.js` passed.
