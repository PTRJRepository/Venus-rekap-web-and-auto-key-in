
const { fetchAttendanceData } = require('./services/attendanceService');

async function verify() {
    try {
        console.log('Fetching attendance data (direct service call)...');
        // Mock query if needed? No, service uses real DB via gateway.
        // Assuming gateway.js works when imported.

        const data = await fetchAttendanceData(1, 2026);
        const emp = data.find(e => e.id === 'PTRJ.241000129');

        if (emp) {
            console.log('Employee Found:', emp.name);
            console.log('Charge Job:', emp.chargeJob);

            const day5 = emp.attendance['5'];
            console.log('Jan 5 Status:', day5.status);
            console.log('Jan 5 Display:', day5.display);
            console.log('Jan 5 Class:', day5.class);
            console.log('Jan 5 OT:', day5.overtimeHours);

            if (day5.status === 'Hadir' && day5.overtimeHours > 0) {
                console.log('SUCCESS: Status is Hadir with Overtime!');
            } else {
                console.log('FAILURE: Status is still', day5.status);
            }
        } else {
            console.log('Employee not found (Filtered out?)');
        }
    } catch (e) {
        console.error('Error:', e);
    }
}

verify();
