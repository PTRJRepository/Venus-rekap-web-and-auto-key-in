# PRD: Bug Fixes & Quality Improvement — Attendance Matrix Month Switching

**Project:** Venus Attendance Recap  
**Date:** 2026-05-10  
**Status:** Draft  

---

## 1. Problem Statement

When user switches the attendance month (changes month/year selector and clicks "Tampilkan"), the application crashes with errors. The root causes span frontend state management, backend data pipeline, and React component lifecycle. A systematic review has identified **10 bug patterns** across the stack.

---

## 2. Bug Inventory

### BUG-01: ErrorBoundary Not Wrapping AttendancePage
**Severity:** High  
**Layer:** Frontend Architecture  
**Root Cause:** `AttendancePage` is not wrapped in `ErrorBoundary`. Any unhandled error inside the page crashes the entire application instead of showing the fallback "Coba Lagi" UI.  

**Impact:** User sees blank/crashed page after any error (network, data, parsing). No recovery mechanism.  

**Fix:** Wrap `AttendancePage` in `App.jsx` with `ErrorBoundary`.

```jsx
// App.jsx
import ErrorBoundary from './components/ErrorBoundary';

function App() {
    return (
        <ErrorBoundary>
            <AttendancePage />
        </ErrorBoundary>
    );
}
```

---

### BUG-02: `handleFetchData` Not Resetting State on Month Switch
**Severity:** High  
**Layer:** Frontend State Management  
**Root Cause:** In `AttendancePage.jsx`, the `handleFetchData` function sets `loading=true`, `error=null`, and resets `selectedEmployeeIds`. However, **critical state is NOT reset**:
- `attendanceData` is NOT cleared before fetch
- `comparisonData` and `compareMode` are NOT cleared
- Expanded rows (`expandedRows` in matrix) are NOT reset
- Active tab content from previous month may render with stale data while loading

**Impact:** 
- Loading spinner appears but old month data still visible
- Comparison overlay from previous month lingers
- Matrix expanded rows persist into new month
- If API fails, old data stays visible making it unclear that fetch failed

**Fix:** Add comprehensive state reset in `handleFetchData`:

```javascript
const handleFetchData = async () => {
    if (!selectedMonth || !selectedYear) return;

    setLoading(true);
    setError(null);
    setSelectedEmployeeIds([]); // ✅ already here
    
    // ADD THESE:
    setAttendanceData([]);           // Clear old data immediately
    setComparisonData(null);         // Clear comparison
    setCompareMode('off');           // Reset compare mode
    setCurrentPeriod(null);          // Clear period indicator
    
    // Reset expanded rows in matrix
    // Need to expose this via ref or lift state
```

**Architectural Note:** Move `expandedRows` state up to `AttendancePage`, pass as prop + callback to `AttendanceMatrix`. This decouples the expanded state from the matrix component.

---

### BUG-03: `activeTab` Persists Across Month Switch
**Severity:** Medium  
**Layer:** Frontend State Management  
**Root Cause:** `activeTab` state is NOT reset when changing month. If user was on "Komparasi" tab (which depends on `comparisonData`), switching to a new month with no comparison data will cause errors or empty state.

**Impact:** 
- User on Comparison tab switches month → sees broken/empty comparison with no data
- Switching back to Matrix tab after comparison may be stale

**Fix:** Reset to 'matrix' tab on month change, or add guard in Comparison tab content.

```javascript
// In handleFetchData, add:
setActiveTab('matrix');
```

Also add defensive rendering in the `comparison` tab:
```jsx
{activeTab === 'comparison' && attendanceData.length > 0 && (
    <ComparisonDialog inline {...} />
)}
```

---

### BUG-04: `handleDataUpdate` Type Mismatch in Comparison Dialog
**Severity:** High  
**Layer:** Frontend — Component Interface  
**Root Cause:** In `AttendancePage`, `handleComparisonComplete` calls `onComparisonComplete(data)` with 4 arguments:
```javascript
onComparisonComplete(data, startDate, endDate, options)
```

But in `ComparisonDialog.jsx`, the callback signature is:
```javascript
const onComparisonComplete = (data) => { /* only 1 param */ }
```

Only the first argument (`data`) is captured, the `startDate`, `endDate`, `options` are silently ignored. This means:
- `ComparisonDialog` cannot know which date range was compared
- Subsequent operations within the dialog may reference wrong period
- The `inline` comparison mode loses context

**Impact:** When using the Comparison tab inline, data passed back to parent may be incomplete. If `ComparisonDialog` tries to use `startDate`, `endDate`, `options` derived from the comparison result, it may use stale/incorrect values.

**Fix:** Align `ComparisonDialog` callback to accept all arguments:

```javascript
// ComparisonDialog.jsx - fix callback signature
const onComparisonComplete = (data, startDate, endDate, options) => {
    if (data) {
        // Use all arguments properly
        setResults(data);
    }
};

// For inline mode, also pass these to parent correctly
```

---

### BUG-05: `onRefresh` Prop Mismatch in ComparisonDialog
**Severity:** Medium  
**Layer:** Frontend — Component Interface  
**Root Cause:** In `AutomationDialog`, `onRefresh` is passed as a prop:
```javascript
onRefresh={performComparison}
```

But `performComparison` is the async function in `AttendancePage`. The `AutomationDialog` calls `onRefresh()` without arguments. This actually works (since `performComparison` doesn't require args), BUT:
- If `performComparison` is called during a new month fetch (BUG-02), it will compare against stale data
- `AutomationDialog` has no way to know which month it is refreshing for

**Impact:** When user clicks "Refresh" in `AutomationDialog` during a month switch, it may trigger comparison for the wrong period or trigger before data is ready.

**Fix:** Debounce/guard the `performComparison` call:
```javascript
// In AutomationDialog, guard the onRefresh call
const handleRefresh = () => {
    if (!loading && dataReady) {
        onRefresh();
    }
};
```

Or pass the current period context to `AutomationDialog`.

---

### BUG-06: `AttendanceMatrix` React.memo Too Aggressive
**Severity:** High  
**Layer:** Frontend — Performance/Reliability  
**Root Cause:** The `React.memo` comparison function at the bottom of `AttendanceMatrix.jsx`:
```javascript
export default React.memo(AttendanceMatrix, (prevProps, nextProps) => {
    return (
        prevProps.data === nextProps.data &&
        // ... 7 other conditions
    );
});
```

This memo prevents re-renders unless ALL props are exactly equal by reference. Problems:
1. `data` comparison: If `attendanceData` is set to a new array each fetch, the reference changes → re-renders (good). But if the array items have the same IDs but different content, reference stays same → stale data
2. `cellFilter`, `comparisonData`, `isLoadingComparison` are all new objects/arrays each render → memo returns false even when actual values haven't changed → excessive re-renders in some cases
3. **Critical:** When switching months and `data` is set to `[]` then new data, the memoized component may show old data if the new array reference is somehow not detected

**Impact:** Matrix may show stale data after month switch, especially if the component is re-used without full remount.

**Fix:** Simplify the memo — only memoize expensive tooltip rendering, not the entire matrix. Or use a proper deep comparison for `data`:

```javascript
export default React.memo(AttendanceMatrix, (prevProps, nextProps) => {
    // Only prevent re-render if data array reference is identical
    // AND all other scalar props are equal
    return (
        prevProps.data === nextProps.data &&
        prevProps.viewMode === nextProps.viewMode &&
        prevProps.selectedIds.length === nextProps.selectedIds.length &&
        prevProps.compareMode === nextProps.compareMode &&
        prevProps.isLoadingComparison === nextProps.isLoadingComparison &&
        prevProps.isFiltered === nextProps.isFiltered
    );
});
```

Remove `cellFilter` and `comparisonData` from memo equality — these change frequently and comparing object references is unreliable.

---

### BUG-07: Backend `attendanceService` Falls Back to Empty Array Silently
**Severity:** High  
**Layer:** Backend Data Pipeline  
**Root Cause:** In `fetchAttendanceData`, if any of the database queries fail (network timeout, query error, missing tables), the error bubbles up. However, the **weekly employees query** (`fetchWeeklyEmployees`) can return an empty array silently if the `HR_T_TimeAttendanceWeekly` table has no data for that month. This causes:
- `employees = []` → no rows in matrix
- No error thrown → frontend shows "Pilih Periode" (empty state)
- User sees nothing but doesn't know why

More critically: the error handling in `fetchAttendanceData` uses raw `executeQuery` calls inside `Promise.all`. If one of the queries inside the parallel fetch fails, `Promise.all` may reject with only partial data OR with no data at all.

```javascript
const [
    weeklyEmployeeIds,
    millEmployees,
    attendanceRaw,
    // ...
] = await Promise.all([
    fetchWeeklyEmployees(),  // CAN silently return []
    getMillEmployees(),      // CAN throw
    fetchAttendanceRaw(startDate, endDate),  // CAN throw
    // ...
]);
```

If `fetchWeeklyEmployees` succeeds but returns [] (no employees), the downstream filter `activeEmployees = employees.filter(emp => activeEmployeeIds.has(emp.venus_employee_id))` results in 0 employees with NO error.

**Impact:** 
- Empty matrix with no error message
- User doesn't know if: (a) no data for this month, (b) query failed, (c) network timeout

**Fix:** Add explicit empty-state detection with clear logging:

```javascript
// After the parallel fetch
if (weeklyEmployeeIds.length === 0) {
    console.warn(`[AttendanceService] No employees found in HR_T_TimeAttendanceWeekly for ${month}/${year}`);
    console.warn('[AttendanceService] Possible causes: month not closed, network issue, or table empty');
    // Still return empty array but with clear status for frontend to handle
    return { error: 'NO_EMPLOYEES', message: `No employees for ${month}/${year}. Table may be empty or month not yet closed.` };
}
```

And in the backend route, handle this:

```javascript
// server.js
const data = noAttendance
    ? await fetchAttendanceDataOvertimeOnly(...)
    : await fetchAttendanceData(...);

// Check for error return
if (data && data.error === 'NO_EMPLOYEES') {
    return res.json({ 
        success: true, 
        data: [], 
        warning: data.message,
        emptyState: true
    });
}
```

---

### BUG-08: `performComparison` Called During/After Month Switch Race Condition
**Severity:** High  
**Layer:** Frontend — Async State Management  
**Root Cause:** In `handleCompareToggle`:
```javascript
const handleCompareToggle = () => {
    if (compareMode === 'off') {
        setCompareMode('presence');
        performComparison();  // ← ASYNC, no await
    }
    // ...
};
```

When user switches month, `handleFetchData` sets `loading=true` and fetches new data. But if user also toggles compare mode during this time, `performComparison()` will:
1. Use `selectedEmployeeIds` (which may have been reset to [])
2. Use `startDate`/`endDate` based on OLD `selectedMonth`/`selectedYear` values (React state updates are async)
3. Use `attendanceData` which may be stale or empty

```javascript
// performComparison uses these - all potentially stale:
const employeesToCompare = selectedEmployeeIds.length > 0
    ? attendanceData.filter(e => selectedEmployeeIds.includes(e.id))
    : attendanceData;  // ← This uses OLD attendanceData or empty
```

**Impact:** 
- Compare triggered right after month switch may compare against old data
- Comparison may fail with "no data" because `attendanceData` was cleared
- Race between `handleFetchData` and `performComparison`

**Fix:** Add loading guard in compare toggle and fetch:
```javascript
// In handleCompareToggle
const handleCompareToggle = () => {
    if (loading) return;  // Block compare while loading new month
    // ...
};

// In performComparison - guard against empty/stale data
const performComparison = async () => {
    if (!attendanceData.length || loading) return;  // Guard
    // ... use current state
};
```

Also make the date calculation synchronous with the current selector values:
```javascript
// Calculate dates BEFORE comparison, not relying on derived state
const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
```

---

### BUG-09: API Response Format Inconsistency Between Endpoints
**Severity:** Medium  
**Layer:** Frontend — API Contract  
**Root Cause:** The frontend `api.js` calls `/api/attendance`:
```javascript
return response.data.data;  // Backend returns { success: true, data: [...] }
```

But `/api/monthly-grid` returns a different structure:
```javascript
res.json({
    success: true,
    year: parseInt(year),
    month: parseInt(month),
    // ... no top-level "data" field, but "grid_data" instead
});
```

The frontend `fetchAttendanceData` only handles `/api/attendance` format. If any part of the system starts using `/api/monthly-grid`, the response parsing breaks.

**Impact:** If someone routes through monthly-grid, data won't be extracted correctly.

**Fix:** Standardize response format or add a response adapter in the API layer.

---

### BUG-10: Active Tab "Komparasi" Renders ComparisonDialog Even When No Data
**Severity:** Medium  
**Layer:** Frontend — Conditional Rendering  
**Root Cause:** In `AttendancePage` render:
```jsx
{activeTab === 'comparison' && (
    <Box sx={{ flexGrow: 1, overflow: 'hidden' }}>
        <ComparisonDialog
            inline={true}
            selectedEmployees={selectedEmployeeIds.length > 0
                ? attendanceData.filter(e => selectedEmployeeIds.includes(e.id))
                : attendanceData  // ← May be empty array
            }
            month={selectedMonth}
            year={selectedYear}
            onComparisonComplete={handleComparisonComplete}
        />
    </Box>
)}
```

The `ComparisonDialog` is rendered even when `attendanceData` is empty. The dialog will show empty tables and "No records to compare" — but this is triggered every time the tab is shown, even if data hasn't loaded.

**Impact:** 
- Tab switches feel slow because dialog is always mounted
- Empty state is shown briefly before data loads

**Fix:** Add `attendanceData.length > 0` guard:
```jsx
{activeTab === 'comparison' && attendanceData.length > 0 && (
    <ComparisonDialog inline={true} {...} />
)}
{activeTab === 'comparison' && attendanceData.length === 0 && !loading && (
    <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
        Tidak ada data untuk ditampilkan
    </Box>
)}
```

---

## 3. Proposed Fix Sequence

| Priority | Bug ID | Fix Description |
|----------|--------|----------------|
| P1 | BUG-01 | Wrap AttendancePage in ErrorBoundary |
| P1 | BUG-02 | Comprehensive state reset in handleFetchData |
| P1 | BUG-07 | Backend empty-state detection and clear logging |
| P1 | BUG-08 | Add loading guards and prevent race conditions |
| P2 | BUG-03 | Reset activeTab on month switch |
| P2 | BUG-04 | Fix ComparisonDialog callback signature |
| P2 | BUG-06 | Simplify React.memo in AttendanceMatrix |
| P2 | BUG-10 | Add guards for comparison tab rendering |
| P3 | BUG-05 | Debounce/guard onRefresh in AutomationDialog |
| P3 | BUG-09 | Standardize API response format |

---

## 4. Testing Requirements

### Manual Test Scenarios

**T1: Clean Month Switch**
1. Load month M1 → display matrix with data
2. Change to month M2 (different month) → click Tampilkan
3. **Expected:** Loading spinner → clear old data → show new data matrix
4. **Expected:** No stale data visible, no comparison overlay from M1

**T2: Month Switch with Active Comparison**
1. Load month M1 → run CHECK SYNC → matrix shows sync indicators
2. Switch to month M2 → click Tampilkan
3. **Expected:** Comparison indicators cleared, compareMode reset to 'off'
4. **Expected:** No overlay from previous comparison

**T3: Error Recovery**
1. Load month M1 → working
2. Stop backend server
3. Try to load month M2
4. **Expected:** Error alert shown, old data NOT cleared (or clear with message)
5. **Expected:** "Coba Lagi" button appears
6. **Expected:** After restart, app recovers without page reload

**T4: Rapid Month Switching**
1. Load month M1
2. Quickly change to M2, then M3, then M4 (before first load completes)
3. **Expected:** Only M4 data shown (debounced/cancelled)
4. **Expected:** No mixed data from multiple months

---

## 5. Files to Modify

| File | Bugs |
|------|------|
| `frontend/src/App.jsx` | BUG-01 |
| `frontend/src/pages/AttendancePage.jsx` | BUG-02, BUG-03, BUG-08, BUG-10 |
| `frontend/src/components/ComparisonDialog.jsx` | BUG-04 |
| `frontend/src/components/AttendanceMatrix.jsx` | BUG-06 |
| `frontend/src/components/AutomationDialog.jsx` | BUG-05 |
| `frontend/src/services/api.js` | BUG-09 |
| `backend/server.js` | BUG-07 |
| `backend/services/attendanceService.js` | BUG-07 |

---

## 6. Definition of Done

- [ ] All 10 bugs have fixes applied
- [ ] Manual test T1 passes: clean month switch with no stale data
- [ ] Manual test T2 passes: comparison state clears on month switch
- [ ] Manual test T3 passes: error shows fallback UI, recovery works
- [ ] Manual test T4 passes: no race condition data mixing
- [ ] Backend logs show clear messages for empty-state vs error
- [ ] No console errors in browser during normal usage
- [ ] No uncaught promise rejections in backend logs