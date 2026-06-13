# Planning Notes

## User Problem

Saat menjalankan komparasi absensi, hari Minggu atau libur nasional dianggap sudah sync karena Venus memang auto hadir seperti hari libur. Konsep yang benar: Venus boleh auto hadir, tetapi Millware tetap wajib punya input PR_TASKREGLN. Jika data Millware kosong, status harus `not_synced`/MISS, bukan sync. Contoh fatal: `POM00214` di UI/status sync terlihat sudah sync, padahal data Millware tidak ada.

## Current Findings

- `backend/services/comparisonService.js` builds Millware lookup from `PR_TASKREGLN` and compares per employee-date.
- Backend currently contains strict-existence comments and fields: `hasRegularRecord`, `regularMatched`, `syncStatus`, `status: MATCH|MISS`. This suggests recent WIP already attempted part of the fix.
- `frontend/src/App.jsx` maps backend comparison details into `comparisonData`, including `hasRegularRecord`, `hasOTRecord`, `regularMatched`, and `otMatched`.
- `frontend/src/components/AttendanceMatrix.jsx` has `getSyncStatus()` logic that correctly requires `hasRegularRecord` in `presence`, `overtime`, and `all` modes.
- However, `AttendanceMatrix.jsx` tooltip/comparison view around the rendered cell defines `needsRegular = !['ALFA', 'N/A', 'OFF'].includes(statusUpper)`. This excludes `OFF`, so a Sunday OFF cell can still display comparison as OK when regular Millware data is missing.
- Holiday status may be rendered as `LBR`/`LIBUR`; it is not excluded in that specific line, but implementation must confirm all status aliases.

## Rule To Preserve

- `ALFA` and `N/A`: no Millware regular record required.
- Sunday (`OFF`) and national holiday (`LBR`/`LIBUR`) with Venus auto-attendance: Millware regular record is still required.
- Sick and annual leave also count as data that must exist in Millware.
- Overtime is required only when Venus OT hours > 0.

## Main Risk

The worktree is dirty, including files in the likely implementation scope. Treat those changes as intentional WIP and do not revert them.
