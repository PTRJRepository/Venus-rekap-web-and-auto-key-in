SELECT TOP (1000) 
    A.[TrxDate],
    A.[EmpCode],
    A.[EmpName],
    A.[TaskCode],
    B.[TaskDesc],
    B.[TaskType],
    B.[UOM],
    A.[Hours],
    A.[Amount],
    A.[Status]
FROM [db_ptrj].[dbo].[PR_TASKREGLN_ARC] AS A
LEFT JOIN [db_ptrj].[dbo].[PR_TASKCODE] AS B 
    ON A.[TaskCode] = B.[TaskCode]
WHERE A.[TrxDate] >= '2026-01-01' 
  AND A.[TrxDate] <= EOMONTH('2026-01-01')
ORDER BY A.[TrxDate] DESC;