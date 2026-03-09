const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../backend/.env') });
const { fetchPayrollData } = require('../../backend/services/payrollService');
const fs = require('fs');

async function runTest() {
    try {
        console.log("Fetching payroll data for March 2026...");
        const result = await fetchPayrollData(3, 2026);

        if (result.success) {
            console.log(`Successfully fetched ${result.data.length} records.`);
            // Filter to a few records that have millware
            const sample = result.data.filter(d => d.millware).slice(0, 2);
            fs.writeFileSync(path.join(__dirname, 'test_payroll_output.json'), JSON.stringify(sample, null, 2));
            console.log("Wrote sample output to test_payroll_output.json");
        } else {
            console.error("Fetch failed:", result.error);
        }
    } catch (e) {
        console.error("Test Error:", e);
    }
}

runTest();
