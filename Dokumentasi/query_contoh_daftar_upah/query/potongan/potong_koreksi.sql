SELECT
       t.*,
       ln.Amount
FROM   PR_ADTRANS_ARC      AS t
JOIN   PR_ADTRANSLN_ARC    AS ln
       ON t.ID = ln.MasterID
WHERE  t.EmpCode = ?
  AND  t.DocDate >= ?
  AND  t.DocDate <  ?
  AND UPPER(t.DocDesc) LIKE '%KORE%'