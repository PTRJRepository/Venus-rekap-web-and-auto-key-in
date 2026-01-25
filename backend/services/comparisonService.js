/**
 * Comparison Service
 * Query Millware database tables to compare with Venus attendance data
 * 
 * Tables:
 * - PR_TASKREGLN: Task registration for attendance (EmpCode = PTRJ ID, TrxDate = date)
 * - PR_EMP_ATTN: Employee attendance (future)
 */

const { executeQuery } = require('./gateway');

/**
 * Query PR_TASKREGLN data for comparison
 * @param {string} startDate - Start date YYYY-MM-DD
 * @param {string} endDate - End date YYYY-MM-DD
 * @param {string[]} empCodes - Array of PTRJ Employee IDs (optional)
 * @param {number} otFilter - 0 for normal hours, 1 for overtime, null for all (optional)
 */
const queryTaskRegData = async (startDate, endDate, empCodes = null, otFilter = null) => {
    try {
        let sql = `
            SELECT 
                EmpCode,
                TrxDate,
                TaskCode,
                Hours,
                OT,
                Status,
                ChargeTo,
                NormalDay,
                CreatedBy,
                CreatedDate
            FROM [db_ptrj_mill].[dbo].[PR_TASKREGLN]
            WHERE TrxDate BETWEEN '${startDate}' AND '${endDate}'
        `;

        if (empCodes && empCodes.length > 0) {
            const empList = empCodes.map(e => `'${e}'`).join(',');
            sql += ` AND EmpCode IN (${empList})`;
        }

        // Filter by OT: 0 = normal hours, 1 = overtime
        if (otFilter !== null && otFilter !== undefined) {
            sql += ` AND OT = ${otFilter}`;
        }

        sql += ` ORDER BY TrxDate, EmpCode`;

        const otDesc = otFilter === 0 ? '(Normal)' : otFilter === 1 ? '(Overtime)' : '(All)';
        console.log(`[Comparison] Querying PR_TASKREGLN ${otDesc}: ${startDate} to ${endDate}`);
        const result = await executeQuery(sql);
        console.log(`[Comparison] Found ${result.length} records in PR_TASKREGLN ${otDesc}`);

        return result;
    } catch (error) {
        console.error('[Comparison] Error querying PR_TASKREGLN:', error.message);
        throw error;
    }
};

/**
 * Compare Venus attendance data with Millware PR_TASKREGLN
 * @param {Array} venusData - Attendance data from Venus (with ptrjEmployeeID and attendance by date)
 * @param {string} startDate - Start date YYYY-MM-DD
 * @param {string} endDate - End date YYYY-MM-DD
 * @returns {Object} Comparison results with sync status for each record
 */
const compareWithTaskReg = async (venusData, startDate, endDate, options = {}) => {
    const { onlyOvertime = false } = options;

    // Get PTRJ IDs from Venus data
    const ptrjIds = venusData
        .filter(emp => emp.ptrjEmployeeID && emp.ptrjEmployeeID !== 'N/A')
        .map(emp => emp.ptrjEmployeeID);

    if (ptrjIds.length === 0) {
        return { results: [], summary: { synced: 0, notSynced: 0, mismatch: 0 } };
    }

    // Query Millware data
    // Pass otFilter if we want strictly OT data? No, query all so we can debug/analyze.
    const millwareData = await queryTaskRegData(startDate, endDate, ptrjIds);

    // Build lookup map: key = "EmpCode_YYYY-MM-DD"
    const millwareMap = {};
    millwareData.forEach(row => {
        const dateStr = formatDateSQL(row.TrxDate);
        const key = `${row.EmpCode}_${dateStr}`;
        if (!millwareMap[key]) {
            millwareMap[key] = [];
        }
        millwareMap[key].push(row);
    });

    // DEBUG: Show sample keys from millwareMap
    const sampleKeys = Object.keys(millwareMap).slice(0, 5);
    console.log(`[Compare] Millware map has ${Object.keys(millwareMap).length} unique date+employee keys`);
    if (sampleKeys.length > 0) {
        console.log(`[Compare] Sample keys: ${sampleKeys.join(', ')}`);
    }

    // Compare each Venus record
    const results = [];
    let synced = 0, notSynced = 0, mismatch = 0;

    venusData.forEach(emp => {
        const ptrjId = emp.ptrjEmployeeID;
        if (!ptrjId || ptrjId === 'N/A') return;

        // Get attendance dates
        const attendance = emp.attendance || {};
        Object.values(attendance).forEach(day => {
            // Skip ALFA / N/A - these shouldn't be synced
            if (day.status === 'ALFA' || day.status === 'N/A') return;

            const dateStr = day.date;
            if (dateStr < startDate || dateStr > endDate) return;

            const key = `${ptrjId}_${dateStr}`;
            const millwareRecords = millwareMap[key];

            let status = 'not_synced';
            let details = null;

            if (millwareRecords && millwareRecords.length > 0) {
                // Record found in Millware
                const normalHours = millwareRecords.filter(r => r.OT === 0).reduce((sum, r) => sum + (parseFloat(r.Hours) || 0), 0);
                const otHours = millwareRecords.filter(r => r.OT === 1).reduce((sum, r) => sum + (parseFloat(r.Hours) || 0), 0);
                const totalHours = normalHours + otHours;

                const venusRegular = (day.regularHours || 0);
                const venusOt = (day.overtimeHours || 0);
                const venusTotal = venusRegular + venusOt;

                // Sync logic
                let isSynced = false;
                if (onlyOvertime) {
                    // In Overtime Only mode, if Millware already has OT, we consider it synced (skip).
                    // We only want to input if Millware has NO OT (0) but Venus HAS OT.
                    isSynced = otHours > 0.01;
                    if (isSynced) {
                        console.log(`[Compare] ✓ SYNCED: ${ptrjId} @ ${dateStr} - Millware OT: ${otHours}h, Venus OT: ${venusOt}h`);
                    }
                } else {
                    // Match total hours (simplest for general status)
                    isSynced = Math.abs(totalHours - venusTotal) < 0.1;
                }

                if (isSynced) {
                    status = 'synced';
                    synced++;
                } else {
                    status = 'mismatch';
                    mismatch++;
                }

                details = {
                    millwareHours: totalHours,
                    millwareNormal: normalHours,
                    millwareOT: otHours,
                    venusHours: venusTotal,
                    venusNormal: venusRegular,
                    venusOT: venusOt,
                    records: millwareRecords.length
                };
            } else {
                notSynced++;
            }

            results.push({
                employeeId: emp.id,
                employeeName: emp.name,
                ptrjId: ptrjId,
                date: dateStr,
                venusStatus: day.status,
                venusRegularHours: day.regularHours || 0,
                venusOvertimeHours: day.overtimeHours || 0,
                syncStatus: status,
                details: details
            });
        });
    });

    return {
        results,
        summary: { synced, notSynced, mismatch, total: synced + notSynced + mismatch }
    };
};

/**
 * Get sync summary by employee
 */
const getSyncSummaryByEmployee = async (startDate, endDate, empCodes = null) => {
    const sql = `
        SELECT 
            EmpCode,
            COUNT(*) as RecordCount,
            SUM(Hours) as TotalHours,
            SUM(CASE WHEN OT = 1 THEN Hours ELSE 0 END) as OvertimeHours,
            MIN(TrxDate) as FirstDate,
            MAX(TrxDate) as LastDate
        FROM [db_ptrj_mill].[dbo].[PR_TASKREGLN]
        WHERE TrxDate BETWEEN '${startDate}' AND '${endDate}'
        ${empCodes && empCodes.length > 0 ? `AND EmpCode IN (${empCodes.map(e => `'${e}'`).join(',')})` : ''}
        GROUP BY EmpCode
        ORDER BY EmpCode
    `;

    return await executeQuery(sql);
};

// Helper to format SQL date
const formatDateSQL = (date) => {
    if (!date) return null;
    if (typeof date === 'string') {
        return date.substring(0, 10);
    }
    return new Date(date).toISOString().split('T')[0];
};

module.exports = {
    queryTaskRegData,
    compareWithTaskReg,
    getSyncSummaryByEmployee
};
