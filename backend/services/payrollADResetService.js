const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const { executeQuery } = require('./gateway');
const { fetchPayrollData } = require('./payrollService');
const { TOLERANCE_RUPIAH, COMPONENT_RULES, normalizeText, getPayrollComponentKey } = require('./payrollComponentMapping');

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

const quoteSql = (value) => `'${String(value || '').replace(/'/g, "''")}'`;

const buildEmpFilter = (empCodes = [], alias = '') => {
    if (!Array.isArray(empCodes) || empCodes.length === 0) return '';

    const prefix = alias ? `${alias}.` : '';
    const codes = empCodes
        .map(code => String(code || '').trim())
        .filter(Boolean)
        .map(quoteSql)
        .join(', ');

    return codes ? `AND RTRIM(${prefix}EmpCode) IN (${codes})` : "";
};

const fetchPayrollADDocIdsFromDB = async (month, year, empCodes = [], options = {}) => {
    const numericMonth = parseInt(month, 10);
    const numericYear = parseInt(year, 10);
    const numericLimit = Math.max(0, parseInt(options.limit || 0, 10) || 0);
    const topClause = numericLimit > 0 ? `TOP ${numericLimit}` : '';

    if (!numericMonth || !numericYear) {
        throw new Error('month and year are required');
    }

    const empFilter = buildEmpFilter(empCodes);

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

const fetchPayrollADDocIdsByDCOID = async (dcoids, options = {}) => {
    if (!Array.isArray(dcoids) || dcoids.length === 0) {
        throw new Error('dcoids array is required');
    }

    const numericLimit = Math.max(0, parseInt(options.limit || 0, 10) || 0);
    const topClause = numericLimit > 0 ? `TOP ${numericLimit}` : '';

    // Validate DCOID format (should be like AD26051752 - AD prefix + 10 chars)
    const validDcoids = dcoids
        .map(d => String(d || '').trim())
        .filter(d => d.length > 0);

    if (validDcoids.length === 0) {
        throw new Error('No valid DCOIDs provided');
    }

    // Build DocID IN clause with proper quoting
    const docIdList = validDcoids.map(quoteSql).join(', ');

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
        WHERE RTRIM(DocID) IN (${docIdList})
        ORDER BY CreatedDate DESC, ID DESC
    `;

    const rows = await executeQuery(sql);
    const seen = new Set();
    const details = [];
    const foundDcoids = new Set();

    for (const row of rows) {
        const docNumber = String(row.DocID || '').trim();
        const internalId = String(row.ID || '').trim();
        const key = docNumber || internalId;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        foundDcoids.add(docNumber);
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

    // Find DCOIDs not found in database
    const notFoundDcoids = validDcoids.filter(d => !foundDcoids.has(d));

    return {
        docIds: details.map(detail => detail.docNumber || detail.internalId),
        details,
        foundCount: details.length,
        notFoundDcoids,
        totalInput: validDcoids.length
    };
};

const fetchDuplicatePayrollADDocIdsFromDB = async (month, year, empCodes = [], options = {}) => {
    const numericMonth = parseInt(month, 10);
    const numericYear = parseInt(year, 10);
    const numericLimit = Math.max(0, parseInt(options.limit || 0, 10) || 0);
    const topClause = numericLimit > 0 ? `TOP ${numericLimit}` : '';

    if (!numericMonth || !numericYear) {
        throw new Error('month and year are required');
    }

    const empFilter = buildEmpFilter(empCodes, 'P');
    const keepStrategy = String(options.keepStrategy || 'latest').toLowerCase();
    const keepOrder = keepStrategy === 'oldest'
        ? 'P.CreatedDate ASC, P.UpdatedDate ASC, P.ID ASC'
        : 'P.CreatedDate DESC, P.UpdatedDate DESC, P.ID DESC';

    const sql = `
        WITH normalized_adtrans AS (
            SELECT
                P.ID,
                P.DocID,
                P.DocDate,
                P.DocDesc,
                P.EmpCode,
                P.EmpName,
                P.LocCode,
                P.AccMonth,
                P.AccYear,
                P.PhyMonth,
                P.PhyYear,
                P.Status,
                P.CreatedDate,
                P.UpdatedDate,
                P.TransType,
                UPPER(LTRIM(RTRIM(ISNULL(P.DocDesc, '')))) AS normalized_doc_desc,
                ROW_NUMBER() OVER (
                    PARTITION BY RTRIM(P.EmpCode), UPPER(LTRIM(RTRIM(ISNULL(P.DocDesc, ''))))
                    ORDER BY ${keepOrder}
                ) AS duplicate_rank,
                COUNT(1) OVER (
                    PARTITION BY RTRIM(P.EmpCode), UPPER(LTRIM(RTRIM(ISNULL(P.DocDesc, ''))))
                ) AS duplicate_count
            FROM [db_ptrj_mill].[dbo].[PR_ADTRANS] P
            WHERE P.PhyMonth = '${numericMonth}'
              AND P.PhyYear = '${numericYear}'
              AND NULLIF(LTRIM(RTRIM(ISNULL(P.EmpCode, ''))), '') IS NOT NULL
              AND NULLIF(LTRIM(RTRIM(ISNULL(P.DocDesc, ''))), '') IS NOT NULL
              ${empFilter}
        )
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
            TransType,
            duplicate_rank,
            duplicate_count
        FROM normalized_adtrans
        WHERE duplicate_count > 1
          AND duplicate_rank > 1
        ORDER BY EmpCode, normalized_doc_desc, duplicate_rank
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
            updatedDate: row.UpdatedDate,
            duplicateRank: Number(row.duplicate_rank || 0),
            duplicateCount: Number(row.duplicate_count || 0),
            duplicateKey: `${String(row.EmpCode || '').trim()}|${String(row.DocDesc || '').trim()}`
        });
    }

    return {
        docIds: details.map(detail => detail.docNumber || detail.internalId),
        details,
        duplicateGroups: details.reduce((groups, detail) => {
            groups[detail.duplicateKey] = groups[detail.duplicateKey] || {
                empCode: detail.empCode,
                empName: detail.empName,
                docDesc: detail.docDesc,
                duplicateCount: detail.duplicateCount,
                deleteCount: 0
            };
            groups[detail.duplicateKey].deleteCount += 1;
            return groups;
        }, {})
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

    const windowCount = Math.max(1, Math.min(10, parseInt(payload.windowCount || payload.windows || payload.workers || 5, 10) || 5));
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
            source: payload.source || 'payroll_ad_reset'
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

/**
 * Trigger ADTRANS reset by DCOID (Direct DocID input)
 * @param {object} payload - { dcoids: [], dryRun, headless, windowCount }
 */
const triggerPayrollADResetByDCOIDAutomation = async (payload = {}) => {
    const dcoids = Array.isArray(payload.dcoids) ? payload.dcoids : [];

    if (dcoids.length === 0) {
        return { success: false, error: 'DCOID array is required' };
    }

    // Validate and fetch from database
    const dbResult = await fetchPayrollADDocIdsByDCOID(dcoids);

    if (dbResult.details.length === 0) {
        return {
            success: false,
            error: 'Tidak ada DocID yang ditemukan di database',
            notFoundDcoids: dbResult.notFoundDcoids,
            totalInput: dbResult.totalInput
        };
    }

    // Prepare data for runner
    const data = preparePayrollADResetData({
        docTargets: dbResult.details,
        docIds: dbResult.docIds,
        dryRun: payload.dryRun,
        headless: payload.headless,
        windowCount: payload.windowCount,
        source: 'payroll_ad_reset_by_dcoid'
    });

    return {
        success: true,
        data,
        foundCount: dbResult.foundCount,
        notFoundDcoids: dbResult.notFoundDcoids,
        totalInput: dbResult.totalInput
    };
};

const startPayrollADResetProcess = (options = {}) => {
    const headless = options.headless !== undefined ? Boolean(options.headless) : process.env.HEADLESS === 'true';
    const workers = Math.max(1, Math.min(10, parseInt(options.windowCount || options.workers || 5, 10) || 5));
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

const fetchDifferenceADDocIdsFromDB = async (month, year, empCodes = [], options = {}) => {
    const numericMonth = parseInt(month, 10);
    const numericYear = parseInt(year, 10);
    const numericLimit = Math.max(0, parseInt(options.limit || 0, 10) || 0);
    const topClause = numericLimit > 0 ? `TOP ${numericLimit}` : '';

    if (!numericMonth || !numericYear) {
        throw new Error('month and year are required');
    }

    const empFilter = buildEmpFilter(empCodes);

    // Get all ADTRANS records for the period, grouped by EmpCode
    // Records are considered "different" if an EmpCode has multiple DocDesc entries (potential duplicates)
    // or if the records were created at different times (suggesting manual vs automated entry)
    const sql = `
        WITH EmpAdtransSummary AS (
            SELECT
                RTRIM(P.EmpCode) AS emp_code,
                P.EmpName,
                P.LocCode,
                P.PhyMonth,
                P.PhyYear,
                COUNT(DISTINCT UPPER(LTRIM(RTRIM(ISNULL(P.DocDesc, ''))))) AS unique_doc_count,
                COUNT(*) AS total_records,
                MIN(P.CreatedDate) AS earliest_created,
                MAX(P.CreatedDate) AS latest_created,
                STRING_AGG(DISTINCT UPPER(LTRIM(RTRIM(ISNULL(P.DocDesc, ''))), ' | ') AS all_doc_descs
            FROM [db_ptrj_mill].[dbo].[PR_ADTRANS] P
            WHERE P.PhyMonth = '${numericMonth}'
              AND P.PhyYear = '${numericYear}'
              AND NULLIF(LTRIM(RTRIM(ISNULL(P.EmpCode, ''))), '') IS NOT NULL
              ${empFilter}
            GROUP BY RTRIM(P.EmpCode), P.EmpName, P.LocCode, P.PhyMonth, P.PhyYear
            HAVING COUNT(*) > 1 OR COUNT(DISTINCT UPPER(LTRIM(RTRIM(ISNULL(P.DocDesc, ''))))) > 1
        )
        SELECT
            P.ID,
            P.DocID,
            P.DocDate,
            P.DocDesc,
            P.EmpCode,
            P.EmpName,
            P.LocCode,
            P.AccMonth,
            P.AccYear,
            P.PhyMonth,
            P.PhyYear,
            P.Status,
            P.CreatedDate,
            P.UpdatedDate,
            P.TransType,
            s.unique_doc_count,
            s.total_records,
            s.all_doc_descs
        FROM [db_ptrj_mill].[dbo].[PR_ADTRANS] P
        INNER JOIN EmpAdtransSummary s ON RTRIM(P.EmpCode) = s.emp_code
            AND P.PhyMonth = s.PhyMonth
            AND P.PhyYear = s.PhyYear
        WHERE P.PhyMonth = '${numericMonth}'
          AND P.PhyYear = '${numericYear}'
        ORDER BY P.EmpCode, P.CreatedDate ASC, P.ID ASC
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
            updatedDate: row.UpdatedDate,
            uniqueDocCount: Number(row.unique_doc_count || 1),
            totalRecords: Number(row.total_records || 1),
            allDocDescs: row.all_doc_descs || ''
        });
    }

    // Group by employee
    const employeeGroups = details.reduce((acc, detail) => {
        const empCode = detail.empCode;
        if (!acc[empCode]) {
            acc[empCode] = {
                empCode: detail.empCode,
                empName: detail.empName,
                uniqueDocCount: detail.uniqueDocCount,
                totalRecords: detail.totalRecords,
                allDocDescs: detail.allDocDescs,
                records: []
            };
        }
        acc[empCode].records.push(detail);
        return acc;
    }, {});

    return {
        docIds: details.map(d => d.docNumber || d.internalId),
        details,
        employeeGroups,
        employeeCount: Object.keys(employeeGroups).length,
        totalRecords: details.length
    };
};

const triggerPayrollADResetByDifferenceAutomation = async (payload = {}) => {
    const { month, year, empCodes } = payload;

    if (!month || !year) {
        return { success: false, error: 'month and year are required' };
    }

    try {
        // Fetch ADTRANS records with differences
        const dbResult = await fetchDifferenceADDocIdsFromDB(month, year, empCodes, {
            limit: payload.limit
        });

        if (dbResult.details.length === 0) {
            return {
                success: true,
                dryRun: payload.dryRun,
                foundCount: 0,
                message: 'Tidak ada ADTRANS dengan perbedaan untuk periode ini'
            };
        }

        console.log(`[PayrollADReset Difference] Found ${dbResult.totalRecords} records from ${dbResult.employeeCount} employees with differences`);

        // Prepare data for runner
        const data = preparePayrollADResetData({
            docTargets: dbResult.details,
            docIds: dbResult.docIds,
            month,
            year,
            dryRun: payload.dryRun,
            headless: payload.headless,
            windowCount: payload.windowCount,
            source: 'payroll_ad_reset_difference'
        });

        return {
            success: true,
            data,
            foundCount: dbResult.details.length,
            employeeGroups: dbResult.employeeGroups,
            employeeCount: dbResult.employeeCount,
            message: `${dbResult.details.length} ADTRANS records from ${dbResult.employeeCount} employees with differences`
        };

    } catch (error) {
        console.error('[PayrollADReset Difference] Error:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Fetch AD records where amounts differ between Venus and Millware
 * @param {number} month - Month (1-12)
 * @param {number} year - Year (YYYY)
 * @param {string[]} empCodes - Optional employee codes filter
 * @param {object} options - Options like tolerance
 */
const fetchAmountDifferenceADDocIdsFromDB = async (month, year, empCodes = [], options = {}) => {
    const numericMonth = parseInt(month, 10);
    const numericYear = parseInt(year, 10);
    const numericLimit = Math.max(0, parseInt(options.limit || 0, 10) || 0);
    // Use 50 rupiah tolerance (same as payrollService.js PAYROLL_TOLERANCE)
    const tolerance = Math.max(0, parseInt(options.tolerance || 50, 10) || 50);

    if (!numericMonth || !numericYear) {
        throw new Error('month and year are required');
    }

    console.log(`[PayrollADReset AmountDiff] Starting: month=${numericMonth}, year=${numericYear}, tolerance=${tolerance}`);

    // Step 1: Fetch Venus payroll data with Millware comparison (using existing payrollService)
    let venusPayroll;
    try {
        venusPayroll = await fetchPayrollData(numericMonth, numericYear, options.payrollSource || {});
        if (!venusPayroll.success || !Array.isArray(venusPayroll.data)) {
            throw new Error(venusPayroll.error || 'Failed to fetch Venus payroll data');
        }
        console.log(`[PayrollADReset AmountDiff] Fetched ${venusPayroll.data.length} employees from payrollService`);
    } catch (error) {
        console.error('[PayrollADReset AmountDiff] Error fetching Venus data:', error);
        throw new Error(`Failed to fetch Venus payroll data: ${error.message}`);
    }

    // Step 2: Identify employees with amount differences
    // Use the same comparison logic as payrollService.js (PAYROLL_TOLERANCE = 50)
    const isMatch = (a, b) => Math.abs(a - b) <= tolerance;

    const employeesWithDifferences = [];

    // Sample data for debugging
    let sampleDebug = null;

    for (const emp of venusPayroll.data) {
        if (!emp.sync) continue;

        const ptrjId = emp.ptrjId;
        if (!ptrjId || ptrjId === '-') continue;

        // Check if employee has Millware data
        const hasMillwareData = emp.millware || emp.sync?.jabatan?.millware || emp.sync?.masaKerja?.millware;
        if (!hasMillwareData) {
            continue; // No Millware data
        }

        const differences = [];

        // Component mapping with ADCode priorities
        const componentMapping = [
            { key: 'jabatan', adCodes: ['GA9128'], name: 'TUNJANGAN JABATAN' },
            { key: 'masaKerja', adCodes: ['GA9129'], name: 'TUNJANGAN MASA KERJA' },
            { key: 'beras', adCodes: ['AL0012'], name: 'TUNJANGAN BERAS' },
            { key: 'pph21', adCodes: ['DEPH21', 'PPH21'], name: 'POTONGAN PPH21' },
            { key: 'spsi', adCodes: ['DE0003', 'SPSI'], name: 'POTONGAN SPSI' }
        ];

        for (const mapping of componentMapping) {
            const venusAmount = Math.abs(toNumber(emp.sync[mapping.key]?.venus));
            const millwareAmount = Math.abs(toNumber(emp.sync[mapping.key]?.millware));

            // Special handling for "beras" component:
            // If one side has value and other is zero, it's a difference (no tolerance)
            const isBeras = mapping.key === 'beras';
            const oneSideHasValue = (venusAmount > 0) !== (millwareAmount > 0);

            // Debug: log first 3 employees
            if (!sampleDebug && employeesWithDifferences.length < 3) {
                sampleDebug = {
                    ptrjId,
                    name: emp.name,
                    components: componentMapping.map(m => ({
                        key: m.key,
                        venus: Math.abs(toNumber(emp.sync[m.key]?.venus)),
                        millware: Math.abs(toNumber(emp.sync[m.key]?.millware))
                    }))
                };
            }

            if (isBeras && oneSideHasValue) {
                // For beras: if Venus=0 but Millware>0 OR Venus>0 but Millware=0
                // This is always a difference (no tolerance for missing component)
                differences.push({
                    componentKey: mapping.key,
                    componentName: mapping.name,
                    venusAmount,
                    millwareAmount,
                    diff: Math.max(venusAmount, millwareAmount),
                    tolerance,
                    adCodes: mapping.adCodes,
                    isMissingComponent: true,
                    missingIn: venusAmount === 0 ? 'Venus' : 'Millware'
                });
            } else if (venusAmount === 0 && millwareAmount === 0) {
                // Skip if both are zero
                continue;
            } else {
                // Standard comparison for other components
                const diff = Math.abs(venusAmount - millwareAmount);
                if (diff > tolerance) {
                    differences.push({
                        componentKey: mapping.key,
                        componentName: mapping.name,
                        venusAmount,
                        millwareAmount,
                        diff,
                        tolerance,
                        adCodes: mapping.adCodes
                    });
                }
            }
        }

        if (differences.length > 0) {
            employeesWithDifferences.push({
                empCode: ptrjId, // Use ptrjId for Millware lookup
                empName: emp.name || ptrjId,
                ptrjId,
                differences
            });
        }
    }

    console.log(`[PayrollADReset AmountDiff] Found ${employeesWithDifferences.length} employees with differences`);
    if (sampleDebug) {
        console.log(`[PayrollADReset AmountDiff] Sample data for ${sampleDebug.ptrjId}:`, JSON.stringify(sampleDebug.components, null, 2));
    }

    if (employeesWithDifferences.length > 0) {
        console.log(`[PayrollADReset AmountDiff] First 3 employees with diff:`, JSON.stringify(employeesWithDifferences.slice(0, 3), null, 2));
    }

    // Step 3: Fetch Millware ADTRANS DocIds for employees with differences
    // Query PR_ADTRANS to get DocIds that contain the components with differences
    const empCodesWithDiff = employeesWithDifferences.map(e => e.empCode).filter(Boolean);

    if (empCodesWithDiff.length === 0) {
        return {
            docIds: [],
            details: [],
            employees: [],
            employeeCount: 0,
            totalRecords: 0,
            tolerance,
            payrollSource: venusPayroll.sourceInfo?.source || options.payrollSource?.source || 'live',
            snapshotId: venusPayroll.sourceInfo?.snapshotId || options.payrollSource?.snapshotId || null,
            venusEmployeeCount: venusPayroll.data.length,
            millwareEmployeeCount: 0,
            message: 'Tidak ada employee dengan selisih amount'
        };
    }

    // Build SQL filter for employees with differences
    const empCodeFilter = empCodesWithDiff.map(quoteSql).join(', ');

    // Fetch ADTRANS with component details (only MasterID, TaskCode, Amount from PR_ADTRANSLN)
    const sql = `
        SELECT
            a.ID,
            a.DocID,
            a.DocDate,
            a.DocDesc,
            a.EmpCode,
            a.EmpName,
            a.LocCode,
            a.AccMonth,
            a.AccYear,
            a.PhyMonth,
            a.PhyYear,
            a.Status,
            a.CreatedDate,
            a.UpdatedDate,
            a.TransType,
            b.MasterID,
            b.TaskCode,
            b.Amount
        FROM [db_ptrj_mill].[dbo].[PR_ADTRANS] a
        LEFT JOIN [db_ptrj_mill].[dbo].[PR_ADTRANSLN] b ON a.ID = b.MasterID
        WHERE a.PhyMonth = '${numericMonth}'
          AND a.PhyYear = '${numericYear}'
          AND RTRIM(a.EmpCode) IN (${empCodeFilter})
        ORDER BY a.EmpCode, a.DocID, b.TaskCode
    `;

    let millwareRows;
    try {
        millwareRows = await executeQuery(sql);
    } catch (error) {
        console.error('[PayrollADReset AmountDiff] Error fetching Millware ADTRANS:', error);
        throw new Error(`Failed to fetch Millware ADTRANS data: ${error.message}`);
    }

    // Step 4: Group DocIds by employee and component
    // Find DocIds that contain components with differences
    const docIdDetails = {}; // docId -> full details
    const docIdsToDelete = new Set();

    // TaskCode (Millware) to component key mapping
    const TASKCODE_TO_COMPONENT = {
        'GA9128': 'jabatan',
        'GA9129': 'masaKerja',
        'AL0012': 'beras',
        'DEPH21': 'pph21',
        'PPH21': 'pph21',
        'DE0003': 'spsi',
        'SPSI': 'spsi'
    };

    for (const row of millwareRows) {
        const docId = String(row.DocID || '').trim();
        const empCode = String(row.EmpCode || '').trim();
        const taskCode = String(row.TaskCode || '').trim();

        if (!docId) continue;

        // Store DocId details
        if (!docIdDetails[docId]) {
            docIdDetails[docId] = {
                docId,
                internalId: String(row.ID || '').trim(),
                empCode,
                empName: String(row.EmpName || '').trim(),
                docDate: row.DocDate,
                docDesc: row.DocDesc,
                month: row.PhyMonth,
                year: row.PhyYear,
                status: row.Status,
                locCode: row.LocCode,
                transType: row.TransType,
                createdDate: row.CreatedDate,
                updatedDate: row.UpdatedDate,
                taskCodes: []
            };
        }

        // Track TaskCodes in this DocId
        if (taskCode && !docIdDetails[docId].taskCodes.includes(taskCode)) {
            docIdDetails[docId].taskCodes.push(taskCode);
        }

        // Check if this DocId contains any component with differences
        const componentKey = TASKCODE_TO_COMPONENT[taskCode];
        if (componentKey) {
            // Find if this employee has a difference for this component
            const empWithDiff = employeesWithDifferences.find(e => e.empCode === empCode);
            if (empWithDiff) {
                const diff = empWithDiff.differences.find(d => d.componentKey === componentKey);
                if (diff) {
                    docIdsToDelete.add(docId);
                }
            }
        }
    }

    // Step 5: Build final result
    const allDocIds = [...docIdsToDelete];
    const limitedDocIds = numericLimit > 0 ? allDocIds.slice(0, numericLimit) : allDocIds;

    const details = limitedDocIds.map(docId => {
        const d = docIdDetails[docId];
        return {
            internalId: d.internalId,
            docNumber: d.docId,
            label: d.docId,
            empCode: d.empCode,
            empName: d.empName,
            docDate: d.docDate,
            docDesc: d.docDesc,
            month: d.month,
            year: d.year,
            status: d.status,
            locCode: d.locCode,
            transType: d.transType,
            createdDate: d.createdDate,
            updatedDate: d.updatedDate
        };
    });

    return {
        docIds: limitedDocIds,
        details,
        employees: employeesWithDifferences,
        employeeCount: employeesWithDifferences.length,
        totalRecords: limitedDocIds.length,
        tolerance,
        venusEmployeeCount: venusPayroll.data.length,
        millwareEmployeeCount: empCodesWithDiff.length
    };
};

/**
 * Map Millware ADCode to component key
 */
const mapADCodeToComponentKey = (adCode, adCodeDesc) => {
    const code = normalizeText(adCode);
    const desc = normalizeText(adCodeDesc);
    const text = `${code} ${desc}`;

    if (code === 'GA9128' || text.includes('JABATAN')) return 'jabatan';
    if (code === 'GA9129' || text.includes('MASA KERJA') || text.includes('MASAKERJA')) return 'masaKerja';
    if (code === 'AL0012' || text.includes('BERAS')) return 'beras';
    if (code.includes('PPH21') || code.includes('DEPH21')) return 'pph21';
    if (code.includes('SPSI') || code.includes('DE0003')) return 'spsi';
    if (text.includes('PREMI') || text.includes('INSENTIF') || text.includes('BONUS')) return 'premi';

    return null;
};

/**
 * Trigger ADTRANS reset by amount differences (Venus vs Millware)
 * @param {object} payload - { month, year, empCodes, dryRun, headless, windowCount, tolerance }
 */
const triggerPayrollADResetByAmountDifferenceAutomation = async (payload = {}) => {
    const { month, year, empCodes } = payload;
    // Default tolerance 50 rupiah (matches payrollService.js PAYROLL_TOLERANCE)
    const tolerance = Math.max(1, parseInt(payload.tolerance || 50, 10) || 50);

    if (!month || !year) {
        return { success: false, error: 'month and year are required' };
    }

    try {
        // Fetch amount differences
        const dbResult = await fetchAmountDifferenceADDocIdsFromDB(month, year, empCodes, {
            limit: payload.limit,
            tolerance: tolerance,
            payrollSource: payload.payrollSource
        });

        if (dbResult.docIds.length === 0) {
            return {
                success: true,
                dryRun: payload.dryRun,
                foundCount: 0,
                message: `Tidak ada ADTRANS dengan selisih amount untuk periode ${month}/${year} (tolerance: ${dbResult.tolerance} rupiah)`
            };
        }

        console.log(`[PayrollADReset AmountDiff] Found ${dbResult.totalRecords} records from ${dbResult.employeeCount} employees with amount differences`);

        // Prepare data for runner
        const data = preparePayrollADResetData({
            docTargets: dbResult.details,
            docIds: dbResult.docIds,
            employees: dbResult.employees,
            month,
            year,
            dryRun: payload.dryRun,
            headless: payload.headless,
            windowCount: payload.windowCount,
            source: 'payroll_ad_reset_amount_difference'
        });

        return {
            success: true,
            data,
            foundCount: dbResult.docIds.length,
            employees: dbResult.employees,
            employeeCount: dbResult.employeeCount,
            tolerance: dbResult.tolerance,
            venusEmployeeCount: dbResult.venusEmployeeCount,
            millwareEmployeeCount: dbResult.millwareEmployeeCount,
            message: `${dbResult.docIds.length} ADTRANS records from ${dbResult.employeeCount} employees with amount differences (tolerance: ${dbResult.tolerance} rupiah)`
        };

    } catch (error) {
        console.error('[PayrollADReset AmountDiff] Error:', error);
        return { success: false, error: error.message };
    }
};

const toNumber = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
};

module.exports = {
    fetchPayrollADDocIdsFromDB,
    fetchPayrollADDocIdsByDCOID,
    fetchDuplicatePayrollADDocIdsFromDB,
    fetchDifferenceADDocIdsFromDB,
    fetchAmountDifferenceADDocIdsFromDB,
    mapADCodeToComponentKey,
    preparePayrollADResetData,
    triggerPayrollADResetAutomation,
    triggerPayrollADResetByDCOIDAutomation,
    triggerPayrollADResetByDifferenceAutomation,
    triggerPayrollADResetByAmountDifferenceAutomation,
    startPayrollADResetProcess,
    stopPayrollADResetProcess
};
