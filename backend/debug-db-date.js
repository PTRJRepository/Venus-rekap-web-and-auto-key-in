const { queryTaskRegData } = require('./services/comparisonService');
const { executeQuery } = require('./services/gateway');

async function test() {
    console.log('--- DB DATE FORMAT DEBUG ---');
    try {
        // Query a small range known to have data
        // Adjust dates if needed to find data
        const result = await executeQuery("SELECT TOP 1 EmpCode, TrxDate FROM [db_ptrj_mill].[dbo].[PR_TASKREGLN] ORDER BY TrxDate DESC");
        
        if (result.length > 0) {
            const row = result[0];
            console.log('Row:', row);
            console.log('TrxDate Type:', typeof row.TrxDate);
            console.log('TrxDate Value:', row.TrxDate);
            console.log('TrxDate Constructor:', row.TrxDate ? row.TrxDate.constructor.name : 'N/A');
            
            if (row.TrxDate instanceof Date) {
                 console.log('Date methods check:');
                 console.log('toISOString:', row.TrxDate.toISOString());
                 console.log('ToString:', row.TrxDate.toString());
            }
        } else {
            console.log('No records found to test.');
        }
    } catch (e) {
        console.error(e);
    }
}

test();
