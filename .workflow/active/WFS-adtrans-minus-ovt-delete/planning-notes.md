# Planning Notes: WFS-adtrans-minus-ovt-delete

## User Intent

**GOAL:** Create a runner to delete ADTRANS documents that have minus overtime (Kurang Bayar Overtime) records

**KEY_CONSTRAINTS:**
- Must filter employees with minus overtime component first
- Must find ADTRANS DocIds with lembur description for those employees
- Must delete those documents using standard ADTRANS deletion process
- Test the feature before production use

**SCOPE:**
- Create new service/runner for minus overtime ADTRANS deletion
- Follow existing ADTRANS deletion patterns (payrollADResetService.js)
- Query Venus payroll to find employees with MINUS_OVT component
- Query Millware PR_ADTRANS to find DocIds for those employees
- Delete found documents via browser automation

**CONTEXT:**
- Existing system has ADTRANS deletion for duplicates and amount differences
- MINUS_OVT is a Venus payroll component (#MINUS_OVT#) for "Kurang Bayar Overtime"
- When Venus has MINUS_OVT, Millware's ADTRANS may have extra overtime that needs to be removed
- The deletion should target documents with lembur description that match the minus overtime pattern

## Phase Status

| Phase | Status |
|-------|--------|
| Phase 1: Session Discovery | ✅ Completed |
| Phase 2: Context Gathering | ✅ Completed |
| Phase 3: Conflict Resolution | ⏭️ Skipped (conflictRisk: low) |
| Phase 4: Task Generation | ✅ Completed |

## Plan Confirmation

**Tasks Generated:** 4
- IMPL-1: fetchMinusOvtADDocIdsFromDB function
- IMPL-2: triggerPayrollADResetByMinusOvtAutomation function
- IMPL-3: API endpoints
- IMPL-4: Test with --dry-run

**Files to Modify:**
- backend/services/payrollADResetService.js
- backend/server.js

**Risk:** Low

## Context Findings

### Critical Files
1. **backend/services/payrollADResetService.js** - Existing ADTRANS deletion service
   - `fetchPayrollADDocIdsFromDB()` - Query PR_ADTRANS by month/year
   - `fetchAmountDifferenceADDocIdsFromDB()` - Compare Venus vs Millware
   - `preparePayrollADResetData()` - Write to current_payroll_ad_delete_data.json
   - `triggerPayrollADResetByAmountDifferenceAutomation()` - Orchestrate deletion

2. **backend/services/payrollService.js** - Venus payroll data
   - Detects MINUS_OVT via code `#MINUS_OVT#` or name containing "KURANG BAYAR OVERTIME"
   - `vLemburMinusOvt` variable tracks the minus overtime amount
   - `sync.lembur.venusDetail.minusOvt` exposes this to frontend

3. **browser-automation-engine/payroll-ad-delete-runner.js** - Browser deletion
   - `processTarget()` - Search DocID, open detail, click delete
   - Uses `current_payroll_ad_delete_data.json` as input
   - Supports `--dry-run` flag for testing

### Data Flow Pattern
```
1. Fetch Venus payroll → filter employees with MINUS_OVT > 0
2. For each employee → find PR_ADTRANS DocIds with "lembur" description
3. Write DocIds to current_payroll_ad_delete_data.json
4. Spawn payroll-ad-delete-runner.js to delete via browser
```

### Millware ADTRANS Structure
- **PR_ADTRANS**: ID, DocID, DocDate, DocDesc, EmpCode, EmpName, PhyMonth, PhyYear
- **PR_ADTRANSLN**: MasterID, TaskCode, Amount (JOIN via a.ID = b.MasterID)
- DocDesc typically contains "lembur" or overtime description

### Conflict Risk: LOW
- No conflicting changes expected
- Uses existing patterns (amount difference deletion)
- Independent new service function

## Session Info

- Session ID: WFS-adtrans-minus-ovt-delete
- Created: 2026-06-13
- Type: workflow
