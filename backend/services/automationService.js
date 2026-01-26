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
                    isSunday: data.isSunday || false,
                    // Leave type info for automation - explicitly set to false if not true
                    isAnnualLeave: data.isAnnualLeave === true,
                    leaveTaskCode: data.leaveTaskCode || null,
                    leaveDescription: data.leaveDescription || null
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

    // Transform to engine format with filtering
    let transformedData = transformEmployeeData(employees, month, year, startDate, endDate);

    // Calculate period
    const firstDay = startDate || `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDay = endDate || `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // --- FILTER: Sync Mismatches Only ---
    // FORCE FILTER: Always check against database to prevent duplicates.
    // The user expects the agent to ONLY receive data that is missing.
    const shouldFilter = true;

    console.log(`[Automation] 🔧 Filter Settings: FORCE FILTER ENABLED (Safety Mode).`);
    console.log(`[Automation] 📅 Period: ${month}/${year} (${firstDay} to ${endDay})`);

    // DEBUG: Check if POM00241 is in the data BEFORE filtering
    const debugEmp = transformedData.find(e => e.PTRJEmployeeID && e.PTRJEmployeeID.trim() === 'POM00241');
    if (debugEmp) {
        console.log(`[DEBUG] POM00241 found in data BEFORE filter:`);
        console.log(`  Dates: ${Object.keys(debugEmp.Attendance || {}).join(', ')}`);
    }

    if (shouldFilter) {
        console.log(`[Automation] 🔍 Filtering for MISMATCHES ONLY (${firstDay} to ${endDay})...`);
        if (onlyOvertime) {
            console.log(`[Automation] 📌 Auto-filtering enabled: Overtime Only mode - will skip dates with existing OT.`);
        }

        // === Query PR_TASKREGLN with correct OT filter based on mode ===
        const { queryTaskRegData } = require('./comparisonService');

        // Get all PTRJ IDs from employees
        const ptrjIds = employees
            .filter(emp => emp.ptrjEmployeeID && emp.ptrjEmployeeID !== 'N/A')
            .map(emp => emp.ptrjEmployeeID);

        // Query Millware with correct OT filter:
        // ALWAYS query ALL records (otFilter = null) to ensure we have a complete picture
        // This fixes the issue where Normal mode ignores existing OT records (e.g. on Sundays)
        const otFilter = null; 
        const modeDesc = 'ALL Records (OT=0 & OT=1)';
        console.log(`[Automation] Querying existing ${modeDesc} records from Millware...`);

        const existingRecords = await queryTaskRegData(firstDay, endDay, ptrjIds, otFilter);

        // Build lookup map: { "EmpCode_YYYY-MM-DD": { normal: bool, overtime: bool } }
        const existingMap = {};
        existingRecords.forEach(record => {
            let dateStr = null;
            if (record.TrxDate) {
                if (typeof record.TrxDate === 'string') {
                    dateStr = record.TrxDate.substring(0, 10);
                } else if (record.TrxDate instanceof Date) {
                    dateStr = record.TrxDate.toISOString().substring(0, 10);
                }
            }
            
            if (dateStr && record.EmpCode) {
                const cleanEmpCode = record.EmpCode.trim().toUpperCase();
                const key = `${cleanEmpCode}_${dateStr}`;
                
                if (!existingMap[key]) {
                    existingMap[key] = { normal: false, overtime: false };
                }
                
                // Check OT column (bit/boolean)
                // OT=1 or true -> Overtime
                // OT=0 or false -> Normal
                const isOT = record.OT === true || record.OT === 1;
                if (isOT) {
                    existingMap[key].overtime = true;
                } else {
                    existingMap[key].normal = true;
                }
            }
        });

        console.log(`[Automation] Found ${existingRecords.length} existing ${modeDesc} records in Millware`);
        console.log(`[Automation] Sample existing keys: ${Object.keys(existingMap).slice(0, 5).join(', ')}`);

        // Filter employees and their attendance dates
        let totalSkipped = 0;
        let totalKept = 0;
        let totalNoOT = 0;
        let debugLog = [];
        let skippedSamples = [];
        let keptSamples = [];

        transformedData = transformedData.map(emp => {
            const newAttendance = {};
            let hasMismatches = false;
            
            // Normalize ID for input
            const inputPtrjId = emp.PTRJEmployeeID ? emp.PTRJEmployeeID.trim().toUpperCase() : '';

            Object.entries(emp.Attendance || {}).forEach(([date, att]) => {
                // Check if already exists using same key format as frontend
                const key = `${inputPtrjId}_${date}`;
                const existing = existingMap[key];
                
                // Determine if we should skip based on mode and existing data
                let alreadyExists = false;
                
                if (onlyOvertime) {
                    // In Overtime Mode: Skip if OT record already exists
                    alreadyExists = existing && existing.overtime;
                } else {
                    // In Normal Mode: Skip if Normal record already exists
                    // CRITICAL FIX: Also skip if it is SUNDAY and OT record exists (assume Sunday is purely OT)
                    const isSundayWrapped = att.isSunday || (att.dayName && att.dayName.toLowerCase() === 'minggu');
                    if (existing) {
                        if (existing.normal) {
                            alreadyExists = true;
                        } else if (isSundayWrapped && existing.overtime) {
                            alreadyExists = true; // Skip Sunday if OT exists (even if no Normal)
                        }
                    }
                }

                const hasOT = att.overtimeHours && att.overtimeHours > 0;

                // DEBUG: Specific employee tracking
                if (inputPtrjId === 'POM00241') {
                     console.log(`[DEBUG] POM00241 Check: "${key}"`);
                     console.log(`   -> Existing in DB: ${existing ? JSON.stringify(existing) : 'None'}`);
                     console.log(`   -> Mode: ${onlyOvertime ? 'OT' : 'Normal'}, isSunday: ${att.isSunday}`);
                     console.log(`   -> Result: alreadyExists=${alreadyExists}`);
                }

                // Debug first few
                if (debugLog.length < 10) {
                    debugLog.push(`${key}: OT=${att.overtimeHours || 0}, exists=${!!alreadyExists}`);
                }

                // Only keep if NOT already in Millware
                // If in Overtime Only mode: MUST have OT
                // If in Normal mode: Keep everything that isn't synced (including Sundays/Regular days)
                const passesModeFilter = onlyOvertime ? hasOT : true;

                if (!alreadyExists && passesModeFilter) {
                    newAttendance[date] = att;
                    hasMismatches = true;
                    totalKept++;

                    // Collect samples
                    if (keptSamples.length < 5) {
                        keptSamples.push(`${key} (R:${att.regularHours || 0}, OT:${att.overtimeHours || 0})`);
                    }
                } else if (alreadyExists) {
                    totalSkipped++;

                    // Collect samples
                    if (skippedSamples.length < 5) {
                        skippedSamples.push(`${key} (SYNCED)`);
                    }
                } else if (onlyOvertime && !hasOT) {
                    // Only count as "No OT" exclusion if we are actually filtering for OT
                    totalNoOT++;
                }
            });

            // Return employee with filtered attendance (or null if no mismatches)
            if (hasMismatches) {
                return { ...emp, Attendance: newAttendance };
            }
            return null;
        }).filter(emp => emp !== null);

        console.log(`[Automation] 🔍 Debug samples: ${debugLog.join(' | ')}`);
        console.log(`[Automation] ✅ KEPT (new/mismatch): ${keptSamples.join(' | ')}`);
        console.log(`[Automation] ⏭️  SKIPPED (synced): ${skippedSamples.join(' | ')}`);
        console.log(`[Automation] ✅ Filter complete: ${totalKept} to process, ${totalSkipped} synced, ${totalNoOT} no-OT (excluded).`);
        console.log(`[Automation] 📉 Filtered down to ${transformedData.length} employees with mismatches.`);
    }

    const exportDate = new Date().toISOString();
    const commonMetadata = {
        export_date: exportDate,
        period_start: firstDay,
        period_end: endDay,
        source: 'web_interface',
        onlyOvertime: onlyOvertime,
        syncMismatchesOnly: syncMismatchesOnly
    };

    // 1. Save FULL data for reference/backup
    const fullPayload = {
        metadata: { ...commonMetadata, total_employees: transformedData.length },
        data: transformedData
    };
    fs.writeFileSync(filePath, JSON.stringify(fullPayload, null, 2));
    console.log(`[Automation] Saving ${transformedData.length} employees${onlyOvertime ? ' (ONLY OVERTIME mode)' : ''}`);

    // 2. Partition data for parallel engines
    const numInstances = parseInt(process.env.AUTOMATION_INSTANCES || '2');
    console.log(`[Automation] Partitioning data for ${numInstances} instances...`);

    const chunks = Array.from({ length: numInstances }, () => []);
    transformedData.forEach((emp, index) => {
        chunks[index % numInstances].push(emp);
    });

    chunks.forEach((chunk, index) => {
        const instanceId = index + 1;
        const chunkPayload = {
            metadata: {
                ...commonMetadata,
                instanceId,
                total_employees: chunk.length
            },
            data: chunk
        };
        const chunkPath = path.join(DATA_DIR, `current_data_engine_${instanceId}.json`);
        fs.writeFileSync(chunkPath, JSON.stringify(chunkPayload, null, 2));
        console.log(`[Automation]   → Instance ${instanceId}: ${chunk.length} employees saved to current_data_engine_${instanceId}.json`);
    });

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
