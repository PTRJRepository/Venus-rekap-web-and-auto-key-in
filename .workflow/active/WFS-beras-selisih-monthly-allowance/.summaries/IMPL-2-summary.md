# IMPL-2 Summary

Status: completed

Updated `browser-automation-engine/templates/payroll-beras-input-with-chargejob.json` so beras Monthly Allowance input parses `employee.chargeJob` and fills account dimensions before Amount/Add.

Dimension order now matches the Task Register charge job pattern:

- Station Code: ChargeJob part 2, CBOBox index 2, validation `#MainContent_MultiDimAcc_reqValBlock`
- Machine Code: ChargeJob part 3, CBOBox index 3, validation `#MainContent_MultiDimAcc_reqValSubBlk`
- Expense Code: ChargeJob part 4, CBOBox index 4, validation `#MainContent_MultiDimAcc_reqValExpCode`

TaskCode remains the payroll AD code input (`TRANSPORT` / `AL0011`) and is not overwritten by ChargeJob part 1.
