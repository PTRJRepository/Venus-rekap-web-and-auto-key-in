SELECT TOP (1000) [GangCode],
    [GangLeader],
    [ADCode],
    [Status],
    [CreateDate],
    [UpdateDate],
    [UpdateID],
    [Description],
    [LocCode]
FROM [db_ptrj].[dbo].[HR_GANG]
WHERE LocCode = 'P2B'