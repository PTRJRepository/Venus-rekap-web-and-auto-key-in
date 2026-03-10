SELECT TOP 10000
    g.ID AS GangID,            -- Ini adalah GangID dari PR_GANG
    g.Description AS GangCode, -- Kode Gang (Contoh: L1H)
    ln.EmpCode,
    ln.AccMonth AS PajakMonth,
    ln.AccYear AS PajakYear,
    -- Konversi ke Bulan Kalender Sebenarnya
    CASE 
        WHEN ln.AccMonth <= 9 THEN ln.AccMonth + 3 
        ELSE ln.AccMonth - 9 
    END AS ActualMonth,
    -- Konversi ke Tahun Kalender Sebenarnya
    CASE 
        WHEN ln.AccMonth <= 9 THEN ln.AccYear - 1 
        ELSE ln.AccYear 
    END AS ActualYear
FROM [db_ptrj].[dbo].[PR_GANG] AS g
JOIN [db_ptrj].[dbo].[PR_GANGLN_ARC] AS ln ON g.ID = ln.MasterID
ORDER BY ln.AccYear DESC, ln.AccMonth DESC;