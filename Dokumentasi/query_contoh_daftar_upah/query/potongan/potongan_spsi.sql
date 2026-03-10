SELECT DISTINCT
    t.DocDesc,
    ln.TaskCode,
    mt.TaskDesc
FROM [db_ptrj].[dbo].[PR_ADTRANS_ARC] AS t
JOIN [db_ptrj].[dbo].[PR_ADTRANSLN_ARC] AS ln 
    ON t.ID = ln.MasterID
LEFT JOIN [db_ptrj].[dbo].[PR_TASKCODE] AS mt 
    ON ln.TaskCode = mt.TaskCode
WHERE t.EmpCode = 'J0587'
  AND t.DocDate >= '2025-05-01'
  AND t.DocDate <  '2025-06-01'
  AND mt.TaskDesc LIKE '%spsi%';