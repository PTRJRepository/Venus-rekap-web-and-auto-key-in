const { executeQuery } = require('./services/gateway');

// Quick test script to verify database queries
async function testQueries() {
    console.log("=== TESTING DATABASE QUERIES ===\n");

    const testMonth = 6; // June
    const testYear = 2025;
    const startDate = `${testYear}-${String(testMonth).padStart(2, '0')}-01`;
    const endDate = `${testYear}-${String(testMonth).padStart(2, '0')}-30`;

    console.log(`Testing for period: ${startDate} to ${endDate}\n`);

    try {
        // Test 1: Employees
        console.log("1. Testing Employees Query...");
        const empSql = `
            SELECT TOP 5 EmployeeID, EmployeeName, IDNo
            FROM [VenusHR14].[dbo].[HR_M_EmployeePI]
            WHERE EmployeeID IS NOT NULL
            ORDER BY EmployeeName
        `;
        const employees = await executeQuery(empSql);
        console.log(`✅ Found ${employees.length} employees (showing top 5)`);
        console.log("Sample:", employees[0]);
        console.log();

        // Test 2: Attendance
        console.log("2. Testing Attendance Query...");
        const attSql = `
            SELECT TOP 10 EmployeeID, TADate, TACheckIn, TACheckOut
            FROM [VenusHR14].[dbo].[HR_T_TAMachine_Summary]
            WHERE TADate BETWEEN '${startDate}' AND '${endDate}'
            ORDER BY TADate
        `;
        const attendance = await executeQuery(attSql);
        console.log(`✅ Found ${attendance.length} attendance records`);
        if (attendance.length > 0) {
            console.log("Sample:", attendance[0]);
        } else {
            console.log("⚠️ NO ATTENDANCE DATA FOUND!");
        }
        console.log();

        // Test 3: Overtime
        console.log("3. Testing Overtime Query...");
        const otSql = `
            SELECT TOP 10 EmployeeID, OTDate, OTHourDuration
            FROM [VenusHR14].[dbo].[HR_T_Overtime]
            WHERE OTDate BETWEEN '${startDate}' AND '${endDate}'
            ORDER BY OTDate
        `;
        const overtime = await executeQuery(otSql);
        console.log(`✅ Found ${overtime.length} overtime records`);
        if (overtime.length > 0) {
            console.log("Sample:", overtime[0]);
        }
        console.log();

        // Test 4: Leaves
        console.log("4. Testing Leaves Query...");
        const leaveSql = `
            SELECT TOP 10 EmployeeID, RefDate, LeaveTypeCode, Outgoing
            FROM [VenusHR14].[dbo].[HR_H_Leave]
            WHERE RefDate BETWEEN '${startDate}' AND '${endDate}'
            ORDER BY RefDate
        `;
        const leaves = await executeQuery(leaveSql);
        console.log(`✅ Found ${leaves.length} leave records`);
        if (leaves.length > 0) {
            console.log("Sample:", leaves[0]);
        }
        console.log();

        // Test 5: Absences
        console.log("5. Testing Absences Query...");
        const absSql = `
            SELECT TOP 10 EmployeeID, FromDate, ToDate, AbsType
            FROM [VenusHR14].[dbo].[HR_T_Absence]
            WHERE FromDate <= '${endDate}' AND ToDate >= '${startDate}'
            ORDER BY FromDate
        `;
        const absences = await executeQuery(absSql);
        console.log(`✅ Found ${absences.length} absence records`);
        if (absences.length > 0) {
            console.log("Sample:", absences[0]);
        }
        console.log();

        console.log("=== TEST COMPLETE ===");
        console.log("\nSUMMARY:");
        console.log(`Employees: ${employees.length}`);
        console.log(`Attendance: ${attendance.length}`);
        console.log(`Overtime: ${overtime.length}`);
        console.log(`Leaves: ${leaves.length}`);
        console.log(`Absences: ${absences.length}`);

        if (attendance.length === 0) {
            console.log("\n⚠️ CRITICAL: NO ATTENDANCE DATA FOUND FOR JUNE 2025!");
            console.log("This explains why everything shows as ALFA.");
            console.log("\nPossible reasons:");
            console.log("1. Data doesn't exist for June 2025 in database");
            console.log("2. Date column format mismatch");
            console.log("3. Database prefix [VenusHR14].[dbo] might be wrong");
        }

    } catch (error) {
        console.error("❌ TEST FAILED:", error.message);
        console.error(error);
    }

    process.exit(0);
}

testQueries();
