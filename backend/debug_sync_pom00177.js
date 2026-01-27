const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { fetchAttendanceData } = require('./services/attendanceService');
const { compareWithTaskReg } = require('./services/comparisonService');

const LOG_FILE = 'debug_direct.log';

const log = (msg) => {
    console.log(msg);
    fs.appendFileSync(LOG_FILE, msg + '\n');
};

const runDebug = async () => {
    fs.writeFileSync(LOG_FILE, "=== DEBUG START ===\n");
    try {
        const month = 1;
        const year = 2026;

        log(`Fetching data for ${month}/${year}...`);
        const employees = await fetchAttendanceData(month, year);

        log(`Fetched ${employees ? employees.length : 0} employees.`);

        const targetEmp = employees.find(e => e.ptrjEmployeeID === 'POM00177');

        if (!targetEmp) {
            log("❌ Employee POM00177 not found!");
            // Search partial
            const partial = employees.filter(e => e.name.toLowerCase().includes('cher') || e.name.toLowerCase().includes('her'));
            log(`Partial matches: ${partial.map(e => `${e.name} (${e.ptrjEmployeeID})`).join(', ')}`);
            return;
        }

        log(`✅ Found Employee: ${targetEmp.name} (${targetEmp.ptrjEmployeeID})`);

        // Cek data attendance mentah
        log("RAW ATTENDANCE (Partial/Sick):");
        Object.values(targetEmp.attendance).forEach(d => {
            if (d.status !== 'Hadir') {
                log(` - ${d.date}: ${d.status} (Reg: ${d.regularHours}h, OT: ${d.overtimeHours}h, IsSick: ${d.isSickLeave}, IsAnnual: ${d.isAnnualLeave})`);
            }
        });

        const startDate = `${year}-01-01`;
        const endDate = `${year}-01-31`;

        log(`Comparing with Task Reg (${startDate} to ${endDate})...`);
        const result = await compareWithTaskReg([targetEmp], startDate, endDate);

        log("\n=== COMPARISON RESULTS ===");
        const results = result.results;

        results.forEach(r => {
            log(`[${r.date}] Venus: ${r.venusStatus} | Sync: ${r.syncStatus} | Final: ${r.status}`);
        });

    } catch (e) {
        log("CRASH: " + e.stack);
    }
    log("=== DEBUG END ===");
    process.exit(0);
};

runDebug();
