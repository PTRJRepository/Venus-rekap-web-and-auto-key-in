const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const { compareWithTaskReg } = require('./comparisonService');

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

                const status = data.status || '';
                const isPartialIn = status === 'Partial In';

                // Robust Sick Leave Detection
                const SICK_LEAVE_TYPES_LIST = ['SAKIT', 'SICK', 'HAID', 'MENSTRUAL', 'MENSTRUAL LEAVE', 'P2', 'P3'];
                let isSickLeave = data.isSickLeave === true;

                if (status && SICK_LEAVE_TYPES_LIST.includes(status.toUpperCase())) {
                    isSickLeave = true;
                }

                // Force isAnnualLeave to false if status is 'Partial In' OR 'Sick Leave'
                // This ensures we use the correct Charge Job (Partial In) or Sick Leave Task Code.
                const isAnnualLeave = (isPartialIn || isSickLeave) ? false : (data.isAnnualLeave === true);

                attendanceByDate[date] = {
                    date,
                    dayName: data.dayName || '',
                    status: status,
                    display: data.display || '',
                    class: data.class || '',
                    checkIn: data.checkIn || null,
                    checkOut: data.checkOut || null,
                    regularHours: data.regularHours || 0,
                    overtimeHours: data.overtimeHours || 0,
                    isHoliday: data.isHoliday || false,
                    holidayName: data.holidayName || null,
                    isSunday: data.isSunday || false,
                    // Leave type info for automation
                    isAnnualLeave: isAnnualLeave,
                    isSickLeave: isSickLeave,
                    // Clear leave codes if we forced isAnnualLeave to false (Partial In or Sick)
                    leaveTaskCode: isAnnualLeave ? (data.leaveTaskCode || null) : null,
                    leaveDescription: isAnnualLeave ? (data.leaveDescription || null) : null
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
const saveAutomationData = async (data) => {
    ensureDataDir();
    // Use fixed filename instead of timestamped - overwrites previous data
    const fileName = 'current_data.json';
    const filePath = path.join(DATA_DIR, fileName);

    const employees = data.employees || [];
    const month = data.month || new Date().getMonth() + 1;
    const year = data.year || new Date().getFullYear();
    const startDate = data.startDate || null;
    const endDate = data.endDate || null;
    const onlyOvertime = data.onlyOvertime || false;
    const syncMismatchesOnly = data.syncMismatchesOnly || false;
    const syncRegularOnly = data.syncRegularOnly || false;

    // Transform to engine format with filtering
    let transformedData = transformEmployeeData(employees, month, year, startDate, endDate);

    // Calculate period
    const firstDay = startDate || `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDay = endDate || `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // --- INTEGRATE STATUS (MATCH/MISS) ---
    console.log(`[Automation] 🔄 Calculating sync status (MATCH/MISS) for ${transformedData.length} employees...`);
    try {
        const comparison = await compareWithTaskReg(employees, firstDay, endDay, { onlyOvertime });

        // Build a lookup map from comparison results: key = "ptrjId_date"
        const statusMap = {};
        comparison.results.forEach(res => {
            const key = `${res.ptrjId}_${res.date}`;
            statusMap[key] = {
                status: res.status, // MATCH/MISS
                syncStatus: res.syncStatus, // synced/mismatch/not_synced
                details: res.details
            };
        });

        // Inject status into transformedData
        transformedData.forEach(emp => {
            Object.entries(emp.Attendance || {}).forEach(([date, att]) => {
                const key = `${emp.PTRJEmployeeID}_${date}`;
                const compareInfo = statusMap[key];

                if (compareInfo) {
                    att.syncStatus = compareInfo.status; // MATCH or MISS
                    att.syncDetail = compareInfo.syncStatus; // synced, mismatch, or not_synced
                    att.millwareInfo = compareInfo.details;

                    // Granular skipping logic
                    // If detailed info exists, use it to determine if specific parts should be skipped
                    if (att.millwareInfo) {
                        att.skipRegular = att.millwareInfo.regularMatched === true;
                        att.skipOvertime = att.millwareInfo.otMatched === true;
                        // DEBUG LOG for user assurance
                        if (att.skipRegular) {
                            console.log(`  [DataPrepare] ⏭️  ${date}: Regular hours MATCHED in DB (${att.millwareInfo.millwareNormal}h). Setting skipRegular=true.`);
                        }
                    }
                } else {
                    att.syncStatus = 'MISS';
                    att.syncDetail = 'not_synced';
                    // If no comparison info (e.g. Millware down?), default to NOT skipping
                    att.skipRegular = false;
                    att.skipOvertime = false;
                }
            });
        });
        console.log(`[Automation] ✅ Sync status injected into current_data.json`);
    } catch (err) {
        console.error(`[Automation] ⚠️ Failed to inject sync status:`, err.message);
    }

    // --- FILTER: Sync Mismatches Only ---
    // If enabled, we filter out employees/days that are already SYNCED (based on backend logic)
    const shouldFilter = syncMismatchesOnly || onlyOvertime || syncRegularOnly;

    if (shouldFilter) {
        console.log(`[Automation] 🔍 Filtering for MISMATCHES ONLY (Using Comparison Results)...`);
        if (syncRegularOnly) console.log(`[Automation] 📌 Filter Mode: REGULAR ONLY (Skipping matched regular hours)`);

        // Filter employees: Keep only those who have at least one 'MISS' day
        transformedData = transformedData.map(emp => {
            const newAttendance = {};
            let hasMismatch = false;
            let keptDays = 0;

            Object.entries(emp.Attendance || {}).forEach(([date, att]) => {
                // Logic: Keep if status is 'MISS'
                // If 'MATCH' or 'synced', we skip it.
                // However, the template has 'skipRegular' logic, so we technically COULD keep everything
                // and let the template skip. BUT to reduce JSON size and processing time,
                // we'll remove the days that don't need any action.

                // Exception: In Overtime Only mode, if OT is matched, we skip.
                if (onlyOvertime) {
                    if (att.skipOvertime !== true) {
                        newAttendance[date] = att;
                        hasMismatch = true;
                        keptDays++;
                    }
                }
                // Exception: In Regular Only mode, if Regular is matched, we skip.
                else if (syncRegularOnly) {
                    if (att.skipRegular !== true) {
                        newAttendance[date] = att;
                        hasMismatch = true;
                        keptDays++;
                    }
                }
                else {
                    // Standard Mode: Keep if syncStatus is MISS
                    if (att.syncStatus === 'MISS') {
                        newAttendance[date] = att;
                        hasMismatch = true;
                        keptDays++;
                    }
                }
            });

            if (hasMismatch) {
                return { ...emp, Attendance: newAttendance };
            }
            return null;
        }).filter(Boolean);

        console.log(`[Automation] 📉 Filtered down to ${transformedData.length} employees with mismatches.`);
    }


    const payload = {
        metadata: {
            export_date: new Date().toISOString(),
            period_start: firstDay,
            period_end: endDay,
            total_employees: transformedData.length,
            source: 'web_interface',
            onlyOvertime: onlyOvertime,
            syncMismatchesOnly: syncMismatchesOnly,
            syncRegularOnly: syncRegularOnly
        },
        data: transformedData
    };

    console.log(`[Automation] Saving ${transformedData.length} employees${onlyOvertime ? ' (ONLY OVERTIME mode)' : ''}`);
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
    return filePath;
};

/**
 * Spawns the automation process
 * Uses current_data.json automatically (no file path needed)
 * Reads AUTOMATION_INSTANCES from .env to control parallel execution
 */
const startAutomationProcess = () => {
    const env = {
        ...process.env,
        AUTO_CLOSE: process.env.AUTO_CLOSE || 'true',
        HEADLESS: process.env.HEADLESS || 'false',
        AUTOMATION_INSTANCES: process.env.AUTOMATION_INSTANCES || '2',
        ENGINE_START_DELAY: process.env.ENGINE_START_DELAY || '2000'
    };

    const instances = env.AUTOMATION_INSTANCES;
    console.log(`[Automation] Starting runner with ${instances} instance(s): node ${RUNNER_SCRIPT}`);

    // No need to pass data file path - runner uses current_data.json by default
    const child = spawn('node', [RUNNER_SCRIPT], {
        env,
        cwd: ENGINE_DIR,
        stdio: ['ignore', 'pipe', 'pipe']
    });

    currentProcess = child;

    child.on('exit', () => {
        currentProcess = null;
    });

    return child;
};

const stopAutomationProcess = () => {
    if (currentProcess) {
        if (process.platform === 'win32') {
            try {
                // Force kill process tree on Windows
                exec(`taskkill /pid ${currentProcess.pid} /T /F`);
                console.log(`[Automation] Force killed process ${currentProcess.pid}`);
            } catch (e) {
                console.error('[Automation] Failed to taskkill:', e);
            }
        } else {
            currentProcess.kill('SIGINT');
        }
        currentProcess = null;
        return true;
    }
    return false;
};

// Track active process
let currentProcess = null;

module.exports = {
    saveAutomationData,
    startAutomationProcess,
    stopAutomationProcess
};
