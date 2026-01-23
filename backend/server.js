const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { parseISO, format, getDay, isSunday } = require('date-fns');
const { fetchAttendanceData, fetchAttendanceDataOvertimeOnly } = require('./services/attendanceService');
const stagingService = require('./services/stagingService');
const { getChargeJobsForMonth } = require('./services/chargeJobService'); // Still useful for monthly view
const { executeQuery } = require('./services/gateway'); // Direct query if needed
const { getPTRJMapping, matchPTRJEmployeeId } = require('./services/mappingService');
const exportService = require('./services/exportService');
const { updateEmployee, getAllEmployees, upsertEmployee } = require('./services/employeeMillService');
const { saveAutomationData, startAutomationProcess } = require('./services/automationService');
const { queryTaskRegData, compareWithTaskReg, getSyncSummaryByEmployee } = require('./services/comparisonService');

require('dotenv').config();

// --- Helper Functions for Holidays ---
let holidaysCache = null;
const HOLIDAYS_PATH = path.join(__dirname, '../../data/national_holidays_2025.json');

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

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Allow large payloads

// --- Attendance Routes ---

app.get('/api/months', async (req, res) => {
    try {
        // Optimized query: Just get distinct Year/Month combinations
        const sql = `
            SELECT DISTINCT 
                YEAR(TADate) as year, 
                MONTH(TADate) as month,
                DATENAME(month, TADate) as month_name
            FROM [VenusHR14].[dbo].[HR_T_TAMachine_Summary]
            GROUP BY YEAR(TADate), MONTH(TADate), DATENAME(month, TADate)
            ORDER BY year DESC, month DESC
        `;
        const result = await executeQuery(sql);

        // Format for frontend
        const months = result.map(row => ({
            year: row.year,
            month: row.month,
            month_name: row.month_name,
            display_name: `${row.month_name} ${row.year}`,
            record_count: 0, // Placeholder - would need actual count from summary query
            employee_count: 0 // Placeholder - would need actual count from summary query
        }));

        res.json({ success: true, data: months });
    } catch (error) {
        console.error("Error fetching months:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/attendance', async (req, res) => {
    const { month, year } = req.query;
    const noAttendance = process.env.NO_ATTENDANCE === 'true';
    console.log(`Received request for attendance: ${month}/${year} (no-attendance: ${noAttendance})`);

    if (!month || !year) return res.status(400).json({ error: 'Month and Year required' });

    try {
        // Use overtime-only mode if NO_ATTENDANCE is enabled
        const data = noAttendance
            ? await fetchAttendanceDataOvertimeOnly(parseInt(month), parseInt(year))
            : await fetchAttendanceData(parseInt(month), parseInt(year));

        // Format response to match frontend expectations
        res.json({
            success: true,
            data: data,
            month_name: new Date(year, month - 1).toLocaleString('id-ID', { month: 'long' }),
            year: parseInt(year),
            days_in_month: new Date(year, month, 0).getDate(),
            data_availability: {
                available_days_count: new Date(year, month, 0).getDate(),
                total_days_in_month: new Date(year, month, 0).getDate(),
                has_unavailable_dates: false,
                latest_available_date: new Date(year, month - 1, new Date(year, month, 0).getDate()).toISOString().split('T')[0]
            }
        });
    } catch (error) {
        console.error("API Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Enhanced monthly grid endpoint that matches the original Python application
app.get('/api/monthly-grid', async (req, res) => {
    const { month, year, bus_code } = req.query;
    const noAttendance = process.env.NO_ATTENDANCE === 'true';
    console.log(`Received request for monthly grid: ${month}/${year}, bus_code: ${bus_code} (no-attendance: ${noAttendance})`);

    if (!month || !year) return res.status(400).json({ error: 'Month and Year required' });

    try {
        // Use overtime-only mode if NO_ATTENDANCE is enabled
        const data = noAttendance
            ? await fetchAttendanceDataOvertimeOnly(parseInt(month), parseInt(year))
            : await fetchAttendanceData(parseInt(month), parseInt(year));

        // Process data into grid format
        const daysInMonth = new Date(year, month, 0).getDate();
        const monthName = new Date(year, month - 1).toLocaleString('id-ID', { month: 'long' });

        // Create grid data structure
        const gridData = data.map((emp, index) => {
            const days = {};

            // Initialize all days in the month
            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

                // Find corresponding attendance data for this day
                const dayData = emp.attendance ? emp.attendance[day.toString()] : null;

                if (dayData) {
                    days[day] = {
                        date: dayData.date,
                        dayName: dayData.dayName,
                        status: dayData.status,
                        checkIn: dayData.checkIn,
                        checkOut: dayData.checkOut,
                        regularHours: dayData.regularHours,
                        overtimeHours: dayData.overtimeHours,
                        chargeJob: dayData.chargeJob,
                        isHoliday: dayData.isHoliday,
                        holidayName: dayData.holidayName,
                        isSunday: dayData.isSunday
                    };
                } else {
                    // Default values for days without data
                    const dateObj = new Date(dateStr);
                    const isSunday = dateObj.getDay() === 0;
                    const holidayName = getHolidayName(dateStr);
                    const isNationalHoliday = !!holidayName;

                    days[day] = {
                        date: dateStr,
                        dayName: dateObj.toLocaleString('id-ID', { weekday: 'short' }),
                        status: (isSunday || isNationalHoliday) ? 'OFF' : 'ALFA',
                        checkIn: null,
                        checkOut: null,
                        regularHours: 0,
                        overtimeHours: 0,
                        chargeJob: '-',
                        isHoliday: isNationalHoliday,
                        holidayName: holidayName,
                        isSunday: isSunday
                    };
                }
            }

            return {
                No: index + 1,
                EmployeeID: emp.id || emp.EmployeeID,
                EmployeeName: emp.name || emp.EmployeeName,
                PTRJEmployeeID: emp.ptrjEmployeeID || emp.PTRJEmployeeID || 'N/A',
                days: days
            };
        });

        res.json({
            success: true,
            year: parseInt(year),
            month: parseInt(month),
            month_name: monthName,
            days_in_month: daysInMonth,
            grid_data: gridData,
            total_employees: gridData.length,
            date_range: `${monthName} ${year}`,
            data_availability: {
                latest_available_date: new Date(year, month - 1, daysInMonth).toISOString().split('T')[0],
                available_days_count: daysInMonth,
                total_days_in_month: daysInMonth,
                has_unavailable_dates: false
            }
        });
    } catch (error) {
        console.error("API Error in monthly-grid:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Monthly Grid Overtime-Only Mode ---
// Same as monthly-grid but uses only Overtime table for attendance data
app.get('/api/monthly-grid-overtime-only', async (req, res) => {
    const { month, year } = req.query;
    console.log(`[OVERTIME-ONLY GRID] Received request: ${month}/${year}`);

    if (!month || !year) return res.status(400).json({ error: 'Month and Year required' });

    try {
        // Use overtime-only data fetcher
        const data = await fetchAttendanceDataOvertimeOnly(parseInt(month), parseInt(year));

        // Process data into grid format
        const daysInMonth = new Date(year, month, 0).getDate();
        const monthName = new Date(year, month - 1).toLocaleString('id-ID', { month: 'long' });

        // Create grid data structure
        const gridData = data.map((emp, index) => {
            const days = {};

            // Initialize all days in the month
            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

                // Find corresponding attendance data for this day
                const dayData = emp.attendance ? emp.attendance[day.toString()] : null;

                if (dayData) {
                    days[day] = {
                        date: dayData.date,
                        dayName: dayData.dayName,
                        status: dayData.status,
                        checkIn: dayData.checkIn,
                        checkOut: dayData.checkOut,
                        regularHours: dayData.regularHours,
                        overtimeHours: dayData.overtimeHours,
                        chargeJob: emp.chargeJob || '-',
                        isHoliday: dayData.isHoliday,
                        holidayName: dayData.holidayName,
                        isSunday: dayData.isSunday
                    };
                } else {
                    // Default values for days without data
                    const dateObj = new Date(dateStr);
                    const isSunday = dateObj.getDay() === 0;
                    const holidayName = getHolidayName(dateStr);
                    const isNationalHoliday = !!holidayName;

                    days[day] = {
                        date: dateStr,
                        dayName: dateObj.toLocaleString('id-ID', { weekday: 'short' }),
                        status: (isSunday || isNationalHoliday) ? 'OFF' : 'ALFA',
                        checkIn: null,
                        checkOut: null,
                        regularHours: 0,
                        overtimeHours: 0,
                        chargeJob: '-',
                        isHoliday: isNationalHoliday,
                        holidayName: holidayName,
                        isSunday: isSunday
                    };
                }
            }

            return {
                No: index + 1,
                EmployeeID: emp.id || emp.EmployeeID,
                EmployeeName: emp.name || emp.EmployeeName,
                PTRJEmployeeID: emp.ptrjEmployeeID || emp.PTRJEmployeeID || 'N/A',
                ChargeJob: emp.chargeJob || '-',
                days: days
            };
        });

        res.json({
            success: true,
            mode: 'overtime-only',
            year: parseInt(year),
            month: parseInt(month),
            month_name: monthName,
            days_in_month: daysInMonth,
            grid_data: gridData,
            total_employees: gridData.length,
            date_range: `${monthName} ${year} (Overtime-Only Mode)`
        });
    } catch (error) {
        console.error("[OVERTIME-ONLY GRID] Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Export Routes ---

app.get('/api/export-options/employees', async (req, res) => {
    console.log(`[API] /api/export-options/employees hit with params:`, req.query);
    try {
        const { start_date, end_date } = req.query;
        if (!start_date || !end_date) {
            console.warn("[API] Missing start_date or end_date");
            return res.status(400).json({ success: false, error: 'Start date and End date required' });
        }

        const employees = await exportService.getActiveEmployees(start_date, end_date);
        res.json({ success: true, data: employees });
    } catch (error) {
        console.error("Error fetching active employees:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/export', async (req, res) => {
    try {
        const { start_date, end_date, employee_ids } = req.body;

        if (!start_date || !end_date || !employee_ids || !Array.isArray(employee_ids)) {
            return res.status(400).json({ success: false, error: 'Invalid parameters' });
        }

        const result = await exportService.exportToJSON(start_date, end_date, employee_ids);
        res.json({ success: true, data: result });
    } catch (error) {
        console.error("Export error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Staging Routes (Replicating web_app.py) ---

app.get('/api/staging/data', async (req, res) => {
    try {
        const filters = {
            status: req.query.status,
            start_date: req.query.start_date,
            end_date: req.query.end_date,
            employee_id: req.query.employee_id,
            limit: req.query.limit ? parseInt(req.query.limit) : 1000,
            offset: req.query.offset ? parseInt(req.query.offset) : 0
        };
        const data = await stagingService.getStagingData(filters);

        // Enhance with structure if needed (e.g. grouped) but flat is fine for basic table
        res.json({ success: true, data: data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/staging/data', async (req, res) => {
    try {
        const { records } = req.body;
        if (!records || !Array.isArray(records)) {
            return res.status(400).json({ success: false, error: 'Records array required' });
        }

        let added = 0;
        for (const record of records) {
            await stagingService.addStagingRecord(record);
            added++;
        }

        res.json({ success: true, message: `Added ${added} records`, added_records: added });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/staging/data/:id', async (req, res) => {
    try {
        await stagingService.deleteStagingRecord(req.params.id);
        res.json({ success: true, message: 'Record deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/staging/delete-all', async (req, res) => {
    try {
        await stagingService.deleteAllStaging();
        res.json({ success: true, message: 'All staging data deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Selective Copy Route ---
app.post('/api/staging/selective-copy', async (req, res) => {
    try {
        const { start_date, end_date, employee_ids } = req.body;
        if (!start_date || !end_date || !employee_ids) {
            return res.status(400).json({ success: false, error: 'Missing parameters' });
        }

        // 1. Fetch source data (using attendanceService's logic but filtered)
        // Since fetchAttendanceData works on full months, we might need a more granular fetcher
        // Or we just re-use the logic but manually construct queries.
        // For simplicity/speed in this refactor, let's use the gateway directly here to be precise.

        // Fetch Attendance
        const attSql = `
            SELECT EmployeeID, TADate, TACheckIn, TACheckOut
            FROM HR_T_TAMachine_Summary
            WHERE TADate BETWEEN '${start_date}' AND '${end_date}'
            AND EmployeeID IN (${employee_ids.map(id => `'${id}'`).join(',')})
        `;
        const attendance = await executeQuery(attSql);

        // Fetch Employees for Names
        const empSql = `SELECT EmployeeID, EmployeeName, IDNo FROM HR_M_EmployeePI WHERE EmployeeID IN (${employee_ids.map(id => `'${id}'`).join(',')})`;
        const employees = await executeQuery(empSql);
        const empMap = {};
        employees.forEach(e => empMap[e.EmployeeID] = e);

        // Fetch Overtime
        const otSql = `SELECT EmployeeID, OTDate, OTHourDuration FROM HR_T_Overtime WHERE OTDate BETWEEN '${start_date}' AND '${end_date}' AND EmployeeID IN (${employee_ids.map(id => `'${id}'`).join(',')})`;
        const overtime = await executeQuery(otSql);
        const otMap = {};
        overtime.forEach(o => {
            const k = `${o.EmployeeID}_${new Date(o.OTDate).toISOString().split('T')[0]}`;
            otMap[k] = (otMap[k] || 0) + parseFloat(o.OTHourDuration || 0);
        });

        // Get Charge Jobs (from local SQLite logic or just use existing)
        // We'll try to find matches in our local charge job DB if possible, or leave empty
        // The Python app fetched from GAS. Here we assume we rely on what's available or user input.
        // For now, let's leave charge jobs blank or basic.

        const ptrjMapping = getPTRJMapping();

        let processed = 0;
        for (const att of attendance) {
            const emp = empMap[att.EmployeeID] || { EmployeeName: 'Unknown' };
            const dateStr = new Date(att.TADate).toISOString().split('T')[0];
            const ot = otMap[`${att.EmployeeID}_${dateStr}`] || 0;

            // Calculate Regular Hours (Simple logic)
            let reg = 0;
            if (att.TACheckIn && att.TACheckOut) {
                const start = new Date(att.TACheckIn);
                const end = new Date(att.TACheckOut);
                reg = (end - start) / (1000 * 60 * 60);
                if (reg > 7) reg = 7;
                if (reg < 0) reg = 0;
            }

            const record = {
                employee_id: att.EmployeeID,
                employee_name: emp.EmployeeName,
                ptrj_employee_id: matchPTRJEmployeeId(emp, ptrjMapping),
                date: dateStr,
                check_in: att.TACheckIn ? new Date(att.TACheckIn).toISOString().split('T')[1].substring(0, 5) : null,
                check_out: att.TACheckOut ? new Date(att.TACheckOut).toISOString().split('T')[1].substring(0, 5) : null,
                regular_hours: reg,
                overtime_hours: ot,
                source_record_id: `copy_${att.EmployeeID}_${dateStr}`,
                notes: 'Selective Copy'
            };

            await stagingService.addStagingRecord(record);
            processed++;
        }

        res.json({ success: true, message: `Copied ${processed} records`, count: processed });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Helper Data Routes ---

app.get('/api/employees', async (req, res) => {
    try {
        const sql = `SELECT EmployeeID, EmployeeName FROM HR_M_EmployeePI WHERE EmployeeID IS NOT NULL ORDER BY EmployeeName`;
        const data = await executeQuery(sql);
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Employee Mill Routes (extend_db_ptrj) ---

// Get all employees from employee_mill table
app.get('/api/employee-mill', async (req, res) => {
    try {
        const employees = await getAllEmployees();
        res.json({ success: true, data: employees });
    } catch (error) {
        console.error('Error fetching employee_mill:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update employee data (PTRJ ID, Charge Job, Name) - Auto-inserts if not exists
app.patch('/api/employee-mill/:venusId', async (req, res) => {
    try {
        const { venusId } = req.params;
        const { ptrj_employee_id, charge_job, employee_name, is_karyawan } = req.body;

        console.log(`[API] Upsert employee ${venusId}:`, { ptrj_employee_id, charge_job, employee_name, is_karyawan });

        // Use upsertEmployee to auto-insert if not exists
        const result = await upsertEmployee(venusId, { ptrj_employee_id, charge_job, employee_name, is_karyawan });

        if (result.success) {
            res.json({ success: true, message: result.message });
        } else {
            res.status(400).json({ success: false, error: result.message });
        }
    } catch (error) {
        console.error('Error updating employee:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Debug Routes ---

// Debug endpoint to check attendance data for specific employee/date
app.get('/api/debug/attendance', async (req, res) => {
    try {
        const { employee_id, date, month, year } = req.query;
        const result = {
            query: { employee_id, date, month, year },
            data: {}
        };

        // Build date range
        let startDate, endDate;
        if (date) {
            startDate = date;
            endDate = date;
        } else if (month && year) {
            startDate = `${year}-${String(month).padStart(2, '0')}-01`;
            const lastDay = new Date(year, month, 0).getDate();
            endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        } else {
            return res.status(400).json({ success: false, error: 'Need either date or month+year' });
        }

        // Query HR_T_TAMachine_Summary
        const attSql = employee_id
            ? `SELECT * FROM [VenusHR14].[dbo].[HR_T_TAMachine_Summary] WHERE TADate BETWEEN '${startDate}' AND '${endDate}' AND EmployeeID = '${employee_id}'`
            : `SELECT TOP 100 * FROM [VenusHR14].[dbo].[HR_T_TAMachine_Summary] WHERE TADate BETWEEN '${startDate}' AND '${endDate}'`;
        result.data.attendance = await executeQuery(attSql);

        // Query HR_H_Leave
        const leaveSql = employee_id
            ? `SELECT * FROM [VenusHR14].[dbo].[HR_H_Leave] WHERE RefDate BETWEEN '${startDate}' AND '${endDate}' AND EmployeeID = '${employee_id}'`
            : `SELECT TOP 100 * FROM [VenusHR14].[dbo].[HR_H_Leave] WHERE RefDate BETWEEN '${startDate}' AND '${endDate}'`;
        result.data.leave = await executeQuery(leaveSql);

        // Query HR_T_Absence
        const absSql = employee_id
            ? `SELECT * FROM [VenusHR14].[dbo].[HR_T_Absence] WHERE FromDate <= '${endDate}' AND ToDate >= '${startDate}' AND EmployeeID = '${employee_id}'`
            : `SELECT TOP 100 * FROM [VenusHR14].[dbo].[HR_T_Absence] WHERE FromDate <= '${endDate}' AND ToDate >= '${startDate}'`;
        result.data.absence = await executeQuery(absSql);

        // Query HR_T_TimeAttendanceWeekly (employee list source)
        if (employee_id) {
            const weeklySql = `SELECT DISTINCT EmployeeID FROM [VenusHR14].[dbo].[HR_T_TimeAttendanceWeekly] WHERE EmployeeID = '${employee_id}'`;
            result.data.weeklyEmployee = await executeQuery(weeklySql);
        }

        // Summary
        result.summary = {
            attendanceCount: result.data.attendance?.length || 0,
            leaveCount: result.data.leave?.length || 0,
            absenceCount: result.data.absence?.length || 0,
            inWeeklyTable: result.data.weeklyEmployee?.length > 0 || 'not checked'
        };

        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Debug query error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Comparison Routes (Millware Sync Validation) ---

// Query PR_TASKREGLN data directly
app.get('/api/comparison/task-reg', async (req, res) => {
    try {
        const { start_date, end_date, emp_codes, ot_filter } = req.query;

        if (!start_date || !end_date) {
            return res.status(400).json({ success: false, error: 'start_date and end_date required' });
        }

        const empCodeArray = emp_codes ? emp_codes.split(',') : null;
        // ot_filter: 0 = normal hours only, 1 = overtime only, undefined/null = all
        const otFilterValue = ot_filter !== undefined ? parseInt(ot_filter) : null;
        const data = await queryTaskRegData(start_date, end_date, empCodeArray, otFilterValue);

        res.json({
            success: true,
            data,
            count: data.length,
            period: { start: start_date, end: end_date },
            otFilter: otFilterValue
        });
    } catch (error) {
        console.error('Error querying PR_TASKREGLN:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Compare Venus attendance with Millware PR_TASKREGLN
app.post('/api/comparison/compare', async (req, res) => {
    try {
        const { employees, startDate, endDate } = req.body;

        if (!employees || !Array.isArray(employees) || !startDate || !endDate) {
            return res.status(400).json({ success: false, error: 'employees array, startDate, endDate required' });
        }

        console.log(`[Comparison] Comparing ${employees.length} employees for ${startDate} to ${endDate}`);
        const result = await compareWithTaskReg(employees, startDate, endDate);

        res.json({
            success: true,
            ...result,
            period: { start: startDate, end: endDate }
        });
    } catch (error) {
        console.error('Error comparing data:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get sync summary by employee
app.get('/api/comparison/summary', async (req, res) => {
    try {
        const { start_date, end_date, emp_codes } = req.query;

        if (!start_date || !end_date) {
            return res.status(400).json({ success: false, error: 'start_date and end_date required' });
        }

        const empCodeArray = emp_codes ? emp_codes.split(',') : null;
        const data = await getSyncSummaryByEmployee(start_date, end_date, empCodeArray);

        res.json({ success: true, data });
    } catch (error) {
        console.error('Error getting sync summary:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Automation Routes ---

app.post('/api/automation/run', async (req, res) => {
    const { employees, month, year, startDate, endDate, onlyOvertime } = req.body;
    if (!employees || !Array.isArray(employees)) {
        return res.status(400).json({ error: 'Invalid data format. Expected { employees: [] }' });
    }

    try {
        console.log(`[Automation] Request to run for ${employees.length} employees (${month}/${year})`);
        if (startDate && endDate) console.log(`[Automation] Date Filter: ${startDate} to ${endDate}`);
        if (onlyOvertime) console.log(`[Automation] Mode: ONLY OVERTIME`);

        // Save data to current_data.json (fixed filename)
        saveAutomationData({ employees, month, year, startDate, endDate, onlyOvertime });
        console.log(`[Automation] Data saved to current_data.json`);

        // Start process (uses current_data.json automatically)
        const child = startAutomationProcess();

        // Handle spawn errors
        child.on('error', (err) => {
            console.error('[Automation] Spawn error:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: `Failed to start automation: ${err.message}` });
            }
        });

        // Setup Streaming Response
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const sendChunk = (type, data) => {
            try {
                res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
            } catch (e) {
                // Client may have disconnected
            }
        };

        sendChunk('status', 'starting');
        sendChunk('info', `Process started with ${employees.length} employees`);

        child.stdout.on('data', (data) => {
            data.toString().split('\n').forEach(line => {
                if (line.trim()) {
                    console.log(`[AutoEngine] ${line.trim()}`);
                    sendChunk('log', line.trim());
                }
            });
        });

        child.stderr.on('data', (data) => {
            data.toString().split('\n').forEach(line => {
                if (line.trim()) {
                    console.error(`[AutoEngine Err] ${line.trim()}`);
                    sendChunk('error', line.trim());
                }
            });
        });

        child.on('close', (code) => {
            console.log(`[Automation] Process exited with code ${code}`);
            sendChunk('status', code === 0 ? 'completed' : 'failed');
            sendChunk('done', { code });
            try { res.end(); } catch (e) { }
        });

        // DON'T kill process on client disconnect - let it run!
        req.on('close', () => {
            console.log('[Automation] Client disconnected (process continues running)');
        });

    } catch (error) {
        console.error('[Automation] Setup Error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
        }
    }
});

// --- Serve Frontend ---
// In production, serve the 'dist' folder
const frontendDist = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendDist));

app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(frontendDist, 'index.html'));
});

// Initialize Staging DB
stagingService.initStagingDB().then(() => {
    // --- Start Server on Network (0.0.0.0) ---
    const PORT = process.env.PORT || 5000;
    const HOST = '0.0.0.0'; // Listen on all network interfaces

    app.listen(PORT, HOST, () => {
        console.log(`\n${'='.repeat(50)}`);
        console.log(`  Venus Attendance Backend Server`);
        console.log(`${'='.repeat(50)}`);
        console.log(`  Status: ✓ RUNNING`);
        console.log(`  Port: ${PORT}`);
        console.log(`  Host: ${HOST} (Network accessible)`);
        console.log(`  Local URL: http://localhost:${PORT}`);
        console.log(`  Network URL: http://<YOUR-IP>:${PORT}`);
        console.log(`${'='.repeat(50)}\n`);
    });
});
