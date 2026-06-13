## Summary
Added Payroll tab controls for Live/Snapshot mode, snapshot list, capture snapshot, active source badge, and source propagation to actions.

## Files Modified
- `frontend/src/components/PayrollReport.jsx`
- `frontend/src/App.jsx`
- `frontend/src/components/ADResetDialog.jsx`
- `frontend/src/components/BerasAutomationDialog.jsx`

## Key Decisions
- Kept controls compact in the existing payroll toolbar.
- Snapshot source is passed to export, normal automation, beras automation, and AD reset amount-difference dialogs.

## Tests
- `npm run build` in `frontend` passed.
