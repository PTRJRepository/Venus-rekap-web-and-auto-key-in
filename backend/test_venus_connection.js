const { executeQuery } = require('./services/gateway');
require('dotenv').config();

console.log("=== VENUS DATABASE CONNECTION TEST ===");
console.log("Gateway URL:", process.env.GATEWAY_URL);
console.log("API Token:", process.env.API_TOKEN_QUERY ? "Loaded (Hidden)" : "MISSING");

const testConnection = async () => {
    try {
        // Query sederhana untuk mengambil 5 karyawan pertama dari Venus
        // Ini memvalidasi bahwa kita terhubung ke database HR yang benar
        const sql = "SELECT TOP 5 EmployeeID, EmployeeName, IDNo FROM [VenusHR14].[dbo].[HR_M_EmployeePI] WHERE EmployeeID IS NOT NULL ORDER BY EmployeeName";
        
        console.log("\n1. Executing Query...");
        console.log(`   SQL: ${sql}`);

        const startTime = Date.now();
        const data = await executeQuery(sql);
        const duration = Date.now() - startTime;

        console.log(`\n2. Status: ✅ SUCCESS (${duration}ms)`);
        console.log(`3. Data Retrieved (${data.length} records):`);
        
        // Tampilkan data dalam format tabel rapi
        console.table(data.map(emp => ({
            ID: emp.EmployeeID,
            Name: emp.EmployeeName,
            NIK: emp.IDNo
        })));

    } catch (error) {
        console.error("\n❌ CONNECTION FAILED");
        console.error("---------------------");
        console.error("Message:", error.message);
        if (error.response) {
            console.error("Gateway Response:", JSON.stringify(error.response.data, null, 2));
            console.error("Status Code:", error.response.status);
        } else {
            console.error("Raw Error:", error);
        }
    }
};

testConnection();
