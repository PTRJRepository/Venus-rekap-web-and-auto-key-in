# Analysis Discussion

**Session**: ANL-2026-06-12-payroll-lembur-snapshot-adjustment  
**Topic**: Adjustment lembur dari payroll snapshot matrix, input selisih ke Monthly Allowance/Deduction dengan ADCode AL0019.  
**Started**: 2026-06-12T15:50:00+07:00  
**Dimensions**: implementation, architecture  
**Depth**: standard

## Current Understanding
### What We Established
- Fitur yang diminta sebaiknya mengikuti pola `Input Beras`, bukan generic `Input ke Millware`, karena yang diinput adalah selisih `Venus - Millware`.
- Data snapshot sudah cukup untuk menghitung adjustment: payload payroll punya `sync.lembur` dan `chargeJob`.
- Target input adalah Millware AD Lists / Monthly Allowance and Deduction, task code `AL0019`, description `TUNJANGAN LEMBUR`, dan amount adalah shortfall.
- UI harus menampilkan tombol adjustment hanya saat `payrollSource === 'snapshot'` dan user berada di payroll matrix comparison.

### What Was Clarified
- Generic payroll automation punya mapping `lembur -> AL0019`, tetapi memasukkan nilai Venus penuh, bukan selisih. Itu tidak sesuai requirement adjustment.
- Matrix saat ini menandai `lembur` sebagai `Info` dan `syncable: false`; fitur baru perlu tombol khusus, bukan sekadar mengaktifkan sync umum.

### Key Insights
- Jalur paling aman adalah menambah path khusus `lembur adjustment`, mirip `beras`: prepare preview, dry-run, execute, data file sendiri, dan template AD Lists dengan charge job.
- Template beras sudah memecahkan bagian tersulit: parsing `chargeJob` lalu mengisi CBOBox AD Lists index 2/3/4.

## Analysis Context
- Focus areas: backend preparation, frontend matrix button/dialog, browser automation template, duplicate guard, snapshot source propagation.
- Excluded: langsung implementasi code, live Millware smoke test.

## Discussion Timeline
### Round 1 - Exploration
#### Key Findings
- `PayrollReport.jsx` sudah punya source selector snapshot/live dan meneruskan `payrollSourceParams`; snapshot params dibuat dari `source` dan `snapshotId`.
- Matrix component ada di `PayrollComponentMatrix`; `lembur` ada di matrix tapi `syncable: false`, sehingga tidak masuk summary/action sync.
- Existing `Input Beras` memanggil `onBerasAutomation(payrollSourceParams)` dan dialognya sudah preview/dry-run/execute.
- `prepareBerasAutomationData` menghitung `shortfallAmount = max(0, venusAmount - millwareAmount)`, lalu override `venusAmount` menjadi amount yang akan diinput.
- Route `/api/payroll/beras/prepare` dan `/api/payroll/beras/run` menjadi pola route untuk fitur baru.
- Template `payroll-beras-input-with-chargejob.json` navigates AD Lists, set description, input task code, parse charge job, fill station/machine/expense, input amount, add, save.
- `payrollComponentMapping.js` sudah punya rule `TUNJANGAN LEMBUR` dengan `adCode: 'AL0019'`.

#### Technical Solution
> **Solution**: Add dedicated snapshot-only lembur adjustment automation path.
> - **Status**: Proposed
> - **Problem**: Need to input only overtime shortfall into AD Lists with charge job.
> - **Rationale**: Beras path already implements shortfall and charge job AD Lists flow.
> - **Alternatives**: Extend generic automation rejected because it inputs full Venus amount and does not fill charge job dimensions.
> - **Next Action**: Create implementation plan or execute feature.

#### Pressure Pass
> **Target**: "Reuse beras shortfall pattern for lembur adjustment"
> - **Evidence**: backend shortfall logic, beras route, beras dialog, and AD Lists charge job template all exist.
> - **Hidden assumption**: AD Lists dimension indexes for AL0019 behave like beras/transport AD Lists.
> - **Boundary impact**: First implementation should be dedicated and tested via dry-run before execute.
> - **Verdict**: Confirmed for design, but browser selector behavior needs live validation.

## Synthesis & Conclusions
### Evidence Anchors
- `frontend/src/components/PayrollReport.jsx:52` sets `lembur` as non-syncable info in matrix.
- `frontend/src/components/PayrollReport.jsx:807` and `frontend/src/components/PayrollReport.jsx:816` build snapshot source params.
- `frontend/src/components/PayrollReport.jsx:1053` existing Input Beras action passes current payroll source.
- `backend/services/payrollAutomationService.js:591` calculates beras shortfall and `:595` overrides the input amount.
- `backend/services/payrollAutomationService.js:669` marks beras payload as `inputType: 'SELISIH'`.
- `backend/server.js:1355` and `backend/server.js:1408` are prepare/run route patterns.
- `browser-automation-engine/templates/payroll-beras-input-with-chargejob.json:189` inputs task code; `:214` parses charge job; `:234`, `:262`, `:292` fill charge job dimensions.
- `backend/services/payrollComponentMapping.js:174` maps lembur to `TUNJANGAN LEMBUR`; `:175` maps it to `AL0019`.

### Recommendations
1. Add `prepareLemburAdjustmentData(month, year, { payrollSource })` in `payrollAutomationService.js`.
   - Use `fetchPayrollData` so snapshot mode reads snapshot.
   - Include only rows with `ptrjId`, `chargeJob`, `sync.lembur.venus > sync.lembur.millware + tolerance`.
   - Amount to input: `shortfallAmount = max(0, venus - millware)`.
   - Component payload: `componentKey: 'lembur'`, `componentName: 'TUNJANGAN LEMBUR'`, `adCode: 'AL0019'`, `adSearchKeyword: 'LEMBUR'`, `venusAmount: shortfallAmount`, `inputAmount`, original amounts, note.
   - Run duplicate/existing ADTRANS filter against `AL0019 + shortfall`.

2. Add backend endpoints mirroring beras:
   - `POST /api/payroll/lembur-adjustment/prepare`
   - `POST /api/payroll/lembur-adjustment/run`
   - Use a separate data file, e.g. `current_payroll_lembur_adjustment_data.json`.
   - Reuse `payroll-runner.js` and `runPayrollDryRun`.

3. Add a template based on `payroll-beras-input-with-chargejob.json`.
   - Description: `TUNJANGAN LEMBUR`.
   - Task code search: `LEMBUR`, fallback `AL0019`.
   - Keep `parseChargeJob` and CBOBox index 2/3/4 steps.

4. Add `LemburAdjustmentDialog.jsx` by adapting `BerasAutomationDialog.jsx`.
   - Preview: employee, PTRJ ID, Venus lembur, Millware lembur, Selisih input.
   - Controls: dry-run/execute and headful/headless.
   - Log stream handling same as beras.

5. Show button only in snapshot matrix mode.
   - Condition: `payrollSource === 'snapshot' && selectedSnapshotId && mainPerspective === 'matrix'`.
   - Text example: `Adjustment Lembur`.
   - It should be visually near `Input Beras`, but disabled in live mode.

6. Update dry-run validation.
   - Require `chargeJob` for `componentKey === 'lembur'` when payload metadata marks adjustment with charge job.
   - Keep existing one component per DocID guard.

7. Add tests.
   - Unit test `prepareLemburAdjustmentData` shortfall-only behavior.
   - Confirm it skips Venus <= Millware, no PTRJ, no chargeJob, duplicate payload, and existing ADTRANS signatures.
   - Test route dry-run if route structure is not too coupled.

### Open Questions
- Does AD Lists for `AL0019` require the same station/machine/expense dimensions as beras? The template likely works, but should be dry-run/smoke-tested.
- Should existing AL0019 from task register overtime be considered in `sync.lembur.millware` plus ADTRANS adjustment later? Current comparison only reads task register overtime for `tunjangan_lembur`, so after input ADTRANS AL0019 the comparison query may need to include ADTRANS AL0019 in Millware lembur if the adjustment should close the matrix diff.

## Plan Checklist
> This is a plan only. No application source code was modified in this analysis.

- [ ] Implement dedicated lembur adjustment prepare/run backend path.
- [ ] Add AL0019 charge-job AD Lists template.
- [ ] Add frontend dialog and snapshot-only matrix button.
- [ ] Update dry-run validation and tests.
- [ ] Verify dry-run and frontend build.

## Session Statistics
- Rounds: 1
- Key findings: 7
- Recommendations: 7
- Confidence: 78%
