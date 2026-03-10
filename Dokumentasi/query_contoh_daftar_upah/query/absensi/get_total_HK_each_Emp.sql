SELECT COUNT(*)
FROM [db_ptrj].[dbo].[PR_TASKREGLN_ARC]
WHERE [EmpCode] = 'B0065'
  AND MONTH([TrxDate]) = 11
  AND YEAR([TrxDate]) = 2025
  AND OT = 0;