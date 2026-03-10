SELECT TOP 100 a.*, g.GangCode
FROM "PR_EMP_ATTN" a
JOIN "PR_GANG_MEMBER" g ON g.GangMember = a.EmpCode
WHERE a.EmpCode = 'H0517'
  AND a.AttnDate >= '2025-05-01'
  AND a.AttnDate < '2025-06-01'
  AND a.IsPresent = 'true'
