SELECT
    d.EmpCode,
    SUM(CASE WHEN h.Status = 'N' THEN 1 ELSE 0 END) as cuti_nasional_hari
FROM HR_HOLIDAY_ARC h
WHERE
    h.HolidayDate >= ?
    AND h.HolidayDate <= ?