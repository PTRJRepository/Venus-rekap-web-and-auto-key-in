-- Query total HK per employee untuk gang
-- Berdasarkan query backend_lama yang sudah bekerja

SELECT
    e."EmpCode" as nik,
    e."EmpName" as nama,
    g."GangCode" as gang_code,
    (
        SELECT COALESCE(COUNT(CASE WHEN a.IsPresent = 'true' AND a.IsRestDay = 'false' AND a.IsHoliday = 'false' THEN 1 END), 0) as hk_count
        FROM PR_EMP_ATTN_ARC a
        WHERE a.EmpCode = e."EmpCode"
        AND a.AttnDate >= '2025-05-01'
        AND a.AttnDate < '2025-06-01'
    ) as hari_kerja

FROM HR_EMPLOYEE e
JOIN HR_GANGLN g ON g."GangMember" = e."EmpCode"
WHERE g."GangCode" = 'H1H'
GROUP BY e."EmpCode", e."EmpName", g."GangCode", hari_kerja
ORDER BY e."EmpCode";