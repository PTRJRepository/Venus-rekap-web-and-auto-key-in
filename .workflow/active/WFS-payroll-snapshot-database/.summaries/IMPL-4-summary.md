## Summary
Propagated payroll source options to export, payroll automation, beras automation, and amount-difference AD reset flows.

## Files Modified
- `backend/services/payrollExportService.js`
- `backend/services/payrollAutomationService.js`
- `backend/services/payrollADResetService.js`
- `backend/server.js`

## Key Decisions
- Live source remains the default.
- Automation payload metadata records source and snapshot id.
- Amount-difference reset uses selected payroll source for comparison, while Millware DocID lookup remains live because deletion targets must come from current Millware.

## Tests
- Focused payroll tests passed.
