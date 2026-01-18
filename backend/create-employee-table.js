/**
 * Create employee_mill table in extend_db_ptrj
 * Run: node create-employee-table.js
 */
const axios = require('axios');
require('dotenv').config();

// Get gateway URL from .env, detect if using proxy
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:8001';
const IS_PROXY = GATEWAY_URL.includes('/query'); // If URL ends with /query, it's using proxy
const API_TOKEN = process.env.API_TOKEN_QUERY;
const SERVER_PROFILE = 'SERVER_PROFILE_1';
const DATABASE = 'extend_db_ptrj';

// Build the query endpoint
const QUERY_ENDPOINT = IS_PROXY
    ? `${GATEWAY_URL}/v1/query`  // Proxy mode: /query/v1/query
    : `${GATEWAY_URL}/v1/query`; // Direct mode: /v1/query

console.log('Gateway URL:', GATEWAY_URL);
console.log('Is Proxy:', IS_PROXY);
console.log('Query Endpoint:', QUERY_ENDPOINT);

async function executeQuery(sql) {
    const r = await axios.post(QUERY_ENDPOINT, {
        sql,
        server: SERVER_PROFILE,
        database: DATABASE
    }, {
        headers: { 'x-api-key': API_TOKEN, 'Content-Type': 'application/json' },
        timeout: 30000
    });

    if (!r.data.success) {
        throw new Error(r.data.error);
    }
    return r.data;
}

async function main() {
    console.log('\n=== Creating employee_mill table ===\n');
    console.log(`Server: ${SERVER_PROFILE}`);
    console.log(`Database: ${DATABASE}\n`);

    try {
        // Check if table exists
        console.log('1. Checking if table exists...');
        const checkResult = await executeQuery(`
            SELECT COUNT(*) as cnt 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_NAME = 'employee_mill' AND TABLE_TYPE = 'BASE TABLE'
        `);

        if (checkResult.data.recordset[0].cnt > 0) {
            console.log('   Table already exists!\n');

            // Get row count
            const countResult = await executeQuery('SELECT COUNT(*) as total FROM employee_mill');
            console.log(`   Current row count: ${countResult.data.recordset[0].total}`);
            return;
        }

        console.log('   Table does not exist. Creating...\n');

        // Create table
        console.log('2. Creating table...');
        await executeQuery(`
            CREATE TABLE [dbo].[employee_mill] (
                id INT IDENTITY(1,1) PRIMARY KEY,
                nik NVARCHAR(50) NULL,
                employee_name NVARCHAR(200) NOT NULL,
                venus_employee_id NVARCHAR(50) NOT NULL,
                ptrj_employee_id NVARCHAR(50) NULL,
                charge_job NVARCHAR(500) NULL,
                is_active BIT DEFAULT 1,
                created_at DATETIME DEFAULT GETDATE(),
                updated_at DATETIME DEFAULT GETDATE()
            )
        `);
        console.log('   Table created! ✓\n');

        // Create indexes
        console.log('3. Creating indexes...');
        await executeQuery(`CREATE INDEX idx_employee_mill_venus_id ON [dbo].[employee_mill](venus_employee_id)`);
        console.log('   - idx_employee_mill_venus_id ✓');

        await executeQuery(`CREATE INDEX idx_employee_mill_ptrj_id ON [dbo].[employee_mill](ptrj_employee_id)`);
        console.log('   - idx_employee_mill_ptrj_id ✓');

        await executeQuery(`CREATE INDEX idx_employee_mill_nik ON [dbo].[employee_mill](nik)`);
        console.log('   - idx_employee_mill_nik ✓');

        await executeQuery(`CREATE INDEX idx_employee_mill_name ON [dbo].[employee_mill](employee_name)`);
        console.log('   - idx_employee_mill_name ✓');

        console.log('\n=== Table created successfully! ===');

    } catch (e) {
        console.log('ERROR:', e.message);
        if (e.response) {
            console.log('Response:', JSON.stringify(e.response.data, null, 2));
        }
    }
}

main();
