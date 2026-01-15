const { executeQuery } = require('./gateway');
const { getPTRJMapping, matchPTRJEmployeeId } = require('./mappingService');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { parseISO, format, isValid, eachDayOfInterval, startOfMonth, endOfMonth, getDay, addDays, isSunday, isSaturday, differenceInMinutes } = require('date-fns');
const { id } = require('date-fns/locale');

const HOLIDAYS_PATH = path.join(__dirname, '../../../data/national_holidays_2025.json');
const CHARGE_JOB_DATA_URL = "https://script.google.com/macros/s/AKfycbxy72FcKPhhuTJ3qT_DhJCLI8Z_xk9NmQlZ4mdmmtdZ-HDTHM8ER2RpYk40W--rmKjQ/exec";

// --- Helper: Load Holidays ---
let holidaysCache = null;
const loadHolidays = () => {
    if (holidaysCache) return holidaysCache;
    try {
        if (fs.existsSync(HOLIDAYS_PATH)) {
            const data = JSON.parse(fs.readFileSync(HOLIDAYS_PATH, 'utf-8'));
            const dates = new Set(data.holidays.map(h => h.date));
            const info = {};
            data.holidays.forEach(h => info[h.date] = h.description);
            holidaysCache = { dates, info };
            return holidaysCache;
        }
    } catch (e) {
        console.error("Error loading holidays:", e);
    }
    return { dates: new Set(), info: {} };
};

const isNationalHoliday = (dateStr) => {
    const { dates } = loadHolidays();
    return dates.has(dateStr);
};

const getHolidayName = (dateStr) => {
    const { info } = loadHolidays();
    return info[dateStr] || null;
};

// --- Helper: Charge Jobs from Google Sheets ---
let chargeJobCache = null;
let chargeJobCacheTime = 0;
const CACHE_DURATION = 1000 * 60 * 15; // 15 minutes

const fetchChargeJobsFromGAS = async () => {
    if (chargeJobCache && (Date.now() - chargeJobCacheTime < CACHE_DURATION)) {
        return chargeJobCache;
    }

    try {
        console.log("Fetching charge jobs from Google Apps Script...");
        const response = await axios.get(CHARGE_JOB_DATA_URL, { timeout: 10000 });
        const data = response.data;

        let employees = [];
        if (data.data) employees = data.data;
        else if (data.employees) employees = data.employees;
        else if (Array.isArray(data)) employees = data;

        const map = {};
        employees.forEach(emp => {
            const name = (emp.namaKaryawan || emp.employeeName || emp.EmployeeName || emp.name || '').trim();
            const id = (emp.employeeId || emp.EmployeeID || emp.id || '').trim();
            const job = (emp.chargeJob || emp.charge_job || emp.ChargeJob || '').trim();

            // Parse charge job parts: TASK_CODE | STATION | MACHINE | EXPENSE
            const parts = job.split('|').map(p => p.trim());
            const chargeJobParsed = {
                full: job || '-',
                task_code: parts[0] || '-',
                station: parts[1] || '-',
                machine: parts[2] || '-',
                expense: parts[3] || '-'
            };

            if (id) map[id] = chargeJobParsed;
            if (name) map[name.toUpperCase()] = chargeJobParsed; // Fallback by name
        });

        chargeJobCache = map;
        chargeJobCacheTime = Date.now();
        console.log(`Cached ${Object.keys(map).length / 2} charge job records`); // Divide by 2 (ID + Name)
        return map;
    } catch (e) {
        console.error("Error fetching charge jobs from GAS:", e.message);
        return chargeJobCache || {}; // Return stale cache or empty
    }
};

// --- Helper: Leave Expansion ---
const calculateConsecutiveWorkingDays = (startDateStr, duration) => {
    if (duration <= 0) return [];

    let currentDate = parseISO(startDateStr);
    const leaveDates = [];
    let workingDaysCounted = 0;
    let iterations = 0;
    const maxIterations = duration * 5;

    while (workingDaysCounted < duration && iterations < maxIterations) {
        const dateStr = format(currentDate, 'yyyy-MM-dd');
        const isSun = isSunday(currentDate);
        const isHoliday = isNationalHoliday(dateStr);

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

// --- Main Data Fetcher ---
const fetchAttendanceData = async (month, year) => {
    const startDate = format(startOfMonth(new Date(year, month - 1)), 'yyyy-MM-dd');
    const endDate = format(endOfMonth(new Date(year, month - 1)), 'yyyy-MM-dd');

    console.log(`Fetching ETL data for ${startDate} to ${endDate}`);

    // 1. Fetch ALL Data in Parallel
    const [
        employees,
        attendanceRaw,
        overtimeRaw,
        leavesRaw,
        absencesRaw,
        chargeJobMap,
        ptrjMapping,
        latestDateStr
    ] = await Promise.all([
        fetchEmployees(),
        fetchAttendanceRaw(startDate, endDate),
        fetchOvertimeRaw(startDate, endDate),
        fetchLeavesRaw(startDate, endDate),
        fetchAbsencesRaw(startDate, endDate),
        fetchChargeJobsFromGAS(),
        Promise.resolve(getPTRJMapping()),
        getLatestAvailableDate()
    ]);

    console.log(`Data fetched: ${employees.length} employees, ${attendanceRaw.length} attendance, ${overtimeRaw.length} overtime, ${leavesRaw.length} leaves, ${absencesRaw.length} absences`);

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
        const dates = calculateConsecutiveWorkingDays(refDate, duration);
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

    // Filter the master employee list
    const activeEmployees = employees.filter(emp => activeEmployeeIds.has(emp.EmployeeID));
    console.log(`[FILTER] Filtered employee list from ${employees.length} to ${activeEmployees.length}`);

    // 3. Build Grid
    const daysInMonth = eachDayOfInterval({
        start: parseISO(startDate),
        end: parseISO(endDate)
    });

    const finalData = activeEmployees.map(emp => {
        const empId = emp.EmployeeID;
        const empName = emp.EmployeeName;

        // Match PTRJ ID
        const ptrjId = matchPTRJEmployeeId(emp, ptrjMapping);

        // Match Charge Job (Try ID, then Name)
        let chargeJobData = chargeJobMap[empId] || chargeJobMap[empName.toUpperCase()] || { full: '-', task_code: '-', station: '-', machine: '-', expense: '-' };

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
            const holidayName = getHolidayName(dateStr);
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
            // Priority 3: No Record (Absent)
            else if (!att) {
                if (isSun || isHol) {
                    if (otHours > 0) {
                        status = 'Lembur';
                        display = otHours.toFixed(1) + 'h'; // Only show overtime hours
                        cssClass = 'hours-overtime-only';
                    } else {
                        status = 'OFF';
                        display = 'OFF';
                        cssClass = 'hours-off';
                    }
                } else {
                    // Working day but absent -> ALFA
                    status = 'ALFA';
                    display = 'ALFA';
                    cssClass = 'hours-alfa';
                }
            }
            // Priority 4: Has Attendance Record
            else {
                // Calculate Hours
                if (att.TACheckIn && att.TACheckOut) {
                    const start = new Date(att.TACheckIn);
                    const end = new Date(att.TACheckOut);
                    let diffHrs = (end - start) / (1000 * 60 * 60);
                    if (diffHrs < 0) diffHrs += 24; // Cross day fix

                    // Business Logic Caps
                    if (isSun || isHol) {
                        regularHours = 0; // All OT
                    } else if (isSat) {
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
                    if (isSun || isHol) regularHours = 0;
                    else if (isSat) regularHours = 5;
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

const fetchEmployees = async () => {
    const sql = `
        SELECT EmployeeID, EmployeeName, IDNo
        FROM [VenusHR14].[dbo].[HR_M_EmployeePI]
        WHERE EmployeeID IS NOT NULL
        ORDER BY EmployeeName
    `;
    return await executeQuery(sql);
};

const fetchAttendanceRaw = async (start, end) => {
    const sql = `
        SELECT EmployeeID, TADate, TACheckIn, TACheckOut, Shift
        FROM [VenusHR14].[dbo].[HR_T_TAMachine_Summary]
        WHERE TADate BETWEEN '${start}' AND '${end}'
    `;
    return await executeQuery(sql);
};

const fetchOvertimeRaw = async (start, end) => {
    const sql = `
        SELECT EmployeeID, OTDate, OTHourDuration
        FROM [VenusHR14].[dbo].[HR_T_Overtime]
        WHERE OTDate BETWEEN '${start}' AND '${end}' AND OTHourDuration > 0
    `;
    return await executeQuery(sql);
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

module.exports = { fetchAttendanceData };