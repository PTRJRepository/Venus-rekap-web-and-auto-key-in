# TODO_LIST: WFS-adtrans-minus-ovt-delete

## Status: IMPLEMENTATION_COMPLETE ✅

## Tasks

- [x] IMPL-1: Add fetchMinusOvtADDocIdsFromDB function
- [x] IMPL-2: Add triggerPayrollADResetByMinusOvtAutomation function
- [x] IMPL-3: Add API endpoints for MINUS_OVT deletion
- [x] IMPL-4: Test with --dry-run

## Test Results

### Query Test (Step 1-2)
- ✅ Found 96 employees with MINUS_OVT in May 2026
- ✅ Found ADTRANS DocIds with "lembur" description

### Runner Test (Step 3)
- ✅ payroll-ad-delete-runner.js --dry-run works correctly

### Implementation Test (Step 4)
- ✅ fetchMinusOvtADDocIdsFromDB returns correct data
- ✅ triggerPayrollADResetByMinusOvtAutomation prepares data correctly
- ✅ API endpoints added to server.js

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/payroll/ad-reset/minus-ovt/preview` | GET | Preview employees with MINUS_OVT and their ADTRANS DocIds |
| `/api/payroll/ad-reset/minus-ovt/run` | POST | Run deletion automation |

## Sample Output

**Preview (May 2026):**
- Employees with MINUS_OVT: 96
- ADTRANS DocIds found: 5 (limited)

**DocIds to delete:**
- AD26052361 - POM00020 - Tigo
- AD26052349 - POM00022 - Ramadani
- AD26052322 - POM00023 - Arianto
- AD26052389 - POM00026 - Nursamsi
- AD26052399 - POM00028 - Derry