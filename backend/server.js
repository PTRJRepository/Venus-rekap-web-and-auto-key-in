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
const { fetchPayrollData, fetchLivePayrollData } = require('./services/payrollService');
const payrollExportService = require('./services/payrollExportService');
const payrollSnapshotService = require('./services/payrollSnapshotService');
const { parseDocIdsInput } = require('./services/docIdUtils');
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

const buildPayrollSourceOptions = (payload = {}) => {
    const source = String(payload.source || payload.payrollSource || '').toLowerCase();
    const snapshotId = payload.snapshotId || payload.payrollSnapshotId || null;
    const useActiveSnapshot = payload.useActiveSnapshot === true
        || String(payload.useActiveSnapshot || '').toLowerCase() === 'true';

    if (source === 'snapshot' || snapshotId || useActiveSnapshot) {
        return {
            source: 'snapshot',
            snapshotId,
            useActiveSnapshot
        };
    }

    return { source: 'live' };
};

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
    const payrollSource = buildPayrollSourceOptions(req.query);
    console.log(`Received request for payroll data: ${month}/${year} (${payrollSource.source})`);

    if (!month || !year) return res.status(400).json({ error: 'Month and Year required' });

    try {
        const result = await fetchPayrollData(parseInt(month), parseInt(year), payrollSource);

        if (result.success) {
            res.json({
                success: true,
                data: result.data,
                analysis: result.analysis,
                sourceInfo: result.sourceInfo,
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

app.get('/api/payroll/snapshots', async (req, res) => {
    const { month, year } = req.query;
    if (!month || !year) return res.status(400).json({ error: 'Month and Year required' });

    try {
        const snapshots = await payrollSnapshotService.listPayrollSnapshots(month, year);
        res.json({ success: true, data: snapshots });
    } catch (error) {
        console.error('[PayrollSnapshot API] List error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/payroll/snapshots', async (req, res) => {
    const { month, year, label, notes, setActive } = req.body || {};
    if (!month || !year) return res.status(400).json({ error: 'month and year are required' });

    try {
        console.log(`[PayrollSnapshot API] Capturing live snapshot for ${month}/${year}`);
        const payrollResult = await fetchLivePayrollData(parseInt(month, 10), parseInt(year, 10));
        if (!payrollResult.success) {
            return res.status(500).json({ success: false, error: payrollResult.error });
        }

        const snapshot = await payrollSnapshotService.createPayrollSnapshot({
            month,
            year,
            label,
            notes,
            payrollResult,
            setActive: setActive !== false,
            capturedBy: req.body?.capturedBy || 'app'
        });

        res.status(201).json({ success: true, data: snapshot });
    } catch (error) {
        console.error('[PayrollSnapshot API] Capture error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/payroll/snapshots/:snapshotId', async (req, res) => {
    try {
        const snapshot = await payrollSnapshotService.getPayrollSnapshot(req.params.snapshotId);
        if (!snapshot) return res.status(404).json({ success: false, error: 'Snapshot not found' });
        res.json({ success: true, data: snapshot });
    } catch (error) {
        console.error('[PayrollSnapshot API] Detail error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.patch('/api/payroll/snapshots/:snapshotId', async (req, res) => {
    try {
        const snapshot = await payrollSnapshotService.updatePayrollSnapshot(req.params.snapshotId, req.body || {});
        if (!snapshot) return res.status(404).json({ success: false, error: 'Snapshot not found' });
        res.json({ success: true, data: snapshot });
    } catch (error) {
        console.error('[PayrollSnapshot API] Update error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/payroll/snapshots/:snapshotId/activate', async (req, res) => {
    try {
        const snapshot = await payrollSnapshotService.activatePayrollSnapshot(req.params.snapshotId, req.body?.actor || 'app');
        res.json({ success: true, data: snapshot });
    } catch (error) {
        console.error('[PayrollSnapshot API] Activate error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/payroll/snapshots/:snapshotId', async (req, res) => {
    try {
        const result = await payrollSnapshotService.softDeletePayrollSnapshot(req.params.snapshotId, req.body?.actor || 'app');
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('[PayrollSnapshot API] Delete error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Payroll Export Routes ---

// Export payroll comparison to CSV or Excel
app.get('/api/payroll/export', async (req, res) => {
    const { month, year, format, filter } = req.query;
    const payrollSource = buildPayrollSourceOptions(req.query);

    if (!month || !year) {
        return res.status(400).json({ error: 'Month and Year required' });
    }

    const exportFormat = format === 'xlsx' || format === 'excel' ? 'xlsx' : 'csv';
    const exportFilter = ['all', 'matched', 'mismatched', 'no_millware'].includes(filter) ? filter : 'all';

    try {
        console.log(`[PayrollExport API] Export request: ${month}/${year}, format=${exportFormat}, filter=${exportFilter}, source=${payrollSource.source}`);

        const result = await payrollExportService.exportPayroll(
            parseInt(month, 10),
            parseInt(year, 10),
            exportFormat,
            exportFilter,
            payrollSource
        );

        if (result.count === 0) {
            return res.json({
                success: true,
                message: result.message,
                count: 0
            });
        }

        // Return download info - frontend will handle the actual download
        res.json({
            success: true,
            filename: result.filename,
            period: result.period,
            count: result.count,
            downloadUrl: `/api/export/download/${result.filename}`
        });
    } catch (error) {
        console.error('[PayrollExport API] Error:', error);
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

// Debug: Check raw Millware data for specific employee and date
app.get('/api/debug/millware-check', async (req, res) => {
    try {
        const { emp_code, date } = req.query;
        if (!emp_code || !date) {
            return res.status(400).json({ success: false, error: 'emp_code and date required' });
        }

        const sql = `
            SELECT L.ID, L.MasterID, H.DocID, H.Status AS HeaderStatus, CAST(NULL AS VARCHAR(100)) AS TaskCode, L.EmpCode, CAST(NULL AS VARCHAR(200)) AS EmpName, L.OT, L.Hours, L.Amount, L.TrxDate, CAST(NULL AS INT) AS NormalDay, CAST(NULL AS VARCHAR(100)) AS ChargeTo, CAST(NULL AS DATETIME) AS CreatedDate
            FROM [db_ptrj_mill].[dbo].[PR_TASKREG] H
            INNER JOIN [db_ptrj_mill].[dbo].[PR_TASKREGLN] L ON H.ID = L.MasterID
            WHERE RTRIM(L.EmpCode) = '${emp_code}' AND CAST(L.TrxDate AS DATE) = '${date}'
            ORDER BY L.OT, L.Hours
        `;

        console.log(`[Debug] Checking Millware for ${emp_code} on ${date}`);
        const result = await executeQuery(sql);
        console.log(`[Debug] Found ${result.length} records`);

        res.json({
            success: true,
            empCode: emp_code,
            date: date,
            recordCount: result.length,
            records: result
        });
    } catch (error) {
        console.error('Error in debug endpoint:', error);
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
                    ? 'Tidak ada data overtime yang perlu diproses setelah filter. Pastikan record OT belum ada dan Venus memiliki jam OT.'
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
const {
    triggerPayrollAutomation,
    prepareBerasAutomationData,
    prepareLemburAdjustmentData
} = require('./services/payrollAutomationService');
const { startPayrollAutomationProcess, stopPayrollAutomationProcess } = require('./services/automationService');
const { spawn, exec } = require('child_process');
const { runPayrollDryRun } = require('../browser-automation-engine/payroll-dry-runner');
const {
    fetchPayrollADDocIdsFromDB,
    fetchDuplicatePayrollADDocIdsFromDB,
    fetchDifferenceADDocIdsFromDB,
    fetchAmountDifferenceADDocIdsFromDB,
    triggerPayrollADResetAutomation,
    triggerPayrollADResetByDCOIDAutomation,
    triggerPayrollADResetByDifferenceAutomation,
    triggerPayrollADResetByAmountDifferenceAutomation,
    fetchMinusOvtADDocIdsFromDB,
    triggerPayrollADResetByMinusOvtAutomation,
    preparePayrollADResetData,
    startPayrollADResetProcess,
    stopPayrollADResetProcess
} = require('./services/payrollADResetService');
const wagesService = require('./services/wagesService');
const playwrightAutomationService = require('./services/playwrightAutomationService');

const PAYROLL_BERAS_TEMPLATE = 'payroll-beras-input-with-chargejob';
const PAYROLL_BERAS_RUNNER_PATH = path.resolve(__dirname, '..', 'browser-automation-engine', 'payroll-runner.js');
const PAYROLL_PARALLEL_RUNNER_PATH = path.resolve(__dirname, '..', 'browser-automation-engine', 'payroll-parallel-runner.js');
const PAYROLL_BERAS_ENGINE_DIR = path.resolve(__dirname, '..', 'browser-automation-engine');
const PAYROLL_BERAS_DATA_FILE = path.resolve(PAYROLL_BERAS_ENGINE_DIR, 'testing_data', 'current_payroll_beras_data.json');
const PAYROLL_LEMBUR_ADJUSTMENT_TEMPLATE = 'payroll-lembur-adjustment-input-with-chargejob';
const PAYROLL_LEMBUR_ADJUSTMENT_DATA_FILE = path.resolve(PAYROLL_BERAS_ENGINE_DIR, 'testing_data', 'current_payroll_lembur_adjustment_data.json');
let currentBerasPayrollProcess = null;
let currentLemburAdjustmentProcess = null;

const stopBerasPayrollProcess = () => {
    if (!currentBerasPayrollProcess) return false;

    const processToStop = currentBerasPayrollProcess;
    currentBerasPayrollProcess = null;

    if (process.platform === 'win32') {
        exec(`taskkill /pid ${processToStop.pid} /T /F`, (error) => {
            if (error) {
                console.error(`[PayrollBeras] Failed to stop process ${processToStop.pid}:`, error.message);
            }
        });
    } else {
        processToStop.kill('SIGINT');
    }

    console.log(`[PayrollBeras] Stop requested for process ${processToStop.pid}`);
    return true;
};

const stopLemburAdjustmentProcess = () => {
    if (!currentLemburAdjustmentProcess) return false;

    const processToStop = currentLemburAdjustmentProcess;
    currentLemburAdjustmentProcess = null;

    if (process.platform === 'win32') {
        exec(`taskkill /pid ${processToStop.pid} /T /F`, (error) => {
            if (error) {
                console.error(`[PayrollLemburAdjustment] Failed to stop process ${processToStop.pid}:`, error.message);
            }
        });
    } else {
        processToStop.kill('SIGINT');
    }

    console.log(`[PayrollLemburAdjustment] Stop requested for process ${processToStop.pid}`);
    return true;
};

app.post('/api/payroll/automation/run', async (req, res) => {
    const { month, year, componentKeys, componentKey } = req.body;
    const payrollSource = buildPayrollSourceOptions(req.body);

    if (!month || !year) {
        return res.status(400).json({ error: 'month and year are required' });
    }

    try {
        const requestedComponentKeys = componentKeys || componentKey || [];
        console.log(`[PayrollAutomation API] Request to run for ${month}/${year} (${payrollSource.source})`, requestedComponentKeys);

        // First, prepare the data (find MISS components)
        const prepResult = await triggerPayrollAutomation(month, year, {
            componentKeys: requestedComponentKeys,
            payrollSource
        });
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
        const stoppedPayroll = stopPayrollAutomationProcess();
        const stoppedBeras = stopBerasPayrollProcess();
        const stoppedLemburAdjustment = stopLemburAdjustmentProcess();
        res.json({
            success: true,
            stopped: stoppedPayroll || stoppedBeras || stoppedLemburAdjustment,
            stoppedPayroll,
            stoppedBeras,
            stoppedLemburAdjustment
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Prepare beras automation data (inputs only the DIFFERENCE/selisih amount)
app.post('/api/payroll/beras/prepare', async (req, res) => {
    const { month, year } = req.body;
    const payrollSource = buildPayrollSourceOptions(req.body);

    if (!month || !year) {
        return res.status(400).json({ error: 'month and year are required' });
    }

    try {
        console.log(`[PayrollBeras API] Preparing beras data for ${month}/${year}`);

        const result = await prepareBerasAutomationData(month, year, { payrollSource });

        if (!result.success) {
            throw new Error(result.error);
        }

        const data = result.data;
        const summary = {
            totalEmployees: data.employees.length,
            totalComponents: data.metadata.totalComponents,
            skippedDuplicates: data.metadata.skippedDuplicates,
            skippedAlreadyExists: data.metadata.skippedAlreadyExists,
            isBerasOnly: data.metadata.isBerasOnly,
            inputType: data.metadata.inputType
        };

        console.log(`[PayrollBeras API] Prepared ${summary.totalEmployees} employees with ${summary.totalComponents} beras components`);

        res.json({
            success: true,
            message: `Data beras siap untuk ${summary.totalEmployees} karyawan (input: SELISIH amount)`,
            employees: data.employees.map(e => ({
                name: e.employeeName,
                ptrjId: e.ptrjId,
                component: e.components?.[0] ? {
                    key: e.components[0].componentKey,
                    venusAmount: e.components[0].venusAmount,
                    millwareAmount: e.components[0].millwareAmount,
                    inputAmount: e.components[0].inputAmount,
                    note: e.components[0].note
                } : null
            })),
            summary
        });

    } catch (error) {
        console.error('[PayrollBeras API] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Run beras automation via browser
app.post('/api/payroll/beras/run', async (req, res) => {
    const { month, year } = req.body;
    const payrollSource = buildPayrollSourceOptions(req.body);
    const dryRun = req.body.dryRun === true
        || String(req.body.dryRun || '').toLowerCase() === 'true'
        || String(req.body.runMode || '').toLowerCase() === 'dry-run';

    if (!month || !year) {
        return res.status(400).json({ error: 'month and year are required' });
    }

    try {
        console.log(`[PayrollBeras API] Running beras automation for ${month}/${year}`);

        // First prepare the data (generates current_payroll_beras_data.json with SELISIH amount)
        const prepResult = await prepareBerasAutomationData(month, year, { payrollSource });
        if (!prepResult.success) {
            throw new Error(prepResult.error);
        }

        if (prepResult.data.employees.length === 0) {
            return res.json({
                success: true,
                message: 'Tidak ada data beras yang perlu diinputkan',
                employeesProcessed: 0
            });
        }

        const totalComponents = prepResult.data.employees.reduce((sum, emp) => sum + (emp.components?.length || 0), 0);
        const headless = req.body.headless === true || req.body.browserMode === 'headless';

        if (dryRun) {
            const dryRunResult = runPayrollDryRun(PAYROLL_BERAS_DATA_FILE, {
                quiet: true,
                payload: prepResult.data
            });

            if (!dryRunResult.success) {
                return res.status(422).json({
                    success: false,
                    error: 'Dry-run validation failed',
                    errors: dryRunResult.errors,
                    warnings: dryRunResult.warnings,
                    employeesProcessed: dryRunResult.employeeCount,
                    componentsProcessed: dryRunResult.rowCount
                });
            }

            return res.json({
                success: true,
                message: `Dry-run OK: ${dryRunResult.employeeCount} karyawan, ${dryRunResult.rowCount} baris BERAS siap diinput (SELISIH amount)`,
                employeesProcessed: dryRunResult.employeeCount,
                componentsProcessed: dryRunResult.rowCount,
                warnings: dryRunResult.warnings,
                rows: dryRunResult.rows
            });
        }

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
        const endStream = () => {
            try {
                res.end();
            } catch (e) {
                // Response closed
            }
        };

        sendChunk('info', `Memproses ${prepResult.data.employees.length} karyawan dengan ${totalComponents} baris BERAS (SELISIH amount)`);
        sendChunk('log', `Template: ${PAYROLL_BERAS_TEMPLATE}`);
        sendChunk('log', `Data file: ${PAYROLL_BERAS_DATA_FILE}`);

        // Build command: payroll-runner.js <template> <dataFile> [--headless]
        const args = [PAYROLL_BERAS_TEMPLATE, PAYROLL_BERAS_DATA_FILE];
        if (headless) args.push('--headless');

        console.log(`[PayrollBeras API] Spawning: node ${PAYROLL_BERAS_RUNNER_PATH} ${args.join(' ')}`);

        const child = spawn('node', [PAYROLL_BERAS_RUNNER_PATH, ...args], {
            cwd: PAYROLL_BERAS_ENGINE_DIR,
            env: { ...process.env },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        currentBerasPayrollProcess = child;
        let childClosed = false;

        res.on('close', () => {
            if (!childClosed && currentBerasPayrollProcess === child) {
                stopBerasPayrollProcess();
            }
        });

        // Handle spawn errors
        child.on('error', (err) => {
            childClosed = true;
            if (currentBerasPayrollProcess === child) currentBerasPayrollProcess = null;
            console.error('[PayrollBeras] Spawn error:', err);
            sendChunk('error', `Failed to start beras runner: ${err.message}`);
            sendChunk('complete', { code: 1, error: err.message, employees: prepResult.data.employees.length, components: totalComponents });
            endStream();
        });

        child.stdout.on('data', (data) => {
            const lines = data.toString().split('\n').filter(line => line.trim());
            lines.forEach(line => sendChunk('log', line));
        });

        child.stderr.on('data', (data) => {
            sendChunk('error', data.toString());
        });

        child.on('close', (code) => {
            childClosed = true;
            if (currentBerasPayrollProcess === child) currentBerasPayrollProcess = null;
            if (code !== 0) {
                sendChunk('error', `Beras runner exited with code ${code}`);
            }
            sendChunk('complete', { code, employees: prepResult.data.employees.length, components: totalComponents });
            endStream();
        });

    } catch (error) {
        console.error('[PayrollBeras API] Error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
        }
    }
});

// Prepare lembur adjustment data (supports both snapshot and live data; inputs only Venus - Millware shortfall)
app.post('/api/payroll/lembur-adjustment/prepare', async (req, res) => {
    const { month, year } = req.body;
    const payrollSource = buildPayrollSourceOptions(req.body);

    if (!month || !year) {
        return res.status(400).json({ error: 'month and year are required' });
    }

    try {
        console.log(`[PayrollLemburAdjustment API] Preparing data for ${month}/${year}`);

        const result = await prepareLemburAdjustmentData(month, year, { payrollSource });
        if (!result.success) {
            throw new Error(result.error);
        }

        const data = result.data;
        const summary = {
            totalEmployees: data.employees.length,
            totalComponents: data.metadata.totalComponents,
            skippedDuplicates: data.metadata.skippedDuplicates,
            skippedAlreadyExists: data.metadata.skippedAlreadyExists,
            isLemburAdjustmentOnly: data.metadata.isLemburAdjustmentOnly,
            inputType: data.metadata.inputType,
            payrollSource: data.metadata.payrollSource,
            snapshotId: data.metadata.snapshotId
        };

        console.log(`[PayrollLemburAdjustment API] Prepared ${summary.totalEmployees} employees with ${summary.totalComponents} lembur adjustment components`);

        res.json({
            success: true,
            message: `Data adjustment lembur siap untuk ${summary.totalEmployees} karyawan (input: SELISIH amount)`,
            employees: data.employees.map(e => ({
                name: e.employeeName,
                ptrjId: e.ptrjId,
                component: e.components?.[0] ? {
                    key: e.components[0].componentKey,
                    venusAmount: e.components[0].originalVenusAmount,
                    millwareAmount: e.components[0].originalMillwareAmount,
                    inputAmount: e.components[0].inputAmount,
                    note: e.components[0].note
                } : null
            })),
            summary
        });
    } catch (error) {
        console.error('[PayrollLemburAdjustment API] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Run lembur adjustment automation via browser
app.post('/api/payroll/lembur-adjustment/run', async (req, res) => {
    const { month, year } = req.body;
    const payrollSource = buildPayrollSourceOptions(req.body);
    const dryRun = req.body.dryRun === true
        || String(req.body.dryRun || '').toLowerCase() === 'true'
        || String(req.body.runMode || '').toLowerCase() === 'dry-run';

    if (!month || !year) {
        return res.status(400).json({ error: 'month and year are required' });
    }

    try {
        console.log(`[PayrollLemburAdjustment API] Running automation for ${month}/${year}`);

        const prepResult = await prepareLemburAdjustmentData(month, year, { payrollSource });
        if (!prepResult.success) {
            throw new Error(prepResult.error);
        }

        if (prepResult.data.employees.length === 0) {
            return res.json({
                success: true,
                message: 'Tidak ada adjustment lembur yang perlu diinputkan',
                employeesProcessed: 0
            });
        }

        const totalComponents = prepResult.data.employees.reduce((sum, emp) => sum + (emp.components?.length || 0), 0);
        const headless = req.body.headless === true || req.body.browserMode === 'headless';
        const workerCount = Math.max(4, Math.min(10, parseInt(req.body.workerCount || req.body.workers || req.body.tabs || 4, 10) || 4));

        if (dryRun) {
            const dryRunResult = runPayrollDryRun(PAYROLL_LEMBUR_ADJUSTMENT_DATA_FILE, {
                quiet: true,
                payload: prepResult.data
            });

            if (!dryRunResult.success) {
                return res.status(422).json({
                    success: false,
                    error: 'Dry-run validation failed',
                    errors: dryRunResult.errors,
                    warnings: dryRunResult.warnings,
                    employeesProcessed: dryRunResult.employeeCount,
                    componentsProcessed: dryRunResult.rowCount
                });
            }

            return res.json({
                success: true,
                message: `Dry-run OK: ${dryRunResult.employeeCount} karyawan, ${dryRunResult.rowCount} baris adjustment lembur siap diinput (SELISIH amount)`,
                employeesProcessed: dryRunResult.employeeCount,
                componentsProcessed: dryRunResult.rowCount,
                warnings: dryRunResult.warnings,
                rows: dryRunResult.rows
            });
        }

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
        const endStream = () => {
            try {
                res.end();
            } catch (e) {
                // Response closed
            }
        };

        sendChunk('info', `Memproses ${prepResult.data.employees.length} karyawan dengan ${totalComponents} baris adjustment lembur (SELISIH amount)`);
        sendChunk('log', `Template: ${PAYROLL_LEMBUR_ADJUSTMENT_TEMPLATE}`);
        sendChunk('log', `Data file: ${PAYROLL_LEMBUR_ADJUSTMENT_DATA_FILE}`);
        sendChunk('log', `Parallel workers/tabs: ${workerCount} (isolated 1 row per worker)`);

        const args = [
            '--tabs',
            String(workerCount),
            '--isolate-rows',
            PAYROLL_LEMBUR_ADJUSTMENT_TEMPLATE,
            PAYROLL_LEMBUR_ADJUSTMENT_DATA_FILE
        ];
        args.push(headless ? '--headless' : '--no-headless');

        console.log(`[PayrollLemburAdjustment API] Spawning: node ${PAYROLL_PARALLEL_RUNNER_PATH} ${args.join(' ')}`);

        const child = spawn('node', [PAYROLL_PARALLEL_RUNNER_PATH, ...args], {
            cwd: PAYROLL_BERAS_ENGINE_DIR,
            env: {
                ...process.env,
                PAYROLL_TABS: String(workerCount),
                AUTOMATION_INSTANCES: String(workerCount),
                HEADLESS: headless ? 'true' : 'false',
                AUTO_CLOSE: 'true'
            },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        currentLemburAdjustmentProcess = child;
        let childClosed = false;

        res.on('close', () => {
            if (!childClosed && currentLemburAdjustmentProcess === child) {
                stopLemburAdjustmentProcess();
            }
        });

        child.on('error', (err) => {
            childClosed = true;
            if (currentLemburAdjustmentProcess === child) currentLemburAdjustmentProcess = null;
            console.error('[PayrollLemburAdjustment] Spawn error:', err);
            sendChunk('error', `Failed to start lembur adjustment runner: ${err.message}`);
            sendChunk('complete', { code: 1, error: err.message, employees: prepResult.data.employees.length, components: totalComponents });
            endStream();
        });

        child.stdout.on('data', (data) => {
            const lines = data.toString().split('\n').filter(line => line.trim());
            lines.forEach(line => sendChunk('log', line));
        });

        child.stderr.on('data', (data) => {
            sendChunk('error', data.toString());
        });

        child.on('close', (code) => {
            childClosed = true;
            if (currentLemburAdjustmentProcess === child) currentLemburAdjustmentProcess = null;
            if (code !== 0) {
                sendChunk('error', `Lembur adjustment runner exited with code ${code}`);
            }
            sendChunk('complete', { code, employees: prepResult.data.employees.length, components: totalComponents, workers: workerCount });
            endStream();
        });
    } catch (error) {
        console.error('[PayrollLemburAdjustment API] Error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
        }
    }
});

// Reset Monthly Allowance/Deduction (PR_ADTRANS) through Millware AD Lists
app.post('/api/payroll/ad-reset/automation/run', async (req, res) => {
    const { month, year, employees } = req.body;
    const requestedMode = String(req.body.targetMode || req.body.scope || req.body.mode || 'all').toLowerCase();
    const targetMode = ['all', 'selected', 'docids', 'duplicates'].includes(requestedMode) ? requestedMode : 'all';
    const dryRun = req.body.dryRun === true || String(req.body.runMode || '').toLowerCase() === 'dry-run';
    const headless = req.body.headless === true || String(req.body.browserMode || '').toLowerCase() === 'headless';
    const limit = Math.max(0, parseInt(req.body.limit || req.body.docLimit || 0, 10) || 0);
    const windowCount = Math.max(1, Math.min(10, parseInt(req.body.windowCount || req.body.windows || req.body.workers || 5, 10) || 5));

    if (!month || !year) {
        return res.status(400).json({ error: 'month and year are required' });
    }

    try {
        const effectiveEmployees = Array.isArray(employees) ? employees : [];
        let effectiveDocIds = parseDocIdsInput([req.body.docIds, req.body.docIdList, req.body.docIdText, req.body.docIDs]);
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

        if (targetMode === 'duplicates' && effectiveDocIds.length === 0) {
            const empCodes = effectiveEmployees
                .map(e => e.empCode || e.ptrjEmployeeID || e.PTRJEmployeeID || e.ptrjId || e.id)
                .map(code => String(code || '').trim())
                .filter(Boolean);
            const dbResult = await fetchDuplicatePayrollADDocIdsFromDB(month, year, empCodes, {
                limit,
                keepStrategy: req.body.keepStrategy
            });
            effectiveDocIds = dbResult.docIds || [];
            docTargets = dbResult.details || [];

            if (effectiveDocIds.length === 0) {
                return res.status(400).json({ error: 'Tidak ada duplicate Monthly Allowance/Deduction untuk dihapus.' });
            }
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
            employees: ['selected', 'duplicates'].includes(targetMode) ? effectiveEmployees : [],
            month,
            year,
            dryRun,
            headless,
            limit,
            windowCount,
            source: targetMode === 'duplicates' ? 'payroll_ad_duplicate_reset' : 'payroll_ad_reset'
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
            message: `Starting Monthly AD Reset: source=${metadata.source}, docIds=${metadata.totalDocIds}, dryRun=${metadata.dryRun}, workers=${metadata.windowCount}`,
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

app.get('/api/payroll/ad-reset/duplicate-doc-ids', async (req, res) => {
    const { month, year, empCodes } = req.query;
    if (!month || !year) {
        return res.status(400).json({ error: 'month and year are required' });
    }

    try {
        const codes = empCodes ? empCodes.split(',').map(code => code.trim()).filter(Boolean) : [];
        const limit = Math.max(0, parseInt(req.query.limit || req.query.docLimit || 0, 10) || 0);
        const result = await fetchDuplicatePayrollADDocIdsFromDB(month, year, codes, {
            limit,
            keepStrategy: req.query.keepStrategy
        });
        res.json({
            success: true,
            docIds: result.docIds,
            details: result.details,
            duplicateGroups: result.duplicateGroups,
            count: result.docIds.length
        });
    } catch (error) {
        console.error('[PayrollADReset Duplicate DocIds API] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Reset Monthly Allowance/Deduction by DCOID (Direct DocID input)
app.post('/api/payroll/ad-reset/by-dcoid/run', async (req, res) => {
    const { dcoids } = req.body;
    const dryRun = req.body.dryRun === true;
    const headless = req.body.headless === true;
    const windowCount = Math.max(1, Math.min(10, parseInt(req.body.windowCount || req.body.windows || 5, 10) || 5));

    if (!dcoids || !Array.isArray(dcoids) || dcoids.length === 0) {
        return res.status(400).json({ error: 'dcoids array is required' });
    }

    try {
        console.log(`[PayrollADReset ByDCOID API] Run request: dcoids=${dcoids.length}, dryRun=${dryRun}, headless=${headless}, windowCount=${windowCount}`);

        const result = await triggerPayrollADResetByDCOIDAutomation({
            dcoids,
            dryRun,
            headless,
            windowCount
        });

        if (!result.success) {
            return res.status(400).json(result);
        }

        // If dryRun, return without starting process
        if (dryRun) {
            return res.json({
                success: true,
                dryRun: true,
                foundCount: result.foundCount,
                notFoundDcoids: result.notFoundDcoids,
                totalInput: result.totalInput,
                docTargets: result.data.docTargets,
                message: `Dry run: ${result.foundCount} DocID(s) found for deletion`
            });
        }

        // Start the automation process
        const child = startPayrollADResetProcess({ dryRun, headless, windowCount });

        // Handle process output streaming
        child.stdout.on('data', (data) => {
            const lines = data.toString().split('\n').filter(Boolean);
            lines.forEach(line => {
                try {
                    const parsed = JSON.parse(line);
                    res.write(`data: ${JSON.stringify(parsed)}\n\n`);
                } catch (_) {
                    res.write(`data: ${JSON.stringify({ type: 'log', message: line })}\n\n`);
                }
            });
        });

        child.stderr.on('data', (data) => {
            res.write(`data: ${JSON.stringify({ type: 'error', message: data.toString() })}\n\n`);
        });

        child.on('exit', (code) => {
            res.write(`data: ${JSON.stringify({ type: 'exit', code })}\n\n`);
            res.end();
        });

        child.on('error', (error) => {
            res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
            res.end();
        });

        // Initial response with SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        res.write(`data: ${JSON.stringify({
            type: 'start',
            success: true,
            foundCount: result.foundCount,
            notFoundDcoids: result.notFoundDcoids,
            totalInput: result.totalInput,
            message: `Starting automation for ${result.foundCount} DocID(s)`
        })}\n\n`);

    } catch (error) {
        console.error('[PayrollADReset ByDCOID API] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Trigger ADTRANS duplicate deletion (keeps latest, deletes older duplicates by EmpCode + DocDesc)
 * POST /api/payroll/ad-reset/duplicates/run
 */
app.post('/api/payroll/ad-reset/duplicates/run', async (req, res) => {
    const { month, year, empCodes } = req.body;
    const dryRun = req.body.dryRun === true;
    const headless = req.body.headless === true;
    const windowCount = Math.max(1, Math.min(10, parseInt(req.body.windowCount || req.body.windows || 5, 10) || 5));
    const limit = Math.max(0, parseInt(req.body.limit || 0, 10) || 0);
    const keepStrategy = String(req.body.keepStrategy || 'latest').toLowerCase(); // 'latest' or 'oldest'

    if (!month || !year) {
        return res.status(400).json({ error: 'month and year are required' });
    }

    try {
        console.log(`[PayrollADReset Duplicates API] Run request: month=${month}, year=${year}, empCodes=${empCodes?.length || 0}, keepStrategy=${keepStrategy}, dryRun=${dryRun}`);

        // Fetch duplicate DocIDs from database
        const codes = Array.isArray(empCodes) ? empCodes : (empCodes ? empCodes.split(',').map(c => c.trim()).filter(Boolean) : []);
        const dbResult = await fetchDuplicatePayrollADDocIdsFromDB(month, year, codes, {
            limit,
            keepStrategy
        });

        if (dbResult.details.length === 0) {
            return res.json({
                success: true,
                dryRun,
                foundCount: 0,
                message: 'Tidak ada duplicate ADTRANS ditemukan untuk periode ini'
            });
        }

        console.log(`[PayrollADReset Duplicates API] Found ${dbResult.details.length} duplicate records to delete`);

        // Prepare data for runner
        const data = preparePayrollADResetData({
            docTargets: dbResult.details,
            docIds: dbResult.docIds,
            month,
            year,
            dryRun,
            headless,
            windowCount,
            source: 'payroll_ad_reset_duplicates'
        });

        // If dryRun, return without starting process
        if (dryRun) {
            return res.json({
                success: true,
                dryRun: true,
                foundCount: dbResult.details.length,
                duplicateGroups: dbResult.duplicateGroups,
                docTargets: dbResult.details,
                message: `Dry run: ${dbResult.details.length} duplicate ADTRANS(s) found (keep ${keepStrategy})`
            });
        }

        // Start the automation process
        const child = startPayrollADResetProcess({ dryRun, headless, windowCount });

        // Handle process output streaming
        child.stdout.on('data', (data) => {
            const lines = data.toString().split('\n').filter(Boolean);
            lines.forEach(line => {
                try {
                    const parsed = JSON.parse(line);
                    res.write(`data: ${JSON.stringify(parsed)}\n\n`);
                } catch (_) {
                    res.write(`data: ${JSON.stringify({ type: 'log', message: line })}\n\n`);
                }
            });
        });

        child.stderr.on('data', (data) => {
            res.write(`data: ${JSON.stringify({ type: 'error', message: data.toString() })}\n\n`);
        });

        child.on('exit', (code) => {
            res.write(`data: ${JSON.stringify({ type: 'exit', code })}\n\n`);
            res.end();
        });

        child.on('error', (error) => {
            res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
            res.end();
        });

        // Initial response with SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        res.write(`data: ${JSON.stringify({
            type: 'start',
            success: true,
            foundCount: dbResult.details.length,
            duplicateGroups: dbResult.duplicateGroups,
            message: `Starting duplicate deletion: ${dbResult.details.length} records (keep ${keepStrategy})`
        })}\n\n`);

    } catch (error) {
        console.error('[PayrollADReset Duplicates API] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Reset ADTRANS where there are differences (multiple DocDesc per employee)
 * POST /api/payroll/ad-reset/differences/run
 */
app.post('/api/payroll/ad-reset/differences/run', async (req, res) => {
    const { month, year, empCodes } = req.body;
    const dryRun = req.body.dryRun === true;
    const headless = req.body.headless === true;
    const windowCount = Math.max(1, Math.min(10, parseInt(req.body.windowCount || req.body.windows || 5, 10) || 5));
    const limit = Math.max(0, parseInt(req.body.limit || 0, 10) || 0);

    if (!month || !year) {
        return res.status(400).json({ error: 'month and year are required' });
    }

    try {
        console.log(`[PayrollADReset Differences API] Run request: month=${month}, year=${year}, empCodes=${empCodes?.length || 0}, dryRun=${dryRun}`);

        const result = await triggerPayrollADResetByDifferenceAutomation({
            month, year, empCodes,
            dryRun, headless, windowCount, limit
        });

        if (!result.success) {
            return res.status(400).json(result);
        }

        if (dryRun) {
            return res.json({
                success: true,
                dryRun: true,
                foundCount: result.foundCount,
                employeeGroups: result.employeeGroups,
                employeeCount: result.employeeCount,
                docTargets: result.data?.docTargets,
                message: result.message
            });
        }

        // Start automation process
        const child = startPayrollADResetProcess({ dryRun, headless, windowCount });

        child.stdout.on('data', (data) => {
            const lines = data.toString().split('\n').filter(Boolean);
            lines.forEach(line => {
                try {
                    const parsed = JSON.parse(line);
                    res.write(`data: ${JSON.stringify(parsed)}\n\n`);
                } catch (_) {
                    res.write(`data: ${JSON.stringify({ type: 'log', message: line })}\n\n`);
                }
            });
        });

        child.stderr.on('data', (data) => {
            res.write(`data: ${JSON.stringify({ type: 'error', message: data.toString() })}\n\n`);
        });

        child.on('exit', (code) => {
            res.write(`data: ${JSON.stringify({ type: 'exit', code })}\n\n`);
            res.end();
        });

        child.on('error', (error) => {
            res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
            res.end();
        });

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        res.write(`data: ${JSON.stringify({
            type: 'start',
            success: true,
            foundCount: result.foundCount,
            employeeCount: result.employeeCount,
            message: result.message
        })}\n\n`);

    } catch (error) {
        console.error('[PayrollADReset Differences API] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Get preview of AD records with amount differences (Venus vs Millware)
 * GET /api/payroll/ad-reset/amount-differences?month=6&year=2026&empCodes=POM00017,POM00018&tolerance=50
 */
app.get('/api/payroll/ad-reset/amount-differences', async (req, res) => {
    const month = parseInt(req.query.month, 10);
    const year = parseInt(req.query.year, 10);
    const payrollSource = buildPayrollSourceOptions(req.query);
    const empCodes = req.query.empCodes
        ? String(req.query.empCodes).split(',').map(c => c.trim()).filter(Boolean)
        : [];
    const limit = Math.max(0, parseInt(req.query.limit || 0, 10) || 0);
    // Default tolerance 50 rupiah (matches payrollService.js PAYROLL_TOLERANCE)
    const tolerance = Math.max(1, parseInt(req.query.tolerance || 50, 10) || 50);

    if (!month || !year) {
        return res.status(400).json({ error: 'month and year are required' });
    }

    try {
        console.log(`[PayrollADReset AmountDiff API] Fetch: month=${month}, year=${year}, empCodes=${empCodes.length}, tolerance=${tolerance}`);

        const result = await fetchAmountDifferenceADDocIdsFromDB(month, year, empCodes, {
            limit,
            tolerance,
            payrollSource
        });

        res.json({
            success: true,
            docIds: result.docIds,
            employeeCount: result.employeeCount,
            totalRecords: result.totalRecords,
            tolerance: result.tolerance,
            venusEmployeeCount: result.venusEmployeeCount,
            millwareEmployeeCount: result.millwareEmployeeCount,
            employees: result.employees,
            preview: result.details.slice(0, 10)
        });

    } catch (error) {
        console.error('[PayrollADReset AmountDiff API] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Reset ADTRANS where there are amount differences (Venus vs Millware)
 * POST /api/payroll/ad-reset/amount-differences/run
 */
app.post('/api/payroll/ad-reset/amount-differences/run', async (req, res) => {
    const { month, year, empCodes } = req.body;
    const payrollSource = buildPayrollSourceOptions(req.body);
    const dryRun = req.body.dryRun === true;
    const headless = req.body.headless === true;
    const windowCount = Math.max(1, Math.min(10, parseInt(req.body.windowCount || req.body.windows || 5, 10) || 5));
    const limit = Math.max(0, parseInt(req.body.limit || 0, 10) || 0);
    // Default tolerance 50 rupiah (matches payrollService.js PAYROLL_TOLERANCE)
    const tolerance = Math.max(1, parseInt(req.body.tolerance || 50, 10) || 50);

    if (!month || !year) {
        return res.status(400).json({ error: 'month and year are required' });
    }

    try {
        console.log(`[PayrollADReset AmountDiff API] Run: month=${month}, year=${year}, empCodes=${empCodes?.length || 0}, dryRun=${dryRun}, tolerance=${tolerance}`);

        const result = await triggerPayrollADResetByAmountDifferenceAutomation({
            month, year, empCodes,
            dryRun, headless, windowCount, limit, tolerance,
            payrollSource
        });

        if (!result.success) {
            return res.status(400).json(result);
        }

        if (dryRun) {
            return res.json({
                success: true,
                dryRun: true,
                foundCount: result.foundCount,
                employees: result.employees,
                employeeCount: result.employeeCount,
                tolerance: result.tolerance,
                docTargets: result.data?.docTargets,
                message: result.message
            });
        }

        // Start automation process
        const child = startPayrollADResetProcess({ dryRun, headless, windowCount });

        child.stdout.on('data', (data) => {
            const lines = data.toString().split('\n').filter(Boolean);
            lines.forEach(line => {
                try {
                    const parsed = JSON.parse(line);
                    res.write(`data: ${JSON.stringify(parsed)}\n\n`);
                } catch (_) {
                    res.write(`data: ${JSON.stringify({ type: 'log', message: line })}\n\n`);
                }
            });
        });

        child.stderr.on('data', (data) => {
            res.write(`data: ${JSON.stringify({ type: 'error', message: data.toString() })}\n\n`);
        });

        child.on('exit', (code) => {
            res.write(`data: ${JSON.stringify({ type: 'exit', code })}\n\n`);
            res.end();
        });

        child.on('error', (error) => {
            res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
            res.end();
        });

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        res.write(`data: ${JSON.stringify({
            type: 'start',
            success: true,
            foundCount: result.foundCount,
            employeeCount: result.employeeCount,
            tolerance: result.tolerance,
            message: result.message
        })}\n\n`);

    } catch (error) {
        console.error('[PayrollADReset AmountDiff API] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Preview MINUS_OVT ADTRANS deletion (Kurang Bayar Overtime)
 * GET /api/payroll/ad-reset/minus-ovt/preview?month=6&year=2026&empCodes=POM00020,POM00023
 */
app.get('/api/payroll/ad-reset/minus-ovt/preview', async (req, res) => {
    const { month, year, empCodes, limit } = req.query;
    const payrollSource = buildPayrollSourceOptions(req.query);
    const parsedLimit = Math.max(0, parseInt(limit || 0, 10) || 0);

    if (!month || !year) {
        return res.status(400).json({ error: 'month and year are required' });
    }

    try {
        console.log(`[PayrollADReset MinusOvt API] Preview: month=${month}, year=${year}, empCodes=${empCodes?.length || 0}`);

        const result = await fetchMinusOvtADDocIdsFromDB(
            parseInt(month, 10),
            parseInt(year, 10),
            empCodes ? empCodes.split(',').map(e => e.trim()) : [],
            { limit: parsedLimit, payrollSource }
        );

        res.json({
            success: true,
            foundCount: result.docIds.length,
            employeeCount: result.employeeCount,
            employees: result.employees.map(e => ({
                empCode: e.empCode,
                empName: e.empName,
                minusOvt: e.minusOvt,
                ot1: e.ot1,
                ot2: e.ot2,
                ot3: e.ot3,
                totalLembur: e.totalLembur
            })),
            docIds: result.docIds,
            docTargets: result.details,
            venusEmployeeCount: result.venusEmployeeCount,
            millwareEmployeeCount: result.millwareEmployeeCount,
            message: result.employeeCount > 0
                ? `${result.docIds.length} ADTRANS (lembur) dari ${result.employeeCount} employee dengan MINUS_OVT`
                : result.message
        });

    } catch (error) {
        console.error('[PayrollADReset MinusOvt API] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Run MINUS_OVT ADTRANS deletion (Kurang Bayar Overtime)
 * POST /api/payroll/ad-reset/minus-ovt/run
 */
app.post('/api/payroll/ad-reset/minus-ovt/run', async (req, res) => {
    const { month, year, empCodes } = req.body;
    const payrollSource = buildPayrollSourceOptions(req.body);
    const dryRun = req.body.dryRun === true;
    const headless = req.body.headless === true;
    const windowCount = Math.max(1, Math.min(10, parseInt(req.body.windowCount || req.body.windows || 5, 10) || 5));
    const limit = Math.max(0, parseInt(req.body.limit || 0, 10) || 0);

    if (!month || !year) {
        return res.status(400).json({ error: 'month and year are required' });
    }

    try {
        console.log(`[PayrollADReset MinusOvt API] Run: month=${month}, year=${year}, empCodes=${empCodes?.length || 0}, dryRun=${dryRun}`);

        const result = await triggerPayrollADResetByMinusOvtAutomation({
            month, year, empCodes,
            dryRun, headless, windowCount, limit,
            payrollSource
        });

        if (!result.success) {
            return res.status(400).json(result);
        }

        if (dryRun) {
            return res.json({
                success: true,
                dryRun: true,
                foundCount: result.foundCount,
                employees: result.employees,
                employeeCount: result.employeeCount,
                docTargets: result.data?.docTargets,
                message: result.message
            });
        }

        // Start automation process
        const child = startPayrollADResetProcess({ dryRun, headless, windowCount });

        child.stdout.on('data', (data) => {
            const lines = data.toString().split('\n').filter(Boolean);
            lines.forEach(line => {
                try {
                    const parsed = JSON.parse(line);
                    res.write(`data: ${JSON.stringify(parsed)}\n\n`);
                } catch (_) {
                    res.write(`data: ${JSON.stringify({ type: 'log', message: line })}\n\n`);
                }
            });
        });

        child.stderr.on('data', (data) => {
            res.write(`data: ${JSON.stringify({ type: 'error', message: data.toString() })}\n\n`);
        });

        child.on('exit', (code) => {
            res.write(`data: ${JSON.stringify({ type: 'exit', code })}\n\n`);
            res.end();
        });

        child.on('error', (error) => {
            res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
            res.end();
        });

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        res.write(`data: ${JSON.stringify({
            type: 'start',
            success: true,
            foundCount: result.foundCount,
            employeeCount: result.employeeCount,
            message: result.message
        })}\n\n`);

    } catch (error) {
        console.error('[PayrollADReset MinusOvt API] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- OT Reset Routes ---
const { triggerOTResetAutomation, startOTResetProcess, stopOTResetProcess, fetchDocIdsFromDB, resolveDocTargetsFromDB } = require('./services/otResetService');

// Run OT Reset automation
app.post('/api/ot-reset/automation/run', async (req, res) => {
    const { employees, startDate, endDate, category, month, year } = req.body;
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
        let effectiveDocIds = parseDocIdsInput([req.body.docIds, req.body.docIdList, req.body.docIdText, req.body.docIDs]);
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

        if (targetMode === 'docids' && effectiveDocIds.length > 0) {
            const requestedDocIds = effectiveDocIds;
            const dbResult = await resolveDocTargetsFromDB(parseInt(month, 10), parseInt(year, 10), requestedDocIds, { category });
            const resolvedTargets = dbResult.docTargets || [];
            const missingTargets = (dbResult.missing || []).map(id => ({ docNumber: id, label: id }));

            effectiveDocIds = [
                ...(dbResult.docIds || []),
                ...missingTargets.map(target => target.docNumber)
            ];
            docTargets = [...resolvedTargets, ...missingTargets];

            if (dbResult.missing && dbResult.missing.length > 0) {
                console.warn(`[OTReset API] Manual DocID not resolved in DB, runner will search list page: ${dbResult.missing.join(', ')}`);
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

// Initialize local application databases
Promise.all([
    stagingService.initStagingDB(),
    payrollSnapshotService.initPayrollSnapshotDB()
]).then(() => {
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
}).catch((error) => {
    console.error('Failed to initialize local databases:', error);
    process.exit(1);
});
