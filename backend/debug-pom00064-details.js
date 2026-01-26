const { queryTaskRegData } = require('./services/comparisonService');

async function debug() {
    console.log('--- DEBUG POM00064 DETAILS ---');
    const empCode = 'POM00064';
    const startDate = '2026-01-05';
    const endDate = '2026-01-08'; 
    
    console.log(`Querying ${empCode} from ${startDate} to ${endDate} (ALL records)...`);
    const records = await queryTaskRegData(startDate, endDate, [empCode], null);
    
    console.log('\n--- Record Details ---');
    records.forEach(r => {
        let createdStr = r.CreatedDate;
        if (typeof r.CreatedDate !== 'string' && r.CreatedDate) {
            createdStr = r.CreatedDate.toISOString();
        }
        console.log(`Date: ${r.TrxDate.substring(0, 10)} | Type: ${r.OT ? 'OT' : 'Normal'} | Hours: ${r.Hours} | Status: ${r.Status} | CreatedBy: ${r.CreatedBy} | CreatedAt: ${createdStr}`);
    });
}

debug();