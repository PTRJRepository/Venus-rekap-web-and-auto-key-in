SELECT COUNT(*) as total_cuti
FROM PR_TASKREG_ARC tr
JOIN PR_TASKREGLN_ARC trl ON tr.id = trl.masterId
WHERE trl.EmpCode = ?
  AND tr.DocDate >= ?
  AND tr.DocDate < ?
  AND trl.TaskCode LIKE 'GA9126%'
