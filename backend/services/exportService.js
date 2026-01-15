const fs = require('fs');
const path = require('path');
const { executeQuery } = require('./gateway');
const { fetchAttendanceData } = require('./attendanceService');
const { format } = require('date-fns');

// Path to export directory (D:\...\Refactor_web_Rekap_Absen\ekstrak absen)
// Assuming server.js is in backend/, we go up one level.
const EXPORT_DIR = path.resolve(__dirname, '../../ekstrak absen');

const ensureExportDir = () => {
    if (!fs.existsSync(EXPORT_DIR)) {
        fs.mkdirSync(EXPORT_DIR, { recursive: true });
    }
};

/**
 * Get list of employees who have ANY attendance/overtime/leave/absence data in the range.
 */
const getActiveEmployees = async (startDate, endDate) => {
    console.log(`[ExportService] Fetching active employees from ${startDate} to ${endDate}`);
    // We can check the main tables.
    // To be efficient, we can union the IDs from all relevant tables within the date range.
    
    const sql = `
        SELECT DISTINCT EmployeeID 
        FROM (
            SELECT EmployeeID FROM [VenusHR14].[dbo].[HR_T_TAMachine_Summary] WHERE TADate BETWEEN '${startDate}' AND '${endDate}'
            UNION
            SELECT EmployeeID FROM [VenusHR14].[dbo].[HR_T_Overtime] WHERE OTDate BETWEEN '${startDate}' AND '${endDate}' AND OTHourDuration > 0
            UNION
            SELECT EmployeeID FROM [VenusHR14].[dbo].[HR_H_Leave] WHERE RefDate BETWEEN '${startDate}' AND '${endDate}'
            UNION
            SELECT EmployeeID FROM [VenusHR14].[dbo].[HR_T_Absence] WHERE FromDate <= '${endDate}' AND ToDate >= '${startDate}'
        ) AS ActiveIDs
    `;

    try {
        const activeIdsResult = await executeQuery(sql);
        console.log(`[ExportService] Found ${activeIdsResult.length} active employee IDs.`);
        
        if (!activeIdsResult || activeIdsResult.length === 0) {
            return [];
        }

        const activeIds = new Set(activeIdsResult.map(r => r.EmployeeID));

        if (activeIds.size === 0) return [];

        // Now fetch details for these IDs
        const idsString = Array.from(activeIds).map(id => `'${id}'`).join(',');
        const empSql = `
            SELECT EmployeeID, EmployeeName, IDNo
            FROM [VenusHR14].[dbo].[HR_M_EmployeePI]
            WHERE EmployeeID IN (${idsString})
            ORDER BY EmployeeName
        `;

        const employees = await executeQuery(empSql);
        console.log(`[ExportService] Fetched details for ${employees.length} employees.`);
        return employees;
    } catch (error) {
        console.error("[ExportService] Error in getActiveEmployees:", error);
        throw error;
    }
};

/**
 * Export attendance data to JSON for specific employees and date range.
 * This reuses the fetchAttendanceData logic but we might need to iterate if it spans multiple months
 * or we can implement a custom fetcher for arbitrary ranges.
 * 
 * Since fetchAttendanceData is optimized for full months, let's use it if the range covers full months,
 * but for arbitrary ranges, it's safer to fetch the specific data or filter the monthly data.
 * 
 * Strategy:
 * 1. Identify which months are involved in [startDate, endDate].
 * 2. Fetch data for those months using fetchAttendanceData.
 * 3. Flatten and filter the results to the exact date range and employees.
 */
const exportToJSON = async (startDate, endDate, employeeIds) => {
    ensureExportDir();

    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Generate list of (month, year) pairs
    let current = new Date(start.getFullYear(), start.getMonth(), 1);
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
    
    const monthsToFetch = [];
    while (current <= endMonth) {
        monthsToFetch.push({ month: current.getMonth() + 1, year: current.getFullYear() });
        current.setMonth(current.getMonth() + 1);
    }

    let allData = [];

    // Fetch in parallel or sequence? Sequence is safer for memory if many months.
    for (const period of monthsToFetch) {
        console.log(`Fetching data for export: ${period.month}/${period.year}`);
        const monthData = await fetchAttendanceData(period.month, period.year);
        
        // Filter and process
        const processed = monthData
            .filter(emp => employeeIds.includes(emp.id)) // Filter employees
            .map(emp => {
                // Filter days within range
                const filteredAttendance = {};
                Object.values(emp.attendance).forEach(day => {
                    if (day.date >= startDate && day.date <= endDate) {
                        filteredAttendance[day.date] = day;
                    }
                });

                return {
                    EmployeeID: emp.id,
                    EmployeeName: emp.name,
                    PTRJEmployeeID: emp.ptrjEmployeeID,
                    ChargeJob: emp.chargeJob,
                    Attendance: filteredAttendance
                };
            });
        
        // Merge into allData (careful with duplicates if employee exists in multiple months - well, the structure is per-employee)
        // Actually, we want a list of employees, and each employee has a list of days.
        // If we fetch multiple months, we need to merge the 'Attendance' object for the same employee.
        
        processed.forEach(p => {
            let existing = allData.find(e => e.EmployeeID === p.EmployeeID);
            if (!existing) {
                existing = { ...p, Attendance: {} };
                allData.push(existing);
            }
            Object.assign(existing.Attendance, p.Attendance);
        });
    }

    // Sort by name
    allData.sort((a, b) => a.EmployeeName.localeCompare(b.EmployeeName));

    // Construct filename
    const timestamp = format(new Date(), 'yyyyMMdd_HHmmss');
    const filename = `export_attendance_${startDate}_to_${endDate}_${timestamp}.json`;
    const filePath = path.join(EXPORT_DIR, filename);

    const finalOutput = {
        metadata: {
            export_date: new Date().toISOString(),
            period_start: startDate,
            period_end: endDate,
            total_employees: allData.length
        },
        data: allData
    };

    fs.writeFileSync(filePath, JSON.stringify(finalOutput, null, 2), 'utf-8');
    
    return { 
        filename, 
        path: filePath, 
        count: allData.length 
    };
};

module.exports = {
    getActiveEmployees,
    exportToJSON
};
