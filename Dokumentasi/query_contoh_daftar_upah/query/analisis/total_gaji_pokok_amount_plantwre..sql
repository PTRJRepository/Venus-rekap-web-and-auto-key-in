SELECT 
    EmpCode, 
    EmpName, 
    SUM(Amount) AS TotalAmountReguler,
    COUNT(DISTINCT TrxDate) AS HariKerjaReguler
FROM [db_ptrj].[dbo].[PR_TASKREGLN]
WHERE TrxDate >= '2026-01-01' AND TrxDate <= '2026-01-31'
  AND OT = 0
GROUP BY EmpCode, EmpName
ORDER BY EmpCode;