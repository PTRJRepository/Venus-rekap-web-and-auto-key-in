-- Query untuk mendapatkan EmpCode, EmpName, LocCode, dan GangCode dalam satu divisi
-- Digunakan untuk mendapatkan data lengkap karyawan dan gang berdasarkan divisi tertentu
-- Berdasarkan hasil debugging, tidak menggunakan filter status karena tidak ada status 'A'

SELECT
    e."EmpCode",
    e."EmpName",
    e."LocCode",
    g."GangCode"
FROM "HR_EMPLOYEE" e
INNER JOIN "HR_GANGLN" g ON g."GangMember" = e."EmpCode"
WHERE UPPER(g."GangCode") LIKE UPPER(? || '%')  -- Parameter: divisi prefix (misal: 'A', 'B', 'C', dll)
ORDER BY g."GangCode", e."EmpCode";