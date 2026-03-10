SELECT TOP 100
    *,
    -- Calculate completed years of service
    CASE
        WHEN MONTH(AppJoinGrpDate) > MONTH(GETDATE()) OR
             (MONTH(AppJoinGrpDate) = MONTH(GETDATE()) AND DAY(AppJoinGrpDate) > DAY(GETDATE()))
        THEN DATEDIFF(year, AppJoinGrpDate, GETDATE()) - 1
        ELSE DATEDIFF(year, AppJoinGrpDate, GETDATE())
    END AS YearsSinceAppJoinGrpDate
FROM HR_EMPLOYMENT
WHERE EmpCode = ?;