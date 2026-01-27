const { executeQuery } = require('./services/gateway');

async function findStaff() {
    try {
        const sql = `
            SELECT TOP 5 venus_employee_id, employee_name, charge_job 
            FROM employee_mill 
            WHERE charge_job LIKE '%STAFF%'
        `;
        // Note: queryExtendDB is internal to employeeMillService, but executeQuery can reach it if we set profile 1
        // Actually, let's use employeeMillService directly if we can export it or just use gateway since we know how.
        // Or simpler: just use gateway with profile 1

        // Wait, attendanceService uses employeeMillService. Let's just use the known profile.
        // It seems `execute query` in gateway.js defaults to SERVER_PROFILE_3 (VenusHR14).
        // `employee_mill` is in `extend_db_ptrj` (SERVER_PROFILE_1).

        // Let's try to pass params to executeQuery if supported, or use axios directly.
        const axios = require('axios');
        require('dotenv').config();

        const url = 'http://localhost:5000/api/debug/attendance?employee_id=PTRJ.000&date=2026-01-01'; // Dummy

        // Actually, let's just write a direct axios query to the gateway like employeeMillService does
        const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:8001';
        const API_TOKEN = process.env.API_TOKEN_QUERY;
        const FINAL_URL = GATEWAY_URL.includes('/query') ?
            (GATEWAY_URL.endsWith('/query') ? GATEWAY_URL : `${GATEWAY_URL}/v1/query`) :
            `${GATEWAY_URL}/v1/query`;

        const res = await axios.post(FINAL_URL, {
            sql,
            server: 'SERVER_PROFILE_1',
            database: 'extend_db_ptrj'
        }, { headers: { 'x-api-key': API_TOKEN } });

        console.log('STAFF Employees:', JSON.stringify(res.data.data.recordset, null, 2));

    } catch (e) {
        console.error('Error:', e.message);
        if (e.response) console.log(e.response.data);
    }
}
findStaff();
