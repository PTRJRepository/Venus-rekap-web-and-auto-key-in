SELECT DISTINCT
    t.DocDesc,
    ln.TaskCode,
    mt.TaskDesc
FROM [db_ptrj].[dbo].[PR_ADTRANS] AS t
JOIN [db_ptrj].[dbo].[PR_ADTRANSLN] AS ln 
    ON t.ID = ln.MasterID
LEFT JOIN [db_ptrj].[dbo].[PR_TASKCODE] AS mt 
    ON ln.TaskCode = mt.TaskCode
WHERE
 t.EmpCode = 'B0065'
 AND
  t.DocDate >= '2026-01-01'
  AND t.DocDate <  '2026-02-01'
  AND mt.TaskDesc = 'ACCRUALS-CHECKROLL'; 