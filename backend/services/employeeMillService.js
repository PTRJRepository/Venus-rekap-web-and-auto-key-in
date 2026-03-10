const { executeQuery } = require('./gateway');
const axios = require('axios');
require('dotenv').config();

// PTRJ ID and ChargeJob from SERVER_PROFILE_1, database extend_db_ptrj
const SERVER_PROFILE_PTRJ = 'SERVER_PROFILE_1';
const DB_PTRJ = 'extend_db_ptrj';

// Helper to query specific server/database
const queryWithServer = async (sql, serverProfile, database) => {
    const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:8001';
    const API_TOKEN = process.env.API_TOKEN_QUERY;

    const IS_PROXY = GATEWAY_URL.includes('/query');
    const FINAL_URL = IS_PROXY ? `${GATEWAY_URL}/v1/query` : `${GATEWAY_URL}/v1/query`;

    console.log(`[EmployeeMill] Querying: ${FINAL_URL}`);
    console.log(`[EmployeeMill] Server: ${serverProfile}, DB: ${database}`);
    console.log(`[EmployeeMill] SQL: ${sql.substring(0, 100)}...`);

    try {
        const response = await axios.post(FINAL_URL, {
            sql,
            server: serverProfile,
            database: database
        }, {
            headers: { 'x-api-key': API_TOKEN },
            timeout: 60000
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

// Helper to query extend_db_ptrj (for ptrj_employee_id and charge_job)
const queryExtendDB = async (sql, database = DB_PTRJ) => {
    return await queryWithServer(sql, SERVER_PROFILE_PTRJ, database);
};

/**
 * Get all employee mappings from DB
 * ptrj_employee_id and charge_job from extend_db_ptrj.employee_mill
 * Returns array of { venus_employee_id, ptrj_employee_id, employee_name, charge_job, is_karyawan }
 */
const getAllEmployees = async () => {
    // Get ptrj_employee_id and charge_job from extend_db_ptrj.employee_mill (SERVER_PROFILE_1)
    const sql = `
        SELECT nik, venus_employee_id, ptrj_employee_id, employee_name, charge_job, ISNULL(is_karyawan, 1) as is_karyawan
        FROM employee_mill
        WHERE is_active = 1
    `;
    console.log('[EmployeeMill] Fetching ptrj_employee_id and charge_job from extend_db_ptrj...');
    const results = await queryExtendDB(sql);

    // Build map from results
    const employeeMap = {};
    if (results && results.length > 0) {
        results.forEach(r => {
            employeeMap[r.venus_employee_id] = {
                venus_employee_id: r.venus_employee_id,
                ptrj_employee_id: r.ptrj_employee_id || null,
                employee_name: r.employee_name || null,
                charge_job: r.charge_job || null,
                is_karyawan: r.is_karyawan
            };
        });
        console.log(`[EmployeeMill] Got ${results.length} employees from employee_mill`);
    } else {
        console.log('[EmployeeMill] WARNING - No results from employee_mill!');
    }

    // Convert map back to array
    const finalResults = Object.values(employeeMap);

    // DEBUG: Log sample data
    if (finalResults && finalResults.length > 0) {
        console.log('[EmployeeMill] Final sample data:');
        finalResults.slice(0, 5).forEach((r, i) => {
            console.log(`  [${i}] venus_employee_id="${r.venus_employee_id}", ptrj_employee_id="${r.ptrj_employee_id}", charge_job="${r.charge_job}", is_karyawan="${r.is_karyawan}"`);
        });

        const withPtrj = finalResults.filter(r => r.ptrj_employee_id && r.ptrj_employee_id.trim() !== '').length;
        const withCharge = finalResults.filter(r => r.charge_job && r.charge_job.trim() !== '').length;
        const nonKaryawan = finalResults.filter(r => r.is_karyawan === 0 || r.is_karyawan === false || r.is_karyawan === '0').length;
        console.log(`[EmployeeMill] Total: ${finalResults.length}, with ptrj_employee_id: ${withPtrj}, with charge_job: ${withCharge}, non-karyawan: ${nonKaryawan}`);
    }

    return finalResults;
};

/**
 * Get Holidays from db_ptrj_mill
 * Returns array of { HolidayDate, Description }
 */
const getHolidaysFromDB = async (start, end) => {
    const sql = `
        SELECT HolidayDate, Description
        FROM [HR_GPH]
        WHERE HolidayDate BETWEEN '${start}' AND '${end}'
    `;
    // Use db_ptrj_mill database
    return await queryWithServer(sql, SERVER_PROFILE_PTRJ, 'db_ptrj_mill');
};

/**

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
 * @param {object} updates - Object containing { ptrj_employee_id, charge_job, employee_name, is_karyawan }
 */
const updateEmployee = async (venusEmployeeId, updates) => {
    const { ptrj_employee_id, charge_job, employee_name, is_karyawan } = updates;

    // Build SET clause dynamically
    const setClauses = [];
    if (ptrj_employee_id !== undefined) {
        setClauses.push(`ptrj_employee_id = '${ptrj_employee_id.replace(/'/g, "''")}'`);
    }
    if (charge_job !== undefined) {
        setClauses.push(`charge_job = '${charge_job.replace(/'/g, "''")}'`);
    }
    if (employee_name !== undefined) {
        setClauses.push(`employee_name = '${employee_name.replace(/'/g, "''")}'`);
    }
    if (is_karyawan !== undefined) {
        setClauses.push(`is_karyawan = ${is_karyawan ? 1 : 0}`);
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

    const GATEWAY_URL = (process.env.GATEWAY_URL || 'http://localhost:8001').replace(/\/$/, '');
    const API_TOKEN = process.env.API_TOKEN_QUERY;
    const FINAL_URL = `${GATEWAY_URL}/v1/query`;

    try {
        const response = await axios.post(FINAL_URL, {
            sql,
            server: SERVER_PROFILE_PTRJ,
            database: DB_PTRJ
        }, {
            headers: { 'x-api-key': API_TOKEN },
            timeout: 60000
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

/**
 * Insert new employee into database
 * Used for new employees who don't exist in extend_db_ptrj
 * @param {object} employeeData - { venus_employee_id, employee_name, ptrj_employee_id, charge_job, is_karyawan }
 */
const insertEmployee = async (employeeData) => {
    const { venus_employee_id, employee_name, ptrj_employee_id, charge_job, is_karyawan = true } = employeeData;

    if (!venus_employee_id) {
        return { success: false, message: 'venus_employee_id is required' };
    }

    const sql = `
        INSERT INTO employee_mill (nik, venus_employee_id, ptrj_employee_id, employee_name, charge_job, is_karyawan, is_active, created_at, updated_at)
        VALUES (
            '${(venus_employee_id || '').replace(/'/g, "''")}',
            '${(venus_employee_id || '').replace(/'/g, "''")}',
            '${(ptrj_employee_id || '').replace(/'/g, "''")}',
            '${(employee_name || '').replace(/'/g, "''")}',
            '${(charge_job || '').replace(/'/g, "''")}',
            ${is_karyawan ? 1 : 0},
            1,
            GETDATE(),
            GETDATE()
        )
    `;

    console.log('[EmployeeMillService] Insert SQL:', sql);

    const GATEWAY_URL = (process.env.GATEWAY_URL || 'http://localhost:8001').replace(/\/$/, '');
    const API_TOKEN = process.env.API_TOKEN_QUERY;
    const FINAL_URL = `${GATEWAY_URL}/v1/query`;

    try {
        const response = await axios.post(FINAL_URL, {
            sql,
            server: SERVER_PROFILE_PTRJ,
            database: DB_PTRJ
        }, {
            headers: { 'x-api-key': API_TOKEN },
            timeout: 60000
        });

        if (response.data.success) {
            console.log(`[EmployeeMillService] Inserted new employee: ${venus_employee_id}`);
            return { success: true, message: 'Employee inserted successfully' };
        } else {
            console.error('EmployeeMillService Insert Error:', response.data.error);
            return { success: false, message: response.data.error };
        }
    } catch (error) {
        console.error('EmployeeMillService Insert Failed:', error.message);
        return { success: false, message: error.message };
    }
};

/**
 * Check if employee exists in database
 * @param {string} venusEmployeeId - The Venus Employee ID to check
 */
const employeeExists = async (venusEmployeeId) => {
    const sql = `SELECT 1 FROM employee_mill WHERE venus_employee_id = '${venusEmployeeId.replace(/'/g, "''")}'`;
    const result = await queryExtendDB(sql);
    return result && result.length > 0;
};

/**
 * Upsert employee - Update if exists, Insert if not
 * @param {string} venusEmployeeId - The Venus Employee ID
 * @param {object} data - { employee_name, ptrj_employee_id, charge_job }
 */
const upsertEmployee = async (venusEmployeeId, data) => {
    const exists = await employeeExists(venusEmployeeId);

    if (exists) {
        return await updateEmployee(venusEmployeeId, data);
    } else {
        return await insertEmployee({
            venus_employee_id: venusEmployeeId,
            ...data
        });
    }
};

/**
 * Find employees by name pattern
 */
const findEmployeeByName = async (namePattern) => {
    const sql = `
        SELECT TOP 10 nik, venus_employee_id, ptrj_employee_id, employee_name, charge_job 
        FROM employee_mill 
        WHERE employee_name LIKE '%${namePattern}%' AND is_active = 1
    `;
    return await queryExtendDB(sql);
};

module.exports = {
    getAllEmployees,
    getPTRJMappingFromDB,
    getChargeJobMapFromDB,
    getHolidaysFromDB,
    updateEmployee,
    insertEmployee,
    employeeExists,
    upsertEmployee,
    findEmployeeByName
};

