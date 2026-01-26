const { queryTaskRegData } = require('./services/comparisonService');
const { executeQuery } = require('./services/gateway');

async function debug() {
    console.log('--- FILTERING LOGIC DEBUG ---');
    const empCode = 'POM00241';
    const startDate = '2026-01-20';
    const endDate = '2026-01-22';
    const otFilter = 0; // Normal mode

    console.log(`Querying for ${empCode} from ${startDate} to ${endDate} (OT=${otFilter})...`);

    try {
        const records = await queryTaskRegData(startDate, endDate, [empCode], otFilter);
        console.log(`
Found ${records.length} records.`);

        // Simulate key generation logic from automationService.js
        const existingMap = {};
        records.forEach(r => {
            console.log('\n--- Record ---');
            console.log('Raw:', JSON.stringify(r));
            console.log('EmpCode type:', typeof r.EmpCode);
            console.log('EmpCode length:', r.EmpCode.length);
            console.log('TrxDate type:', typeof r.TrxDate);
            
            // Logic from automationService.js
            let dateStr = null;
            if (r.TrxDate) {
                if (typeof r.TrxDate === 'string') {
                    dateStr = r.TrxDate.substring(0, 10);
                } else if (r.TrxDate instanceof Date) {
                    dateStr = r.TrxDate.toISOString().substring(0, 10);
                }
            }
            
            const cleanEmpCode = r.EmpCode.trim();
            const key = `${cleanEmpCode}_${dateStr}`;
            
            console.log(`Generated Key: "${key}"`);
            existingMap[key] = true;
        });

        console.log('\n--- Lookup Test ---');
        // Test lookup with expected key
        const testKey = 'POM00241_2026-01-20';
        console.log(`Looking up "${testKey}":`, existingMap[testKey] ? 'FOUND (Filtered)' : 'NOT FOUND (Will duplicate)');

        if (!existingMap[testKey]) {
            console.log('FAILURE: The key generated from DB does not match the expected key!');
            console.log('Expected:', testKey);
            console.log('Available Keys:', Object.keys(existingMap));
        } else {
            console.log('SUCCESS: Logic appears correct for this case.');
        }

    } catch (e) {
        console.error(e);
    }
}

debug();