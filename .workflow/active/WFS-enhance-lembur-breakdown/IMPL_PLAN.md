# IMPL_PLAN: Enhance Lembur Breakdown Display

## Session: WFS-enhance-lembur-breakdown

## Goal
Enhance lembur (overtime) breakdown display di payroll comparison matrix dengan breakdown detail untuk Millware dan Venus.

## Current State

### Millware Lembur (sudah ada breakdown di data)
```javascript
// payrollComparisonService.js - Line 229-232
const tunjanganLembur = calculateMillwareOvertimeAllowance({
    taskRegisterAmount: taskRegisterLemburAmount,
    adTransAmount: tunjanganLemburAdtrans
});
// Returns: { taskRegisterAmount, adTransAmount, totalAmount }
```

### Venus Lembur (satu nilai gabungan)
```javascript
// payrollService.js - Line 264
const key = getPayrollComponentKey(d);
if (key === 'lembur') vLembur += d.amount;
// OT1 + OT2 + OT3 + MINUS_OVT = satu nilai total
```

## Target State

### Millware Display
```
LEMBUR TOTAL: Rp 5,341,127
  - TASKREG (OT Hours): Rp 5,000,000
  - ADTRANS (Topup): Rp 341,127
```

### Venus Display
```
LEMBUR TOTAL: Rp 5,037,919
  - OT1 (OT Jam ke 1): Rp 629,739
  - OT2 (OT Jam ke 2): Rp 4,338,208
  - OT3 (OT Jam ke 3): Rp 69,971
  - MINUS_OVT (Kurang Bayar): Rp -163,266 (excluded from total)
```

## Implementation Tasks

### Task 1: IMPL-1 - Enhance Venus Lembur Breakdown in payrollService.js
**File:** `backend/services/payrollService.js`

**Changes:**
1. Create `vLemburOT1`, `vLemburOT2`, `vLemburOT3`, `vLemburMinusOvt` variables
2. Parse individual Venus components:
   - `#OT1#` → `vLemburOT1`
   - `#OT2#` → `vLemburOT2`
   - `#OT3#` → `vLemburOT3`
   - `#MINUS_OVT#` → `vLemburMinusOvt`
3. Add to sync object:
   ```javascript
   lembur: { 
     venus: vLembur,  // OT1+OT2+OT3 only (exclude MINUS_OVT)
     venusDetail: {
       ot1: vLemburOT1,
       ot2: vLemburOT2,
       ot3: vLemburOT3,
       minusOvt: vLemburMinusOvt
     }
   }
   ```

**Verify:** Run payroll API, check Venus lembur breakdown in response

---

### Task 2: IMPL-2 - Enhance Millware Lembur Breakdown in payrollComparisonService.js
**File:** `backend/services/payrollComparisonService.js`

**Changes:**
1. Already has breakdown in calculation (Line 34-46)
2. Add to finalResults (Line 281-283):
   ```javascript
   tunjangan_lembur_taskreg: tunjanganLembur.taskRegisterAmount,
   tunjangan_lembur_adtrans: tunjanganLembur.adTransAmount,
   ```
3. Ensure `sync.lembur.millware` includes both:
   ```javascript
   lembur: { 
     millware: totalLemburAmount,
     millwareDetail: {
       taskreg: tunjanganLembur.taskRegisterAmount,
       adtrans: tunjanganLembur.adTransAmount
     }
   }
   ```

**Verify:** Check payroll API response has millwareDetail

---

### Task 3: IMPL-3 - Update Frontend Matrix Display
**File:** `frontend/src/components/PayrollReport.jsx`

**Changes:**
1. Update `PayrollComponentMatrix` to show lembur breakdown:
   ```jsx
   {/* Instead of single value */}
   <Typography>{formatCurrency(cell.venus)}</Typography>
   
   {/* Show breakdown */}
   <Typography>Total: {formatCurrency(cell.venus)}</Typography>
   <Typography fontSize="0.5rem">OT1: {formatCurrency(cell.venusDetail?.ot1)}</Typography>
   <Typography fontSize="0.5rem">OT2: {formatCurrency(cell.venusDetail?.ot2)}</Typography>
   <Typography fontSize="0.5rem">OT3: {formatCurrency(cell.venusDetail?.ot3)}</Typography>
   ```

2. Add Millware breakdown:
   ```jsx
   <Typography fontSize="0.5rem">MW TaskReg: {formatCurrency(cell.millwareDetail?.taskreg)}</Typography>
   <Typography fontSize="0.5rem">MW AdTrans: {formatCurrency(cell.millwareDetail?.adtrans)}</Typography>
   ```

**Verify:** Visual check of matrix display

---

### Task 4: IMPL-4 - Update Variance Analysis Tab
**File:** `frontend/src/components/PayrollReport.jsx` - `EmployeePayrollRow`

**Changes:**
1. Expand Tab 2 (Variance Analysis) to show detailed lembur:
   ```jsx
   { label: 'Lembur (Accumulated)', key: 'lembur' },
   // Change to:
   { 
     label: 'Lembur - OT1', 
     key: 'lembur_ot1',
     subLabel: 'OT Jam ke 1'
   },
   { 
     label: 'Lembur - OT2', 
     key: 'lembur_ot2',
     subLabel: 'OT Jam ke 2'
   },
   { 
     label: 'Lembur - OT3', 
     key: 'lembur_ot3',
     subLabel: 'OT Jam ke 3'
   },
   { 
     label: 'Lembur Total (V)', 
     key: 'lembur',
     subLabel: 'OT1+OT2+OT3'
   },
   {
     label: 'Millware TaskReg', 
     key: 'lembur_taskreg',
     subLabel: 'Dari PR_TASKREGLN'
   },
   {
     label: 'Millware AdTrans', 
     key: 'lembur_adtrans',
     subLabel: 'Topup dari ADTRANS'
   }
   ```

**Verify:** Click employee row, check Variance tab

---

### Task 5: IMPL-5 - Update payrollComponentMapping.js (Optional)
**File:** `backend/services/payrollComponentMapping.js`

**Changes:** Already has correct mapping:
- `#OT1#` → `lembur`
- `#OT2#` → `lembur`
- `#OT3#` → `lembur`
- `#MINUS_OVT#` → `kurangBayarOvertime_excluded`

**Status:** NO CHANGES NEEDED - Current mapping is correct

---

## Verification Plan

### Test Case 1: API Response
```bash
curl /api/payroll?month=5&year=2026
```
Expected: `sync.lembur` has both `venus` (with breakdown) and `millware` (with breakdown)

### Test Case 2: Matrix Display
1. Go to Payroll Report → Matrix view
2. Check Lembur column shows breakdown

### Test Case 3: Employee Detail
1. Click employee row → Variance Analysis tab
2. Check all lembur components listed separately

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Frontend breaking changes | Low | Incremental updates, test each component |
| Backward compatibility | Low | Add new fields, keep existing structure |

## Estimated Effort
- Backend changes: 1-2 hours
- Frontend changes: 2-3 hours
- Testing: 1 hour
- **Total: 4-6 hours**
