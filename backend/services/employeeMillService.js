const { executeQuery } = require('./gateway');
const axios = require('axios');
require('dotenv').config();

const SERVER_PROFILE = 'SERVER_PROFILE_1';
const DB = 'extend_db_ptrj';

// Helper to query extend_db_ptrj specifically
const queryExtendDB = async (sql, params = {}) => {
    // Note: The executeQuery from gateway.js usually takes sql, server, database
    // But currently gateway.js implementation might be tied to config.
    // Let's rely on standard axios call like in seeder to be safe and independent.

    // Actually, let's use the implementation from gateway.js if it supports explicit server/db
    // Checking gateway.js content might be useful, but to avoid circular deps or config issues, 
    // I'll implement a clean query method here using env vars directly.

    const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:8001';
    const API_TOKEN = process.env.API_TOKEN_QUERY;

    // Handle proxy vs direct
    const endpoint = GATEWAY_URL.includes('/query') ?
        (GATEWAY_URL.endsWith('/query') ? GATEWAY_URL : `${GATEWAY_URL}/v1/query`) :
        `${GATEWAY_URL}/v1/query`;

    const SAFE_ENDPOINT = endpoint.replace('//v1', '/v1').replace('query/v1', 'query');
    // Previous scripts used logic: IS_PROXY ? `${GATEWAY_URL}/v1/query` : `${GATEWAY_URL}/v1/query`
    // If GATEWAY_URL is http://localhost:8001, endpoint is http://localhost:8001/v1/query

    const IS_PROXY = GATEWAY_URL.includes('/query');
    const FINAL_URL = IS_PROXY ? `${GATEWAY_URL}/v1/query` : `${GATEWAY_URL}/v1/query`;

    console.log(`[EmployeeMill] Querying: ${FINAL_URL}`);
    console.log(`[EmployeeMill] Server: ${SERVER_PROFILE}, DB: ${params.database || DB}`);
    console.log(`[EmployeeMill] SQL: ${sql.substring(0, 100)}...`);

    try {
        const response = await axios.post(FINAL_URL, {
            sql,
            // params, // Gateway might not support safe params yet, use string interpolation in caller if needed
            server: SERVER_PROFILE,
            database: params.database || DB
        }, {
            headers: { 'x-api-key': API_TOKEN },
            timeout: 10000
        });

        if (response.data.success) {
            console.log(`[EmployeeMill] Success. Rows: ${response.data.data.recordset ? response.data.data.recordset.length : 0}`);
            return response.data.data.recordset;
        } else {
            console.error('EmployeeMillService Query Error:', response.data.error);
            return [];
        }
    } catch (error) {
        console.error('EmployeeMillService Request Failed:', error.message);
        return [];
    }
};

/**
 * Get all employee mappings from DB
 * Returns array of { venus_employee_id, ptrj_employee_id, employee_name, charge_job }
 */
const getAllEmployees = async () => {
    const sql = `
        SELECT nik, venus_employee_id, ptrj_employee_id, employee_name, charge_job 
        FROM employee_mill 
        WHERE is_active = 1
    `;
    return await queryExtendDB(sql);
};

/**
 * Get Holidays from db_ptrj_mill
 * Returns array of { HolidayDate, Description }
 */
const getHolidaysFromDB = async (start, end) => {
    const sql = `
        SELECT HolidayDate, Description 
        FROM [db_ptrj_mill].[dbo].[HR_GPH] 
        WHERE HolidayDate BETWEEN '${start}' AND '${end}'
    `;
    // Pass specific database for this query
    return await queryExtendDB(sql, { database: 'db_ptrj_mill' });
};

/**
 * Get PTRJ Mapping object: { [venusId]: ptrjId }
 */
const getPTRJMappingFromDB = async () => {
    const employees = await getAllEmployees();
    const mapping = {};
    employees.forEach(emp => {
        if (emp.venus_employee_id && emp.ptrj_employee_id) {
            mapping[emp.venus_employee_id] = emp.ptrj_employee_id;
        }
    });
    return mapping;
};

/**
 * Get Charge Job Map: { [idOrName]: { full, task_code, station, machine, expense } }
 */
const getChargeJobMapFromDB = async () => {
    const employees = await getAllEmployees();
    const map = {};

    employees.forEach(emp => {
        const job = emp.charge_job || '-';
        const parts = job.split('|').map(p => p.trim());

        const parsed = {
            full: job,
            task_code: parts[0] || '-',
            station: parts[1] || '-',
            machine: parts[2] || '-',
            expense: parts[3] || '-'
        };

        if (emp.venus_employee_id) map[emp.venus_employee_id] = parsed;
        if (emp.employee_name) map[emp.employee_name.toUpperCase()] = parsed;
    });

    console.log(`[EmployeeMillService] Loaded ${employees.length} employees, mapped to ${Object.keys(map).length} keys for charge jobs`);
    return map;
};

/**
 * Update employee data in the database
 * @param {string} venusEmployeeId - The Venus Employee ID to update
 * @param {object} updates - Object containing { ptrj_employee_id, charge_job }
 */
const updateEmployee = async (venusEmployeeId, updates) => {
    const { ptrj_employee_id, charge_job } = updates;

    // Build SET clause dynamically
    const setClauses = [];
    if (ptrj_employee_id !== undefined) {
        setClauses.push(`ptrj_employee_id = '${ptrj_employee_id.replace(/'/g, "''")}'`);
    }
    if (charge_job !== undefined) {
        setClauses.push(`charge_job = '${charge_job.replace(/'/g, "''")}'`);
    }
    setClauses.push("updated_at = GETDATE()");

    if (setClauses.length === 1) {
        return { success: false, message: 'No valid fields to update' };
    }

    const sql = `
        UPDATE employee_mill 
        SET ${setClauses.join(', ')}
        WHERE venus_employee_id = '${venusEmployeeId.replace(/'/g, "''")}'
    `;

    console.log('[EmployeeMillService] Update SQL:', sql);

    const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:8001';
    const API_TOKEN = process.env.API_TOKEN_QUERY;
    const FINAL_URL = GATEWAY_URL.includes('/query') ? `${GATEWAY_URL}/v1/query` : `${GATEWAY_URL}/v1/query`;

    try {
        const response = await axios.post(FINAL_URL, {
            sql,
            server: SERVER_PROFILE,
            database: DB
        }, {
            headers: { 'x-api-key': API_TOKEN },
            timeout: 10000
        });

        if (response.data.success) {
            console.log(`[EmployeeMillService] Updated employee: ${venusEmployeeId}`);
            return { success: true, message: 'Employee updated successfully' };
        } else {
            console.error('EmployeeMillService Update Error:', response.data.error);
            return { success: false, message: response.data.error };
        }
    } catch (error) {
        console.error('EmployeeMillService Update Failed:', error.message);
        return { success: false, message: error.message };
    }
};

module.exports = {
    getAllEmployees,
    getPTRJMappingFromDB,
    getChargeJobMapFromDB,
    getHolidaysFromDB,
    updateEmployee
};
