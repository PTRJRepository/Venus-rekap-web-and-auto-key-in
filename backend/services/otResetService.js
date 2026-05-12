/**
 * OT Reset Service - Hapus record OT/Normal di Task Register Millware
 *
 * Flow:
 *  1. fetchDocIdsFromDB(month, year, empCodes?, { category }) -> query PR_TASKREG di db_ptrj_mill
 *     all employees: empty empCodes; query still filters line category (OT/Normal/all)
 *  2. prepareOTResetData(payload) → simpan config ke current_delete_data.json
 *  3. triggerOTResetAutomation(payload) → spawn delete-ot-runner.js + SSE stream
 *
 * delete-ot-runner.js membaca:
 *   - docIds[] / docTargets[] dari data file
 *   - metadata.category → 'ot' | 'normal' | 'all'
 *   - employees[] → filter by EmpCode di grid column 2
 */

const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const { executeQuery } = require('./gateway');

// Define paths
const ENGINE_DIR = path.resolve(__dirname, '../../browser-automation-engine');
const DATA_DIR = path.join(ENGINE_DIR, 'testing_data');
const DELETE_DATA_FILE = path.join(DATA_DIR, 'current_delete_data.json');
const DELETE_RUNNER_SCRIPT = path.join(ENGINE_DIR, 'delete-ot-runner.js');

// ──────────────────────────────────────────────
// Fetch DocIds from Millware SQL Database (db_ptrj_mill)
//
// PR_TASKREG: ID, DocID, DocDate, PhyMonth, PhyYear, Status, ...
// PR_TASKREGLN: MasterID, EmpCode, TrxDate, OT, Hours, Amount, ...
// ──────────────────────────────────────────────
const normalizeTargetCategory = (category = 'OT') => {
    const rawCategory = String(category || 'OT');
    if (rawCategory === 'Normal' || rawCategory === 'normal') return 'normal';
    if (rawCategory === 'all') return 'all';
    return 'ot';
};

const buildLineCategoryFilter = (category) => {
    const normalized = normalizeTargetCategory(category);
    if (normalized === 'ot') return 'AND ISNULL(L.OT, 0) = 1';
    if (normalized === 'normal') return 'AND ISNULL(L.OT, 0) = 0';
    return '';
};

const fetchDocIdsFromDB = async (month, year, empCodes = [], options = {}) => {
    const category = typeof options === 'string' ? options : options.category;
    const numericLimit = Math.max(0, parseInt(options.limit || 0, 10) || 0);
    const topClause = numericLimit > 0 ? `TOP ${numericLimit}` : '';
    const categoryFilter = buildLineCategoryFilter(category);
    const normalizedCategory = normalizeTargetCategory(category);

    console.log(`[OTReset] Fetching DocIds from db_ptrj_mill for ${month}/${year}, category=${normalizedCategory}, limit=${numericLimit || 'all'}...`);

    // Build employee filter clause
    let empFilter = '';
    if (empCodes && empCodes.length > 0) {
        const codes = empCodes.map(c => `'${c.replace(/'/g, "''")}'`).join(', ');
        empFilter = `AND RTRIM(L.EmpCode) IN (${codes})`;
    }

    const sql = `
        SELECT ${topClause}
            H.ID AS doc_id,
            H.DocID AS doc_number,
            H.DocDate,
            H.PhyMonth,
            H.PhyYear,
            H.Status,
            H.LocCode,
            COUNT(1) AS matching_line_count,
            SUM(CASE WHEN ISNULL(L.OT, 0) = 1 THEN 1 ELSE 0 END) AS ot_line_count,
            SUM(CASE WHEN ISNULL(L.OT, 0) = 0 THEN 1 ELSE 0 END) AS normal_line_count
        FROM [db_ptrj_mill].[dbo].[PR_TASKREG] H
        INNER JOIN [db_ptrj_mill].[dbo].[PR_TASKREGLN] L ON H.ID = L.MasterID
        WHERE H.PhyMonth = '${month}'
          AND H.PhyYear = '${year}'
          ${empFilter}
          ${categoryFilter}
        GROUP BY H.ID, H.DocID, H.DocDate, H.PhyMonth, H.PhyYear, H.Status, H.LocCode
        ORDER BY H.DocDate DESC
    `;

    try {
        const rows = await executeQuery(sql);
        console.log(`[OTReset] PR_TASKREG found ${rows.length} DocIds`);

        // Also check archived tables
        const arcSql = `
            SELECT ${topClause}
                H.ID AS doc_id,
                H.DocID AS doc_number,
                H.DocDate,
                H.PhyMonth,
                H.PhyYear,
                H.Status,
                H.LocCode,
                COUNT(1) AS matching_line_count,
                SUM(CASE WHEN ISNULL(L.OT, 0) = 1 THEN 1 ELSE 0 END) AS ot_line_count,
                SUM(CASE WHEN ISNULL(L.OT, 0) = 0 THEN 1 ELSE 0 END) AS normal_line_count
            FROM [db_ptrj_mill].[dbo].[PR_TASKREG_ARC] H
            INNER JOIN [db_ptrj_mill].[dbo].[PR_TASKREGLN_ARC] L ON H.ID = L.MasterID
            WHERE H.PhyMonth = '${month}'
              AND H.PhyYear = '${year}'
              ${empFilter}
              ${categoryFilter}
            GROUP BY H.ID, H.DocID, H.DocDate, H.PhyMonth, H.PhyYear, H.Status, H.LocCode
            ORDER BY H.DocDate DESC
        `;
        const arcRows = await executeQuery(arcSql);

        // Merge + dedupe by doc_id
        const seen = new Set();
        const all = [];
        for (const r of rows) {
            if (!seen.has(r.doc_id)) { seen.add(r.doc_id); all.push(r); }
        }
        for (const r of arcRows) {
            if (!seen.has(r.doc_id)) { seen.add(r.doc_id); all.push(r); }
        }

        // Return as array of strings (the numeric ID used by Millware URLs)
        const docIds = all.map(r => r.doc_id);
        console.log(`[OTReset] Total unique DocIds: ${docIds.length}`);
        return {
            docIds,
            details: all.map(r => ({
                docId: String(r.doc_id),
                docNumber: r.doc_number,
                date: r.DocDate,
                month: r.PhyMonth,
                year: r.PhyYear,
                status: r.Status,
                locCode: r.LocCode,
                matchingLineCount: Number(r.matching_line_count || 0),
                otLineCount: Number(r.ot_line_count || 0),
                normalLineCount: Number(r.normal_line_count || 0),
                category: normalizedCategory
            }))
        };
    } catch (err) {
        console.error(`[OTReset] DB Query Error: ${err.message}`);
        throw err;
    }
};

// ──────────────────────────────────────────────
// File System Helpers
// ──────────────────────────────────────────────
const ensureDataDir = () => {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
};

// Track running process
let currentProcess = null;

/**
 * Prepare OT Reset data and save to current_delete_data.json
 *
 * @param {Object} payload
 * @param {string[]} payload.docIds - Array of internal DocIds to process (e.g. ["34986", "34987"])
 * @param {Object[]} [payload.docTargets] - Array of { internalId, docNumber } targets
 * @param {Object[]} [payload.employees] - Selected employees (for logging)
 * @param {string} [payload.startDate] - Start date filter (YYYY-MM-DD)
 * @param {string} [payload.endDate] - End date filter (YYYY-MM-DD)
 * @param {string} payload.category - "OT" | "Normal" | "all"
 * @param {string} [payload.targetMode] - "all" | "selected" | "docids"
 * @param {boolean} [payload.dryRun] - true = cek saja, false = hapus
 * @param {boolean} [payload.headless] - browser visibility
 * @param {number} [payload.limit] - optional DocID limit for mode all
 * @param {number} [payload.maxPages] - detail pages guard per DocID
 * @param {number} [payload.tabCount] - browser tabs, 1 = single tab
 * @param {boolean} [payload.forceListSearch] - open DocIDs through list search instead of direct detail URL
 * @param {number} payload.month - Month (1-12)
 * @param {number} payload.year - Year
 */
const prepareOTResetData = (payload) => {
    ensureDataDir();

    const {
        docIds = [],
        employees = [],
        startDate = null,
        endDate = null,
        category = 'OT',
        targetMode = 'all',
        docTargets = [],
        dryRun = false,
        headless = false,
        limit = 0,
        maxPages = 50,
        tabCount = 1,
        forceListSearch = false,
        month,
        year
    } = payload;

    // Normalize category
    const rawCategory = String(category || 'OT');
    const targetCategory = normalizeTargetCategory(rawCategory);

    const normalizedMode = ['selected', 'docids', 'all'].includes(String(targetMode).toLowerCase())
        ? String(targetMode).toLowerCase()
        : 'all';

    const periodStart = startDate || `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const periodEnd = endDate || `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // Build employee filter: { empCodes: ['POM00055', ...], names: ['Asmadi', ...] }
    const empList = (Array.isArray(employees) ? employees : []).map(e => ({
        empCode: e.empCode || e.ptrjEmployeeID || e.PTRJEmployeeID || e.ptrjId || e.id || '',
        empName: e.name || e.EmployeeName || e.employeeName || '',
        empId: e.id || ''
    })).filter(e => e.empCode); // only valid entries

    // If no employees specified -> process ALL employees inside each detail grid.
    const hasEmpFilter = empList.length > 0;
    const processAllFromList = normalizedMode === 'all' && docIds.length === 0;
    const numericLimit = Math.max(0, parseInt(limit || 0, 10) || 0);
    const numericMaxPages = Math.max(1, parseInt(maxPages || 50, 10) || 50);
    const numericTabCount = Math.max(1, Math.min(10, parseInt(tabCount || 1, 10) || 1));

    const normalizedDocTargets = (Array.isArray(docTargets) && docTargets.length > 0)
        ? docTargets.map(t => ({
            internalId: String(t.internalId || t.docId || t.doc_id || t.id || '').trim(),
            docNumber: String(t.docNumber || t.doc_number || '').trim(),
            label: String(t.label || t.docNumber || t.doc_number || t.docId || t.doc_id || t.id || '').trim()
        })).filter(t => t.internalId || t.docNumber || t.label)
        : docIds.map(id => ({
            internalId: String(id).trim(),
            docNumber: '',
            label: String(id).trim()
        })).filter(t => t.internalId);

    const data = {
        metadata: {
            export_date: new Date().toISOString(),
            period_start: periodStart,
            period_end: periodEnd,
            category: targetCategory,
            categoryLabel: rawCategory,
            targetMode: normalizedMode,
            mode: normalizedMode,
            processAllFromList,
            dryRun: Boolean(dryRun),
            headless: Boolean(headless),
            limit: numericLimit,
            maxPages: numericMaxPages,
            tabCount: numericTabCount,
            forceListSearch: Boolean(forceListSearch),
            month,
            year,
            totalDocIds: docIds.length,
            totalEmployees: empList.length,
            hasEmployeeFilter: hasEmpFilter,
            source: 'web_interface'
        },
        docIds: docIds,
        docTargets: normalizedDocTargets,
        // Employee filter: runner uses empCode to match against grid column 2 (Emp Code)
        employees: empList
    };

    try {
        fs.writeFileSync(DELETE_DATA_FILE, JSON.stringify(data, null, 2));
    } catch (writeErr) {
        console.error(`[OTReset] Failed to write data file: ${writeErr.message}`);
        throw new Error(`Gagal menyimpan data OT Reset: ${writeErr.message}`);
    }
    console.log(`[OTReset] Data saved: mode=${normalizedMode}, docIds=${docIds.length}, processAllFromList=${processAllFromList}, category=${targetCategory}, dryRun=${Boolean(dryRun)}, headless=${Boolean(headless)}, limit=${numericLimit}, maxPages=${numericMaxPages}, tabCount=${numericTabCount}, forceListSearch=${Boolean(forceListSearch)}, period=${periodStart} to ${periodEnd}`);

    return data;
};

/**
 * Spawn delete-ot-runner.js and return SSE stream
 *
 * @param {Object} payload - Same as prepareOTResetData
 * @returns {Object} - { success, message, data }
 */
const triggerOTResetAutomation = (payload) => {
    // First prepare data
    const data = prepareOTResetData(payload);

    if ((!data.docIds || data.docIds.length === 0) && !data.metadata.processAllFromList) {
        return {
            success: false,
            error: 'Tidak ada DocId yang dipilih. Pilih DocId, pilih karyawan, atau gunakan mode "Semua".'
        };
    }

    console.log(`[OTReset] Triggering automation mode=${data.metadata.targetMode}, docIds=${data.docIds.length}, category=${data.metadata.category}`);

    return {
        success: true,
        data: {
            docIds: data.docIds,
            metadata: data.metadata
        }
    };
};

/**
 * Start the OT reset automation process (spawns delete-ot-runner.js)
 * Returns the child process so server.js can pipe SSE
 */
const startOTResetProcess = (options = {}) => {
    const headless = options.headless !== undefined
        ? Boolean(options.headless)
        : process.env.HEADLESS === 'true';

    const env = {
        ...process.env,
        AUTO_CLOSE: process.env.AUTO_CLOSE || 'true',
        HEADLESS: String(headless),
        AUTOMATION_INSTANCES: process.env.AUTOMATION_INSTANCES || '1',
        ENGINE_START_DELAY: process.env.ENGINE_START_DELAY || '2000'
    };

    const args = [DELETE_RUNNER_SCRIPT, '--all'];
    if (options.dryRun) args.push('--dry-run');
    if (options.category) args.push('--category', String(options.category));
    if (options.limit && Number(options.limit) > 0) args.push('--limit', String(Number(options.limit)));
    if (options.maxPages) args.push('--max-pages', String(Number(options.maxPages)));
    if (options.tabCount) args.push('--tabs', String(Number(options.tabCount)));
    if (options.forceListSearch) args.push('--force-list-search');

    console.log(`[OTReset] Starting delete-ot-runner.js (headless=${env.HEADLESS}, dryRun=${Boolean(options.dryRun)}, limit=${options.limit || 0}, maxPages=${options.maxPages || 50}, tabCount=${options.tabCount || 1}, forceListSearch=${Boolean(options.forceListSearch)})`);

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

/**
 * Stop the running OT reset process
 */
const stopOTResetProcess = () => {
    if (currentProcess) {
        if (process.platform === 'win32') {
            try {
                exec(`taskkill /pid ${currentProcess.pid} /T /F`, () => { /* ignore errors */ });
                console.log(`[OTReset] Force killed process ${currentProcess.pid}`);
            } catch (e) {
                console.error('[OTReset] Failed to taskkill:', e);
            }
        } else {
            currentProcess.kill('SIGINT');
        }
        currentProcess = null;
        return true;
    }
    return false;
};

module.exports = {
    fetchDocIdsFromDB,
    prepareOTResetData,
    triggerOTResetAutomation,
    startOTResetProcess,
    stopOTResetProcess
};
