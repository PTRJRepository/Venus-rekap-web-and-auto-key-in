-- Query untuk mendapatkan EmpCode dan GangCode dalam satu divisi
-- Digunakan untuk mendapatkan data karyawan dan gang berdasarkan divisi tertentu

SELECT
    e."EmpCode",
    g."GangCode"
FROM "HR_EMPLOYEE" e
JOIN "HR_GANGLN" g ON g."GangMember" = e."EmpCode"
WHERE UPPER(g."GangCode") LIKE UPPER(? || '%')  -- Parameter: divisi prefix (misal: 'A', 'B', 'C', dll)
ORDER BY g."GangCode", e."EmpCode";