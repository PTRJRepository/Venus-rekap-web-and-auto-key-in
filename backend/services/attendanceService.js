const { executeQuery } = require('./gateway');
const axios = require('axios');
const { format, isSunday, isSaturday } = require('date-fns');

const CHARGE_JOB_URL = 'https://script.google.com/macros/s/AKfycbxy72FcKPhhuTJ3qT_DhJCLI8Z_xk9NmQlZ4mdmmtdZ-HDTHM8ER2RpYk40W--rmKjQ/exec';

// National holidays for 2026 (can be loaded from JSON file or database later)
const NATIONAL_HOLIDAYS = {
    '2026-01-01': 'Tahun Baru 2026',
    '2026-02-19': 'Isra Mikraj',
    '2026-03-14': 'Hari Raya Nyepi',
    '2026-03-30': 'Wafat Isa Almasih',
    '2026-04-03': 'Hari Raya Idul Fitri',
    '2026-04-04': 'Hari Raya Idul Fitri',
    '2026-05-01': 'Hari Buruh Internasional',
    '2026-05-13': 'Kenaikan Isa Almasih',
    '2026-05-23': 'Hari Raya Waisak',
    '2026-06-01': 'Hari Lahir Pancasila',
    '2026-06-10': 'Hari Raya Idul Adha',
    '2026-07-01': 'Tahun Baru Islam',
    '2026-08-17': 'Hari Kemerdekaan RI',
    '2026-09-10': 'Maulid Nabi Muhammad',
    '2026-12-25': 'Hari Raya Natal',
};

/**
 * Fetch PTRJ employee mapping from db_ptrj database
 * Maps Venus employee IDs and names to PTRJ Employee IDs
 */
const fetchPTRJEmployeeMapping = async () => {
    try {
        console.log('Fetching PTRJ employee mapping...');
        const query = `
            SELECT [EmpCode], [EmpName], [NewICNo]
            FROM [db_ptrj].[dbo].[HR_EMPLOYEE]
            WHERE [Status] = '1'
        `;

        const results = await executeQuery(query);
        const mapping = new Map();

        results.forEach(emp => {
            const empCode = emp.EmpCode ? emp.EmpCode.trim() : null;
            const empName = emp.EmpName ? emp.EmpName.trim() : null;
            const newICNo = emp.NewICNo ? emp.NewICNo.trim() : null;

            // Map by ID (highest priority)
            if (newICNo && empCode) {
                mapping.set(`id:${newICNo}`, empCode);
            }

            // Map by name (fallback)
            if (empName && empCode) {
                mapping.set(`name:${empName.toLowerCase()}`, empCode);
            }
        });

        console.log(`Loaded ${results.length} PTRJ employee mappings`);
        return mapping;
    } catch (error) {
        console.error('Error fetching PTRJ employee mapping:', error.message);
        return new Map();
    }
};

/**
 * Match Venus employee to PTRJ Employee ID
 * Priority: 1) IDNo match, 2) Exact name match, 3) Fuzzy name match
 */
const matchPTRJEmployeeID = (venusEmployee, ptrjMapping) => {
    if (!venusEmployee || !ptrjMapping || ptrjMapping.size === 0) {
        return 'N/A';
    }

    const idNo = venusEmployee.IDNo ? venusEmployee.IDNo.trim() : null;
    const empName = venusEmployee.EmployeeName ? venusEmployee.EmployeeName.trim() : null;

    // Priority 1: Match by IDNo
    if (idNo) {
        const idMatch = ptrjMapping.get(`id:${idNo}`);
        if (idMatch) {
            return idMatch;
        }
    }

    // Priority 2: Match by exact name
    if (empName) {
        const nameMatch = ptrjMapping.get(`name:${empName.toLowerCase()}`);
        if (nameMatch) {
            return nameMatch;
        }
    }

    // Priority 3: Fuzzy name matching
    if (empName) {
        const empNameLower = empName.toLowerCase();
        for (const [key, value] of ptrjMapping.entries()) {
            if (key.startsWith('name:')) {
                const ptrjName = key.substring(5);
                if (ptrjName.includes(empNameLower) || empNameLower.includes(ptrjName)) {
                    return value;
                }
            }
        }
    }

    return 'N/A';
};

/**
 * Fetch charge job data from Google Apps Script
 */
const fetchChargeJobs = async () => {
    try {
        const response = await axios.get(CHARGE_JOB_URL);
        let list = [];
        if (response.data.data) list = response.data.data;
        else if (response.data.employees) list = response.data.employees;
        else list = response.data;

        const map = new Map();
        if (Array.isArray(list)) {
            list.forEach(item => {
                const id = item.employeeId || item.EmployeeID || item.id;
                const name = item.employeeName || item.namaKaryawan || item.name;
                const job = item.chargeJob || item.charge_job || item.task_code_data;

                if (id) map.set(String(id).trim(), job);
                if (name) map.set(String(name).trim().toLowerCase(), job);
            });
        }
        return map;
    } catch (e) {
        console.error("Error fetching charge jobs:", e.message);
        return new Map();
    }
};

/**
 * Check if a date is a national holiday
 */
const isNationalHoliday = (dateStr) => {
    return dateStr in NATIONAL_HOLIDAYS;
};

/**
 * Get holiday name for a date
 */
const getHolidayName = (dateStr) => {
    return NATIONAL_HOLIDAYS[dateStr] || null;
};

/**
 * Main function to fetch attendance data for a month
 */
const fetchAttendanceData = async (month, year) => {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

    console.log(`Fetching data for range: ${startDate} to ${endDate}`);

    // 1. Fetch Employees (with IDNo for PTRJ matching)
    const empQuery = `
        SELECT DISTINCT emp.EmployeeID, emp.EmployeeName, emp.BusCode, emp.IDNo 
        FROM HR_M_EmployeePI emp 
        WHERE emp.EmployeeID IS NOT NULL AND emp.EmployeeName IS NOT NULL
        ORDER BY emp.EmployeeName
    `;

    // 2. Fetch Attendance
    const attQuery = `
        SELECT t.EmployeeID, t.TADate, t.TACheckIn, t.TACheckOut, t.Shift, 
        DATEDIFF(MINUTE, t.TACheckIn, t.TACheckOut) / 60.0 as TotalHours
        FROM HR_T_TAMachine_Summary t 
        WHERE t.TADate BETWEEN '${startDate}' AND '${endDate}'
    `;

    // 3. Fetch Overtime
    const otQuery = `
        SELECT ot.EmployeeID, ot.OTDate, ot.OTHourDuration 
        FROM HR_T_Overtime ot 
        WHERE ot.OTDate BETWEEN '${startDate}' AND '${endDate}' AND ot.OTHourDuration > 0
    `;

    // 4. Fetch Leave
    const leaveQuery = `
        SELECT l.EmployeeID, l.RefDate, l.LeaveTypeCode 
        FROM HR_H_Leave l 
        WHERE l.RefDate BETWEEN '${startDate}' AND '${endDate}'
    `;

    // 5. Fetch Absence
    const absQuery = `
        SELECT a.EmployeeID, a.FromDate, a.ToDate, a.AbsType
        FROM HR_T_Absence a 
        WHERE (a.FromDate <= '${endDate}' AND a.ToDate >= '${startDate}')
    `;

    try {
        const [employees, attendance, overtime, leaves, absences, chargeJobMap, ptrjMapping] = await Promise.all([
            executeQuery(empQuery),
            executeQuery(attQuery),
            executeQuery(otQuery),
            executeQuery(leaveQuery),
            executeQuery(absQuery),
            fetchChargeJobs(),
            fetchPTRJEmployeeMapping()
        ]);

        console.log(`Fetched: ${employees.length} employees, ${attendance.length} attendance records`);

        // Process Data - Map data for easy lookup
        const attMap = new Map();
        attendance.forEach(r => {
            const dateStr = new Date(r.TADate).toISOString().split('T')[0];
            attMap.set(`${r.EmployeeID}_${dateStr}`, r);
        });

        const otMap = new Map();
        overtime.forEach(r => {
            const dateStr = new Date(r.OTDate).toISOString().split('T')[0];
            const key = `${r.EmployeeID}_${dateStr}`;
            otMap.set(key, (otMap.get(key) || 0) + r.OTHourDuration);
        });

        const leaveMap = new Map();
        leaves.forEach(r => {
            const dateStr = new Date(r.RefDate).toISOString().split('T')[0];
            leaveMap.set(`${r.EmployeeID}_${dateStr}`, r);
        });

        // Expand Absence Ranges
        const absMap = new Map();
        absences.forEach(r => {
            let curr = new Date(r.FromDate < startDate ? startDate : r.FromDate);
            const end = new Date(r.ToDate > endDate ? endDate : r.ToDate);
            const type = r.AbsType;
            const isUnpaid = String(type).toLowerCase().includes('unpaid');

            while (curr <= end) {
                const dateStr = curr.toISOString().split('T')[0];
                absMap.set(`${r.EmployeeID}_${dateStr}`, { type, isUnpaid });
                curr.setDate(curr.getDate() + 1);
            }
        });

        // Build Matrix with enhanced cell data
        const matrix = employees.map(emp => {
            const days = {};
            const start = new Date(startDate);
            const end = new Date(endDate);

            // Get PTRJ Employee ID
            const ptrjEmployeeID = matchPTRJEmployeeID(emp, ptrjMapping);

            // Get Charge Job
            let chargeJob = chargeJobMap.get(String(emp.EmployeeID).trim()) ||
                chargeJobMap.get(String(emp.EmployeeName).trim().toLowerCase()) ||
                '-';

            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                const dateStr = d.toISOString().split('T')[0];
                const dayNum = d.getDate();
                const isSun = isSunday(d);
                const isSat = isSaturday(d);
                const isHoliday = isNationalHoliday(dateStr);
                const holidayName = getHolidayName(dateStr);

                // Get 3-letter Indonesian day name
                const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
                const dayName = dayNames[d.getDay()];

                // Priority Logic
                const abs = absMap.get(`${emp.EmployeeID}_${dateStr}`);
                const leave = leaveMap.get(`${emp.EmployeeID}_${dateStr}`);
                const att = attMap.get(`${emp.EmployeeID}_${dateStr}`);
                const ot = otMap.get(`${emp.EmployeeID}_${dateStr}`) || 0;

                let status = '';
                let regularHours = 0;
                let overtimeHours = ot;

                if (abs) {
                    status = abs.isUnpaid ? 'ALFA' : abs.type;
                    regularHours = 0;
                } else if (leave) {
                    status = leave.LeaveTypeCode;
                    regularHours = 0;
                } else if (att) {
                    if (att.TACheckIn && att.TACheckOut) {
                        status = 'Hadir';
                        regularHours = att.TotalHours || 0;
                    } else {
                        status = 'Hadir (Partial)';
                        regularHours = att.TotalHours || 0;
                    }
                } else {
                    if (isSun || isHoliday) {
                        status = ot > 0 ? 'Lembur' : 'OFF';
                        regularHours = 0;
                    } else {
                        status = 'ALFA';
                        regularHours = 0;
                    }
                }

                days[dayNum] = {
                    date: dateStr,
                    dayName: dayName,
                    status: status,
                    checkIn: att?.TACheckIn ? new Date(att.TACheckIn).toISOString().substr(11, 5) : null,
                    checkOut: att?.TACheckOut ? new Date(att.TACheckOut).toISOString().substr(11, 5) : null,
                    regularHours: regularHours,
                    overtimeHours: overtimeHours,
                    isHoliday: isHoliday,
                    holidayName: holidayName,
                    chargeJob: chargeJob
                };
            }

            return {
                id: emp.EmployeeID,
                name: emp.EmployeeName,
                ptrjEmployeeID: ptrjEmployeeID,
                chargeJob: chargeJob,
                attendance: days
            };
        });

        return matrix;

    } catch (error) {
        throw error;
    }
}

module.exports = { fetchAttendanceData };