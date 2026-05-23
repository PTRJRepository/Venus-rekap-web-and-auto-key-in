const axios = require('axios');
const sqlServer = require('mssql');
require('dotenv').config();

// PTRJ ID and ChargeJob from SERVER_PROFILE_1, database extend_db_ptrj
const SERVER_PROFILE_PTRJ = 'SERVER_PROFILE_1';
const DB_PTRJ = 'extend_db_ptrj';
const LOCAL_EXTEND_DB_ENABLED = process.env.LOCAL_EXTEND_DB_ENABLED !== 'false';
const DEFAULT_GATEWAY_TIMEOUT = Number(process.env.GATEWAY_TIMEOUT || 10000);
const EXTEND_DB_GATEWAY_TIMEOUT = Number(process.env.EXTEND_DB_GATEWAY_TIMEOUT || 8000);
const GATEWAY_PREFLIGHT_TIMEOUT = Number(process.env.GATEWAY_PREFLIGHT_TIMEOUT || 1500);

let localExtendDbPoolPromise;
let activeGatewayTargetsPromise;

const parseBooleanEnv = (value, defaultValue) => {
    if (value === undefined) return defaultValue;
    return String(value).toLowerCase() === 'true';
};

const getLocalExtendDbConfig = () => {
    const config = {
        server: process.env.LOCAL_EXTEND_DB_SERVER || 'localhost',
        database: process.env.LOCAL_EXTEND_DB_DATABASE || DB_PTRJ,
        user: process.env.LOCAL_EXTEND_DB_USER,
        password: process.env.LOCAL_EXTEND_DB_PASSWORD,
        connectionTimeout: Number(process.env.LOCAL_EXTEND_DB_CONNECTION_TIMEOUT || 15000),
        requestTimeout: Number(process.env.LOCAL_EXTEND_DB_REQUEST_TIMEOUT || 60000),
        options: {
            encrypt: parseBooleanEnv(process.env.LOCAL_EXTEND_DB_ENCRYPT, false),
            trustServerCertificate: parseBooleanEnv(process.env.LOCAL_EXTEND_DB_TRUST_CERT, true)
        }
    };

    if (process.env.LOCAL_EXTEND_DB_PORT) {
        config.port = Number(process.env.LOCAL_EXTEND_DB_PORT);
    } else if (process.env.LOCAL_EXTEND_DB_INSTANCE) {
        config.options.instanceName = process.env.LOCAL_EXTEND_DB_INSTANCE;
    }

    return config;
};

const getLocalExtendDbPool = async () => {
    if (!LOCAL_EXTEND_DB_ENABLED) {
        throw new Error('Local extend_db_ptrj fallback is disabled');
    }

    const config = getLocalExtendDbConfig();
    if (!config.user || !config.password) {
        throw new Error('LOCAL_EXTEND_DB_USER and LOCAL_EXTEND_DB_PASSWORD are required for local fallback');
    }

    if (!localExtendDbPoolPromise) {
        localExtendDbPoolPromise = new sqlServer.ConnectionPool(config)
            .connect()
            .catch(error => {
                localExtendDbPoolPromise = null;
                throw error;
            });
    }

    return localExtendDbPoolPromise;
};

const queryLocalExtendDB = async (sql) => {
    const config = getLocalExtendDbConfig();
    const target = config.port
        ? `${config.server},${config.port}`
        : `${config.server}${process.env.LOCAL_EXTEND_DB_INSTANCE ? `\\${process.env.LOCAL_EXTEND_DB_INSTANCE}` : ''}`;
    console.log(`[EmployeeMill] Local fallback: ${target}, DB: ${config.database}`);

    const pool = await getLocalExtendDbPool();
    const result = await pool.request().query(sql);
    const rows = result.recordset || [];
    const affected = (result.rowsAffected || []).reduce((total, count) => total + count, 0);

    console.log(`[EmployeeMill] Local fallback success. Rows: ${rows.length}, affected: ${affected}`);
    return rows;
};

const normalizeGateway = (url) => {
    const normalized = String(url || '').replace(/\/+$/, '');
    const hasV1QueryPath = /\/v1\/query$/i.test(normalized);
    const hasQueryPath = /\/query$/i.test(normalized);
    return {
        baseURL: hasV1QueryPath
            ? normalized.replace(/\/v1\/query$/i, '')
            : hasQueryPath
                ? normalized.replace(/\/query$/i, '')
                : normalized,
        queryPath: hasV1QueryPath ? '/v1/query' : hasQueryPath ? '/query' : '/v1/query'
    };
};

const getGatewayTargets = () => {
    const primary = normalizeGateway(process.env.GATEWAY_URL || 'http://localhost:8001');
    const fallback = normalizeGateway(process.env.LOCAL_GATEWAY_URL || process.env.GATEWAY_FALLBACK_URL || 'http://localhost:8001');
    const targets = [primary];

    if (`${fallback.baseURL}${fallback.queryPath}` !== `${primary.baseURL}${primary.queryPath}`) {
        targets.push(fallback);
    }

    return targets;
};

const shouldTryGatewayFallback = (error) => {
    if (!error.response) return true;
    return error.response.status >= 500;
};

const isSameGateway = (a, b) => `${a.baseURL}${a.queryPath}` === `${b.baseURL}${b.queryPath}`;

const checkGatewayReachable = async (gateway) => {
    try {
        await axios.get(gateway.baseURL, {
            timeout: GATEWAY_PREFLIGHT_TIMEOUT,
            validateStatus: () => true
        });
        return true;
    } catch (error) {
        console.warn(`[EmployeeMill] Gateway preflight failed for ${gateway.baseURL}: ${error.message}`);
        return false;
    }
};

const getActiveGatewayTargets = async () => {
    if (!activeGatewayTargetsPromise) {
        activeGatewayTargetsPromise = (async () => {
            const targets = getGatewayTargets();
            const primary = targets[0];
            const fallback = targets[1];

            if (!fallback || isSameGateway(primary, fallback)) {
                console.log(`[EmployeeMill] Active gateway: ${primary.baseURL}${primary.queryPath}`);
                return [primary];
            }

            const primaryAvailable = await checkGatewayReachable(primary);
            if (primaryAvailable) {
                console.log(`[EmployeeMill] Active gateway: ${primary.baseURL}${primary.queryPath}`);
                return targets;
            }

            console.warn(`[EmployeeMill] Primary gateway unavailable at startup. Using local gateway: ${fallback.baseURL}${fallback.queryPath}`);
            return [fallback];
        })();
    }

    return activeGatewayTargetsPromise;
};

getActiveGatewayTargets().catch(error => {
    console.warn(`[EmployeeMill] Gateway preflight initialization failed: ${error.message}`);
});

// Helper to query specific server/database
const executeGatewayQuery = async (sql, serverProfile, database) => {
    const API_TOKEN = process.env.API_TOKEN_QUERY;
    console.log(`[EmployeeMill] Server: ${serverProfile}, DB: ${database}`);
    console.log(`[EmployeeMill] SQL: ${sql.substring(0, 100)}...`);

    const timeout = database === DB_PTRJ ? EXTEND_DB_GATEWAY_TIMEOUT : DEFAULT_GATEWAY_TIMEOUT;
    const gateways = await getActiveGatewayTargets();
    let lastError;

    for (let i = 0; i < gateways.length; i += 1) {
        const gateway = gateways[i];
        const label = isSameGateway(gateway, getGatewayTargets()[0]) ? 'primary' : 'fallback';
        const finalUrl = `${gateway.baseURL}${gateway.queryPath}`;

        try {
            console.log(`[EmployeeMill] Querying ${label}: ${finalUrl}`);
            const response = await axios.post(finalUrl, {
                sql,
                server: serverProfile,
                database: database
            }, {
                headers: { 'x-api-key': API_TOKEN },
                timeout
            });

            if (response.data.success) {
                const rows = response.data.data.recordset || [];
                console.log(`[EmployeeMill] Gateway success (${label}). Rows: ${rows.length}`);
                return rows;
            }

            throw new Error(response.data.error || 'Gateway query failed');
        } catch (error) {
            lastError = error;
            console.error(`EmployeeMillService Gateway Failed (${label}):`, error.message);

            if (i < gateways.length - 1 && shouldTryGatewayFallback(error)) {
                console.warn(`[EmployeeMill] ${finalUrl} unavailable. Trying local gateway fallback...`);
                continue;
            }

            break;
        }
    }

    throw lastError;
};

const queryWithServer = async (sql, serverProfile, database, options = {}) => {
    const { throwOnFailure = false } = options;
    let lastError;

    try {
        return await executeGatewayQuery(sql, serverProfile, database);
    } catch (error) {
        lastError = error;
        console.error('EmployeeMillService Gateway Failed:', error.message);
    }

    if (database === DB_PTRJ && LOCAL_EXTEND_DB_ENABLED) {
        try {
            return await queryLocalExtendDB(sql);
        } catch (error) {
            lastError = error;
            console.error('EmployeeMillService Local Fallback Failed:', error.message);
        }
    }

    if (throwOnFailure) {
        throw lastError;
    }

    return [];
};

// Helper to query extend_db_ptrj (for ptrj_employee_id and charge_job)
const queryExtendDB = async (sql, database = DB_PTRJ, options = {}) => {
    return await queryWithServer(sql, SERVER_PROFILE_PTRJ, database, options);
};

/**
 * Get all employee mappings from DB
 * ptrj_employee_id and charge_job from extend_db_ptrj.employee_mill
 * Returns array of { venus_employee_id, ptrj_employee_id, employee_name, charge_job, is_karyawan }
 */
const getAllEmployees = async () => {
    // Get ptrj_employee_id and charge_job from extend_db_ptrj.employee_mill (SERVER_PROFILE_1)
    const sql = `
        SELECT nik, venus_employee_id, ptrj_employee_id, employee_name, charge_job, is_karyawan
        FROM (
            SELECT
                nik,
                venus_employee_id,
                ptrj_employee_id,
                employee_name,
                charge_job,
                ISNULL(is_karyawan, 1) as is_karyawan,
                ROW_NUMBER() OVER (
                    PARTITION BY venus_employee_id
                    ORDER BY updated_at DESC, created_at DESC, nik DESC
                ) as rn
            FROM employee_mill
            WHERE is_active = 1
        ) latest
        WHERE rn = 1
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

    try {
        await queryExtendDB(sql, DB_PTRJ, { throwOnFailure: true });
        console.log(`[EmployeeMillService] Updated employee: ${venusEmployeeId}`);
        return { success: true, message: 'Employee updated successfully' };
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

    try {
        await queryExtendDB(sql, DB_PTRJ, { throwOnFailure: true });
        console.log(`[EmployeeMillService] Inserted new employee: ${venus_employee_id}`);
        return { success: true, message: 'Employee inserted successfully' };
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

