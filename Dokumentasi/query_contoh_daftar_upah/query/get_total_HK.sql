SELECT
    -- This query calculates the total number of work days (HK) for a given employee within a specified date range.
    -- It counts all attendance records for the employee, effectively removing any 'is_present = true' filter if it was intended.
    COUNT(*) AS total_hk
FROM "PR_EMP_ATTN_ARC"
WHERE EmpCode = :emp_code
  AND AttnDate >= :start_date
  AND AttnDate < :end_date