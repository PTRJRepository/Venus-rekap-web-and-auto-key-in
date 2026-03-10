-- Query untuk mendapatkan daftar employee berdasarkan lokasi kerja
-- Parameter: @LocCode - Kode lokasi kerja
-- Usage: Ganti 'P1A' dengan loc code yang diinginkan
-- Mengembalikan semua employee aktif di lokasi tersebut dengan informasi gang

SELECT
    e.EmpCode AS EmployeeCode,
    e.EmpName AS EmployeeName,
    e.LocCode AS LocationCode,
    g.GangCode AS GangCode,
    g.GangName AS GangName,
    e.IsActive AS IsActive
FROM HR_EMPLOYEE e
JOIN HR_GANGLN g ON e.EmpCode = g.GangMember
WHERE e.LocCode = @LocCode
    AND e.IsActive = 1  -- Filter hanya employee aktif
ORDER BY g.GangCode, e.EmpCode
