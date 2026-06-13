# IMPL_PLAN: WFS-adtrans-minus-ovt-delete

## Goal
Create a runner to delete ADTRANS documents that have minus overtime (Kurang Bayar Overtime) records.

## Workflow
1. Filter employees with MINUS_OVT component in Venus payroll
2. Find PR_ADTRANS DocIds for those employees with lembur description
3. Delete those documents using standard ADTRANS deletion process

## Tasks

### IMPL-1: Add fetchMinusOvtADDocIdsFromDB() function
**File:** `backend/services/payrollADResetService.js`
**Type:** backend
**Priority:** high

**Steps:**
1. Fetch Venus payroll data with MINUS_OVT breakdown
2. Filter employees where `sync.lembur.venusDetail.minusOvt > 0`
3. Query PR_ADTRANS for those employees with lembur description
4. Return DocIds and employee details

**Acceptance Criteria:**
- [ ] Function returns employees with MINUS_OVT > 0
- [ ] Function returns matching ADTRANS DocIds
- [ ] Function handles empty results gracefully

---

### IMPL-2: Add triggerPayrollADResetByMinusOvtAutomation() function
**File:** `backend/services/payrollADResetService.js`
**Type:** backend
**Priority:** high

**Steps:**
1. Call fetchMinusOvtADDocIdsFromDB() to get targets
2. Prepare data for payroll-ad-delete-runner.js
3. Return preview with employee count and DocId count

**Acceptance Criteria:**
- [ ] Function orchestrates filter → find → prepare workflow
- [ ] Function returns proper success/error response
- [ ] Function supports dryRun mode

---

### IMPL-3: Add API endpoints
**File:** `backend/server.js`
**Type:** backend
**Priority:** high

**Steps:**
1. Add `GET /api/payroll/ad-reset/minus-ovt/preview` endpoint
2. Add `POST /api/payroll/ad-reset/minus-ovt/run` endpoint
3. Register new functions in module.exports

**Acceptance Criteria:**
- [ ] Preview endpoint returns employee and DocId list
- [ ] Run endpoint triggers automation
- [ ] Both endpoints support month/year parameters

---

### IMPL-4: Test with --dry-run
**File:** `browser-automation-engine/payroll-ad-delete-runner.js`
**Type:** test
**Priority:** high

**Steps:**
1. Run preview to identify target DocIds
2. Execute with --dry-run flag
3. Verify correct targets are identified
4. Check deletion simulation works correctly

**Acceptance Criteria:**
- [ ] Preview shows correct employees with MINUS_OVT
- [ ] Dry-run identifies correct DocIds
- [ ] No errors during execution

---

## Files to Modify
1. `backend/services/payrollADResetService.js` - Add new functions
2. `backend/server.js` - Add API endpoints

## Files to Create
- None (uses existing patterns)

## Dependencies
- Existing ADTRANS deletion pattern (payrollADResetService.js)
- Existing MINUS_OVT detection (payrollService.js)
- Existing browser automation runner (payroll-ad-delete-runner.js)

## Risk Assessment
- **Risk:** Low
- **Reasoning:** Uses existing deletion patterns, no database schema changes
