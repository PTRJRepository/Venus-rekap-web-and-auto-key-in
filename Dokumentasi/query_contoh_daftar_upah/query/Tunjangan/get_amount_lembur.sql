SELECT SUM(trl.amount) as TotalAmount,
       SUM(trl.Hours) as TotalHours
FROM PR_TASKREG_ARC tr
JOIN PR_TASKREGLN_ARC trl ON tr.id = trl.masterId
WHERE trl.EmpCode = ?
  AND tr.DocDate >= ?
  AND tr.DocDate < ?
  AND trl.OT = 1