## Summary
Refactored payroll service source selection so `fetchPayrollData(month, year, options)` supports live or snapshot sources while keeping live default behavior.

## Files Modified
- `backend/services/payrollService.js`

## Key Decisions
- Kept existing live implementation intact as `fetchLivePayrollData`.
- Snapshot source reads from `payrollSnapshotService` and does not touch Venus/Millware dependencies.

## Tests
- `node --test backend\services\payrollService.test.js` passed.
