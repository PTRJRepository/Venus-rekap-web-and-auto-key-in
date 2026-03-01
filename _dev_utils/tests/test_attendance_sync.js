const { fetchAttendanceData } = require('../../backend/services/attendanceService');

async function run() {
    try {
        console.log("Testing fetchAttendanceData for Month 1, Year 2026...");
        const data = await fetchAttendanceData(1, 2026);
        console.log(`Returned ${data.length} employees.`);

        // Let's sample a few to ensure names are present.
        if (data.length > 0) {
            console.log("Sample records:");
            console.log(data.slice(0, 5).map(e => ({ id: e.id, name: e.name, ptrj_id: e.ptrjEmployeeID })));
        } else {
            console.log("No data returned.");
        }
    } catch (e) {
        console.error("Test failed:", e);
    }
}

run();
