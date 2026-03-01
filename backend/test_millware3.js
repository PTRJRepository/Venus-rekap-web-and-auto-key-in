const { executeQuery } = require('./services/gateway');

async function test() {
    console.log("Checking if PR_TRXTASKREGISTER or PR_TRXTASKREGISTERDET exist and have data...");

    try {
        let sql1 = `SELECT TOP 5 * FROM [db_ptrj_mill].[dbo].[PR_TRXTASKREGISTERDET] WHERE EmpCode = 'POM00123' ORDER BY TrxDate DESC`;
        let res1 = await executeQuery(sql1);
        console.log("PR_TRXTASKREGISTERDET POM00123:", res1);
    } catch (e) { console.log("Error querying PR_TRXTASKREGISTERDET:", e.message); }

    try {
        let sql2 = `SELECT TOP 5 * FROM [db_ptrj_mill].[dbo].[PR_TrxTaskRegisterDet] WHERE EmpCode = 'POM00194' ORDER BY TrxDate DESC`;
        let res2 = await executeQuery(sql2);
        console.log("PR_TrxTaskRegisterDet POM00194:", res2);
    } catch (e) { console.log("Error querying PR_TrxTaskRegisterDet:", e.message); }

    // Also try checking PR_EMP_ATTN (from the comments in comparisonService.js)
    try {
        let sql3 = `SELECT TOP 5 * FROM [db_ptrj_mill].[dbo].[PR_EMP_ATTN] WHERE EmpCode = 'POM00123' ORDER BY TrxDate DESC`;
        let res3 = await executeQuery(sql3);
        console.log("PR_EMP_ATTN POM00123:", res3);
    } catch (e) { console.log("Error querying PR_EMP_ATTN:", e.message); }
}

test().catch(console.error);
