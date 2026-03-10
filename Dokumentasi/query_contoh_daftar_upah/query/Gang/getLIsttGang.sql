-- Parameters (bind via prepared statements to prevent SQL injection)
-- @division NVARCHAR(50) = NULL   -- e.g. 'PG1A','PG1B','PG2A','PG2B','DME','ARA','ARB1','ARB2','INFRA','AREC','IJL','STF-OFFICE','SECURITY'
-- @gangCode NVARCHAR(50) = NULL   -- specific gang code (exact match)
-- @search NVARCHAR(100) = NULL    -- flexible search term applied to GangCode/Description

DECLARE @search2 NVARCHAR(100) = NULLIF(@search, N'');

WITH "DivisionMap" AS (
    SELECT 'PG1A' AS "Division", 'A'   AS "Prefix" UNION ALL
    SELECT 'PG1B' AS "Division", 'B'   AS "Prefix" UNION ALL
    SELECT 'PG2A' AS "Division", 'C'   AS "Prefix" UNION ALL
    SELECT 'PG2B' AS "Division", 'D'   AS "Prefix" UNION ALL
    SELECT 'DME'  AS "Division", 'E'   AS "Prefix" UNION ALL
    SELECT 'ARA'  AS "Division", 'F'   AS "Prefix" UNION ALL
    SELECT 'ARB1' AS "Division", 'G'   AS "Prefix" UNION ALL
    SELECT 'ARB2' AS "Division", 'H'   AS "Prefix" UNION ALL
    SELECT 'INFRA'AS "Division", 'I'   AS "Prefix" UNION ALL
    SELECT 'AREC' AS "Division", 'J'   AS "Prefix" UNION ALL
    SELECT 'IJL'  AS "Division", 'IJL' AS "Prefix" UNION ALL
    SELECT 'STF-OFFICE' AS "Division", 'STF' AS "Prefix" UNION ALL
    SELECT 'SECURITY'   AS "Division", 'SEC' AS "Prefix"
), "FilteredMap" AS (
    SELECT * FROM "DivisionMap"
    WHERE @division IS NULL OR "Division" = @division
)
SELECT g."GangCode",
       g."Description"
FROM   "HR_GANG" g
       JOIN "FilteredMap" m
         ON g."GangCode" LIKE CONCAT(m."Prefix", '%')
WHERE  (@gangCode IS NULL OR g."GangCode" = @gangCode)
   AND (@search2 IS NULL OR g."GangCode" LIKE CONCAT('%', @search2, '%') OR g."Description" LIKE CONCAT('%', @search2, '%'))
ORDER BY g."GangCode"
OPTION (RECOMPILE);

-- Result schema:
-- GangCode NVARCHAR, Description NVARCHAR
-- Behavior:
-- - If @division provided: filters gangs whose GangCode starts with mapped Prefix for the selected division
-- - Optional LIKE search via @search across GangCode/Description
-- - Optional exact selection via @gangCode
