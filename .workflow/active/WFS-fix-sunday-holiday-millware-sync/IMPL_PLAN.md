# Implementation Plan: Sunday/Holiday Millware Sync Guard

## Goal

Fix attendance comparison so Venus auto-attendance on Sunday and national holidays is never treated as synced unless Millware has the required regular `PR_TASKREGLN` record. If Millware is empty, the cell and summary must show MISS/not synced. The reported case `POM00214` on Sunday must not appear synced when Millware data is missing.

## Evidence From Code

1. `backend/services/attendanceService.js` intentionally creates auto-attendance for Sunday/holiday:
   - Sunday displays `OFF` and uses regular hours for automation input.
   - Holiday displays `LBR` and uses regular hours.
2. `backend/services/comparisonService.js` should be the source of truth for whether Millware data exists:
   - It queries `PR_TASKREGLN`.
   - It emits `hasRegularRecord`, `regularMatched`, and `status: MATCH|MISS`.
3. `frontend/src/App.jsx` maps those details into `comparisonData`.
4. `frontend/src/components/AttendanceMatrix.jsx` has two relevant comparison paths:
   - `getSyncStatus()` mostly applies the correct rule.
   - The comparison tooltip/render path still uses `needsRegular = !['ALFA', 'N/A', 'OFF'].includes(statusUpper)`, which can mark `OFF` as OK even when Millware is empty.

## Implementation Tasks

### IMPL-1: Normalize Required-Regular-Record Rule

Create one local helper for deciding whether a Venus day requires a Millware regular record. The helper must return `false` only for `ALFA` and `N/A`. It must return `true` for `OFF`, `LBR`, `LIBUR`, `HADIR`, sick, cuti, izin, and leave statuses.

Apply the helper consistently in:
- backend comparison decision, if not already equivalent;
- frontend comparison tooltip/render path;
- frontend `getSyncStatus()` path if it still has inline status checks.

### IMPL-2: Backend Regression Coverage

Add a focused regression test for `compareWithTaskReg()` using mocked `executeQuery()` responses:
- Venus day: status `OFF`, regularHours `7`, no Millware rows => result must be `MISS` and `syncStatus` not `synced`.
- Venus day: status `LBR` or `LIBUR`, regularHours `7`, no Millware rows => result must be `MISS`.
- Venus day: status `ALFA`, no Millware rows => no sync miss result or allowed non-required behavior, matching current business rule.
- Venus day: status `OFF` with an OT=0 Millware row => can be `MATCH` for presence.

If mocking the module is awkward in the current CommonJS structure, extract a small pure helper from `comparisonService.js` and test it directly, then add at least one integration-style test around comparison output.

### IMPL-3: UI Regression and Cleanup

Make the UI read the same rule as backend:
- In the tooltip/comparison render path, do not exclude `OFF` from `needsRegular`.
- Ensure missing regular record displays red/not synced for Sunday OFF and holiday LBR/LIBUR.
- Remove or gate noisy `POM00214` debug logging once regression behavior is covered.
- Keep display text concise and aligned with existing Material UI style.

### IMPL-4: Verification

Run focused checks:
- Backend regression tests for comparison logic.
- `npm run build` in `frontend` to catch UI compile errors.
- If backend has no test script, run the specific node test file directly with `node --test`.
- Manually verify data shape for `POM00214_2026-05-03` and `POM00214_2026-05-10`: absent Millware regular record must produce `hasRegularRecord: false`, `status: MISS`, UI not synced.

## Conflict Handling

The worktree already has uncommitted changes in the exact files involved. Before execution:
- inspect `git diff -- backend/services/comparisonService.js frontend/src/components/AttendanceMatrix.jsx frontend/src/App.jsx`;
- do not revert existing edits;
- change only the minimal lines required for the rule and tests;
- stage only files created or edited for this task.

## Acceptance Criteria

- Sunday `OFF` requires Millware regular data.
- National holiday `LBR`/`LIBUR` requires Millware regular data.
- Missing Millware data for those statuses is shown as MISS/not synced in backend result and UI.
- `ALFA` and `N/A` remain non-required.
- Regression tests or focused verification cover missing Millware Sunday/holiday cases.
