/**
 * Seed employee_mill table from existing JSON mapping and Google Apps Script
 * Run: node seed-employee-mill.js
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { getChargeJobsForMonth } = require('./services/chargeJobService');
require('dotenv').config();

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:8001';
const IS_PROXY = GATEWAY_URL.includes('/query');
const QUERY_ENDPOINT = IS_PROXY ? `${GATEWAY_URL}/v1/query` : `${GATEWAY_URL}/v1/query`;
const API_TOKEN = process.env.API_TOKEN_QUERY;
const SERVER_PROFILE = 'SERVER_PROFILE_1';
const DATABASE = 'extend_db_ptrj';

const MAPPING_FILE = path.join(__dirname, '../../data/employee_id_mapping.json');

async function executeQuery(sql) {
    // Basic SQL escaping to prevent syntax errors
    const safeSql = sql.replace(/'/g, "''");

    // This is executed directly, so we just pass the SQL string (already formatted in the caller if params needed)
    // Note: The simple executeQuery here expects a full SQL string. 
    // Ideally we should use params, but for bulk seed script simple string construction is often used if careful.
    // However, names like O'Connor will break it. Let's rely on caller to escape or use parametrized if gateway supports it.
    // Gateway supports params, let's use valid SQL construction in loop.

    // For this seeder, we will construct the SQL carefully.
}

async function runQuery(sql, params = {}) {
    const r = await axios.post(QUERY_ENDPOINT, {
        sql,
        params,
        server: SERVER_PROFILE,
        database: DATABASE
    }, {
        headers: { 'x-api-key': API_TOKEN, 'Content-Type': 'application/json' },
        timeout: 30000
    });

    if (!r.data.success) {
        throw new Error(`Query failed: ${r.data.error}`);
    }
    return r.data;
}

async function main() {
    console.log('=== Seeding employee_mill Table ===\n');

    // 1. Load Mapping JSON
    console.log('1. Loading employee_id_mapping.json...');
    if (!fs.existsSync(MAPPING_FILE)) {
        console.error('Mapping file not found!');
        return;
    }
    const mappingData = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf-8'));
    const mappings = mappingData.mapping || [];
    console.log(`   Found ${mappings.length} mapping records.\n`);

    // 2. Load Charge Jobs from GAS (Legacy)
    console.log('2. Fetching Charge Jobs from Google Script...');
    let chargeJobs = {};
    try {
        chargeJobs = await getChargeJobsForMonth();
        console.log(`   Found ${Object.keys(chargeJobs).length} charge job entries.\n`);
    } catch (e) {
        console.warn('   Failed to fetch charge jobs:', e.message);
        console.warn('   Proceeding without charge jobs...\n');
    }

    // 3. Prepare Data
    console.log('3. Preparing data for insertion...');
    let insertedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // Manual escaping function
    const escape = (str) => {
        if (str === null || str === undefined) return 'NULL';
        return "'" + String(str).replace(/'/g, "''") + "'";
    };

    for (const record of mappings) {
        const nik = record.nik;
        const venusId = record.venus_employee_id;
        const ptrjId = record.ptrj_employee_id;
        const name = record.venus_employee_name || record.ptrj_employee_name;

        if (!venusId || !name) {
            skippedCount++;
            continue;
        }

        // Find charge job
        let cjob = chargeJobs[venusId] || chargeJobs[name] || null;

        try {
            // Check if exists
            const checkRes = await runQuery(`SELECT id FROM employee_mill WHERE venus_employee_id = ${escape(venusId)}`);

            if (checkRes.data.recordset.length > 0) {
                // Update
                const updateSql = `
                    UPDATE employee_mill 
                    SET nik = ${escape(nik)}, 
                        employee_name = ${escape(name)}, 
                        ptrj_employee_id = ${escape(ptrjId)}, 
                        charge_job = ${escape(cjob)},
                        updated_at = GETDATE()
                    WHERE venus_employee_id = ${escape(venusId)}
                `;
                await runQuery(updateSql);
            } else {
                // Insert
                const insertSql = `
                    INSERT INTO employee_mill (nik, employee_name, venus_employee_id, ptrj_employee_id, charge_job)
                    VALUES (${escape(nik)}, ${escape(name)}, ${escape(venusId)}, ${escape(ptrjId)}, ${escape(cjob)})
                `;
                await runQuery(insertSql);
                insertedCount++;
            }

            // Log progress every 20 items
            if ((insertedCount + skippedCount) % 20 === 0) {
                process.stdout.write('.');
            }

        } catch (e) {
            console.error(`\n   Error processing ${name}: ${e.message}`);
            if (e.response && e.response.data) {
                console.error('   Gateway Response:', JSON.stringify(e.response.data));
            }
            errorCount++;
            // if (errorCount >= 1) break; // Commented out to process all
        }
    }

    console.log('\n\n=== Seeding Completed ===');
    console.log(`Inserted/Updated: ${insertedCount}`);
    console.log(`Skipped: ${skippedCount}`);
    console.log(`Errors: ${errorCount}`);
}

main();
