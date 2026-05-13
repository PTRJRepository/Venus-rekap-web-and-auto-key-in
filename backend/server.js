const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { parseISO, format, getDay, isSunday } = require('date-fns');
const { fetchAttendanceData, fetchAttendanceDataOvertimeOnly } = require('./services/attendanceService');
const stagingService = require('./services/stagingService');
const { getChargeJobsForMonth } = require('./services/chargeJobService'); // Still useful for monthly view
const { executeQuery } = require('./services/gateway'); // Direct query if needed
const { getLatestAttendancePeriod } = require('./services/latestPeriodService');
const { getPTRJMapping, matchPTRJEmployeeId } = require('./services/mappingService');
const exportService = require('./services/exportService');
const { updateEmployee, getAllEmployees, upsertEmployee } = require('./services/employeeMillService');
const { saveAutomationData, startAutomationProcess, stopAutomationProcess } = require('./services/automationService');
const { queryTaskRegData, compareWithTaskReg, getMissData, getSyncSummaryByEmployee } = require('./services/comparisonService');
const validationService = require('./services/validationService');
const { fetchPayrollData } = require('./services/payrollService');
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

app.get('/api/latest-period', async (req, res) => {
    try {
        const period = await getLatestAttendancePeriod(executeQuery);
        res.json({ success: true, ...period });
    } catch (error) {
        console.error("Error fetching latest period:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/attendance', async (req, res) => {
    const { month, year, showStaff } = req.query;
    const noAttendance = process.env.NO_ATTENDANCE === 'true';
    const showStaffFlag = showStaff === 'true';
    console.log(`Received request for attendance: ${month}/${year} (no-attendance: ${noAttendance}, showStaff: ${showStaffFlag})`);

    if (!month || !year) return res.status(400).json({ error: 'Month and Year required' });

    try {
        // Use overtime-only mode if NO_ATTENDANCE is enabled
        const data = noAttendance
            ? await fetchAttendanceDataOvertimeOnly(parseInt(month), parseInt(year), { showStaff: showStaffFlag })
            : await fetchAttendanceData(parseInt(month), parseInt(year), { showStaff: showStaffFlag });

        // Handle empty state from service
        if (data && data.emptyState) {
            return res.json({
                success: true,
                data: [],
                warning: data.message,
                emptyState: true,
                month_name: new Date(year, month - 1).toLocaleString('id-ID', { month: 'long' }),
                year: parseInt(year),
                days_in_month: new Date(year, month, 0).getDate()
            });
        }

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

app.get('/api/payroll', async (req, res) => {
    const { month, year } = req.query;
    console.log(`Received request for payroll data: ${month}/${year}`);

    if (!month || !year) return res.status(400).json({ error: 'Month and Year required' });

    try {
        const result = await fetchPayrollData(parseInt(month), parseInt(year));

        if (result.success) {
            res.json({
                success: true,
                data: result.data,
                month: parseInt(month),
                year: parseInt(year)
            });
        } else {
            res.status(500).json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error("Payroll API Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== WAGES API (Daftar Upah) ====================

// GET /api/wages - Get wages comparison (Venus vs Millware)
app.get('/api/wages', async (req, res) => {
    const { month, year } = req.query;
    console.log(`Received request for wages: ${month}/${year}`);

    if (!month || !year) {
        return res.status(400).json({ error: 'Month and Year required' });
    }

    try {
        const result = await wagesService.fetchWagesData(parseInt(month), parseInt(year));

        if (result.success) {
            res.json({
                success: true,
                data: result.data,
                period: result.period
            });
        } else {
            res.status(500).json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error("Wages API Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/wages/periods - Get available periods
app.get('/api/wages/periods', async (req, res) => {
    console.log('Received request for wages periods');

    try {
        const result = await wagesService.getAvailablePeriods();

        if (result.success) {
            res.json({
                success: true,
                data: result.data
            });
        } else {
            res.status(500).json({ success: false, error: result.error });
        }
    } catch (error) {
        console.error("Wages Periods API Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Enhanced monthly grid endpoint that matches the original Python application
app.get('/api/monthly-grid', async (req, res) => {
    const { month, year, bus_code, showStaff } = req.query;
    const noAttendance = process.env.NO_ATTENDANCE === 'true';
    const showStaffFlag = showStaff === 'true';
    console.log(`Received request for monthly grid: ${month}/${year}, bus_code: ${bus_code} (no-attendance: ${noAttendance}, showStaff: ${showStaffFlag})`);

    if (!month || !year) return res.status(400).json({ error: 'Month and Year required' });

    try {
        // Use overtime-only mode if NO_ATTENDANCE is enabled
        const data = noAttendance
            ? await fetchAttendanceDataOvertimeOnly(parseInt(month), parseInt(year), { showStaff: showStaffFlag })
            : await fetchAttendanceData(parseInt(month), parseInt(year), { showStaff: showStaffFlag });

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
    const { month, year, showStaff } = req.query;
    const showStaffFlag = showStaff === 'true';
    console.log(`[OVERTIME-ONLY GRID] Received request: ${month}/${year} (showStaff: ${showStaffFlag})`);

    if (!month || !year) return res.status(400).json({ error: 'Month and Year required' });

    try {
        // Use overtime-only data fetcher
        const data = await fetchAttendanceDataOvertimeOnly(parseInt(month), parseInt(year), { showStaff: showStaffFlag });

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

app.post('/api/export/miss-data', async (req, res) => {
    try {
        const { employees, startDate, endDate, options } = req.body;

        if (!employees || !Array.isArray(employees) || !startDate || !endDate) {
            return res.status(400).json({ success: false, error: 'employees array, startDate, endDate required' });
        }

        const result = await exportService.exportMissDataToCSV(employees, startDate, endDate, options);
        res.json({ success: true, data: result });
    } catch (error) {
        console.error("Export Miss Data error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/export/download/:filename', (req, res) => {
    const filename = req.params.filename;
    // Security check: prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return res.status(400).json({ error: 'Invalid filename' });
    }

    const EXPORT_DIR = path.resolve(__dirname, '../ekstrak absen');
    const filePath = path.join(EXPORT_DIR, filename);

    if (fs.existsSync(filePath)) {
        res.download(filePath, filename);
    } else {
        res.status(404).json({ error: 'File not found' });
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

        // Debug: Log sample employee data
        console.log(`[Comparison API] Comparing ${employees.length} employees for ${startDate} to ${endDate}`);
        if (employees.length > 0) {
            const sample = employees[0];
            console.log('[Comparison API] Sample employee keys:', Object.keys(sample));
            console.log('[Comparison API] Has ptrjEmployeeID:', !!sample.ptrjEmployeeID, 'Value:', sample.ptrjEmployeeID);
            console.log('[Comparison API] Has attendance:', !!sample.attendance);
            if (sample.attendance) {
                const sampleDay = sample.attendance['1'];
                console.log('[Comparison API] Sample day 1 data:', JSON.stringify(sampleDay));
            }
        }

        const result = await compareWithTaskReg(employees, startDate, endDate);

        console.log('[Comparison API] Result summary:', result.summary);

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

// Get ONLY 'MISS' data (mismatches or missing records)
app.post('/api/comparison/miss', async (req, res) => {
    try {
        const { employees, startDate, endDate, options } = req.body;

        if (!employees || !Array.isArray(employees) || !startDate || !endDate) {
            return res.status(400).json({ success: false, error: 'employees array, startDate, endDate required' });
        }

        console.log(`[Comparison] Fetching MISS data for ${employees.length} employees (${startDate} to ${endDate})`);
        const result = await getMissData(employees, startDate, endDate, options);

        res.json({
            success: true,
            ...result,
            period: { start: startDate, end: endDate }
        });
    } catch (error) {
        console.error('Error fetching MISS data:', error);
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
    const { employees, month, year, startDate, endDate, onlyOvertime, syncMismatchesOnly, syncRegularOnly, windowCount } = req.body;
    if (!employees || !Array.isArray(employees)) {
        return res.status(400).json({ error: 'Invalid data format. Expected { employees: [] }' });
    }

    const maxWindows = parseInt(process.env.MAX_AUTOMATION_WINDOWS || '6', 10);
    const parsedWindowCount = parseInt(windowCount || '1', 10);
    const automationWindows = Math.max(1, Math.min(
        Number.isFinite(maxWindows) && maxWindows > 0 ? maxWindows : 6,
        Number.isFinite(parsedWindowCount) && parsedWindowCount > 0 ? parsedWindowCount : 1
    ));

    try {
        console.log(`[Automation] Request to run for ${employees.length} employees (${month}/${year})`);
        console.log(`[Automation] Windows requested: ${automationWindows} (8 tabs/window)`);
        if (startDate && endDate) console.log(`[Automation] Date Filter: ${startDate} to ${endDate}`);
        if (onlyOvertime) console.log(`[Automation] Mode: ONLY OVERTIME`);
        if (syncRegularOnly) console.log(`[Automation] Mode: REGULAR ONLY`);
        if (syncMismatchesOnly) console.log(`[Automation] Mode: SYNC MISMATCHES ONLY`);

        // Save data to current_data.json (fixed filename)
        const savedData = await saveAutomationData({ employees, month, year, startDate, endDate, onlyOvertime, syncMismatchesOnly, syncRegularOnly, windowCount: automationWindows });
        console.log(`[Automation] Data saved to current_data.json`);

        if (!savedData.employeeCount || !savedData.attendanceRecords) {
            return res.status(409).json({
                error: onlyOvertime
                    ? 'Tidak ada data overtime yang perlu diproses setelah filter. Pastikan absensi regular sudah ada di Millware dan record OT belum ada.'
                    : 'Tidak ada data yang perlu diproses setelah filter sync/mode.'
            });
        }

        // Start process (uses current_data.json automatically)
        const child = startAutomationProcess({ windowCount: automationWindows });

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
        sendChunk('info', `Process started with ${savedData.employeeCount} employees, ${savedData.attendanceRecords} attendance record(s), ${automationWindows} window(s), 8 tab(s)/window`);

        const parseRunnerLine = (line) => {
            const trimmed = line.trim();
            if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
            try {
                const parsed = JSON.parse(trimmed);
                return parsed && parsed.event ? parsed : null;
            } catch (_) {
                return null;
            }
        };

        const eventWindowPrefix = (event) => Number.isInteger(event.window_index) ? `Window ${event.window_index + 1}: ` : '';
        const eventMessages = {
            'multiwindow.started': (event) => `Multi-window runner: ${event.actual_windows} window(s), ${event.tabs_per_window} tab(s)/window, ${event.total_capacity} max tab(s)`,
            'window.started': (event) => `Window ${event.window_index + 1}/${event.window_count}: started with ${event.employee_count} employee(s), ${event.attendance_count} attendance record(s)`,
            'window.completed': (event) => `Window ${event.window_index + 1}/${event.window_count}: completed`,
            'window.failed': (event) => `Window ${event.window_index + 1}/${event.window_count}: failed`,
            'window.run.started': (event) => `Window ${event.window_index + 1}: runner started (${event.employee_count} employee(s), ${event.actual_tabs} tab(s))`,
            'window.run.completed': (event) => `Window ${event.window_index + 1}: runner completed (${event.total_processed} employee(s))`,
            'window.run.failed': (event) => `Window ${event.window_index + 1}: runner failed`,
            'run.started': (event) => `${eventWindowPrefix(event)}Runner started: ${event.employee_count} employee(s), ${event.actual_tabs} tab(s), stagger ${event.stagger_delay_ms}ms`,
            'session.login.done': (event) => `${eventWindowPrefix(event)}Fresh login completed, session saved`,
            'session.reused': (event) => `${eventWindowPrefix(event)}Session restored from disk`,
            'tab.assigned': (event) => `${eventWindowPrefix(event)}Tab ${event.tab_index + 1}: ${event.employee_count} employee(s) assigned (${event.first_emp_id} → ${event.last_emp_id})`,
            'tab.triggered': (event) => `${eventWindowPrefix(event)}Tab ${event.tab_index + 1} triggered`,
            'tab.started': (event) => `${eventWindowPrefix(event)}Tab ${event.tab_index + 1} started`,
            'tab.submit.started': (event) => `${eventWindowPrefix(event)}Tab ${event.tab_index + 1}: saving ${event.added_rows} added row(s)`,
            'tab.submit.completed': (event) => `${eventWindowPrefix(event)}Tab ${event.tab_index + 1}: Save confirmed (${event.status})`,
            'tab.completed': (event) => `${eventWindowPrefix(event)}Tab ${event.tab_index + 1}: ${event.status}`,
            'run.completed': (event) => event.windows
                ? `Run completed: ${event.windows} window(s), ${event.attendance_records} attendance record(s) processed`
                : `Run completed: ${event.total_processed} employee(s) processed`
        };

        let stdoutBuffer = '';
        let stderrBuffer = '';

        const handleStdoutLine = (line) => {
            if (line.trim()) {
                const runnerEvent = parseRunnerLine(line);
                if (runnerEvent) {
                    console.log(`[AutoEngine Event] ${runnerEvent.event}`);
                    sendChunk('event', runnerEvent);
                    const message = eventMessages[runnerEvent.event]?.(runnerEvent);
                    if (message) sendChunk('info', message);
                } else {
                    console.log(`[AutoEngine] ${line.trim()}`);
                    sendChunk('log', line.trim());
                }
            }
        };

        const handleStderrLine = (line) => {
            if (line.trim()) {
                console.error(`[AutoEngine Err] ${line.trim()}`);
                sendChunk('error', line.trim());
            }
        };

        child.stdout.on('data', (data) => {
            stdoutBuffer += data.toString();
            const lines = stdoutBuffer.split(/\r?\n/);
            stdoutBuffer = lines.pop() || '';
            lines.forEach(handleStdoutLine);
        });

        child.stderr.on('data', (data) => {
            stderrBuffer += data.toString();
            const lines = stderrBuffer.split(/\r?\n/);
            stderrBuffer = lines.pop() || '';
            lines.forEach(handleStderrLine);
        });

        child.on('close', (code) => {
            if (stdoutBuffer.trim()) {
                handleStdoutLine(stdoutBuffer);
                stdoutBuffer = '';
            }
            if (stderrBuffer.trim()) {
                handleStderrLine(stderrBuffer);
                stderrBuffer = '';
            }
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

app.post('/api/automation/stop', (req, res) => {
    try {
        const stopped = stopAutomationProcess();
        res.json({ success: true, stopped });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Payroll Automation Routes ---

// Prepare and run payroll automation
const { triggerPayrollAutomation } = require('./services/payrollAutomationService');
const { startPayrollAutomationProcess, stopPayrollAutomationProcess } = require('./services/automationService');
const {
    fetchPayrollADDocIdsFromDB,
    triggerPayrollADResetAutomation,
    startPayrollADResetProcess,
    stopPayrollADResetProcess
} = require('./services/payrollADResetService');
const wagesService = require('./services/wagesService');
const playwrightAutomationService = require('./services/playwrightAutomationService');

app.post('/api/payroll/automation/run', async (req, res) => {
    const { month, year, componentKeys, componentKey } = req.body;

    if (!month || !year) {
        return res.status(400).json({ error: 'month and year are required' });
    }

    try {
        const requestedComponentKeys = componentKeys || componentKey || [];
        console.log(`[PayrollAutomation API] Request to run for ${month}/${year}`, requestedComponentKeys);

        // First, prepare the data (find MISS components)
        const prepResult = await triggerPayrollAutomation(month, year, { componentKeys: requestedComponentKeys });
        if (!prepResult.success) {
            throw new Error(prepResult.error);
        }

        if (prepResult.data.employees.length === 0) {
            return res.json({
                success: true,
                message: 'Tidak ada data payroll yang perlu diinputkan (semua sudah cocok)',
                employeesProcessed: 0,
                componentsProcessed: 0
            });
        }

        // Count total components
        const totalComponents = prepResult.data.employees.reduce((sum, emp) => sum + emp.components.length, 0);

        console.log(`[PayrollAutomation API] Prepared ${prepResult.data.employees.length} employees with ${totalComponents} components`);

        // Start the automation process
        const child = startPayrollAutomationProcess();

        // Handle spawn errors
        child.on('error', (err) => {
            console.error('[PayrollAutomation] Spawn error:', err);
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
                // Response closed
            }
        };

        child.stdout.on('data', (data) => {
            const lines = data.toString().split('\n').filter(line => line.trim());
            lines.forEach(line => sendChunk('log', line));
        });

        child.stderr.on('data', (data) => {
            sendChunk('error', data.toString());
        });

        child.on('close', (code) => {
            sendChunk('complete', { code, employees: prepResult.data.employees.length, components: totalComponents });
            res.end();
        });

        // Initial response
        res.json({
            success: true,
            message: `Memproses ${prepResult.data.employees.length} karyawan dengan ${totalComponents} komponen`,
            employees: prepResult.data.employees.map(e => ({
                name: e.employeeName,
                ptrjId: e.ptrjId,
                components: e.components.length
            }))
        });

    } catch (error) {
        console.error('[PayrollAutomation API] Error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
        }
    }
});

// Stop payroll automation
app.post('/api/payroll/automation/stop', (req, res) => {
    try {
        const stopped = stopPayrollAutomationProcess();
        res.json({ success: true, stopped });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Reset Monthly Allowance/Deduction (PR_ADTRANS) through Millware AD Lists
app.post('/api/payroll/ad-reset/automation/run', async (req, res) => {
    const { month, year, employees, docIds } = req.body;
    const requestedMode = String(req.body.targetMode || req.body.scope || req.body.mode || 'all').toLowerCase();
    const targetMode = ['all', 'selected', 'docids'].includes(requestedMode) ? requestedMode : 'all';
    const dryRun = req.body.dryRun === true || String(req.body.runMode || '').toLowerCase() === 'dry-run';
    const headless = req.body.headless === true || String(req.body.browserMode || '').toLowerCase() === 'headless';
    const limit = Math.max(0, parseInt(req.body.limit || req.body.docLimit || 0, 10) || 0);
    const windowCount = Math.max(1, Math.min(10, parseInt(req.body.windowCount || req.body.windows || req.body.workers || 1, 10) || 1));

    if (!month || !year) {
        return res.status(400).json({ error: 'month and year are required' });
    }

    try {
        const effectiveEmployees = Array.isArray(employees) ? employees : [];
        let effectiveDocIds = Array.isArray(docIds) ? docIds.map(String).filter(Boolean) : [];
        let docTargets = effectiveDocIds.map(docId => ({ docNumber: docId, label: docId }));

        if (targetMode === 'all' && effectiveDocIds.length === 0) {
            const dbResult = await fetchPayrollADDocIdsFromDB(month, year, [], { limit });
            effectiveDocIds = dbResult.docIds || [];
            docTargets = dbResult.details || [];
        }

        if (targetMode === 'selected' && effectiveDocIds.length === 0) {
            const empCodes = effectiveEmployees
                .map(e => e.empCode || e.ptrjEmployeeID || e.PTRJEmployeeID || e.ptrjId || e.id)
                .map(code => String(code || '').trim())
                .filter(Boolean);

            if (empCodes.length === 0) {
                return res.status(400).json({ error: 'Karyawan dipilih tidak punya PTRJ Employee ID valid.' });
            }

            const dbResult = await fetchPayrollADDocIdsFromDB(month, year, empCodes, { limit });
            effectiveDocIds = dbResult.docIds || [];
            docTargets = dbResult.details || [];
        }

        if (targetMode === 'docids' && effectiveDocIds.length === 0) {
            return res.status(400).json({ error: 'DocID manual belum diisi.' });
        }

        if (effectiveDocIds.length === 0 && docTargets.length === 0) {
            return res.status(400).json({ error: 'Tidak ada DocID Monthly Allowance/Deduction pada periode ini.' });
        }

        const triggerResult = triggerPayrollADResetAutomation({
            docIds: effectiveDocIds,
            docTargets,
            employees: targetMode === 'selected' ? effectiveEmployees : [],
            month,
            year,
            dryRun,
            headless,
            limit,
            windowCount
        });

        if (!triggerResult.success) {
            return res.status(400).json({ error: triggerResult.error });
        }

        const { metadata } = triggerResult.data;
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        if (res.flushHeaders) res.flushHeaders();

        const sendChunk = (type, data) => {
            try {
                res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
            } catch (_) {
                // Client disconnected.
            }
        };

        sendChunk('status', 'starting');
        sendChunk('info', {
            message: `Starting Monthly AD Reset: docIds=${metadata.totalDocIds}, dryRun=${metadata.dryRun}, workers=${metadata.windowCount}`,
            metadata
        });

        const child = startPayrollADResetProcess({
            dryRun: metadata.dryRun,
            headless: metadata.headless,
            windowCount: metadata.windowCount
        });

        let stdoutBuffer = '';
        const handleLine = (line) => {
            if (!line.trim()) return;
            const text = line.trim().replace(/^\[[0-9:]+\]\s*/, '');
            const lower = text.toLowerCase();
            const realError = lower.includes('"status":"error"') || lower.includes('error:') || /\berrors=([1-9]\d*)\b/.test(lower);
            if (realError) sendChunk('error', text);
            else if (text.includes('PAYROLL AD DELETE COMPLETE') || text.includes('"status":"deleted"')) sendChunk('info', text);
            else sendChunk('log', text);
        };

        child.on('error', (err) => {
            sendChunk('error', `Failed to start: ${err.message}`);
            sendChunk('status', 'failed');
            try { res.end(); } catch (_) {}
        });

        child.stdout.on('data', (data) => {
            stdoutBuffer += data.toString();
            const lines = stdoutBuffer.split(/\r?\n/);
            stdoutBuffer = lines.pop() || '';
            lines.forEach(handleLine);
        });

        child.stderr.on('data', (data) => {
            const text = data.toString().trim();
            if (text) sendChunk('error', text);
        });

        child.on('close', (code) => {
            if (stdoutBuffer.trim()) handleLine(stdoutBuffer);
            sendChunk('status', code === 0 ? 'completed' : 'failed');
            sendChunk('done', { code });
            try { res.end(); } catch (_) {}
        });

        req.on('close', () => {
            console.log('[PayrollADReset] Client disconnected (process continues running)');
        });
    } catch (error) {
        console.error('[PayrollADReset API] Error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
        } else {
            try {
                res.write(`data: ${JSON.stringify({ type: 'error', data: error.message })}\n\n`);
                res.end();
            } catch (_) {}
        }
    }
});

app.post('/api/payroll/ad-reset/automation/stop', (req, res) => {
    try {
        const stopped = stopPayrollADResetProcess();
        res.json({ success: true, stopped });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/payroll/ad-reset/doc-ids', async (req, res) => {
    const { month, year, empCodes } = req.query;
    if (!month || !year) {
        return res.status(400).json({ error: 'month and year are required' });
    }

    try {
        const codes = empCodes ? empCodes.split(',').map(code => code.trim()).filter(Boolean) : [];
        const limit = Math.max(0, parseInt(req.query.limit || req.query.docLimit || 0, 10) || 0);
        const result = await fetchPayrollADDocIdsFromDB(month, year, codes, { limit });
        res.json({
            success: true,
            docIds: result.docIds,
            details: result.details,
            count: result.docIds.length
        });
    } catch (error) {
        console.error('[PayrollADReset DocIds API] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- OT Reset Routes ---
const { triggerOTResetAutomation, startOTResetProcess, stopOTResetProcess, fetchDocIdsFromDB } = require('./services/otResetService');

// Run OT Reset automation
app.post('/api/ot-reset/automation/run', async (req, res) => {
    const { docIds, employees, startDate, endDate, category, month, year } = req.body;
    const requestedMode = String(req.body.targetMode || req.body.scope || req.body.mode || 'all').toLowerCase();
    const targetMode = ['all', 'selected', 'docids'].includes(requestedMode) ? requestedMode : 'all';
    const dryRun = req.body.dryRun === true || String(req.body.runMode || '').toLowerCase() === 'dry-run';
    const headless = req.body.headless === true || String(req.body.browserMode || '').toLowerCase() === 'headless';
    const limit = Math.max(0, parseInt(req.body.limit || req.body.docLimit || 0, 10) || 0);
    const maxPages = Math.max(1, parseInt(req.body.maxPages || 50, 10) || 50);
    const requestedParallelMode = String(req.body.parallelMode || req.body.concurrencyMode || 'windows').toLowerCase();
    const parallelMode = ['tabs', 'windows', 'hybrid'].includes(requestedParallelMode) ? requestedParallelMode : 'windows';
    const tabCount = Math.max(1, Math.min(10, parseInt(req.body.tabCount || req.body.tabs || 1, 10) || 1));
    const windowCount = Math.max(1, Math.min(10, parseInt(req.body.windowCount || req.body.windows || (parallelMode === 'windows' ? tabCount : 1), 10) || 1));

    if (!month || !year) {
        return res.status(400).json({ error: 'month and year are required' });
    }
    if (!category) {
        return res.status(400).json({ error: 'category is required (OT, Normal, or all)' });
    }

    try {
        let effectiveDocIds = Array.isArray(docIds) ? docIds.filter(Boolean) : [];
        let docTargets = effectiveDocIds.map(id => ({ internalId: id, label: id }));
        const effectiveEmployees = Array.isArray(employees) ? employees : [];

        console.log(`[OTReset API] Run request: mode=${targetMode}, docIds=${effectiveDocIds.length}, employees=${effectiveEmployees.length}, category=${category}, dryRun=${dryRun}, headless=${headless}, limit=${limit}, maxPages=${maxPages}, parallelMode=${parallelMode}, windowCount=${windowCount}, tabCount=${tabCount}`);

        if (targetMode === 'all' && effectiveDocIds.length === 0) {
            const dbResult = await fetchDocIdsFromDB(parseInt(month, 10), parseInt(year, 10), [], { category, limit });
            effectiveDocIds = dbResult.docIds || [];
            docTargets = (dbResult.details || []).map(detail => ({
                internalId: detail.docId,
                docNumber: detail.docNumber,
                label: detail.docNumber || detail.docId,
                matchingLineCount: detail.matchingLineCount,
                otLineCount: detail.otLineCount,
                normalLineCount: detail.normalLineCount
            }));

            console.log(`[OTReset API] Filtered all-mode DocIDs from DB: ${effectiveDocIds.length} doc(s), category=${category}`);

            if (effectiveDocIds.length === 0) {
                return res.status(400).json({ error: `Tidak ada DocID Millware dengan record ${category} pada periode ini.` });
            }
        }

        if (targetMode === 'selected' && effectiveDocIds.length === 0) {
            const empCodes = effectiveEmployees
                .map(e => e.empCode || e.ptrjEmployeeID || e.PTRJEmployeeID || e.ptrjId)
                .filter(Boolean);

            if (empCodes.length === 0) {
                return res.status(400).json({ error: 'Karyawan dipilih tidak punya PTRJ Employee ID valid.' });
            }

            const dbResult = await fetchDocIdsFromDB(parseInt(month, 10), parseInt(year, 10), empCodes, { category });
            effectiveDocIds = dbResult.docIds || [];
            docTargets = (dbResult.details || []).map(detail => ({
                internalId: detail.docId,
                docNumber: detail.docNumber,
                label: detail.docNumber || detail.docId,
                matchingLineCount: detail.matchingLineCount,
                otLineCount: detail.otLineCount,
                normalLineCount: detail.normalLineCount
            }));

            if (effectiveDocIds.length === 0) {
                return res.status(400).json({ error: 'Tidak ada DocID Millware untuk karyawan terpilih pada periode ini.' });
            }
        }

        if (targetMode === 'docids' && effectiveDocIds.length === 0) {
            return res.status(400).json({ error: 'DocID manual belum diisi.' });
        }

        // Trigger: prepare data file. Mode "all" now stores DB-filtered DocIDs only;
        // runner still opens through Task Register List search before deleting detail rows.
        const triggerResult = triggerOTResetAutomation({
            docIds: effectiveDocIds,
            docTargets,
            employees: targetMode === 'selected' ? effectiveEmployees : [],
            startDate,
            endDate,
            category,
            targetMode,
            dryRun,
            headless,
            limit,
            maxPages,
            tabCount,
            windowCount,
            parallelMode,
            forceListSearch: targetMode === 'all',
            month,
            year
        });

        if (!triggerResult.success) {
            return res.status(400).json({ error: triggerResult.error });
        }

        const { metadata } = triggerResult.data;

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        if (res.flushHeaders) res.flushHeaders();

        const sendChunk = (type, data) => {
            try {
                res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
            } catch (_) {
                // Client disconnected.
            }
        };

        sendChunk('status', 'starting');
        sendChunk('info', {
            message: `Starting OT Reset: mode=${metadata.targetMode}, docIds=${metadata.totalDocIds}, category=${metadata.categoryLabel}, dryRun=${metadata.dryRun}, parallel=${metadata.parallelMode}, windows=${metadata.windowCount}, tabs=${metadata.tabCount}`,
            metadata
        });

        const child = startOTResetProcess({
            dryRun: metadata.dryRun,
            headless: metadata.headless,
            limit: metadata.limit,
            maxPages: metadata.maxPages,
            tabCount: metadata.tabCount,
            windowCount: metadata.windowCount,
            tabsPerWindow: metadata.tabsPerWindow,
            parallelMode: metadata.parallelMode,
            forceListSearch: metadata.forceListSearch,
            category: metadata.category
        });
        let stdoutBuffer = '';

        child.on('error', (err) => {
            console.error('[OTReset] Spawn error:', err);
            sendChunk('error', `Failed to start: ${err.message}`);
            sendChunk('status', 'failed');
            try { res.end(); } catch (_) { }
        });

        const handleLine = (line) => {
            if (!line.trim()) return;
            const trimmed = line.trim();
            const text = trimmed.startsWith('[') && trimmed.includes(']') ? trimmed.substring(11) : trimmed;
            const lowerText = text.toLowerCase();
            const positiveErrorSummary = /\berrors=([1-9]\d*)\b/.test(lowerText);
            const benignFallback = lowerText.includes('search field not found')
                || lowerText.includes('search button not found')
                || lowerText.includes('errors=0')
                || lowerText.includes('delete error(s)');
            const realError = !benignFallback && (
                positiveErrorSummary
                || lowerText.includes('"status":"error"')
                || lowerText.includes('delete error:')
                || lowerText.includes('save error')
                || lowerText.includes('failed')
                || lowerText.includes('detail grid not found')
                || lowerText.includes('target docid not found')
                || lowerText.includes('no successful delete click')
            );

            if (realError) {
                sendChunk('error', text);
            } else if (text.includes('Result doc=') || text.includes('DELETE RUNNER COMPLETE') || text.includes('Open from list')) {
                sendChunk('info', text);
            } else {
                sendChunk('log', text);
            }
        };

        child.stdout.on('data', (data) => {
            stdoutBuffer += data.toString();
            const lines = stdoutBuffer.split(/\r?\n/);
            stdoutBuffer = lines.pop() || '';
            lines.forEach(handleLine);
        });

        child.stderr.on('data', (data) => {
            const text = data.toString().trim();
            if (text) sendChunk('error', text);
        });

        child.on('close', (code) => {
            if (stdoutBuffer.trim()) handleLine(stdoutBuffer);
            console.log(`[OTReset] Process exited with code ${code}`);
            sendChunk('status', code === 0 ? 'completed' : 'failed');
            sendChunk('done', { code });
            try { res.end(); } catch (_) { }
        });

        req.on('close', () => {
            console.log('[OTReset] Client disconnected (process continues running)');
        });

    } catch (error) {
        console.error('[OTReset API] Error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
        } else {
            try {
                res.write(`data: ${JSON.stringify({ type: 'error', data: error.message })}\n\n`);
                res.end();
            } catch (_) { }
        }
    }
});

// Stop OT Reset automation
app.post('/api/ot-reset/automation/stop', (req, res) => {
    try {
        const stopped = stopOTResetProcess();
        res.json({ success: true, stopped });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Fetch Task Register DocIds from Millware DB (db_ptrj_mill)
app.get('/api/task-register/doc-ids', async (req, res) => {
    const { month, year, empCodes, category } = req.query;
    if (!month || !year) {
        return res.status(400).json({ error: 'month and year are required' });
    }
    try {
        // empCodes: comma-separated list of employee codes (optional filter)
        const codes = empCodes ? empCodes.split(',').map(c => c.trim()).filter(Boolean) : [];
        const limit = Math.max(0, parseInt(req.query.limit || req.query.docLimit || 0, 10) || 0);
        const result = await fetchDocIdsFromDB(parseInt(month), parseInt(year), codes, { category: category || 'all', limit });
        res.json({
            docIds: result.docIds,
            details: result.details,
            count: result.docIds.length
        });
    } catch (error) {
        console.error('[TaskRegister API] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- Playwright Automation Routes ---

// Run attendance automation with Playwright
app.post('/api/automation/playwright/attendance', (req, res) => {
    try {
        const { employees, data, headless } = req.body;

        if (!employees || !Array.isArray(employees) || employees.length === 0) {
            return res.status(400).json({ success: false, error: 'Employees array is required' });
        }

        if (!data || !data.month || !data.year) {
            return res.status(400).json({ success: false, error: 'data.month and data.year are required' });
        }

        console.log(`[Playwright Attendance API] Running for ${employees.length} employees (${data.month}/${data.year})`);

        const result = playwrightAutomationService.runAttendance({
            employees,
            data,
            headless,
        });

        res.json({
            success: true,
            payloadId: result.payloadId,
            status: result.status,
            employeeCount: result.employeeCount,
        });
    } catch (error) {
        console.error('[Playwright Attendance API] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Run payroll automation with Playwright
app.post('/api/automation/playwright/payroll', (req, res) => {
    try {
        const { employees, data, headless } = req.body;

        if (!data || !data.components || !Array.isArray(data.components)) {
            return res.status(400).json({ success: false, error: 'data.components array is required' });
        }

        if (data.components.length === 0) {
            return res.status(400).json({ success: false, error: 'data.components cannot be empty' });
        }

        console.log(`[Playwright Payroll API] Running for ${data.components.length} components`);

        const result = playwrightAutomationService.runPayroll({
            employees,
            data,
            headless,
        });

        res.json({
            success: true,
            payloadId: result.payloadId,
            status: result.status,
            componentCount: data.components.length,
        });
    } catch (error) {
        console.error('[Playwright Payroll API] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get Playwright automation status
app.get('/api/automation/playwright/status/:payloadId', (req, res) => {
    try {
        const { payloadId } = req.params;
        const status = playwrightAutomationService.getStatus(payloadId);

        if (status.status === 'not_found') {
            return res.status(404).json({ success: false, error: 'Automation not found' });
        }

        res.json({ success: true, ...status });
    } catch (error) {
        console.error('[Playwright Status API] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Stop Playwright automation
app.post('/api/automation/playwright/stop/:payloadId', (req, res) => {
    try {
        const { payloadId } = req.params;
        const stopped = playwrightAutomationService.stop(payloadId);

        res.json({ success: true, stopped });
    } catch (error) {
        console.error('[Playwright Stop API] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// List all active Playwright automations
app.get('/api/automation/playwright/list', (req, res) => {
    try {
        const list = playwrightAutomationService.listActive();
        res.json({ success: true, count: list.length, automations: list });
    } catch (error) {
        console.error('[Playwright List API] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Validation Routes ---

// Start a new validation session
app.post('/api/validation/session/start', (req, res) => {
    try {
        const sessionId = validationService.startValidationSession();
        res.json({ success: true, sessionId });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Log a validation entry (called by automation engine)
app.post('/api/validation/log', async (req, res) => {
    try {
        const { ptrjEmployeeID, employeeName, date, regularHours, overtimeHours, inputType, status } = req.body;

        if (!ptrjEmployeeID || !date || !inputType) {
            return res.status(400).json({ success: false, error: 'ptrjEmployeeID, date, and inputType are required' });
        }

        const result = await validationService.logValidation({
            ptrjEmployeeID,
            employeeName,
            date,
            regularHours,
            overtimeHours,
            inputType,
            status
        });

        res.json({ success: true, data: result });
    } catch (error) {
        console.error('[Validation] Error logging:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get validation results for current session
app.get('/api/validation/results', (req, res) => {
    try {
        const results = validationService.getValidationResults();
        res.json({ success: true, ...results });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Generate and download Excel report
app.get('/api/validation/report/excel', async (req, res) => {
    try {
        const { sessionId } = req.query;

        const { filename, filepath, summary } = await validationService.generateExcelReport(sessionId);

        res.download(filepath, filename, (err) => {
            if (err) {
                console.error('[Validation] Error downloading report:', err);
                if (!res.headersSent) {
                    res.status(500).json({ success: false, error: 'Failed to download report' });
                }
            }
        });
    } catch (error) {
        console.error('[Validation] Error generating report:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get validation summary only
app.get('/api/validation/summary', (req, res) => {
    try {
        const results = validationService.getValidationResults();
        res.json({ success: true, summary: results.summary });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Load validation logs from file
app.get('/api/validation/logs', (req, res) => {
    try {
        const logs = validationService.loadValidationLogs();
        res.json({ success: true, logs, count: logs.length });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Clear validation logs
app.delete('/api/validation/logs', (req, res) => {
    try {
        validationService.clearValidationLogs();
        res.json({ success: true, message: 'Validation logs cleared' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Download Excel report for last session
app.get('/api/validation/report/last-session', async (req, res) => {
    try {
        const { filename, filepath, summary } = await validationService.generateLastSessionReport();

        res.download(filepath, filename, (err) => {
            if (err) {
                console.error('[Validation] Error downloading last session report:', err);
                if (!res.headersSent) {
                    res.status(500).json({ success: false, error: 'Failed to download report' });
                }
            }
        });
    } catch (error) {
        console.error('[Validation] Error generating last session report:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get last session info only
app.get('/api/validation/last-session', (req, res) => {
    try {
        const lastSessionId = validationService.getLastSessionId();
        if (!lastSessionId) {
            return res.json({ success: true, hasSession: false, message: 'No sessions found' });
        }
        res.json({ success: true, hasSession: true, sessionId: lastSessionId });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
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
    const PORT = process.env.PORT || 3002;
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
