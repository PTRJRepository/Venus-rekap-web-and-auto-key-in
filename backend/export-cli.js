/**
 * CLI Export Tool for Attendance Data
 * 
 * Usage:
 *   node export-cli.js --month 1 --year 2026
 *   node export-cli.js --month 1 --year 2026 --no-attendance
 * 
 * Flags:
 *   --month <number>       Month to export (1-12)
 *   --year <number>        Year to export
 *   --no-attendance        Use overtime-only mode (skip T_Machine table)
 *   --output <path>        Output file path (optional)
 */

const { fetchAttendanceData, fetchAttendanceDataOvertimeOnly } = require('./services/attendanceService');
const fs = require('fs');
const path = require('path');
const { format } = require('date-fns');

// Parse CLI arguments
const args = process.argv.slice(2);
const getArg = (name) => {
    const index = args.indexOf(`--${name}`);
    return index !== -1 ? args[index + 1] : null;
};
const hasFlag = (name) => args.includes(`--${name}`);

// Get parameters
const month = parseInt(getArg('month'));
const year = parseInt(getArg('year'));
const noAttendance = hasFlag('no-attendance');
const outputPath = getArg('output');

// Validate
if (!month || !year || isNaN(month) || isNaN(year)) {
    console.error('⚠️  Parameter tidak lengkap.');
    console.log('');
    console.log('Cara pakai:');
    console.log('  node export-cli.js --month 1 --year 2026');
    console.log('  node export-cli.js --month 1 --year 2026 --no-attendance');
    console.log('');
    console.log('Flags:');
    console.log('  --month <number>       Bulan yang akan diexport (1-12)');
    console.log('  --year <number>        Tahun');
    console.log('  --no-attendance        Gunakan mode overtime-only (skip T_Machine)');
    console.log('  --output <path>        Path output file (optional)');
    process.exit(1);
}

// Main execution
(async () => {
    console.log('\n' + '═'.repeat(50));
    console.log('  📊 ATTENDANCE DATA EXPORT');
    console.log('═'.repeat(50) + '\n');

    console.log(`📅 Period: ${month}/${year}`);
    console.log(`🔧 Mode: ${noAttendance ? 'OVERTIME-ONLY' : 'FULL (T_Machine + Overtime)'}`);
    console.log('');

    try {
        // Fetch data based on mode
        console.log('📥 Fetching data...');
        let data;

        if (noAttendance) {
            console.log('   Using overtime-only mode (no T_Machine)');
            data = await fetchAttendanceDataOvertimeOnly(month, year);
        } else {
            console.log('   Using full mode (T_Machine + Overtime)');
            data = await fetchAttendanceData(month, year);
        }

        console.log(`✅ Fetched ${data.length} employees`);

        // Prepare output
        const exportData = {
            metadata: {
                export_date: new Date().toISOString(),
                period_start: format(new Date(year, month - 1, 1), 'yyyy-MM-dd'),
                period_end: format(new Date(year, month, 0), 'yyyy-MM-dd'),
                mode: noAttendance ? 'overtime-only' : 'full',
                total_employees: data.length
            },
            data: data.map(emp => ({
                EmployeeID: emp.id,
                EmployeeName: emp.name,
                PTRJEmployeeID: emp.ptrjEmployeeID,
                ChargeJob: emp.chargeJob,
                Attendance: Object.fromEntries(
                    Object.values(emp.attendance)
                        .filter(a => a.status !== 'OFF' && a.status !== 'N/A' && a.status !== 'ALFA')
                        .map(a => {
                            let overrideJob = undefined;
                            if (a.status.toUpperCase() === 'SAKIT' || a.isSickLeave) {
                                overrideJob = 'personal sick leave';
                            } else if (a.status.toUpperCase() === 'IZIN' || a.isAnnualLeave) {
                                overrideJob = 'personal annual leave';
                            }
                            return [a.date, { ...a, ChargeJob: overrideJob }];
                        })
                )
            }))
        };

        // Determine output path
        const timestamp = format(new Date(), 'yyyyMMdd_HHmmss');
        const defaultFileName = `export_${noAttendance ? 'ot-only_' : ''}${year}-${String(month).padStart(2, '0')}_${timestamp}.json`;
        const finalPath = outputPath || path.join(__dirname, '..', 'ekstrak absen', defaultFileName);

        // Ensure directory exists
        const dir = path.dirname(finalPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Write file
        fs.writeFileSync(finalPath, JSON.stringify(exportData, null, 2), 'utf-8');

        console.log('');
        console.log('═'.repeat(50));
        console.log(`✅ Export berhasil!`);
        console.log(`📁 File: ${finalPath}`);
        console.log(`👥 Employees: ${exportData.data.length}`);
        console.log('═'.repeat(50) + '\n');

    } catch (error) {
        console.error('\n💥 Error:', error.message);
        process.exit(1);
    }
})();
