SELECT SUM(ln.Amount)
FROM PR_ADTRANS_ARC t
JOIN PR_ADTRANSLN_ARC ln ON t.ID = ln.MasterID
WHERE t.EmpCode = ?
  AND t.DocDate >= ?
  AND t.DocDate < ?
  AND t.DocDesc = 'TUNJANGAN JABATAN'