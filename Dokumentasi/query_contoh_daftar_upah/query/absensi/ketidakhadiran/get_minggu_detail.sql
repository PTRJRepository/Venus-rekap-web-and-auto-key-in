SELECT [TrxDate]
FROM [db_ptrj].[dbo].[PR_TASKREGLN_ARC]
WHERE [EmpCode] = 'B0065'
    AND MONTH([TrxDate]) = 05
    AND YEAR([TrxDate]) = 2025
    AND OT = 0
    AND DATEPART(weekday, [TrxDate]) = 1