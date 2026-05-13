const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const { executeQuery } = require('./gateway');

const ENGINE_DIR = path.resolve(__dirname, '../../browser-automation-engine');
const DATA_DIR = path.join(ENGINE_DIR, 'testing_data');
const DATA_FILE = path.join(DATA_DIR, 'current_payroll_ad_delete_data.json');
const RUNNER_SCRIPT = path.join(ENGINE_DIR, 'payroll-ad-delete-runner.js');

let currentProcess = null;

const ensureDataDir = () => {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
};

const normalizeEmpCode = (employee) => (
    employee?.empCode ||
    employee?.ptrjEmployeeID ||
    employee?.PTRJEmployeeID ||
    employee?.ptrjId ||
    employee?.id ||
    ''
).trim();

const fetchPayrollADDocIdsFromDB = async (month, year, empCodes = [], options = {}) => {
    const numericMonth = parseInt(month, 10);
    const numericYear = parseInt(year, 10);
    const numericLimit = Math.max(0, parseInt(options.limit || 0, 10) || 0);
    const topClause = numericLimit > 0 ? `TOP ${numericLimit}` : '';

    if (!numericMonth || !numericYear) {
        throw new Error('month and year are required');
    }

    let empFilter = '';
    if (Array.isArray(empCodes) && empCodes.length > 0) {
        const codes = empCodes
            .map(code => String(code || '').trim())
            .filter(Boolean)
            .map(code => `'${code.replace(/'/g, "''")}'`)
            .join(', ');
        if (codes) empFilter = `AND RTRIM(EmpCode) IN (${codes})`;
    }

    const sql = `
        SELECT ${topClause}
            ID,
            DocID,
            DocDate,
            DocDesc,
            EmpCode,
            EmpName,
            LocCode,
            AccMonth,
            AccYear,
            PhyMonth,
            PhyYear,
            Status,
            CreatedDate,
            UpdatedDate,
            TransType
        FROM [db_ptrj_mill].[dbo].[PR_ADTRANS]
        WHERE PhyMonth = '${numericMonth}'
          AND PhyYear = '${numericYear}'
          ${empFilter}
        ORDER BY CreatedDate DESC, ID DESC
    `;

    const rows = await executeQuery(sql);
    const seen = new Set();
    const details = [];

    for (const row of rows) {
        const docNumber = String(row.DocID || '').trim();
        const internalId = String(row.ID || '').trim();
        const key = docNumber || internalId;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        details.push({
            internalId,
            docNumber,
            label: docNumber || internalId,
            empCode: String(row.EmpCode || '').trim(),
            empName: String(row.EmpName || '').trim(),
            docDate: row.DocDate,
            docDesc: row.DocDesc,
            month: row.PhyMonth,
            year: row.PhyYear,
            status: row.Status,
            locCode: row.LocCode,
            transType: row.TransType,
            createdDate: row.CreatedDate,
            updatedDate: row.UpdatedDate
        });
    }

    return {
        docIds: details.map(detail => detail.docNumber || detail.internalId),
        details
    };
};

const preparePayrollADResetData = (payload = {}) => {
    ensureDataDir();

    const docTargets = Array.isArray(payload.docTargets) ? payload.docTargets : [];
    const docIds = Array.isArray(payload.docIds) ? payload.docIds : [];
    const employees = Array.isArray(payload.employees) ? payload.employees : [];
    const targets = docTargets.length > 0
        ? docTargets
        : docIds.map(docId => ({ docNumber: String(docId || '').trim(), label: String(docId || '').trim() }));

    const windowCount = Math.max(1, Math.min(10, parseInt(payload.windowCount || payload.windows || payload.workers || 1, 10) || 1));
    const data = {
        metadata: {
            export_date: new Date().toISOString(),
            month: parseInt(payload.month, 10),
            year: parseInt(payload.year, 10),
            dryRun: Boolean(payload.dryRun),
            headless: Boolean(payload.headless),
            limit: Math.max(0, parseInt(payload.limit || 0, 10) || 0),
            windowCount,
            totalDocIds: targets.length,
            totalEmployees: employees.length,
            source: 'payroll_ad_reset'
        },
        docTargets: targets.map(target => ({
            internalId: String(target.internalId || target.ID || target.id || '').trim(),
            docNumber: String(target.docNumber || target.DocID || target.docId || target.label || '').trim(),
            label: String(target.label || target.docNumber || target.DocID || target.docId || target.internalId || '').trim(),
            empCode: String(target.empCode || target.EmpCode || '').trim(),
            empName: String(target.empName || target.EmpName || '').trim()
        })).filter(target => target.docNumber || target.internalId || target.label),
        employees: employees.map(employee => ({
            empCode: normalizeEmpCode(employee),
            empName: employee.name || employee.employeeName || employee.EmployeeName || employee.empName || '',
            empId: employee.id || employee.EmployeeID || ''
        })).filter(employee => employee.empCode)
    };

    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    return data;
};

const triggerPayrollADResetAutomation = (payload = {}) => {
    const data = preparePayrollADResetData(payload);
    if (!data.docTargets.length) {
        return { success: false, error: 'Tidak ada DocID Monthly Allowance/Deduction untuk dihapus.' };
    }
    return { success: true, data };
};

const startPayrollADResetProcess = (options = {}) => {
    const headless = options.headless !== undefined ? Boolean(options.headless) : process.env.HEADLESS === 'true';
    const workers = Math.max(1, Math.min(10, parseInt(options.windowCount || options.workers || 1, 10) || 1));
    const env = {
        ...process.env,
        AUTO_CLOSE: process.env.AUTO_CLOSE || 'true',
        HEADLESS: String(headless)
    };

    const args = [RUNNER_SCRIPT, '--all', '--workers', String(workers)];
    if (options.dryRun) args.push('--dry-run');

    const child = spawn('node', args, {
        cwd: ENGINE_DIR,
        env,
        stdio: ['ignore', 'pipe', 'pipe']
    });

    currentProcess = child;
    child.on('exit', () => {
        currentProcess = null;
    });

    return child;
};

const stopPayrollADResetProcess = () => {
    if (!currentProcess) return false;

    if (process.platform === 'win32') {
        exec(`taskkill /pid ${currentProcess.pid} /T /F`, () => {});
    } else {
        currentProcess.kill('SIGINT');
    }
    currentProcess = null;
    return true;
};

module.exports = {
    fetchPayrollADDocIdsFromDB,
    preparePayrollADResetData,
    triggerPayrollADResetAutomation,
    startPayrollADResetProcess,
    stopPayrollADResetProcess
};
