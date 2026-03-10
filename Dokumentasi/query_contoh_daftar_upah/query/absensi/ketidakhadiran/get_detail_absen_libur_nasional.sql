SELECT T1.[TrxDate],
    T2.[GPHCode] AS HolidayGPHCode,
    T2.[Description] AS HolidayDescription,
    T2.[HolidayDate] AS IsHolidayDate
FROM [db_ptrj].[dbo].[PR_TASKREGLN_ARC] AS T1
    INNER JOIN [db_ptrj].[dbo].[HR_GPH] AS T2 ON T1.[TrxDate] = T2.[HolidayDate]
    AND T2.[Status] = 1
WHERE T1.[EmpCode] = 'B0065'
    AND MONTH(T1.[TrxDate]) = 05
    AND YEAR(T1.[TrxDate]) = 2025
    AND T1.[OT] = 0;