const { upsertEmployee, getAllEmployees } = require('../../backend/services/employeeMillService');

async function testUpsert() {
    try {
        console.log("Testing getAllEmployees...");
        const emps = await getAllEmployees();
        console.log(`Found ${emps.length} employees`);

        const testVenusId = "TEST_JD_01";
        console.log(`Testing upsert for ${testVenusId}...`);

        const result = await upsertEmployee(testVenusId, {
            ptrj_employee_id: "PTRJ_01",
            charge_job: "CJ_01",
            employee_name: "John Doe",
            is_karyawan: true
        });

        console.log("Upsert Result:", result);
    } catch (e) {
        console.error("Test failed:", e);
    }
}

testUpsert();
