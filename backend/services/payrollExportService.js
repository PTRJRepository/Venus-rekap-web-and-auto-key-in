const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { fetchPayrollData } = require('./payrollService');
const { format } = require('date-fns');

const EXPORT_DIR = path.resolve(__dirname, '../../ekstrak absen');

const ensureExportDir = () => {
    if (!fs.existsSync(EXPORT_DIR)) {
        fs.mkdirSync(EXPORT_DIR, { recursive: true });
    }
};

/**
 * Column definitions for payroll comparison export
 */
const COLUMN_HEADERS = [
    { key: 'employeeId', header: 'Employee ID' },
    { key: 'employeeName', header: 'Nama Karyawan' },
    { key: 'ptrjId', header: 'PTRJ ID' },
    { key: 'chargeJob', header: 'Charge Job' },
    { key: 'syncStatus', header: 'Status' },
    // Gaji Pokok
    { key: 'gajiPokokVenus', header: 'Gaji Pokok (Venus)' },
    { key: 'gajiPokokMillware', header: 'Gaji Pokok (Millware)' },
    { key: 'gajiPokokStatus', header: 'Gaji Pokok Status' },
    // Tunjangan
    { key: 'jabatanVenus', header: 'Tunj. Jabatan (Venus)' },
    { key: 'jabatanMillware', header: 'Tunj. Jabatan (Millware)' },
    { key: 'jabatanStatus', header: 'Jabatan Status' },
    { key: 'berasVenus', header: 'Tunj. Beras (Venus)' },
    { key: 'berasMillware', header: 'Tunj. Beras (Millware)' },
    { key: 'berasStatus', header: 'Beras Status' },
    { key: 'masaKerjaVenus', header: 'Tunj. Masa Kerja (Venus)' },
    { key: 'masaKerjaMillware', header: 'Tunj. Masa Kerja (Millware)' },
    { key: 'masaKerjaStatus', header: 'Masa Kerja Status' },
    { key: 'lemburVenus', header: 'Tunj. Lembur (Venus)' },
    { key: 'lemburMillware', header: 'Tunj. Lembur (Millware)' },
    { key: 'lemburStatus', header: 'Lembur Status' },
    { key: 'premiVenus', header: 'Premi (Venus)' },
    { key: 'premiMillware', header: 'Premi (Millware)' },
    { key: 'premiStatus', header: 'Premi Status' },
    // Potongan
    { key: 'pph21Venus', header: 'PPH21 (Venus)' },
    { key: 'pph21Millware', header: 'PPH21 (Millware)' },
    { key: 'pph21Status', header: 'PPH21 Status' },
    { key: 'bpjsKesVenus', header: 'BPJS Kesehatan (Venus)' },
    { key: 'bpjsKesMillware', header: 'BPJS Kesehatan (Millware)' },
    { key: 'bpjsKesStatus', header: 'BPJS Kes Status' },
    { key: 'bpjsPenVenus', header: 'BPJS Pensiun (Venus)' },
    { key: 'bpjsPenMillware', header: 'BPJS Pensiun (Millware)' },
    { key: 'bpjsPenStatus', header: 'BPJS Pen Status' },
    { key: 'spsiVenus', header: 'SPSI (Venus)' },
    { key: 'spsiMillware', header: 'SPSI (Millware)' },
    { key: 'spsiStatus', header: 'SPSI Status' },
    // Summary
    { key: 'totalTunjanganVenus', header: 'Total Tunjangan (Venus)' },
    { key: 'totalPotonganVenus', header: 'Total Potongan (Venus)' },
    { key: 'upahBersihVenus', header: 'Upah Bersih (Venus)' },
    { key: 'upahBersihMillware', header: 'Upah Bersih (Millware)' },
    { key: 'upahBersihStatus', header: 'Upah Bersih Status' },
];

/**
 * Convert payroll data to flat export rows
 */
const flattenPayrollData = (data, filter = 'all') => {
    return data
        .filter(row => {
            if (filter === 'all') return true;
            if (filter === 'matched') return row.sync?.isSynced === true;
            if (filter === 'mismatched') return row.sync?.isSynced === false && row.millware;
            if (filter === 'no_millware') return !row.millware;
            return true;
        })
        .map(row => {
            const sync = row.sync || {};
            const getStatus = (key) => {
                const comp = sync[key];
                if (!comp) return '-';
                const diff = Math.abs(comp.venus - comp.millware);
                if (diff <= 50) return 'MATCH';
                return 'DIFF';
            };

            return {
                employeeId: row.id || '-',
                employeeName: row.name || '-',
                ptrjId: row.ptrjId || '-',
                chargeJob: row.chargeJob || '-',
                syncStatus: sync.isSynced ? 'SYNC' : (row.millware ? 'DIFF' : 'NO MW'),
                // Gaji Pokok
                gajiPokokVenus: sync.gajiPokok?.venus || 0,
                gajiPokokMillware: sync.gajiPokok?.millware || 0,
                gajiPokokStatus: getStatus('gajiPokok'),
                // Tunjangan
                jabatanVenus: sync.jabatan?.venus || 0,
                jabatanMillware: sync.jabatan?.millware || 0,
                jabatanStatus: getStatus('jabatan'),
                berasVenus: sync.beras?.venus || 0,
                berasMillware: sync.beras?.millware || 0,
                berasStatus: sync.berasStatus?.status || getStatus('beras'),
                masaKerjaVenus: sync.masaKerja?.venus || 0,
                masaKerjaMillware: sync.masaKerja?.millware || 0,
                masaKerjaStatus: getStatus('masaKerja'),
                lemburVenus: sync.lembur?.venus || 0,
                lemburMillware: sync.lembur?.millware || 0,
                lemburStatus: getStatus('lembur'),
                premiVenus: sync.premi?.venus || 0,
                premiMillware: sync.premi?.millware || 0,
                premiStatus: getStatus('premi'),
                // Potongan
                pph21Venus: sync.pph21?.venus || 0,
                pph21Millware: sync.pph21?.millware || 0,
                pph21Status: getStatus('pph21'),
                bpjsKesVenus: sync.bpjsKes?.venus || 0,
                bpjsKesMillware: sync.bpjsKes?.millware || 0,
                bpjsKesStatus: getStatus('bpjsKes'),
                bpjsPenVenus: sync.bpjsPen?.venus || 0,
                bpjsPenMillware: sync.bpjsPen?.millware || 0,
                bpjsPenStatus: getStatus('bpjsPen'),
                spsiVenus: sync.spsi?.venus || 0,
                spsiMillware: sync.spsi?.millware || 0,
                spsiStatus: getStatus('spsi'),
                // Summary
                totalTunjanganVenus: row.tunjanganTotal || 0,
                totalPotonganVenus: row.potonganTotal || 0,
                upahBersihVenus: sync.upahBersih?.venus || 0,
                upahBersihMillware: sync.upahBersih?.millware || 0,
                upahBersihStatus: getStatus('upahBersih'),
            };
        });
};

/**
 * Escape CSV value (handle commas, quotes, newlines)
 */
const escapeCSVValue = (value) => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
};

/**
 * Format number for display (with thousand separator)
 */
const formatNumber = (num) => {
    if (num === null || num === undefined || num === '') return '';
    const n = Number(num);
    if (isNaN(n)) return num;
    return n.toLocaleString('id-ID');
};

/**
 * Export payroll comparison to CSV
 */
const exportPayrollToCSV = async (month, year, filter = 'all', payrollSourceOptions = {}) => {
    ensureExportDir();

    console.log(`[PayrollExport] Exporting CSV for ${month}/${year}, filter: ${filter}`);

    // Fetch payroll data
    const result = await fetchPayrollData(month, year, payrollSourceOptions);
    if (!result.success) {
        throw new Error(result.error || 'Failed to fetch payroll data');
    }

    const rows = flattenPayrollData(result.data, filter);

    if (rows.length === 0) {
        return { count: 0, message: 'No data to export with current filter' };
    }

    // Build CSV content
    const headers = COLUMN_HEADERS.map(col => col.header);
    const csvRows = rows.map(row => {
        return COLUMN_HEADERS.map(col => {
            const value = row[col.key];
            // Format numbers with thousand separator
            if (typeof value === 'number' && col.key.includes('Venus') || col.key.includes('Millware')) {
                return formatNumber(value);
            }
            return escapeCSVValue(value);
        }).join(',');
    });

    const csvContent = [headers.join(','), ...csvRows].join('\n');

    // Write file
    const timestamp = format(new Date(), 'yyyyMMdd_HHmmss');
    const periodLabel = `${year}${String(month).padStart(2, '0')}`;
    const filename = `payroll_comparison_${periodLabel}_${filter}_${timestamp}.csv`;
    const filePath = path.join(EXPORT_DIR, filename);

    fs.writeFileSync(filePath, '﻿' + csvContent, 'utf-8'); // BOM for Excel compatibility

    console.log(`[PayrollExport] CSV exported to ${filePath}`);

    return {
        filename,
        path: filePath,
        count: rows.length,
        period: periodLabel
    };
};

/**
 * Export payroll comparison to Excel
 */
const exportPayrollToExcel = async (month, year, filter = 'all', payrollSourceOptions = {}) => {
    ensureExportDir();

    console.log(`[PayrollExport] Exporting Excel for ${month}/${year}, filter: ${filter}`);

    // Fetch payroll data
    const result = await fetchPayrollData(month, year, payrollSourceOptions);
    if (!result.success) {
        throw new Error(result.error || 'Failed to fetch payroll data');
    }

    const rows = flattenPayrollData(result.data, filter);

    if (rows.length === 0) {
        return { count: 0, message: 'No data to export with current filter' };
    }

    // Create workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Venus Payroll System';
    workbook.created = new Date();

    // Create main sheet
    const worksheet = workbook.addWorksheet('Perbandingan Payroll');

    // Set column widths
    worksheet.columns = COLUMN_HEADERS.map(col => ({
        key: col.key,
        width: col.header.length + 2
    }));

    // Add title row
    const periodLabel = `${year}-${String(month).padStart(2, '0')}`;
    worksheet.insertRow(1, [`Perbandingan Payroll Millware vs Venus - ${periodLabel}`]);
    worksheet.mergeCells(1, 1, 1, COLUMN_HEADERS.length);
    worksheet.getRow(1).font = { bold: true, size: 14 };
    worksheet.getRow(1).alignment = { horizontal: 'center' };

    // Add filter info row
    const filterLabel = filter === 'all' ? 'Semua' :
                       filter === 'matched' ? 'Matched (Sesuai)' :
                       filter === 'mismatched' ? 'Mismatched (Selisih)' :
                       filter === 'no_millware' ? 'No Millware' : filter;
    worksheet.insertRow(2, [`Filter: ${filterLabel} | Total: ${rows.length} karyawan`]);
    worksheet.mergeCells(2, 1, 2, COLUMN_HEADERS.length);
    worksheet.getRow(2).font = { italic: true, size: 10 };
    worksheet.getRow(2).alignment = { horizontal: 'center' };

    // Add header row (row 3)
    const headerRow = worksheet.addRow(COLUMN_HEADERS.map(col => col.header));
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5496' } };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

    // Add data rows
    rows.forEach((row, index) => {
        const dataRow = worksheet.addRow(
            COLUMN_HEADERS.map(col => {
                const value = row[col.key];
                // Format numbers
                if (typeof value === 'number' &&
                    (col.key.includes('Venus') || col.key.includes('Millware'))) {
                    return value;
                }
                return value;
            })
        );

        // Apply number format for currency columns
        COLUMN_HEADERS.forEach((col, colIndex) => {
            const cell = dataRow.getCell(colIndex + 1);
            if (col.key.includes('Venus') || col.key.includes('Millware')) {
                cell.numFmt = '#,##0';
            }

            // Color coding based on status
            if (col.key.includes('Status')) {
                const status = row[col.key];
                if (status === 'MATCH') {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00FF00' } };
                } else if (status === 'DIFF') {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF0000' } };
                    cell.font = { color: { argb: 'FFFFFFFF' } };
                }
                cell.alignment = { horizontal: 'center' };
            }
        });

        // Alternate row colors for readability
        if (index % 2 === 0) {
            dataRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
        }

        // Highlight sync status column
        const statusCell = dataRow.getCell(5); // syncStatus is 5th column
        if (row.syncStatus === 'SYNC') {
            statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00FF00' } };
        } else if (row.syncStatus === 'DIFF') {
            statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF6600' } };
        } else if (row.syncStatus === 'NO MW') {
            statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF0000' } };
            statusCell.font = { color: { argb: 'FFFFFFFF' } };
        }
    });

    // Freeze header row
    worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 3 }];

    // Write file
    const timestamp = format(new Date(), 'yyyyMMdd_HHmmss');
    const periodStr = `${year}${String(month).padStart(2, '0')}`;
    const filename = `payroll_comparison_${periodStr}_${filter}_${timestamp}.xlsx`;
    const filePath = path.join(EXPORT_DIR, filename);

    await workbook.xlsx.writeFile(filePath);

    console.log(`[PayrollExport] Excel exported to ${filePath}`);

    return {
        filename,
        path: filePath,
        count: rows.length,
        period: periodStr
    };
};

/**
 * Export payroll comparison data (CSV or Excel)
 */
const exportPayroll = async (month, year, format = 'csv', filter = 'all', payrollSourceOptions = {}) => {
    if (format === 'xlsx' || format === 'excel') {
        return exportPayrollToExcel(month, year, filter, payrollSourceOptions);
    }
    return exportPayrollToCSV(month, year, filter, payrollSourceOptions);
};

module.exports = {
    exportPayroll,
    exportPayrollToCSV,
    exportPayrollToExcel,
    flattenPayrollData,
    COLUMN_HEADERS
};
