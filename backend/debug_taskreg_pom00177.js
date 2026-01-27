const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { queryTaskRegData } = require('./services/comparisonService');

const LOG_FILE = 'debug_taskreg.log';

const log = (msg) => {
    console.log(msg);
    fs.appendFileSync(LOG_FILE, msg + '\n');
};

const runDebug = async () => {
    fs.writeFileSync(LOG_FILE, "=== DEBUG START ===\n");
    try {
        const empCode = 'POM00177';
        const startDate = '2026-01-01';
        const endDate = '2026-01-31';

        log(`Querying Task Reg for ${empCode} (${startDate} to ${endDate})...`);

        // Passing null for otFilter to get ALL records
        const data = await queryTaskRegData(startDate, endDate, [empCode], null);

        log(`Found ${data.length} records.`);

        data.forEach(r => {
            const dateStr = typeof r.TrxDate === 'string' ? r.TrxDate.substring(0, 10) : new Date(r.TrxDate).toISOString().substring(0, 10);
            log(`[${dateStr}] Hours: ${r.Hours}, OT: ${r.OT}, Code: ${r.TaskCode}`);
        });

    } catch (e) {
        log("CRASH: " + e.stack);
    }
    log("=== DEBUG END ===");
    process.exit(0);
};

runDebug();
