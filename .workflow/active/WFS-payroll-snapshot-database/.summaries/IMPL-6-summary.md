## Summary
Added focused Node tests for snapshot service CRUD/capture and payroll source selection.

## Files Modified
- `backend/services/payrollSnapshotService.test.js`
- `backend/services/payrollService.test.js`

## Key Decisions
- Tests use temporary SQLite databases through `_setDatabasePathForTests`.
- Source-selection test stubs live dependencies and verifies snapshot mode does not call them.

## Tests
- `node --test backend\services\payrollSnapshotService.test.js backend\services\payrollService.test.js backend\services\payrollAutomationService.test.js backend\services\payrollComparisonService.test.js` passed.
- `npm run build` in `frontend` passed.
