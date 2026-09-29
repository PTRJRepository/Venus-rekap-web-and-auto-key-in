const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const { compareWithTaskReg } = require('./comparisonService');
const { fetchAttendanceData } = require('./attendanceService');

// Define paths
const ENGINE_DIR = path.resolve(__dirname, '../../browser-automation-engine');
const DATA_DIR = path.join(ENGINE_DIR, 'testing_data');
const ATTENDANCE_RUNNER_SCRIPT = path.join(ENGINE_DIR, 'multi-tab-runner.js');
const ATTENDANCE_MULTI_WINDOW_RUNNER_SCRIPT = path.join(ENGINE_DIR, 'multi-window-runner.js');
const PAYROLL_RUNNER_SCRIPT = path.join(ENGINE_DIR, 'payroll-parallel-runner.js');
const PAYROLL_DATA_FILE = path.join(DATA_DIR, 'current_payroll_data.json');
const TABS_PER_ATTENDANCE_WINDOW = 4;
const DEFAULT_MAX_ATTENDANCE_WINDOWS = 6;

const ensureDataDir = () => {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
};

const parsePositiveInt = (value, fallback) => {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeAttendanceWindowCount = (value) => {
    const maxWindows = parsePositiveInt(process.env.MAX_AUTOMATION_WINDOWS, DEFAULT_MAX_ATTENDANCE_WINDOWS);
    const requested = parsePositiveInt(value, 1);
    return Math.max(1, Math.min(maxWindows, requested));
};

const getMillwareDetail = (millwareInfo, key) => {
    if (!millwareInfo || typeof millwareInfo !== 'object') return undefined;
    if (Object.prototype.hasOwnProperty.call(millwareInfo, key)) {
        return millwareInfo[key];
    }
    const nested = millwareInfo.details;
    if (nested && typeof nested === 'object' && Object.prototype.hasOwnProperty.call(nested, key)) {
        return nested[key];
    }
    return undefined;
};

const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const isRegularHoursMatched = (att = {}) => {
    const hasRegularRecord = getMillwareDetail(att.millwareInfo, 'hasRegularRecord') === true;
    const millwareNormal = toNumber(getMillwareDetail(att.millwareInfo, 'millwareNormal'));
    return hasRegularRecord && millwareNormal > 0;
};

const buildLatestEmployeeMap = async (month, year) => {
    const matrixEmployees = await fetchAttendanceData(Number(month), Number(year), { showStaff: true });
    const byVenusId = {};
    const byPtrjId = {};

    matrixEmployees.forEach(emp => {
        if (emp.id) byVenusId[String(emp.id).trim()] = emp;
        if (emp.ptrjEmployeeID) byPtrjId[String(emp.ptrjEmployeeID).trim()] = emp;
    });

    return { byVenusId, byPtrjId };
};

const applyLatestEmployeeMapping = (employees, latestMap) => {
    return employees.map(emp => {
        const venusId = String(emp.id || emp.EmployeeID || '').trim();
        const ptrjId = String(emp.ptrjEmployeeID || emp.PTRJEmployeeID || '').trim();
        const latest = latestMap.byVenusId[venusId] || latestMap.byPtrjId[ptrjId];

        if (!latest) return emp;

        const latestPtrjId = latest.ptrjEmployeeID || emp.ptrjEmployeeID || emp.PTRJEmployeeID || '';
        const latestChargeJob = latest.chargeJob || emp.chargeJob || emp.ChargeJob || '';

        if (latestChargeJob && latestChargeJob !== (emp.chargeJob || emp.ChargeJob || '')) {
            console.log(`[Automation] Refresh ChargeJob ${latestPtrjId || ptrjId || venusId} (${emp.name || emp.EmployeeName || latest.employee_name || ''}): "${emp.chargeJob || emp.ChargeJob || ''}" -> "${latestChargeJob}"`);
        }

        return {
            ...emp,
            ptrjEmployeeID: latestPtrjId,
            chargeJob: latestChargeJob,
            name: emp.name || latest.name || emp.EmployeeName || ''
        };
    });
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
                const explicitDate = typeof data?.date === 'string' ? data.date.substring(0, 10) : '';
                const keyedDate = /^\d{4}-\d{2}-\d{2}/.test(String(dayNum)) ? String(dayNum).substring(0, 10) : '';
                const date = explicitDate || keyedDate || `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;

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
                    useNormalChargeJob: (!isAnnualLeave && !isSickLeave), // Regular day, Sunday, or Holiday uses normal ChargeJob
                    // Calculate leave hours based on day (Saturday = 5, else 7)
                    calculatedLeaveHours: new Date(date).getDay() === 6 ? 5 : 7
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
 * @param {object} data - Input options including optional outputFileName
 */
const saveAutomationData = async (data) => {
    ensureDataDir();
    // Use fixed filename instead of timestamped - overwrites previous data
    // Pass data.outputFileName to override (e.g. 'current_data_ot.json' for OT runs)
    const fileName = data.outputFileName || 'current_data.json';
    const filePath = path.join(DATA_DIR, fileName);

    let employees = data.employees || [];
    const month = data.month || new Date().getMonth() + 1;
    const year = data.year || new Date().getFullYear();
    const startDate = data.startDate || null;
    const endDate = data.endDate || null;
    const onlyOvertime = data.onlyOvertime || false;
    const syncMismatchesOnly = data.syncMismatchesOnly || false;
    const syncRegularOnly = data.syncRegularOnly || false;
    const automationWindows = normalizeAttendanceWindowCount(data.windowCount || data.automationWindows || 1);

    try {
        const latestMap = await buildLatestEmployeeMap(month, year);
        employees = applyLatestEmployeeMapping(employees, latestMap);
    } catch (err) {
        console.error(`[Automation] ⚠️ Failed to refresh latest employee mapping from Attendance Matrix source:`, err.message);
    }

    // Transform to engine format with filtering
    let transformedData = transformEmployeeData(employees, month, year, startDate, endDate);

    // Drop employees with no valid Millware ID. They can never be keyed in
    // (the form needs PTRJEmployeeID) and they all collapse to the same
    // "N/A|date" identity key, which trips the runner preflight duplicate gate.
    const preFilterCount = transformedData.length;
    transformedData = transformedData.filter(emp => {
        const pid = String(emp.PTRJEmployeeID || '').trim().toUpperCase();
        if (!pid || pid === 'N/A' || pid === '-' || pid === 'NULL' || pid === 'UNDEFINED') {
            console.log(`[Automation] 🚫 Skipping ${emp.EmployeeID} (${emp.EmployeeName}): no valid PTRJEmployeeID ("${emp.PTRJEmployeeID}") — cannot key into Millware.`);
            return false;
        }
        return true;
    });
    if (transformedData.length !== preFilterCount) {
        console.log(`[Automation] 🚫 Removed ${preFilterCount - transformedData.length} employee(s) without valid PTRJEmployeeID; ${transformedData.length} remain.`);
    }

    // Dedupe on PTRJEmployeeID. The runner's preflight identity key is
    // `PTRJID|date`, so two Venus employees sharing one Millware code produce
    // identical keys for the same dates and the whole window aborts. This is a
    // mapping collision in employee_mill (needs an HR data fix) — keep the
    // first employee, drop the rest, and log loudly so it gets fixed upstream.
    const seenPtrj = new Map();
    const deduped = [];
    for (const emp of transformedData) {
        const pid = String(emp.PTRJEmployeeID || '').trim().toUpperCase();
        if (seenPtrj.has(pid)) {
            const first = seenPtrj.get(pid);
            console.log(`[Automation] 🚫 COLLISION: ${emp.EmployeeID} (${emp.EmployeeName}) shares PTRJEmployeeID ${emp.PTRJEmployeeID} with ${first.EmployeeID} (${first.EmployeeName}) — dropping ${emp.EmployeeID} from this batch. Fix employee_mill mapping!`);
            continue;
        }
        seenPtrj.set(pid, emp);
        deduped.push(emp);
    }
    if (deduped.length !== transformedData.length) {
        console.log(`[Automation] 🚫 Removed ${transformedData.length - deduped.length} employee(s) with colliding PTRJEmployeeID; ${deduped.length} remain.`);
    }
    transformedData = deduped;

    // Calculate period
    const firstDay = startDate || `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDay = endDate || `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // --- INTEGRATE STATUS (MATCH/MISS) ---
    console.log(`[Automation] 🔄 Calculating sync status (MATCH/MISS) for ${transformedData.length} employees...`);
    try {
        const comparison = await compareWithTaskReg(transformedData, firstDay, endDay, {
            onlyOvertime,
            syncRegularOnly,
            onlyRegular: syncRegularOnly
        });

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
                        att.skipRegular = isRegularHoursMatched(att);
                        // OT hanya di-skip bila record OT ADA dan jamnya SAMA dengan Venus
                        // (Millware harus ikut Venus: beda jam -> diinput ulang)
                        const otExisted = getMillwareDetail(att.millwareInfo, 'otMatched') === true;
                        const otHoursEqual = getMillwareDetail(att.millwareInfo, 'otHoursMatch') === true;
                        att.skipOvertime = otExisted && otHoursEqual;
                        // DEBUG LOG for user assurance
                        if (att.skipRegular) {
                            console.log(`  [DataPrepare] ⏭️  ${date}: Regular hours MATCHED in DB (${att.millwareInfo.millwareNormal}h). Setting skipRegular=true.`);
                        }
                        if (!att.skipOvertime && otExisted) {
                            console.log(`  [DataPrepare] ⏭️  ${date}: OT jam beda dengan Venus (MW ${att.millwareInfo.millwareOT}h vs V ${att.overtimeHours}h). skipOvertime=false - akan diinput ulang.`);
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
                // 2026-09-11: user CANCELLED the OT delete ("ot delete itu gausah").
                // Re-inputting mismatched rows without deleting would double their
                // hours (source of the existing 1326 duplicate rows), so OT rows that
                // already exist — even with wrong hours — are SKIPPED here.

                if (syncRegularOnly) {
                    const statusUpper = String(att.status || '').trim().toUpperCase();
                    const needsRegular = !['ALFA', 'N/A'].includes(statusUpper);
                    const hasRegularRecord = getMillwareDetail(att.millwareInfo, 'hasRegularRecord') === true;
                    const millwareNormal = toNumber(getMillwareDetail(att.millwareInfo, 'millwareNormal'));
                    const venusRegular = toNumber(att.regularHours);
                    const regularExists = isRegularHoursMatched(att);

                    if (!needsRegular) {
                        shouldKeep = false;
                        reason = `Status ${statusUpper || '-'} tidak perlu regular`;
                    } else if (regularExists) {
                        shouldKeep = false;
                        reason = `Regular sudah ada (Venus ${venusRegular}h, Millware ${millwareNormal}h)`;
                    } else {
                        shouldKeep = true;
                        reason = hasRegularRecord
                            ? `Regular kosong/0h di Millware`
                            : `Regular MISSING`;
                    }
                } else if (att.syncStatus === 'MATCH' || att.syncDetail === 'synced' || att.status === 'ALFA') {
                    shouldKeep = false;
                    reason = `Already synced (MATCH) or ALFA`;
                } else if (att.syncStatus !== 'MISS') {
                    shouldKeep = false;
                    reason = `Status dari server bukan MISS`;
                } else {
                    // It is a MISS. Now filter based on the target mode.
                    if (onlyOvertime) {
                        // 2026-09-11: user "skip ot" — seluruh fase OT dibatalkan.
                        // Baris yang sudah ada (walau jam beda) TIDAK di-input ulang
                        // tanpa delete → jam dobel (sumber 1326 baris duplikat).
                        const venusOT = toNumber(att.overtimeHours);
                        const hasOTRecord = getMillwareDetail(att.millwareInfo, 'hasOTRecord') === true;
                        if (venusOT > 0 && !hasOTRecord) {
                            shouldKeep = true;
                            reason = `OT MISSING`;
                        } else {
                            shouldKeep = false;
                            reason = venusOT === 0
                                ? `Venus OT = 0`
                                : `OT sudah ada (jam beda dibiarkan — delete dibatalkan)`;
                        }
                    }
                    else {
                        // All Mismatches Mode: Rely on Comparison Service determination of MISS
                        // Plus: OT record ada tapi jam beda -> tetap KEEP agar diinput ulang
                        const venusOT = toNumber(att.overtimeHours);
                        const otHoursMatch = getMillwareDetail(att.millwareInfo, 'otHoursMatch') === true;
                        if (venusOT > 0 && otHoursMatch === false) {
                            shouldKeep = true;
                            reason = `OT jam beda (Venus ${venusOT}h, Millware ${toNumber(getMillwareDetail(att.millwareInfo, 'millwareOT'))}h) - input ulang`;
                        } else {
                            shouldKeep = true;
                            reason = `Status dari server: MISS`;
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
            syncRegularOnly: syncRegularOnly,
            automationWindows,
            tabsPerWindow: TABS_PER_ATTENDANCE_WINDOW
        },
        data: transformedData
    };
    const attendanceRecords = transformedData.reduce((total, emp) => {
        return total + Object.keys(emp.Attendance || {}).length;
    }, 0);

    // Log ChargeJob info for debugging
    transformedData.forEach(emp => {
        if (emp.ChargeJob) {
            console.log(`[Automation] Employee ${emp.PTRJEmployeeID} (${emp.EmployeeName}): ChargeJob="${emp.ChargeJob}"`);
        } else {
            console.log(`[Automation] ⚠️ Employee ${emp.PTRJEmployeeID} (${emp.EmployeeName}): NO ChargeJob!`);
        }
    });

    console.log(`[Automation] Saving ${transformedData.length} employees${onlyOvertime ? ' (ONLY OVERTIME mode)' : ''}; windows=${automationWindows}, tabs/window=${TABS_PER_ATTENDANCE_WINDOW}`);
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
    return {
        filePath,
        employeeCount: transformedData.length,
        attendanceRecords
    };
};

/**
 * Spawns the automation process
 * Uses current_data.json automatically (no file path needed)
 * Uses multi-tab runner by default with 8 concurrent tabs.
 */
const startAutomationProcess = (options = {}) => {
    const windowCount = normalizeAttendanceWindowCount(options.windowCount || options.automationWindows || 1);
    const runnerScript = windowCount > 1 ? ATTENDANCE_MULTI_WINDOW_RUNNER_SCRIPT : ATTENDANCE_RUNNER_SCRIPT;
    const env = {
        ...process.env,
        AUTO_CLOSE: process.env.AUTO_CLOSE || 'true',
        HEADLESS: process.env.HEADLESS || 'false',
        FRESH_LOGIN: process.env.FRESH_LOGIN || 'true',
        MULTI_TAB_CONCURRENCY: String(TABS_PER_ATTENDANCE_WINDOW),
        TABS_PER_WINDOW: String(TABS_PER_ATTENDANCE_WINDOW),
        AUTOMATION_WINDOWS: String(windowCount),
        MAX_AUTOMATION_WINDOWS: process.env.MAX_AUTOMATION_WINDOWS || String(DEFAULT_MAX_ATTENDANCE_WINDOWS),
        MULTI_TAB_STAGGER_DELAY: process.env.MULTI_TAB_STAGGER_DELAY || '1000',
        MULTI_TAB_ISOLATED_SESSIONS: process.env.MULTI_TAB_ISOLATED_SESSIONS || 'false',
        MULTI_TAB_BRING_TO_FRONT_ON_TRIGGER: process.env.MULTI_TAB_BRING_TO_FRONT_ON_TRIGGER || 'false',
        ENGINE_START_DELAY: process.env.ENGINE_START_DELAY || '2000'
    };

    const tabs = env.MULTI_TAB_CONCURRENCY;
    const mode = windowCount > 1 ? 'multi-window' : 'multi-tab';
    console.log(`[Automation] Starting ${mode} runner with ${windowCount} window(s), ${tabs} tab(s)/window, freshLogin=${env.FRESH_LOGIN}: node ${runnerScript}`);

    // No need to pass data file path - runner uses current_data.json by default
    const child = spawn('node', [runnerScript], {
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
let currentPayrollProcess = null;

/**
 * Start payroll automation process
 * Uses current_payroll_data.json as input
 */
const startPayrollAutomationProcess = () => {
    const env = {
        ...process.env,
        AUTO_CLOSE: process.env.AUTO_CLOSE || 'true',
        HEADLESS: process.env.HEADLESS || 'false',
        AUTOMATION_INSTANCES: process.env.AUTOMATION_INSTANCES || '1', // Single instance for payroll
        ENGINE_START_DELAY: process.env.ENGINE_START_DELAY || '2000'
    };

    const tabs = env.PAYROLL_TABS || env.AUTOMATION_INSTANCES || '5';
    console.log(`[PayrollAutomation] Starting monthly allowance/deduction runner with ${tabs} tab(s): node ${PAYROLL_RUNNER_SCRIPT} --tabs ${tabs} ${PAYROLL_DATA_FILE}`);

    const child = spawn('node', [PAYROLL_RUNNER_SCRIPT, '--tabs', tabs, PAYROLL_DATA_FILE], {
        cwd: ENGINE_DIR,
        env,
        stdio: ['ignore', 'pipe', 'pipe']
    });

    currentPayrollProcess = child;

    child.stdout.on('data', (data) => {
        const lines = data.toString().split('\n').filter(line => line.trim());
        lines.forEach(line => console.log(`[PayrollRunner] ${line}`));
    });

    child.stderr.on('data', (data) => {
        console.error(`[PayrollRunner ERROR] ${data.toString()}`);
    });

    child.on('close', (code) => {
        console.log(`[PayrollAutomation] Process exited with code ${code}`);
        currentPayrollProcess = null;
    });

    return child;
};

/**
 * Stop payroll automation process
 */
const stopPayrollAutomationProcess = () => {
    if (currentPayrollProcess) {
        console.log('[PayrollAutomation] Stopping process...');
        currentPayrollProcess.kill('SIGINT');
        currentPayrollProcess = null;
        return true;
    }
    return false;
};

module.exports = {
    saveAutomationData,
    startAutomationProcess,
    stopAutomationProcess,
    startPayrollAutomationProcess,
    stopPayrollAutomationProcess
};
