-- Query untuk mendapatkan EmpCode, EmpName, LocCode, dan GangCode dalam satu divisi
-- Versi ini menggunakan INNER JOIN dan pastikan struktur kolom benar

SELECT 
    e."EmpCode",
    e."EmpName",
    e."LocCode",
    g."GangCode"
FROM "HR_EMPLOYEE" e
INNER JOIN "HR_GANGLN" g ON g."GangMember" = e."EmpCode"
WHERE UPPER(g."GangCode") LIKE UPPER(? || '%')  -- Parameter: divisi prefix (misal: 'A', 'B', 'C', dll)
  AND e."Status" = 'A'  -- Hanya karyawan aktif
ORDER BY g."GangCode", e."EmpCode";