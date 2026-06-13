# Implementation Plan: Beras Selisih to Monthly Allowance

## 1. Requirements Summary

Tambahkan alur agar komponen `beras` yang masih selisih ikut diinput ke Monthly Allowance/Deduction. Nilai yang diinput adalah selisih `Venus - Millware`, bukan full amount Venus. Input harus mirip penginputan tunjangan/potongan yang sudah ada, tetapi untuk beras perlu mengisi dimensi akun seperti Task Register: Station Code, Machine Code, dan Expense Code berdasarkan `chargeJob`.

## 2. Architecture Decisions

1. Reuse payroll monthly allowance path.
   - Gunakan `payroll-runner.js` + `payroll-ad-input.json`, bukan membuat runner khusus baru.
   - Beras sudah diarahkan ke jalur ini oleh `/api/payroll/beras/run`.

2. Keep beras selisih calculation in backend.
   - `prepareBerasAutomationData()` tetap menjadi sumber payload `current_payroll_beras_data.json`.
   - `venusAmount` pada component boleh tetap menjadi amount yang diinput karena runner/template sudah memakai field itu.
   - Simpan `originalVenusAmount`, `originalMillwareAmount`, dan `inputAmount` untuk audit/preview.

3. Add account dimension input to payroll AD template.
   - Reuse `parseChargeJob` dari `actions/index.js`.
   - Jangan reuse `_charge_job_input.json` langsung untuk payroll tanpa adaptasi, karena step itu juga mengisi Task Code dari ChargeJob. Payroll TaskCode harus tetap dari component AD code.
   - Buat sub-template payroll khusus, misalnya `_payroll_account_dim_input.json`, yang hanya mengisi Station/Machine/Expense dari parsed ChargeJob.

4. Resolve beras AD code before implementation.
   - Config menyebut `AL0012`.
   - Current discovered mapping menyebut `AL0011` dengan desc TUNJANGAN TRANSPORT.
   - Implementasi harus memakai sumber mapping yang disepakati dan dites lewat dry-run/autocomplete discovery.

## 3. Task Breakdown

### IMPL-1: Normalize Beras Payload and Mapping

Scope:
- Pastikan `prepareBerasAutomationData()` menghasilkan payload beras selisih yang lengkap untuk monthly allowance.
- Sertakan `chargeJob` dan/atau parsed dimension fields jika diperlukan oleh template.
- Validasi dan konsolidasikan mapping beras `AL0011` vs `AL0012`.

Acceptance:
- Payload beras punya satu component per record.
- Amount input adalah selisih positif.
- Payload punya data cukup untuk Station/Machine/Expense.
- Unit tests cover selisih partial/full and mapping behavior.

### IMPL-2: Add Payroll Account Dimension Template

Scope:
- Tambah template/helper payroll untuk parse `employee.chargeJob`.
- Fill Station Code, Machine Code, dan Expense Code setelah TaskCode dipilih dan sebelum Amount/Add.
- Reuse `retryInputWithValidation`, termasuk special Expense Code select path.

Acceptance:
- Template payroll AD Lists mengisi employee, component TaskCode, account dimensions, amount, Add, Save.
- Missing expense falls back to LABOUR using existing parser behavior.
- No changes to Task Register behavior.

### IMPL-3: Wire Beras Run to Generic Payroll Path

Scope:
- Pastikan `/api/payroll/beras/run` dan dialog beras tetap memakai generated beras payload dan generic payroll runner.
- Hapus atau abaikan runner beras khusus hanya jika sudah tidak dipakai; jangan refactor besar saat ada WIP.
- Pastikan stop action menghentikan process yang benar.

Acceptance:
- Dry-run beras memvalidasi payload tanpa browser input.
- Execute beras menjalankan same payroll AD template dengan `--component-key=beras`.
- UI preview tetap menampilkan original Venus/Millware dan selisih input.

### IMPL-4: Verification and Tests

Scope:
- Tambah/extend tests:
  - `charge-job-parser.test.js` for common chargeJob formats.
  - payroll dry-run payload validation for beras selisih.
  - template structure test to assert dimension input occurs before Amount/Add.
  - backend prepare test for beras selisih and duplicate/existing filtering.

Acceptance:
- Relevant Node tests pass.
- Dry-run command passes on generated/current test payload.
- Optional smoke browser opens AD Lists and verifies selectors if environment permits.

### IMPL-5: Operational Guardrails

Scope:
- Add logging/diagnostics for parsed station/machine/expense per beras row.
- Add warnings when chargeJob missing or beras mapping is ambiguous.
- Keep live execution gated by dry-run and preview.

Acceptance:
- Logs show employee, PTRJ ID, AD code, selisih amount, Station/Machine/Expense.
- Missing dimension data is visible before Add rather than silently skipped.

## 4. Implementation Strategy

Recommended execution: sequential.

1. First solve backend payload and mapping ambiguity.
2. Then update template/helper to fill account dimensions.
3. Then wire/run through existing beras endpoint.
4. Then test and dry-run.

Parallel implementation is not recommended in this worktree because multiple related files already have uncommitted changes.

## 5. Risk Assessment

High:
- Existing WIP touches the same backend/frontend/automation files. Implementation must preserve those changes.
- Beras mapping conflict (`AL0011` vs `AL0012`) can input to wrong AD code if not resolved.

Medium:
- AD Lists page may expose account dimension fields only after TaskCode postback. Template must wait for fields after TaskCode selection.
- `chargeJob` formats differ by employee. Parser fallback covers some cases, but short formats need tests.

Low:
- Frontend changes are mostly preview/label/logging if backend and runner contract stays stable.

## 6. Validation Commands

Run after implementation, adjusted to available package scripts:

```powershell
node browser-automation-engine/charge-job-parser.test.js
node browser-automation-engine/payroll-dry-runner.js browser-automation-engine/testing_data/current_payroll_beras_data.json
node browser-automation-engine/payroll-runner.js browser-automation-engine/testing_data/current_payroll_beras_data.json --component-key=beras --dry-run
npm run build
```

Smoke browser validation can be run only when Millware is reachable and user approves visible browser automation:

```powershell
node browser-automation-engine/payroll-runner.js browser-automation-engine/testing_data/current_payroll_beras_data.json --component-key=beras --row-limit=1 --smoke-browser
```
