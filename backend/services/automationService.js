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
                const statusUpper = (status || '').toUpperCase().trim();
                const isPartialIn = statusUpper === 'PARTIAL IN';

                // Robust Sick Leave Detection - Priority 1
                const SICK_LEAVE_TYPES_LIST = ['SAKIT', 'SICK', 'HAID', 'MENSTRUAL', 'MENSTRUAL LEAVE', 'P2', 'P3'];
                let isSickLeave = data.isSickLeave === true;

                if (statusUpper && SICK_LEAVE_TYPES_LIST.includes(statusUpper)) {
                    isSickLeave = true;
                }

                // Annual Leave Detection - Priority 2 (ONLY for CT/Cuti status)
                // IMPORTANT: Annual Leave should ONLY be used when status is CT/Cuti
                // Regular attendance (Hadir) and Partial In should use original Charge Job
                const ANNUAL_LEAVE_TYPES_LIST = ['CT', 'CUTI', 'ANNUAL LEAVE', 'ANNUAL', 'CUTI TAHUNAN'];
                let isAnnualLeave = data.isAnnualLeave === true;

                // Double-check: if status is explicitly CT/Cuti, set isAnnualLeave to true
                if (statusUpper && ANNUAL_LEAVE_TYPES_LIST.some(type => statusUpper.includes(type))) {
                    isAnnualLeave = true;
                }

                // FINAL: Force isAnnualLeave to false if status is 'Partial In' OR 'Sick Leave'
                // This ensures we use the correct Charge Job (Partial In) or Sick Leave Task Code.
                if (isPartialIn || isSickLeave) {
                    isAnnualLeave = false;
                }

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
                    leaveDescription: isAnnualLeave ? (data.leaveDescription || null) : null,
                    // For Sunday/Holiday, explicitly mark that normal ChargeJob should be used
                    useNormalChargeJob: (!isAnnualLeave && !isSickLeave) // Regular day, Sunday, or Holiday uses normal ChargeJob
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
        console.log(`[Automation] ══════════════════════════════════════════════════════════`);
        console.log(`[Automation] 🔍 STRICT FILTERING: Ensuring only MISS data is processed`);
        console.log(`[Automation] 📌 Mode: ${onlyOvertime ? 'OVERTIME ONLY' : syncRegularOnly ? 'REGULAR ONLY' : 'ALL MISMATCHES'}`);
        console.log(`[Automation] ══════════════════════════════════════════════════════════`);

        let totalKept = 0;
        let totalSkipped = 0;

        // Filter employees: Keep only those who have at least one 'MISS' day
        transformedData = transformedData.map(emp => {
            const newAttendance = {};
            let hasMismatch = false;
            let keptDays = 0;
            let skippedDays = 0;

            Object.entries(emp.Attendance || {}).forEach(([date, att]) => {
                let shouldKeep = false;
                let reason = "";

                // --- STRICT FILTERING LOGIC ---
                // We use multiple conditions to ensure ONLY truly missing data passes through
                // CRITICAL: Only input data that DOESN'T exist at all in Millware
                // - Regular (OT=0): Only input if NO OT=0 record exists
                // - Overtime (OT=1): Only input if NO OT=1 record exists

                if (onlyOvertime) {
                    // OT Mode: Only keep if OT is MISSING in Millware
                    const venusOT = att.overtimeHours || 0;
                    const millwareOT = att.millwareInfo?.millwareOT || 0;
                    const hasOTRecord = att.millwareInfo?.hasOTRecord === true;
                    const hasRegularRecord = att.millwareInfo?.hasRegularRecord === true;

                    if (venusOT === 0) {
                        shouldKeep = false;
                        reason = `Venus OT = 0 (tidak ada lembur)`;
                    } else if (!hasRegularRecord) {
                        // PREREQUISITE: Regular attendance must exist in Millware before overtime can be input
                        shouldKeep = false;
                        reason = `⛔ Prerequisites not met: Regular attendance (OT=0) belum ada di Millware`;
                    } else if (hasOTRecord && Math.abs(millwareOT - venusOT) < 0.1) {
                        // OT record exists and hours match
                        shouldKeep = false;
                        reason = `OT sudah synced (${millwareOT}h)`;
                    } else if (!hasOTRecord) {
                        // No OT=1 record in Millware - NEEDS INPUT
                        shouldKeep = true;
                        reason = `OT MISSING - No OT=1 record in Millware (Venus: ${venusOT}h)`;
                    } else {
                        // OT record exists but hours don't match
                        shouldKeep = true;
                        reason = `OT MISMATCH - Venus: ${venusOT}h vs Millware: ${millwareOT}h`;
                    }
                }
                else if (syncRegularOnly) {
                    // Regular Mode: Only keep if Regular is MISSING in Millware
                    const venusReg = att.regularHours || 0;
                    const millwareReg = att.millwareInfo?.millwareNormal || 0;
                    const hasRegularRecord = att.millwareInfo?.hasRegularRecord === true;

                    // Skip ALFA - no input needed
                    if (att.status === 'ALFA') {
                        shouldKeep = false;
                        reason = `ALFA - tidak perlu input`;
                    } else if (att.skipRegular === true) {
                        // Regular already matched in Millware
                        shouldKeep = false;
                        reason = `Regular record exists in Millware (${millwareReg}h)`;
                    } else if (!hasRegularRecord) {
                        // No OT=0 record in Millware - NEEDS INPUT
                        shouldKeep = true;
                        reason = `Regular MISSING - No OT=0 record in Millware (Venus: ${venusReg}h, Status: ${att.status})`;
                    } else if (Math.abs(millwareReg - venusReg) >= 0.1) {
                        // Record exists but hours don't match
                        shouldKeep = true;
                        reason = `Regular MISMATCH - Venus: ${venusReg}h vs Millware: ${millwareReg}h`;
                    } else {
                        // Already synced
                        shouldKeep = false;
                        reason = `Regular already synced (${millwareReg}h)`;
                    }
                }
                else {
                    // All Mismatches Mode: Keep if syncStatus is MISS
                    // CRITICAL: Only input data that is MISSING in Millware
                    const venusReg = att.regularHours || 0;
                    const venusOT = att.overtimeHours || 0;
                    const millwareReg = att.millwareInfo?.millwareNormal || 0;
                    const millwareOT = att.millwareInfo?.millwareOT || 0;
                    const hasRegularRecord = att.millwareInfo?.hasRegularRecord === true;
                    const hasOTRecord = att.millwareInfo?.hasOTRecord === true;

                    // Primary check: syncStatus from comparison service
                    if (att.syncStatus === 'MATCH' || att.syncDetail === 'synced') {
                        shouldKeep = false;
                        reason = `Already synced (MATCH)`;
                    } else if (att.syncStatus === 'MISS') {
                        // Check what's missing
                        const regularNeedsInput = !hasRegularRecord && att.status !== 'ALFA';
                        const otNeedsInput = !hasOTRecord && venusOT > 0;
                        
                        // Also check if hours don't match (mismatch case)
                        const regularMismatch = hasRegularRecord && Math.abs(millwareReg - venusReg) >= 0.1;
                        const otMismatch = hasOTRecord && Math.abs(millwareOT - venusOT) >= 0.1;

                        if (regularNeedsInput || otNeedsInput || regularMismatch || otMismatch) {
                            shouldKeep = true;
                            const reasons = [];
                            if (regularNeedsInput) reasons.push('Regular belum diinput');
                            if (otNeedsInput) reasons.push(`OT ${venusOT}h belum diinput`);
                            if (regularMismatch) reasons.push(`Regular beda: ${venusReg}h vs ${millwareReg}h`);
                            if (otMismatch) reasons.push(`OT beda: ${venusOT}h vs ${millwareOT}h`);
                            reason = `MISS: ${reasons.join(', ')}`;
                        } else {
                            shouldKeep = false;
                            reason = `No missing data`;
                        }
                    } else {
                        // Fallback: use skip flags
                        const needsRegular = !att.skipRegular && att.status !== 'ALFA';
                        const needsOT = !att.skipOvertime && venusOT > 0;

                        if (needsRegular || needsOT) {
                            shouldKeep = true;
                            reason = `Needs sync (skipRegular=${att.skipRegular}, skipOvertime=${att.skipOvertime})`;
                        } else {
                            shouldKeep = false;
                            reason = `Already synced (flags)`;
                        }
                    }
                }

                // Log decision for transparency
                if (shouldKeep) {
                    console.log(`  ✅ [KEEP] ${emp.PTRJEmployeeID} @ ${date}: ${reason}`);
                    newAttendance[date] = att;
                    hasMismatch = true;
                    keptDays++;
                    totalKept++;
                } else {
                    console.log(`  ⏭️  [SKIP] ${emp.PTRJEmployeeID} @ ${date}: ${reason}`);
                    skippedDays++;
                    totalSkipped++;
                }
            });

            if (hasMismatch) {
                console.log(`  📊 ${emp.PTRJEmployeeID}: Kept ${keptDays} days, Skipped ${skippedDays} days`);
                return { ...emp, Attendance: newAttendance };
            }
            console.log(`  🚫 ${emp.PTRJEmployeeID}: All days synced - REMOVING from export`);
            return null;
        }).filter(Boolean);

        console.log(`[Automation] ══════════════════════════════════════════════════════════`);
        console.log(`[Automation] 📉 FILTER RESULT: ${transformedData.length} employees with mismatches`);
        console.log(`[Automation] 📊 Total: ${totalKept} days KEPT, ${totalSkipped} days SKIPPED`);
        console.log(`[Automation] ══════════════════════════════════════════════════════════`);
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

    // Log ChargeJob info for debugging
    transformedData.forEach(emp => {
        if (emp.ChargeJob) {
            console.log(`[Automation] Employee ${emp.PTRJEmployeeID} (${emp.EmployeeName}): ChargeJob="${emp.ChargeJob}"`);
        } else {
            console.log(`[Automation] ⚠️ Employee ${emp.PTRJEmployeeID} (${emp.EmployeeName}): NO ChargeJob!`);
        }
    });

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
