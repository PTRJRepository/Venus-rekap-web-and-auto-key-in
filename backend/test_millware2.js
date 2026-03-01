const { executeQuery } = require('./services/gateway');

async function test() {
    let sql1 = `SELECT * FROM [db_ptrj_mill].[dbo].[PR_TASKREGLN] WHERE EmpCode = 'POM00123' AND TrxDate = '2026-02-25'`;
    let res1 = await executeQuery(sql1);
    console.log("POM00123 on 25th:", res1);

    let sql2 = `SELECT * FROM [db_ptrj_mill].[dbo].[PR_TASKREGLN] WHERE EmpCode = 'POM00192' AND TrxDate = '2026-02-23'`;
    let res2 = await executeQuery(sql2);
    console.log("POM00192 on 23rd:", res2);

    // Test without cast just in case
    let sql3 = `SELECT TOP 5 TrxDate, TaskCode, Hours, OT FROM [db_ptrj_mill].[dbo].[PR_TASKREGLN] WHERE EmpCode = 'POM00123' ORDER BY TrxDate DESC`;
    let res3 = await executeQuery(sql3);
    console.log("Recent PR_TASKREGLN for POM00123:", res3);

    // Check if there are any records at all on those dates across all employees just in case the dates are stored with time?
    let sql4 = `SELECT TOP 1 * FROM [db_ptrj_mill].[dbo].[PR_TASKREGLN] WHERE TrxDate >= '2026-02-25' AND TrxDate < '2026-02-26'`;
    let res4 = await executeQuery(sql4);
    console.log("Any record on 25th with strict boundary:", res4.length > 0 ? "Yes" : "No");

}

test().catch(console.error);
