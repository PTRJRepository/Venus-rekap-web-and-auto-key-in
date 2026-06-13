## Summary
Added payroll snapshot API routes and initialized snapshot database at backend startup.

## Files Modified
- `backend/server.js`

## Key Decisions
- `/api/payroll` now accepts `source=snapshot` and `snapshotId`.
- New snapshot routes support list, capture, detail, metadata update, activate, and delete.
- Snapshot capture always captures live payroll data to avoid snapshot-of-snapshot ambiguity.

## Tests
- `node --check backend\server.js` passed.
