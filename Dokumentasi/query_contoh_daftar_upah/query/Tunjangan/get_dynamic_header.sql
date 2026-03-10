SELECT DISTINCT
       t.DocDesc
FROM   PR_ADTRANS_ARC      AS t
JOIN   PR_ADTRANSLN_ARC    AS ln
       ON t.ID = ln.MasterID
WHERE  t.EmpCode LIKE 'H%'
  AND  t.DocDate >= '2025-05-01'
  AND  t.DocDate <  '2025-06-01'
