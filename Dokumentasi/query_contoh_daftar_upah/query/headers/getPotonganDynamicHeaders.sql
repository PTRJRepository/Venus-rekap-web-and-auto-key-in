SELECT DISTINCT t.DocDesc
FROM "PR_ADTRANS_ARC" AS t
JOIN "PR_ADTRANSLN_ARC" AS ln ON t.ID = ln.MasterID
WHERE t.EmpCode IN (
    SELECT "HR_EMPLOYEE"."EmpCode"
    FROM "HR_EMPLOYEE"
    JOIN "HR_GANGLN" ON "HR_GANGLN"."GangMember" = "HR_EMPLOYEE"."EmpCode"
    WHERE "HR_GANGLN"."GangCode" = ?
)
AND t.DocDate >= ?
AND t.DocDate < ?
AND t.DocDesc LIKE 'POT%'
AND t.DocDesc NOT LIKE '%PPH21%'
AND t.DocDesc NOT LIKE '%koreksi%'
AND t.DocDesc NOT LIKE '%spsi%'
ORDER BY t.DocDesc;