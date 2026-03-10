WITH DailyAttendance AS (
    -- Filter OT = 0 dilakukan di sini sebelum penjumlahan
    SELECT 
        EmpCode, 
        EmpName, 
        TrxDate,
        SUM(Hours) AS TotalHoursActual,
        CASE 
            WHEN DATENAME(weekday, TrxDate) IN ('Friday', 'Jumat') THEN 5 
            ELSE 7 
        END AS TargetHours
    FROM [db_ptrj].[dbo].[PR_TASKREGLN]
    WHERE OT = 0 
    GROUP BY EmpCode, EmpName, TrxDate
)
-- Ambil data yang total jam regulernya di bawah target
SELECT 
    EmpCode,
    EmpName,
    TrxDate,
    DATENAME(weekday, TrxDate) AS NamaHari,
    TotalHoursActual,
    TargetHours,
    (TargetHours - TotalHoursActual) AS SelisihJam,
    'WARNING: Jam Reguler Kurang' AS Keterangan
FROM DailyAttendance
WHERE TotalHoursActual < TargetHours
ORDER BY TrxDate DESC, EmpCode;