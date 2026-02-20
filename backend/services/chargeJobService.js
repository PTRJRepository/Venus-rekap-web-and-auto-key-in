const axios = require('axios');
const path = require('path');
const fs = require('fs');

// Load config to get URL
const CONFIG_PATH = path.join(__dirname, '../../../config.json');
let CHARGE_JOB_DATA_URL = '';

try {
    if (fs.existsSync(CONFIG_PATH)) {
        const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
        CHARGE_JOB_DATA_URL = config.google_apps_script?.charge_job_data_url;
    }
} catch (e) {
    console.error("Error loading config for Charge Job URL:", e);
}

const getChargeJobsForMonth = async (month, year) => {
    // Note: Month/Year params are kept for interface compatibility, 
    // but GAS currently returns a snapshot of current charge jobs.
    // If historical data is needed, we'd need a different source or the GAS script to support parameters.
    
    if (!CHARGE_JOB_DATA_URL) {
        console.warn("Charge Job Data URL not configured.");
        return {};
    }

    try {
        console.log(`Fetching charge jobs from GAS: ${CHARGE_JOB_DATA_URL}`);
        const response = await axios.get(CHARGE_JOB_DATA_URL, { timeout: 15000 });
        const data = response.data;
        
        // Handle various response structures
        let employeeList = [];
        if (Array.isArray(data)) {
            employeeList = data;
        } else if (data.data && Array.isArray(data.data)) {
            employeeList = data.data;
        } else if (data.employees && Array.isArray(data.employees)) {
            employeeList = data.employees;
        } else {
            console.warn("Unexpected GAS response structure:", data);
            return {};
        }

        const chargeJobMap = {};
        
        employeeList.forEach(emp => {
            const empId = (emp.employeeId || emp.EmployeeID || emp.id || '').trim();
            const empName = (emp.namaKaryawan || emp.employeeName || emp.EmployeeName || emp.name || '').trim();
            const chargeJob = (emp.chargeJob || emp.charge_job || emp.ChargeJob || emp.task_code_data || '').trim();

            if (chargeJob) {
                if (empId) chargeJobMap[empId] = chargeJob;
                if (empName) chargeJobMap[empName] = chargeJob; // Fallback by name
            }
        });

        console.log(`Loaded ${Object.keys(chargeJobMap).length} charge job entries from GAS.`);
        return chargeJobMap;

    } catch (error) {
        console.error("Error fetching charge jobs from GAS:", error.message);
        return {};
    }
};

module.exports = { getChargeJobsForMonth };