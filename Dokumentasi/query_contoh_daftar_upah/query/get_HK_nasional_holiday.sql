SELECT COUNT(*) as total_hk
FROM "PR_EMP_ATTN_ARC"
WHERE EmpCode = ?
  AND AttnDate >= ?
  AND AttnDate < ?
  AND IsPresent = 'true'
  AND "TodayIsHoliday" = 'true'