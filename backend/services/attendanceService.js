const { executeQuery } = require('./gateway');
// const { getPTRJMapping, matchPTRJEmployeeId } = require('./mappingService'); // Now unused
// const { getChargeJobMapFromDB } = require('./employeeMillService'); // Now unused
const { getAllEmployees: getMillEmployees, getHolidaysFromDB: fetchHolidaysFromMill } = require('./employeeMillService');

// const fs = require('fs'); // Unused
// const path = require('path'); // Unused
const axios = require('axios');
const { parseISO, format, isValid, eachDayOfInterval, startOfMonth, endOfMonth, getDay, addDays, isSunday, isSaturday, differenceInMinutes } = require('date-fns');
const { id } = require('date-fns/locale');

// --- Constants ---
const WORK_HOURS = {
    NORMAL: 7.0,
    SHORT: 5.0
};

// --- Leave Type Configuration ---
// Leave types that should use task code "(GA9130) PERSONNEL ANNUAL LEAVE" in Millware
// Excludes Sakit (Sick) and Haid (Menstrual) which have their own handling
const ANNUAL_LEAVE_TYPES = ['CT', 'MELAHIRKAN', 'P1', 'P2', 'P3', 'ANNUAL LEAVE'];
const ANNUAL_LEAVE_TASK_CODE = '(GA9130) PERSONNEL ANNUAL LEAVE';

// Leave types that should use task code "(GA9130) SICK LEAVE" (or similar)
const SICK_LEAVE_TYPES = ['SAKIT', 'SICK', 'HAID', 'MENSTRUAL'];
const SICK_LEAVE_TASK_CODE = '(GA9127) (AL) PERSONNEL SICK LEAVE'; // Corrected from dropdown

// Cache for leave type descriptions
let leaveTypeCache = null;

// --- Helper: Fetch Leave Type Descriptions from DB ---
const fetchLeaveTypesFromDB = async () => {
    if (leaveTypeCache) return leaveTypeCache;

    try {
        const sql = `
            SELECT LeaveTypeCode, LeaveTypeName, Description
            FROM [VenusHR14].[dbo].[HR_M_LeaveType]
        `;
        const result = await executeQuery(sql);
        const map = {};
        if (result && Array.isArray(result)) {
            result.forEach(row => {
                map[row.LeaveTypeCode] = {
                    name: row.LeaveTypeName,
                    description: row.Description
                };
            });
        }
        leaveTypeCache = map;
        console.log(`[LeaveTypes] Loaded ${Object.keys(map).length} leave types from DB`);
        return map;
    } catch (e) {
        console.error("Error fetching leave types from DB:", e);
        return {};
    }
};

// --- Helper: Check if leave type is Annual Leave ---
const isAnnualLeaveType = (leaveTypeCode) => {
    if (!leaveTypeCode) return false;
    // Also include explicit 'ANNUAL LEAVE' string if database uses it
    return ANNUAL_LEAVE_TYPES.includes(leaveTypeCode.toUpperCase()) || leaveTypeCode.toUpperCase().includes('ANNUAL');
};

// --- Helper: Check if leave type is Sick Leave ---
const isSickLeaveType = (leaveTypeCode) => {
    if (!leaveTypeCode) return false;
    return SICK_LEAVE_TYPES.includes(leaveTypeCode.toUpperCase()) || leaveTypeCode.toUpperCase().includes('SICK');
};

// const HOLIDAYS_PATH = ... // Removed

// --- Helper: Fetch Holidays from DB ---
const fetchHolidaysFromDB = async (start, end) => {
    try {
        const result = await fetchHolidaysFromMill(start, end);
        const map = {};
        if (result && Array.isArray(result)) {
            result.forEach(row => {
                const dateStr = formatDateSQL(row.HolidayDate);
                if (dateStr) {
                    map[dateStr] = row.Description || 'Holiday';
                }
            });
        }
        return map;
    } catch (e) {
        console.error("Error fetching holidays from DB helper:", e);
        return {};
    }
};

// --- Helper: Leave Expansion ---
const calculateConsecutiveWorkingDays = (startDateStr, duration, holidayMap) => {
    if (duration <= 0) return [];

    let currentDate = parseISO(startDateStr);
    const leaveDates = [];
    let workingDaysCounted = 0;
    let iterations = 0;
    const maxIterations = duration * 5;

    while (workingDaysCounted < duration && iterations < maxIterations) {
        const dateStr = format(currentDate, 'yyyy-MM-dd');
        const isSun = isSunday(currentDate);
        const isHoliday = holidayMap ? !!holidayMap[dateStr] : false;

        if (!isSun && !isHoliday) {
            leaveDates.push(dateStr);
            workingDaysCounted++;
        }
        currentDate = addDays(currentDate, 1);
        iterations++;
    }
    return leaveDates;
};

// --- Helper: Check Availability ---
const getLatestAvailableDate = async () => {
    try {
        const sql = `SELECT TOP (1) TADate FROM [VenusHR14].[dbo].[HR_T_TAMachine_Summary] ORDER BY TADate DESC`;
        const result = await executeQuery(sql);
        if (result && result.length > 0) {
            return format(new Date(result[0].TADate), 'yyyy-MM-dd');
        }
    } catch (e) {
        console.error("Error getting latest date:", e);
    }
    return null;
};

// --- Helper: Parse Charge Job String ---
const parseChargeJob = (jobString) => {
    const job = jobString || '-';
    const parts = job.split('|').map(p => p.trim());
    return {
        full: job,
        task_code: parts[0] || '-',
        station: parts[1] || '-',
        machine: parts[2] || '-',
        expense: parts[3] || '-'
    };
};

// --- Helper: Fetch Employees from Weekly Attendance Table ---
// This is the main source of employee list - only employees with records in Weekly table
// Note: No date filter because current month data only exists after closing
const fetchWeeklyEmployees = async () => {
    try {
        // Get ALL distinct employees from HR_T_TimeAttendanceWeekly (no date filter)
        // This table only has data after month closing, so we get all available employees
        const sql = `
            SELECT DISTINCT EmployeeID
            FROM [VenusHR14].[dbo].[HR_T_TimeAttendanceWeekly]
            ORDER BY EmployeeID
        `;
        const result = await executeQuery(sql);
        console.log(`[Weekly] Fetched ${result?.length || 0} distinct employees from HR_T_TimeAttendanceWeekly (all months)`);
        return result || [];
    } catch (e) {
        console.error("Error fetching Weekly employees:", e);
        return [];
    }
};

// --- Main Data Fetcher ---
const fetchAttendanceData = async (month, year) => {
    const startDate = format(startOfMonth(new Date(year, month - 1)), 'yyyy-MM-dd');
    const endDate = format(endOfMonth(new Date(year, month - 1)), 'yyyy-MM-dd');

    console.log(`Fetching ETL data for ${startDate} to ${endDate}`);

    // 1. Fetch ALL Data in Parallel
    // Employee list comes from HR_T_TimeAttendanceWeekly (Venus) 
    // Then LEFT JOIN with extend_db_ptrj for ptrj_employee_id and charge_job
    const [
        weeklyEmployeeIds,  // Distinct EmployeeIDs from HR_T_TimeAttendanceWeekly
        millEmployees,      // From extend_db_ptrj for mapping
        attendanceRaw,
        overtimeRaw,
        leavesRaw,
        absencesRaw,
        latestDateStr,
        holidayMap,
        leaveTypesMap       // Leave type descriptions from HR_M_LeaveType
    ] = await Promise.all([
        fetchWeeklyEmployees(),  // Get ALL employees from Weekly table (no date filter)
        getMillEmployees(),                        // Get mapping data from extend_db_ptrj
        fetchAttendanceRaw(startDate, endDate),
        fetchOvertimeRaw(startDate, endDate),
        fetchLeavesRaw(startDate, endDate),
        fetchAbsencesRaw(startDate, endDate),
        getLatestAvailableDate(),
        fetchHolidaysFromDB(startDate, endDate),
        fetchLeaveTypesFromDB()  // Fetch leave type descriptions
    ]);

    console.log(`[DEBUG] Latest Date Available: ${latestDateStr}`);
    console.log(`Data fetched: ${weeklyEmployeeIds.length} employees (from HR_T_TimeAttendanceWeekly), ${millEmployees.length} mappings, ${attendanceRaw.length} attendance, ${overtimeRaw.length} overtime`);

    // Build mapping from extend_db_ptrj (venus_employee_id -> ptrj info)
    const millMap = {};
    millEmployees.forEach(me => {
        if (me.venus_employee_id) {
            millMap[me.venus_employee_id] = me;
        }
    });

    // LEFT JOIN: Start with Weekly employees, get mapping from extend_db_ptrj if available
    const employees = weeklyEmployeeIds.map(we => {
        const millData = millMap[we.EmployeeID];
        return {
            venus_employee_id: we.EmployeeID,
            employee_name: millData?.employee_name || we.EmployeeName || we.EmployeeID, // Fallback to ID if no name
            ptrj_employee_id: millData?.ptrj_employee_id || null,
            charge_job: millData?.charge_job || null
        };
    });

    console.log(`[DEBUG] Final employee list: ${employees.length} (with ${employees.filter(e => e.ptrj_employee_id).length} having PTRJ mapping)`);

    // 2. Build Lookups
    const attendanceMap = {};
    attendanceRaw.forEach((row, idx) => {
        const dateStr = formatDateSQL(row.TADate);
        const key = `${row.EmployeeID}_${dateStr}`;
        attendanceMap[key] = row;
        if (idx === 0) console.log(`[DEBUG] First attendance key: ${key}, TADate: ${row.TADate}, formatted: ${dateStr}`);
    });
    console.log(`[DEBUG] Attendance map size: ${Object.keys(attendanceMap).length}`);

    const overtimeMap = {};
    overtimeRaw.forEach((row, idx) => {
        const dateStr = formatDateSQL(row.OTDate);
        const key = `${row.EmployeeID}_${dateStr}`;
        overtimeMap[key] = (overtimeMap[key] || 0) + parseFloat(row.OTHourDuration || 0);
        if (idx === 0) console.log(`[DEBUG] First overtime key: ${key}`);
    });

    const leaveMap = {};
    leavesRaw.forEach((row, idx) => {
        const duration = parseInt(row.Outgoing || 1);
        const refDate = formatDateSQL(row.RefDate);
        const dates = calculateConsecutiveWorkingDays(refDate, duration, holidayMap);
        const leaveTypeCode = row.LeaveTypeCode || '';
        const leaveTypeName = leaveTypesMap[leaveTypeCode]?.name || leaveTypeCode;
        const isAnnual = isAnnualLeaveType(leaveTypeCode);
        const isSick = isSickLeaveType(leaveTypeCode);

        let taskCode = null;
        if (isAnnual) taskCode = ANNUAL_LEAVE_TASK_CODE;
        else if (isSick) taskCode = SICK_LEAVE_TASK_CODE;

        dates.forEach(d => {
            leaveMap[`${row.EmployeeID}_${d}`] = {
                type: leaveTypeCode,
                desc: leaveTypeName,
                isAnnualLeave: isAnnual,
                isSickLeave: isSick,
                leaveTaskCode: taskCode
            };
        });
        if (idx === 0) console.log(`[DEBUG] First leave: RefDate=${refDate}, type=${leaveTypeCode}, isAnnual=${isAnnual}, expanded to ${dates.length} dates`);
    });

    const absenceMap = {};
    absencesRaw.forEach((row, idx) => {
        const from = parseISO(formatDateSQL(row.FromDate));
        const to = parseISO(formatDateSQL(row.ToDate));
        const days = eachDayOfInterval({ start: from, end: to });

        days.forEach(d => {
            const dStr = format(d, 'yyyy-MM-dd');
            absenceMap[`${row.EmployeeID}_${dStr}`] = {
                type: row.AbsType,
                isUnpaid: (row.AbsType || '').toLowerCase() === 'unpaid leave'
            };
        });
        if (idx === 0) console.log(`[DEBUG] First absence: FromDate=${formatDateSQL(row.FromDate)}, ToDate=${formatDateSQL(row.ToDate)}, expanded to ${days.length} dates`);
    });

    console.log(`[DEBUG] Map sizes - Att: ${Object.keys(attendanceMap).length}, OT: ${Object.keys(overtimeMap).length}, Leave: ${Object.keys(leaveMap).length}, Abs: ${Object.keys(absenceMap).length}`);

    // --- Active Employee Filter ---
    // Only include employees who have ATTENDANCE records in the database
    // Employees with only overtime/leave/absence but no attendance will be excluded
    const activeEmployeeIds = new Set();
    attendanceRaw.forEach(r => activeEmployeeIds.add(r.EmployeeID));

    // Log for debugging
    console.log(`[FILTER] Employees with attendance records: ${activeEmployeeIds.size}`);

    // Filter the employee list - only show those with actual attendance data
    const activeEmployees = employees.filter(emp => activeEmployeeIds.has(emp.venus_employee_id));
    console.log(`[FILTER] Filtered employee list from ${employees.length} to ${activeEmployees.length} (based on attendance records only)`);

    // 3. Build Grid
    const daysInMonth = eachDayOfInterval({
        start: parseISO(startDate),
        end: parseISO(endDate)
    });

    const finalData = activeEmployees.map(emp => {
        const empId = emp.venus_employee_id; // Using ID from Mill DB (matches Venus)
        const empName = emp.employee_name;   // Using Name from Mill DB
        const ptrjId = emp.ptrj_employee_id || 'N/A';

        // Use Charge Job as combined string (no splitting)
        const chargeJob = emp.charge_job || '-';

        const empData = {
            id: empId,
            name: empName,
            ptrjEmployeeID: ptrjId,
            chargeJob: chargeJob,  // Combined format, not split
            attendance: {}
        };

        daysInMonth.forEach(dateObj => {
            const dateStr = format(dateObj, 'yyyy-MM-dd');
            const dayNum = format(dateObj, 'd');
            const dayName = format(dateObj, 'EEE', { locale: id });
            const key = `${empId}_${dateStr}`;

            const isSun = isSunday(dateObj);
            const isSat = isSaturday(dateObj);
            const holidayName = holidayMap[dateStr] || null;
            const isHol = !!holidayName;

            // Check Data Availability
            if (latestDateStr && dateStr > latestDateStr) {
                empData.attendance[dayNum] = {
                    status: 'N/A',
                    display: 'N/A',
                    class: 'hours-data-unavailable',
                    date: dateStr,
                    dayName: dayName,
                    checkIn: null,
                    checkOut: null,
                    regularHours: 0,
                    overtimeHours: 0,
                    isHoliday: isHol,
                    holidayName: holidayName,
                    isSunday: isSun
                };
                return;
            }

            // Fetch data parts
            const att = attendanceMap[key];
            const otHours = overtimeMap[key] || 0;
            const leave = leaveMap[key];
            const absence = absenceMap[key];

            // --- ETL LOGIC (Priority Based) ---

            let status = 'absent';
            let display = '-';
            let cssClass = 'hours-absent';
            let regularHours = 0;
            let checkIn = att ? formatTime(att.TACheckIn) : null;
            let checkOut = att ? formatTime(att.TACheckOut) : null;

            // Priority 1: Attendance Record (HR_T_TAMachine_Summary) - Reality
            // If attendance exists (even partial), it takes precedence over everything else
            if (att) {
                // Calculate Hours
                if (att.TACheckIn && att.TACheckOut) {
                    const start = new Date(att.TACheckIn);
                    const end = new Date(att.TACheckOut);
                    let diffHrs = (end - start) / (1000 * 60 * 60);
                    if (diffHrs < 0) diffHrs += 24; // Cross day fix

                    // Business Logic Caps
                    if (isSat) {
                        regularHours = Math.min(diffHrs, WORK_HOURS.SHORT);
                    } else {
                        regularHours = Math.min(diffHrs, WORK_HOURS.NORMAL);
                    }

                    status = 'Hadir';
                    cssClass = 'hours-full';

                    // Simplified Display: Only show overtime if present
                    if (otHours > 0) {
                        display = `✓ +${otHours.toFixed(1)}h`; // Checkmark + overtime
                        cssClass = 'hours-normal-overtime';
                    } else {
                        display = '✓'; // Just checkmark for normal attendance
                        cssClass = 'hours-normal';
                    }

                } else {
                    // Incomplete attendance record
                    if (isSat) regularHours = WORK_HOURS.SHORT;
                    else regularHours = WORK_HOURS.NORMAL;

                    if (otHours > 0) {
                        display = `⚠ +${otHours.toFixed(1)}h`; // Warning + overtime
                    } else {
                        display = '⚠'; // Warning for incomplete
                    }

                    if (att.TACheckIn && !att.TACheckOut) {
                        status = 'Partial In';
                        cssClass = 'hours-partial-check-in-only';
                    } else {
                        status = 'Partial Out';
                        cssClass = 'hours-partial-check-out-only';
                    }
                }
            }
            // Priority 2: Absence (HR_T_Absence)
            else if (absence) {
                if (absence.isUnpaid) {
                    status = 'ALFA';
                    display = 'ALFA';
                    cssClass = 'hours-alfa';
                } else {
                    status = absence.type;
                    display = absence.type;
                    cssClass = `absence-${absence.type.toLowerCase().replace(/ /g, '-')}`;
                }
            }
            // Priority 3: Leave (HR_H_Leave)
            else if (leave) {
                status = leave.type;
                display = leave.type;
                cssClass = `leave-${leave.type.toLowerCase()}`;
                // Set regular hours for leave (Sat=5, Others=7) so automation knows what to input
                regularHours = isSat ? WORK_HOURS.SHORT : WORK_HOURS.NORMAL;
            }
            // Priority 4: No Record - Auto-Hadir for OFF/Holiday, ALFA for working days
            else {
                // No attendance record exists in database
                if (isSun) {
                    // Sunday = Auto Hadir with OFF display
                    status = 'Hadir';  // Counts as HK
                    regularHours = 0;  // No regular hours on Sunday
                    display = 'OFF';
                    cssClass = 'hours-off';
                    if (otHours > 0) {
                        display = `OFF +${otHours.toFixed(1)}h`;
                        cssClass = 'hours-overtime-only';
                    }
                } else if (isHol) {
                    // Holiday = Auto Hadir with LBR display
                    status = 'Hadir';  // Counts as HK
                    regularHours = isSat ? WORK_HOURS.SHORT : WORK_HOURS.NORMAL;  // Holiday gets regular hours
                    display = 'LBR';
                    cssClass = 'hours-holiday';
                    if (otHours > 0) {
                        display = `LBR +${otHours.toFixed(1)}h`;
                        cssClass = 'hours-normal-overtime';
                    }
                } else {
                    // Working day without attendance record = ALFA
                    status = 'ALFA';
                    display = 'ALFA';
                    cssClass = 'hours-alfa';
                }
            }

            // FINAL CONSISTENCY CHECK (Sync with Frontend Logic)
            // If status is Hadir/Partial In/Out but regularHours is 0, default to standard working hours.
            if ((status === 'Hadir' || status === 'Partial In' || status === 'Partial Out') && regularHours <= 0 && !isSun) {
                regularHours = isSat ? WORK_HOURS.SHORT : WORK_HOURS.NORMAL;
            }

            empData.attendance[dayNum] = {
                date: dateStr,
                dayName: dayName,
                status: status,
                display: display,
                class: cssClass,
                checkIn: checkIn,
                checkOut: checkOut,
                regularHours: regularHours,
                overtimeHours: otHours,
                isHoliday: isHol,
                holidayName: holidayName,
                isSunday: isSun,
                // Leave type info for automation - allow Partial Leave (attendance + leave)
                isAnnualLeave: (!absence && leave?.isAnnualLeave) || false,
                isSickLeave: (!absence && leave?.isSickLeave) || false,
                leaveTaskCode: (!absence && leave?.leaveTaskCode) || null,
                leaveDescription: (!absence && leave?.desc) || null
            };
        });

        return empData;
    });

    console.log(`Processed ${finalData.length} employees with full ETL data`);
    return finalData;
};

// --- Gateway Query Wrappers ---

// fetchEmployees Removed - Now handled by getAllEmployees() from employeeMillService

const fetchAttendanceRaw = async (start, end) => {
    const sql = `
        SELECT EmployeeID, TADate, TACheckIn, TACheckOut, Shift
        FROM [VenusHR14].[dbo].[HR_T_TAMachine_Summary]
        WHERE TADate BETWEEN '${start}' AND '${end}'
    `;
    return await executeQuery(sql);
};

const fetchOvertimeRaw = async (start, end) => {
    // Use exact same format as user's working query
    const sql = `
        SELECT EmployeeID, OTDate, OTHourDuration
        FROM [VenusHR14].[dbo].[HR_T_Overtime]
        WHERE OTDate >= '${start}' AND OTDate <= '${end}'
        ORDER BY OTDate
    `;
    console.log('[DEBUG] Overtime Query:', sql);
    const result = await executeQuery(sql);
    console.log('[DEBUG] Overtime Result Count:', result?.length || 0);
    return result;
};

const fetchLeavesRaw = async (start, end) => {
    const sql = `
        SELECT EmployeeID, RefDate, LeaveTypeCode, Outgoing
        FROM [VenusHR14].[dbo].[HR_H_Leave]
        WHERE RefDate BETWEEN '${start}' AND '${end}'
    `;
    return await executeQuery(sql);
};

const fetchAbsencesRaw = async (start, end) => {
    const sql = `
        SELECT EmployeeID, FromDate, ToDate, AbsType
        FROM [VenusHR14].[dbo].[HR_T_Absence]
        WHERE FromDate <= '${end}' AND ToDate >= '${start}'
    `;
    return await executeQuery(sql);
};

// --- Utils ---
const formatDateSQL = (dateVal) => {
    if (!dateVal) return null;
    // CRITICAL FIX: Use date-fns format to respect local/parsed time and avoid UTC shifting
    const d = typeof dateVal === 'string' ? new Date(dateVal) : new Date(dateVal);
    if (isNaN(d.getTime())) return null;
    return format(d, 'yyyy-MM-dd');
};



const formatTime = (dateVal) => {
    if (!dateVal) return null;
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return null;
    try {
        return d.toISOString().split('T')[1].substring(0, 5);
    } catch {
        return null;
    }
};

/**
 * OVERTIME-ONLY MODE
 * Fetch attendance data using ONLY the Overtime table.
 * If an employee has overtime on a date, they are considered "Hadir" with regularHours=7.
 * Useful when HR_T_TAMachine_Summary data is not yet available.
 */
const fetchAttendanceDataOvertimeOnly = async (month, year) => {
    const startDate = format(startOfMonth(new Date(year, month - 1)), 'yyyy-MM-dd');
    const endDate = format(endOfMonth(new Date(year, month - 1)), 'yyyy-MM-dd');

    console.log(`[OVERTIME-ONLY MODE] Fetching data for ${startDate} to ${endDate}`);

    // Fetch data (skip attendance table)
    const [
        employees, // From Mill DB
        overtimeRaw,
        leavesRaw,
        absencesRaw,
        holidayMap,
        leaveTypesMap
    ] = await Promise.all([
        getAllEmployees(),
        fetchOvertimeRaw(startDate, endDate),
        fetchLeavesRaw(startDate, endDate),
        fetchAbsencesRaw(startDate, endDate),
        fetchHolidaysFromDB(startDate, endDate),
        fetchLeaveTypesFromDB()
    ]);

    console.log(`[OVERTIME-ONLY] Data: ${employees.length} employees (from Mill DB), ${overtimeRaw.length} overtime records, ${Object.keys(holidayMap).length} holidays`);

    // Build overtime map (only source of "attendance" now)
    const overtimeMap = {};
    overtimeRaw.forEach(row => {
        const dateStr = formatDateSQL(row.OTDate);
        const key = `${row.EmployeeID}_${dateStr}`;
        overtimeMap[key] = (overtimeMap[key] || 0) + parseFloat(row.OTHourDuration || 0);
    });

    // Build leave map
    const leaveMap = {};
    leavesRaw.forEach(row => {
        const duration = parseInt(row.Outgoing || 1);
        const refDate = formatDateSQL(row.RefDate);
        const dates = calculateConsecutiveWorkingDays(refDate, duration, holidayMap);
        const leaveTypeCode = row.LeaveTypeCode || '';
        const leaveTypeName = leaveTypesMap[leaveTypeCode]?.name || leaveTypeCode;
        const isAnnual = isAnnualLeaveType(leaveTypeCode);
        const isSick = isSickLeaveType(leaveTypeCode);

        let taskCode = null;
        if (isAnnual) taskCode = ANNUAL_LEAVE_TASK_CODE;
        else if (isSick) taskCode = SICK_LEAVE_TASK_CODE;

        dates.forEach(d => {
            leaveMap[`${row.EmployeeID}_${d}`] = {
                type: leaveTypeCode,
                desc: leaveTypeName,
                isAnnualLeave: isAnnual,
                isSickLeave: isSick,
                leaveTaskCode: taskCode
            };
        });
    });

    // Build absence map
    const absenceMap = {};
    absencesRaw.forEach(row => {
        const from = parseISO(formatDateSQL(row.FromDate));
        const to = parseISO(formatDateSQL(row.ToDate));
        const days = eachDayOfInterval({ start: from, end: to });
        days.forEach(d => {
            const dStr = format(d, 'yyyy-MM-dd');
            absenceMap[`${row.EmployeeID}_${dStr}`] = {
                type: row.AbsType,
                isUnpaid: (row.AbsType || '').toLowerCase() === 'unpaid leave'
            };
        });
    });

    // Active employees = those with overtime only
    const activeEmployeeIds = new Set();
    overtimeRaw.forEach(r => activeEmployeeIds.add(r.EmployeeID));
    leavesRaw.forEach(r => activeEmployeeIds.add(r.EmployeeID));
    absencesRaw.forEach(r => activeEmployeeIds.add(r.EmployeeID));

    console.log(`[OVERTIME-ONLY] Active employees: ${activeEmployeeIds.size}`);

    const activeEmployees = employees.filter(emp => activeEmployeeIds.has(emp.venus_employee_id));

    // Build grid
    const daysInMonth = eachDayOfInterval({
        start: parseISO(startDate),
        end: parseISO(endDate)
    });

    const finalData = activeEmployees.map(emp => {
        const empId = emp.venus_employee_id;
        const empName = emp.employee_name;
        const ptrjId = emp.ptrj_employee_id || 'N/A';
        const chargeJob = emp.charge_job || '-';

        const empData = {
            id: empId,
            name: empName,
            ptrjEmployeeID: ptrjId,
            chargeJob: chargeJob,  // Combined format, not split
            attendance: {}
        };

        daysInMonth.forEach(dateObj => {
            const dateStr = format(dateObj, 'yyyy-MM-dd');
            const dayNum = format(dateObj, 'd');
            const dayName = format(dateObj, 'EEE', { locale: id });
            const key = `${empId}_${dateStr}`;

            const isSun = isSunday(dateObj);
            const isSat = isSaturday(dateObj);
            const holidayName = holidayMap[dateStr] || null;
            const isHol = !!holidayName;

            const otHours = overtimeMap[key] || 0;
            const leave = leaveMap[key];
            const absence = absenceMap[key];

            let status = 'ALFA';
            let display = 'ALFA';
            let cssClass = 'hours-alfa';
            let regularHours = 0;

            // Priority 1: Absence
            if (absence) {
                if (absence.isUnpaid) {
                    status = 'ALFA';
                    display = 'ALFA';
                    cssClass = 'hours-alfa';
                } else {
                    status = absence.type;
                    display = absence.type;
                    cssClass = `absence-${absence.type.toLowerCase().replace(/ /g, '-')}`;
                }
            }
            // Priority 2: Has Overtime = Hadir (takes precedence over leave)
            else if (otHours > 0) {
                // If there's overtime, assume they worked regular hours too
                if (isHol) {
                    regularHours = isSat ? WORK_HOURS.SHORT : WORK_HOURS.NORMAL; // Holiday = paid regular hours
                    status = 'Hadir';
                    display = `LBR +${otHours.toFixed(1)}h`;
                    cssClass = 'hours-normal-overtime';
                } else if (isSun) {
                    regularHours = 0; // Sunday = rest day, no regular hours
                    status = 'Hadir';
                    display = `OFF +${otHours.toFixed(1)}h`;
                    cssClass = 'hours-overtime-only';
                } else if (isSat) {
                    regularHours = WORK_HOURS.SHORT; // Saturday = 5 hours regular
                    status = 'Hadir';
                    display = `✓ +${otHours.toFixed(1)}h`;
                    cssClass = 'hours-normal-overtime';
                } else {
                    regularHours = WORK_HOURS.NORMAL; // Weekday = 7 hours regular
                    status = 'Hadir';
                    display = `✓ +${otHours.toFixed(1)}h`;
                    cssClass = 'hours-normal-overtime';
                }
            }
            // Priority 3: Leave (only if NO overtime)
            else if (leave) {
                status = leave.type;
                display = leave.type;
                cssClass = `leave-${leave.type.toLowerCase()}`;
            }
            // Priority 4: Sunday/Holiday - Auto Hadir with OFF/LBR display
            else if (isSun) {
                status = 'Hadir';  // Counts as HK
                display = 'OFF';
                cssClass = 'hours-off';
                regularHours = 0;
            }
            else if (isHol) {
                status = 'Hadir';  // Counts as HK
                display = 'LBR';
                cssClass = 'hours-holiday';
                regularHours = isSat ? WORK_HOURS.SHORT : WORK_HOURS.NORMAL;
            }
            // Priority 5: No overtime, no record on working day = ALFA
            else {
                status = 'ALFA';
                display = 'ALFA';
                cssClass = 'hours-alfa';
            }

            // FINAL CONSISTENCY CHECK (Sync with Frontend Logic)
            // If status is Hadir/Partial In/Out but regularHours is 0, default to standard working hours.
            if ((status === 'Hadir' || status === 'Partial In' || status === 'Partial Out') && regularHours <= 0 && !isSun) {
                regularHours = isSat ? WORK_HOURS.SHORT : WORK_HOURS.NORMAL;
            }

            empData.attendance[dayNum] = {
                date: dateStr,
                dayName: dayName,
                status: status,
                display: display,
                class: cssClass,
                checkIn: null,
                checkOut: null,
                regularHours: regularHours,
                overtimeHours: otHours,
                isHoliday: isHol,
                holidayName: holidayName,
                isSunday: isSun,
                // Leave type info for automation - only set if leave is actually applied (no overtime)
                isAnnualLeave: (otHours === 0 && !absence && leave?.isAnnualLeave) || false,
                isSickLeave: (otHours === 0 && !absence && leave?.isSickLeave) || false,
                leaveTaskCode: (otHours === 0 && !absence && leave?.leaveTaskCode) || null,
                leaveDescription: (otHours === 0 && !absence && leave?.desc) || null
            };
        });

        return empData;
    });

    console.log(`[OVERTIME-ONLY] Processed ${finalData.length} employees`);
    return finalData;
};

module.exports = { fetchAttendanceData, fetchAttendanceDataOvertimeOnly };