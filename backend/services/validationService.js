/**
 * Validation Service
 * Validates automation input by querying PR_TASKREGLN and generates Excel reports
 */

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { executeQuery } = require('./gateway');

// Validation log storage directory
const VALIDATION_DIR = path.join(__dirname, '../../validation_logs');
const VALIDATION_LOG_FILE = path.join(VALIDATION_DIR, 'validation_log.json');

// In-memory validation results
let validationResults = [];
let validationSessionId = null;

/**
 * Initialize validation directory
 */
const initValidationDir = () => {
    if (!fs.existsSync(VALIDATION_DIR)) {
        fs.mkdirSync(VALIDATION_DIR, { recursive: true });
    }
};

/**
 * Start a new validation session
 */
const startValidationSession = () => {
    validationSessionId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    validationResults = [];
    console.log(`[Validation] New session started: ${validationSessionId}`);
    return validationSessionId;
};

/**
 * Log and validate a single input operation
 * @param {Object} params - Validation parameters
 * @param {string} params.ptrjEmployeeID - PTRJ Employee ID
 * @param {string} params.employeeName - Employee Name
 * @param {string} params.date - Date (YYYY-MM-DD)
 * @param {number} params.regularHours - Regular hours input
 * @param {number} params.overtimeHours - Overtime hours input
 * @param {string} params.inputType - Type: 'REGULAR' or 'OVERTIME'
 * @param {string} params.status - 'ATTEMPT' or 'SUCCESS' or 'FAILED'
 */
const logValidation = async (params) => {
    const {
        ptrjEmployeeID,
        employeeName,
        date,
        regularHours,
        overtimeHours,
        inputType,
        status = 'ATTEMPT'
    } = params;

    const logEntry = {
        sessionId: validationSessionId,
        timestamp: new Date().toISOString(),
        ptrjEmployeeID,
        employeeName,
        date,
        regularHours,
        overtimeHours,
        inputType,
        status,
        validationResult: null
    };

    // If status is SUCCESS, validate by querying PR_TASKREGLN
    if (status === 'SUCCESS') {
        try {
            const isValid = await validateAgainstMillware({
                ptrjEmployeeID,
                date,
                regularHours,
                overtimeHours,
                inputType
            });
            logEntry.validationResult = isValid ? 'VALID' : 'INVALID';
        } catch (error) {
            console.error(`[Validation] Error validating ${ptrjEmployeeID} @ ${date}:`, error.message);
            logEntry.validationResult = 'ERROR';
            logEntry.error = error.message;
        }
    }

    validationResults.push(logEntry);

    // Also append to file for persistence
    saveValidationLog(logEntry);

    return logEntry;
};

/**
 * Validate data against PR_TASKREGLN
 * @param {Object} params
 * @param {string} params.ptrjEmployeeID - Employee code
 * @param {string} params.date - Date (YYYY-MM-DD)
 * @param {number} params.regularHours - Expected regular hours
 * @param {number} params.overtimeHours - Expected overtime hours
 * @param {string} params.inputType - 'REGULAR' or 'OVERTIME'
 * @returns {boolean} - True if valid (matching record found)
 */
const validateAgainstMillware = async (params) => {
    const { ptrjEmployeeID, date, regularHours, overtimeHours, inputType } = params;

    const sql = `
        SELECT
            EmpCode,
            TrxDate,
            TaskCode,
            Hours,
            OT,
            Status,
            CreatedDate
        FROM [db_ptrj_mill].[dbo].[PR_TASKREGLN]
        WHERE EmpCode = '${ptrjEmployeeID}'
        AND CONVERT(date, TrxDate) = '${date}'
        ORDER BY CreatedDate DESC
    `;

    const result = await executeQuery(sql);

    // Determine what we're checking
    const otValue = inputType === 'OVERTIME' ? 1 : 0;
    const expectedHours = inputType === 'OVERTIME' ? overtimeHours : regularHours;

    // Find matching record
    const matchingRecord = result.find(r => {
        const recordOT = r.OT == 1 || r.OT == true ? 1 : 0;
        return recordOT === otValue;
    });

    if (!matchingRecord) {
        console.log(`[Validation] NO MATCH: ${ptrjEmployeeID} @ ${date} (${inputType}) - Expected ${expectedHours}h, no record found in PR_TASKREGLN`);
        return false;
    }

    const actualHours = parseFloat(matchingRecord.Hours) || 0;
    const hoursMatch = Math.abs(actualHours - expectedHours) < 0.1; // Allow small tolerance

    if (hoursMatch) {
        console.log(`[Validation] ✓ VALID: ${ptrjEmployeeID} @ ${date} (${inputType}) - Expected ${expectedHours}h, Found ${actualHours}h (OT=${matchingRecord.OT})`);
        return true;
    } else {
        console.log(`[Validation] ✗ INVALID: ${ptrjEmployeeID} @ ${date} (${inputType}) - Expected ${expectedHours}h, Found ${actualHours}h (OT=${matchingRecord.OT})`);
        return false;
    }
};

/**
 * Save validation log entry to file
 */
const saveValidationLog = (logEntry) => {
    initValidationDir();

    // Read existing logs
    let logs = [];
    if (fs.existsSync(VALIDATION_LOG_FILE)) {
        try {
            logs = JSON.parse(fs.readFileSync(VALIDATION_LOG_FILE, 'utf-8'));
        } catch (e) {
            logs = [];
        }
    }

    logs.push(logEntry);

    // Keep only last 10000 entries to prevent file from growing too large
    if (logs.length > 10000) {
        logs = logs.slice(-10000);
    }

    fs.writeFileSync(VALIDATION_LOG_FILE, JSON.stringify(logs, null, 2));
};

/**
 * Get validation results for current session
 */
const getValidationResults = () => {
    return {
        sessionId: validationSessionId,
        results: validationResults,
        summary: generateSummary()
    };
};

/**
 * Generate summary statistics
 */
const generateSummary = () => {
    const summary = {
        total: validationResults.length,
        valid: 0,
        invalid: 0,
        error: 0,
        pending: 0,
        byType: {
            REGULAR: { total: 0, valid: 0, invalid: 0 },
            OVERTIME: { total: 0, valid: 0, invalid: 0 }
        },
        invalidRecords: []
    };

    validationResults.forEach(r => {
        summary.total++;

        if (r.validationResult === 'VALID') {
            summary.valid++;
            if (r.inputType) {
                summary.byType[r.inputType].total++;
                summary.byType[r.inputType].valid++;
            }
        } else if (r.validationResult === 'INVALID') {
            summary.invalid++;
            if (r.inputType) {
                summary.byType[r.inputType].total++;
                summary.byType[r.inputType].invalid++;
            }
            // Add to invalid records list
            summary.invalidRecords.push({
                employeeName: r.employeeName,
                ptrjEmployeeID: r.ptrjEmployeeID,
                date: r.date,
                inputType: r.inputType,
                expectedHours: r.inputType === 'OVERTIME' ? r.overtimeHours : r.regularHours,
                timestamp: r.timestamp
            });
        } else if (r.validationResult === 'ERROR') {
            summary.error++;
        } else {
            summary.pending++;
        }
    });

    return summary;
};

/**
 * Generate Excel report from validation results
 * @param {string} sessionId - Session ID (optional, defaults to current session)
 */
const generateExcelReport = async (sessionId = null) => {
    const results = sessionId
        ? validationResults.filter(r => r.sessionId === sessionId)
        : validationResults;

    if (results.length === 0) {
        throw new Error('No validation results to export');
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Validation Report');

    // Define columns
    worksheet.columns = [
        { header: 'Timestamp', key: 'timestamp', width: 22 },
        { header: 'Employee Name', key: 'employeeName', width: 30 },
        { header: 'PTRJ ID', key: 'ptrjEmployeeID', width: 15 },
        { header: 'Date', key: 'date', width: 12 },
        { header: 'Input Type', key: 'inputType', width: 12 },
        { header: 'Regular Hours', key: 'regularHours', width: 14 },
        { header: 'Overtime Hours', key: 'overtimeHours', width: 16 },
        { header: 'Input Status', key: 'status', width: 14 },
        { header: 'Validation Result', key: 'validationResult', width: 18 }
    ];

    // Add header style
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
    };

    // Add data rows
    results.forEach((result, index) => {
        const row = worksheet.addRow({
            timestamp: result.timestamp,
            employeeName: result.employeeName,
            ptrjEmployeeID: result.ptrjEmployeeID,
            date: result.date,
            inputType: result.inputType,
            regularHours: result.regularHours,
            overtimeHours: result.overtimeHours,
            status: result.status,
            validationResult: result.validationResult || 'PENDING'
        });

        // Color code based on validation result
        if (result.validationResult === 'VALID') {
            row.eachCell(cell => {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FF00FF00' } // Green
                };
            });
        } else if (result.validationResult === 'INVALID') {
            row.eachCell(cell => {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFFF0000' } // Red
                };
            });
        } else if (result.validationResult === 'ERROR') {
            row.eachCell(cell => {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFFF9900' } // Orange
                };
            });
        }
    });

    // Add summary sheet
    const summary = generateSummary();
    const summarySheet = workbook.addWorksheet('Summary');

    summarySheet.columns = [
        { header: 'Metric', key: 'metric', width: 30 },
        { header: 'Value', key: 'value', width: 20 }
    ];

    summarySheet.addRows([
        { metric: 'Session ID', value: summary.sessionId || validationSessionId },
        { metric: 'Total Records', value: summary.total },
        { metric: 'Valid Records', value: summary.valid },
        { metric: 'Invalid Records', value: summary.invalid },
        { metric: 'Error Records', value: summary.error },
        { metric: 'Pending Validation', value: summary.pending },
        { metric: '', value: '' },
        { metric: 'REGULAR - Total', value: summary.byType.REGULAR.total },
        { metric: 'REGULAR - Valid', value: summary.byType.REGULAR.valid },
        { metric: 'REGULAR - Invalid', value: summary.byType.REGULAR.invalid },
        { metric: '', value: '' },
        { metric: 'OVERTIME - Total', value: summary.byType.OVERTIME.total },
        { metric: 'OVERTIME - Valid', value: summary.byType.OVERTIME.valid },
        { metric: 'OVERTIME - Invalid', value: summary.byType.OVERTIME.invalid }
    ]);

    // Style summary header
    summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    summarySheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
    };

    // Add invalid records sheet
    if (summary.invalidRecords.length > 0) {
        const invalidSheet = workbook.addWorksheet('Invalid Records');
        invalidSheet.columns = [
            { header: 'Employee Name', key: 'employeeName', width: 30 },
            { header: 'PTRJ ID', key: 'ptrjEmployeeID', width: 15 },
            { header: 'Date', key: 'date', width: 12 },
            { header: 'Input Type', key: 'inputType', width: 12 },
            { header: 'Expected Hours', key: 'expectedHours', width: 16 },
            { header: 'Timestamp', key: 'timestamp', width: 22 }
        ];

        summary.invalidRecords.forEach(record => {
            invalidSheet.addRow(record);
        });

        // Style header
        invalidSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        invalidSheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFF0000' }
        };
    }

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const filename = `validation_report_${timestamp}.xlsx`;
    const filepath = path.join(VALIDATION_DIR, filename);

    // Save workbook
    await workbook.xlsx.writeFile(filepath);

    console.log(`[Validation] Excel report generated: ${filepath}`);
    return { filename, filepath, summary };
};

/**
 * Load validation logs from file
 */
const loadValidationLogs = () => {
    initValidationDir();

    if (!fs.existsSync(VALIDATION_LOG_FILE)) {
        return [];
    }

    try {
        const logs = JSON.parse(fs.readFileSync(VALIDATION_LOG_FILE, 'utf-8'));
        return logs;
    } catch (e) {
        console.error('[Validation] Error loading logs:', e.message);
        return [];
    }
};

/**
 * Clear validation logs
 */
const clearValidationLogs = () => {
    validationResults = [];
    if (fs.existsSync(VALIDATION_LOG_FILE)) {
        fs.unlinkSync(VALIDATION_LOG_FILE);
    }
    console.log('[Validation] Logs cleared');
};

/**
 * Get last session ID from logs
 */
const getLastSessionId = () => {
    const logs = loadValidationLogs();
    if (logs.length === 0) return null;
    return logs[logs.length - 1].sessionId;
};

/**
 * Generate report for last session
 */
const generateLastSessionReport = async () => {
    const lastSessionId = getLastSessionId();
    if (!lastSessionId) {
        throw new Error('No validation sessions found');
    }
    return await generateExcelReport(lastSessionId);
};

module.exports = {
    startValidationSession,
    logValidation,
    validateAgainstMillware,
    getValidationResults,
    generateExcelReport,
    loadValidationLogs,
    clearValidationLogs,
    getLastSessionId,
    generateLastSessionReport
};
