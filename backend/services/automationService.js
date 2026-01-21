const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Define paths
const ENGINE_DIR = path.resolve(__dirname, '../../browser-automation-engine');
const DATA_DIR = path.join(ENGINE_DIR, 'testing_data');
const RUNNER_SCRIPT = path.join(ENGINE_DIR, 'parallel-runner.js');

const ensureDataDir = () => {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
};

/**
 * Transform employee data from web format to automation engine format
 * Web format: { id, name, ptrjEmployeeID, chargeJob, attendance: { "1": {...}, "2": {...} } }
 * Engine format: { EmployeeID, EmployeeName, PTRJEmployeeID, ChargeJob, Attendance: { "2026-01-01": {...} } }
 */
/**
 * Transform employee data from web format to automation engine format
 * Web format: { id, name, ptrjEmployeeID, chargeJob, attendance: { "1": {...}, "2": {...} } }
 * Engine format: { EmployeeID, EmployeeName, PTRJEmployeeID, ChargeJob, Attendance: { "2026-01-01": {...} } }
 */
const transformEmployeeData = (employees, month, year, startDate = null, endDate = null) => {
    return employees.map(emp => {
        // Transform attendance from day-number keys to date keys
        const attendanceByDate = {};

        if (emp.attendance) {
            Object.entries(emp.attendance).forEach(([dayNum, data]) => {
                // Construct date string from day number
                const date = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;

                // Filter by date range if provided
                if (startDate && date < startDate) return;
                if (endDate && date > endDate) return;

                attendanceByDate[date] = {
                    date,
                    dayName: data.dayName || '',
                    status: data.status || '',
                    display: data.display || '',
                    class: data.class || '',
                    checkIn: data.checkIn || null,
                    checkOut: data.checkOut || null,
                    regularHours: data.regularHours || 0,
                    overtimeHours: data.overtimeHours || 0,
                    isHoliday: data.isHoliday || false,
                    holidayName: data.holidayName || null,
                    isSunday: data.isSunday || false
                };
            });
        }

        return {
            EmployeeID: emp.id || '',
            EmployeeName: emp.name || '',
            PTRJEmployeeID: emp.ptrjEmployeeID || '',
            ChargeJob: emp.chargeJob || '',
            Attendance: attendanceByDate
        };
    });
};

/**
 * Saves input data to a temporary JSON file for the automation engine
 */
const saveAutomationData = (data) => {
    ensureDataDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `web_input_${timestamp}.json`;
    const filePath = path.join(DATA_DIR, fileName);

    const employees = data.employees || [];
    const month = data.month || new Date().getMonth() + 1;
    const year = data.year || new Date().getFullYear();
    const startDate = data.startDate || null;
    const endDate = data.endDate || null;

    // Transform to engine format with filtering
    const transformedData = transformEmployeeData(employees, month, year, startDate, endDate);

    // Calculate period
    const firstDay = startDate || `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDay = endDate || `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const payload = {
        metadata: {
            export_date: new Date().toISOString(),
            period_start: firstDay,
            period_end: endDay,
            total_employees: transformedData.length,
            source: 'web_interface'
        },
        data: transformedData
    };

    console.log(`[Automation] Saving ${transformedData.length} employees with attendance data`);
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
    return filePath;
};

/**
 * Spawns the automation process
 */
const startAutomationProcess = (dataFilePath) => {
    const env = {
        ...process.env,
        AUTO_CLOSE: 'true',
        HEADLESS: 'false'
    };

    console.log(`[Automation] Starting runner: node ${RUNNER_SCRIPT} ${dataFilePath}`);

    const child = spawn('node', [RUNNER_SCRIPT, dataFilePath], {
        env,
        cwd: ENGINE_DIR,
        stdio: ['ignore', 'pipe', 'pipe']
        // No shell:true - paths with spaces work correctly without shell
    });

    return child;
};

module.exports = {
    saveAutomationData,
    startAutomationProcess
};
