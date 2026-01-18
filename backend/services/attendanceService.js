const { executeQuery } = require('./gateway');
// const { getPTRJMapping, matchPTRJEmployeeId } = require('./mappingService'); // Now unused
// const { getChargeJobMapFromDB } = require('./employeeMillService'); // Now unused
const { getAllEmployees, getHolidaysFromDB: fetchHolidaysFromMill } = require('./employeeMillService');

// const fs = require('fs'); // Unused
// const path = require('path'); // Unused
const axios = require('axios');
const { parseISO, format, isValid, eachDayOfInterval, startOfMonth, endOfMonth, getDay, addDays, isSunday, isSaturday, differenceInMinutes } = require('date-fns');
const { id } = require('date-fns/locale');

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

// --- Main Data Fetcher ---
const fetchAttendanceData = async (month, year) => {
    const startDate = format(startOfMonth(new Date(year, month - 1)), 'yyyy-MM-dd');
    const endDate = format(endOfMonth(new Date(year, month - 1)), 'yyyy-MM-dd');

    console.log(`Fetching ETL data for ${startDate} to ${endDate}`);

    // 1. Fetch ALL Data in Parallel
    const [
        employees, // Now from Employee Mill DB
        attendanceRaw,
        overtimeRaw,
        leavesRaw,
        absencesRaw,
        latestDateStr,
        holidayMap
    ] = await Promise.all([
        getAllEmployees(),
        fetchAttendanceRaw(startDate, endDate),
        fetchOvertimeRaw(startDate, endDate),
        fetchLeavesRaw(startDate, endDate),
        fetchAbsencesRaw(startDate, endDate),
        getLatestAvailableDate(),
        fetchHolidaysFromDB(startDate, endDate)
    ]);

    console.log(`[DEBUG] Latest Date Available: ${latestDateStr}`);

    console.log(`Data fetched: ${employees.length} employees (from Mill DB), ${attendanceRaw.length} attendance, ${overtimeRaw.length} overtime, ${leavesRaw.length} leaves, ${absencesRaw.length} absences, ${Object.keys(holidayMap).length} holidays`);

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
        dates.forEach(d => {
            leaveMap[`${row.EmployeeID}_${d}`] = {
                type: row.LeaveTypeCode,
                desc: row.LeaveTypeCode
            };
        });
        if (idx === 0) console.log(`[DEBUG] First leave: RefDate=${refDate}, expanded to ${dates.length} dates`);
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
    // Create a set of Employee IDs that have ANY data in the raw results
    const activeEmployeeIds = new Set();
    attendanceRaw.forEach(r => activeEmployeeIds.add(r.EmployeeID));
    overtimeRaw.forEach(r => activeEmployeeIds.add(r.EmployeeID));
    leavesRaw.forEach(r => activeEmployeeIds.add(r.EmployeeID));
    absencesRaw.forEach(r => activeEmployeeIds.add(r.EmployeeID));

    console.log(`[FILTER] Total active employees found in data sources: ${activeEmployeeIds.size}`);

    // Filter the master employee list using venus_employee_id (which maps to VenusHR EmployeeID)
    const activeEmployees = employees.filter(emp => activeEmployeeIds.has(emp.venus_employee_id));
    console.log(`[FILTER] Filtered employee list from ${employees.length} to ${activeEmployees.length}`);

    // 3. Build Grid
    const daysInMonth = eachDayOfInterval({
        start: parseISO(startDate),
        end: parseISO(endDate)
    });

    const finalData = activeEmployees.map(emp => {
        const empId = emp.venus_employee_id; // Using ID from Mill DB (matches Venus)
        const empName = emp.employee_name;   // Using Name from Mill DB
        const ptrjId = emp.ptrj_employee_id || 'N/A';

        // Parse Charge Job directly from object
        const chargeJobData = parseChargeJob(emp.charge_job);

        const empData = {
            id: empId,
            name: empName,
            ptrjEmployeeID: ptrjId,
            chargeJob: chargeJobData.full,
            chargeJobParts: {
                task_code: chargeJobData.task_code,
                station: chargeJobData.station,
                machine: chargeJobData.machine,
                expense: chargeJobData.expense
            },
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

            // Priority 1: Absence (HR_T_Absence)
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
            // Priority 2: Leave (HR_H_Leave)
            else if (leave) {
                status = leave.type;
                display = leave.type;
                cssClass = `leave-${leave.type.toLowerCase()}`;
            }
            // Priority 3: Holiday (Auto Present)
            else if (isHol) {
                // Auto Present Logic: "kalo hari libryu maka seharnya auto hadir semua ... hadir jam regular nya"
                status = 'Hadir'; // Counts as HK

                // Regular Hours Logic
                if (isSat) regularHours = 5;
                else regularHours = 7;

                // Display Logic
                if (otHours > 0) {
                    display = `LBR +${otHours.toFixed(1)}h`;
                    cssClass = 'hours-normal-overtime'; // Greenish
                } else {
                    display = 'LBR'; // Explicitly show it's holiday presence
                    cssClass = 'hours-full'; // Green
                }
            }
            // Priority 4: Sunday (Auto Present as Rest Day)
            else if (isSun) {
                status = 'Hadir'; // Counts as HK (Rest Day is paid)
                regularHours = 0; // No regular hours on Sunday

                if (otHours > 0) {
                    display = `OFF +${otHours.toFixed(1)}h`;
                    cssClass = 'hours-overtime-only';
                } else {
                    display = 'OFF';
                    cssClass = 'hours-off';
                }
            }
            // Priority 5: No Record (Absent on working day)
            else if (!att) {
                // Working day but absent -> ALFA
                status = 'ALFA';
                display = 'ALFA';
                cssClass = 'hours-alfa';
            }
            // Priority 5: Has Attendance Record (Normal working day)
            else {
                // Calculate Hours
                if (att.TACheckIn && att.TACheckOut) {
                    const start = new Date(att.TACheckIn);
                    const end = new Date(att.TACheckOut);
                    let diffHrs = (end - start) / (1000 * 60 * 60);
                    if (diffHrs < 0) diffHrs += 24; // Cross day fix

                    // Business Logic Caps
                    if (isSat) {
                        regularHours = Math.min(diffHrs, 5.0);
                    } else {
                        regularHours = Math.min(diffHrs, 7.0);
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
                    // Incomplete
                    if (isSat) regularHours = 5;
                    else regularHours = 7;

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
                isSunday: isSun
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
    // CRITICAL FIX: Always extract date-only part, even from ISO string
    // SQL Server returns "2025-09-01T00:00:00.000Z" but we need "2025-09-01"
    const d = typeof dateVal === 'string' ? new Date(dateVal) : new Date(dateVal);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split('T')[0]; // Always return YYYY-MM-DD
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
        holidayMap
    ] = await Promise.all([
        getAllEmployees(),
        fetchOvertimeRaw(startDate, endDate),
        fetchLeavesRaw(startDate, endDate),
        fetchAbsencesRaw(startDate, endDate),
        fetchHolidaysFromDB(startDate, endDate)
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
        dates.forEach(d => {
            leaveMap[`${row.EmployeeID}_${d}`] = {
                type: row.LeaveTypeCode,
                desc: row.LeaveTypeCode
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
        const chargeJobData = parseChargeJob(emp.charge_job);

        const empData = {
            id: empId,
            name: empName,
            ptrjEmployeeID: ptrjId,
            chargeJob: chargeJobData.full,
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
            // Priority 2: Leave
            else if (leave) {
                status = leave.type;
                display = leave.type;
                cssClass = `leave-${leave.type.toLowerCase()}`;
            }
            // Priority 3: Has Overtime = Hadir
            else if (otHours > 0) {
                // If there's overtime, assume they worked regular hours too
                if (isHol) {
                    regularHours = isSat ? 5 : 7; // Holiday = paid regular hours
                    status = 'Hadir';
                    display = `LBR +${otHours.toFixed(1)}h`;
                    cssClass = 'hours-normal-overtime';
                } else if (isSun) {
                    regularHours = 0; // Sunday = rest day, no regular hours
                    status = 'Hadir';
                    display = `OFF +${otHours.toFixed(1)}h`;
                    cssClass = 'hours-overtime-only';
                } else if (isSat) {
                    regularHours = 5; // Saturday = 5 hours regular
                    status = 'Hadir';
                    display = `✓ +${otHours.toFixed(1)}h`;
                    cssClass = 'hours-normal-overtime';
                } else {
                    regularHours = 7; // Weekday = 7 hours regular
                    status = 'Hadir';
                    display = `✓ +${otHours.toFixed(1)}h`;
                    cssClass = 'hours-normal-overtime';
                }
            }
            // Priority 4: Sunday/Holiday = Auto Present (Rest Day)
            else if (isSun || isHol) {
                status = 'Hadir'; // Counts as HK (paid rest day)
                regularHours = isHol ? (isSat ? 5 : 7) : 0; // Holiday gets regular hours, Sunday doesn't
                display = isHol ? 'LBR' : 'OFF';
                cssClass = 'hours-off';
            }
            // Priority 5: No overtime, no record on working day
            else {
                // No data = unknown/absent
                status = 'ALFA';
                display = 'ALFA';
                cssClass = 'hours-alfa';
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
                isSunday: isSun
            };
        });

        return empData;
    });

    console.log(`[OVERTIME-ONLY] Processed ${finalData.length} employees`);
    return finalData;
};

module.exports = { fetchAttendanceData, fetchAttendanceDataOvertimeOnly };