const { executeQuery } = require('./services/gateway');

const runDebug = async () => {
    console.log('--- STARTING DB DEBUG ---');
    const empCode = 'POM00299'; // From user's current_data.json
    const startDate = '2026-01-01';
    const endDate = '2026-01-31';

    const sql = `
        SELECT EmpCode, TrxDate, Hours, OT, CreatedDate 
        FROM [db_ptrj_mill].[dbo].[PR_TASKREGLN] 
        WHERE EmpCode = '${empCode}' 
        AND TrxDate BETWEEN '${startDate}' AND '${endDate}'
        ORDER BY TrxDate
    `;

    console.log('Executing SQL:', sql);

    try {
        const results = await executeQuery(sql);
        console.log(`Found ${results.length} records.`);
        if (results.length > 0) {
            console.log('Sample Record:', results[0]);
            results.forEach(r => {
                console.log(`Date: ${r.TrxDate} | Hours: ${r.Hours} | OT: ${r.OT}`);
            });
        } else {
            console.log('No records found! This explains why automation re-inputs data.');
        }
    } catch (err) {
        console.error('Query Failed:', err);
    }
};

runDebug();
