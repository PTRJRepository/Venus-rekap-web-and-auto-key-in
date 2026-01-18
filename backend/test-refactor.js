const { fetchAttendanceData } = require('./services/attendanceService');
require('dotenv').config();

(async () => {
    console.log('=== TEST REFACTOR: Attendance Service ===\n');

    // Test for January 2026 (or current month)
    const month = 1;
    const year = 2026;

    console.log(`Fetching data for ${month}/${year}...`);
    try {
        const data = await fetchAttendanceData(month, year);
        console.log(`\nResult: Fetched ${data.length} employees.`);

        if (data.length > 0) {
            // Find an employee with seeded charge job to verify
            const sample = data.find(e => e.chargeJob !== '-' && e.chargeJob.length > 5);

            if (sample) {
                console.log('\n[SUCCESS] Found employee with Charge Job from DB:');
                console.log(`   Name: ${sample.name}`);
                console.log(`   ID: ${sample.id}`);
                console.log(`   PTRJ ID: ${sample.ptrjEmployeeID}`);
                console.log(`   Charge Job: ${sample.chargeJob}`);
                console.log(`   Task Code: ${sample.chargeJobParts.task_code}`);
            } else {
                console.log('\n[WARNING] No employee with valid charge job found in sample (might be expected if seeding incomplete).');
                console.log('Sample Data (First record):', JSON.stringify(data[0], null, 2));
            }
        } else {
            console.log('[ERROR] No data returned.');
        }
    } catch (e) {
        console.error('[FAIL] Error fetching attendance:', e);
    }
})();
