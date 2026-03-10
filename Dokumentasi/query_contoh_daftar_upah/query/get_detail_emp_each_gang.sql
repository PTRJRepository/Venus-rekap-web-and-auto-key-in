SELECT TOP 100
    "HR_EMPLOYEE"."EmpCode",
    "HR_EMPLOYEE"."EmpName",
    "HR_EMPLOYEE"."Gender",
    "HR_EMPLOYEE"."LocCode"
FROM "HR_EMPLOYEE"
JOIN "HR_GANGLN" ON "HR_GANGLN"."GangMember" = "HR_EMPLOYEE"."EmpCode"
WHERE "HR_GANGLN"."GangCode" = ?
 