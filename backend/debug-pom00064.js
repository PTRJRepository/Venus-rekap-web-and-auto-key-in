const { queryTaskRegData } = require('./services/comparisonService');

async function debug() {
    console.log('--- DEBUG POM00064 ---');
    const empCode = 'POM00064';
    const startDate = '2026-01-05';
    const endDate = '2026-01-11';
    
    // Fetch ALL records (OT=null)
    console.log(`Querying ${empCode} from ${startDate} to ${endDate} (ALL records)...`);
    const records = await queryTaskRegData(startDate, endDate, [empCode], null);
    
    console.log(`Found ${records.length} records.`);
    
    // Map dates
    const dateMap = {};
    records.forEach(r => {
        const d = r.TrxDate.substring(0, 10);
        if (!dateMap[d]) dateMap[d] = { normal: false, overtime: false };
        if (r.OT) dateMap[d].overtime = true;
        else dateMap[d].normal = true;
    });
    
    console.log('Existing Dates in Millware:');
    console.table(dateMap);
    
    // Check specific dates mentioned by user
    const checkDates = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-11'];
    console.log('\n--- Analysis ---');
    checkDates.forEach(date => {
        const exists = dateMap[date];
        const hasNormal = exists && exists.normal;
        const hasOT = exists && exists.overtime;
        
        console.log(`Date ${date}:`);
        console.log(`  - In Millware? ${exists ? 'YES' : 'NO'}`);
        if (exists) {
            console.log(`    - Has Normal? ${hasNormal}`);
            console.log(`    - Has OT? ${hasOT}`);
        }
        
        // Simulation of Automation Logic (Normal Mode)
        // Skip if existing.normal is true
        // OR if Sunday (assuming 6, 11 are Sundays) and existing.overtime is true
        const isSunday = (new Date(date).getDay() === 0);
        let wouldSkip = false;
        
        if (exists) {
            if (hasNormal) wouldSkip = true;
            else if (isSunday && hasOT) wouldSkip = true;
        }
        
        console.log(`  - Automation Action (Normal Mode): ${wouldSkip ? 'SKIP (Already exists)' : 'PROCESS (Input)'}`);
    });
}

debug();
