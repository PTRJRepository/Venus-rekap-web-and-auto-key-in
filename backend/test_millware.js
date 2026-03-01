const { executeQuery } = require('./services/gateway');

async function test() {
    console.log("Checking PR_TASKREGLN for POM00194 on 2026-02-20...");
    let sql1 = `SELECT * FROM [db_ptrj_mill].[dbo].[PR_TASKREGLN] WHERE EmpCode = 'POM00194' AND TrxDate = '2026-02-20'`;
    let res1 = await executeQuery(sql1);
    console.log("PR_TASKREGLN:", res1);

    console.log("\nChecking PR_TASKREGLN_ARC for POM00194 on 2026-02-20...");
    let sql2 = `SELECT * FROM [db_ptrj_mill].[dbo].[PR_TASKREGLN_ARC] WHERE EmpCode = 'POM00194' AND TrxDate = '2026-02-20'`;
    try {
        let res2 = await executeQuery(sql2);
        console.log("PR_TASKREGLN_ARC:", res2);
    } catch (e) { console.log("ARC table error:", e.message); }

    console.log("\nChecking how many records POM00194 has overall...");
    let sql3 = `SELECT TOP 5 TrxDate, TaskCode, Hours, OT FROM [db_ptrj_mill].[dbo].[PR_TASKREGLN] WHERE EmpCode = 'POM00194' ORDER BY TrxDate DESC`;
    let res3 = await executeQuery(sql3);
    console.log("Recent PR_TASKREGLN:", res3);

    console.log("\nChecking if POM00194 has a different format (like padding)...");
    let sql4 = `SELECT TOP 2 EmpCode FROM [db_ptrj_mill].[dbo].[PR_TASKREGLN] WHERE EmpCode LIKE '%POM00194%'`;
    let res4 = await executeQuery(sql4);
    console.log("EmpCode LIKE:", res4);
}

test().catch(console.error);
