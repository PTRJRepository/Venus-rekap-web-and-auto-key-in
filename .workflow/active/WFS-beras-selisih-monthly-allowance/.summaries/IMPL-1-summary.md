# IMPL-1 Summary

Status: completed

Backend beras payload was verified against the current WIP implementation. The generated payload uses one component per beras record, keeps `chargeJob`, stores original Venus/Millware amounts, and uses the positive `Venus - Millware` shortfall as the input amount.

Mapping remains on the current discovered Millware mapping: `AL0011` / `TRANSPORT` for beras input. No live mapping change to `AL0012` was made.

Validation added: payroll dry-run now fails beras rows that do not have `employee.chargeJob`, because account dimensions are required for this flow.
