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
    const { onlyOvertime = false, onlyRegular = false } = options;

    // DEBUG: Log all employees' ptrjEmployeeID
    console.log('[Compare Service] Received venusData:', venusData.length, 'employees');
    const sampleEmp = venusData[0];
    if (sampleEmp) {
        console.log('[Compare Service] Sample emp keys:', Object.keys(sampleEmp));
        console.log('[Compare Service] Sample emp ptrjEmployeeID:', sampleEmp.ptrjEmployeeID);
        console.log('[Compare Service] Sample emp name:', sampleEmp.name);
        console.log('[Compare Service] Sample emp id:', sampleEmp.id);
    }

    // Get PTRJ IDs from Venus data
    const ptrjIds = venusData
        .filter(emp => emp.ptrjEmployeeID && emp.ptrjEmployeeID !== 'N/A')
        .map(emp => emp.ptrjEmployeeID);

    console.log('[Compare Service] Filtered ptrjIds count:', ptrjIds.length);
    console.log('[Compare Service] Sample ptrjIds:', ptrjIds.slice(0, 5));

    if (ptrjIds.length === 0) {
        console.log('[Compare Service] WARNING: No valid ptrjEmployeeID found in employees!');
        return { results: [], summary: { synced: 0, notSynced: 0, mismatch: 0 } };
    }

    // Query Millware data
    // Pass otFilter if we want strictly OT data? No, query all so we can debug/analyze.
    const millwareData = await queryTaskRegData(startDate, endDate, ptrjIds);

    // Build lookup map: key = "EmpCode_YYYY-MM-DD"
    const millwareMap = {};
    millwareData.forEach(row => {
        const dateStr = formatDateSQL(row.TrxDate);
        const code = row.EmpCode ? row.EmpCode.trim() : '';
        const key = `${code}_${dateStr}`;
        if (!millwareMap[key]) {
            millwareMap[key] = [];
        }
        millwareMap[key].push(row);
    });

    console.log(`[Compare] Millware map has ${Object.keys(millwareMap).length} unique date+employee keys`);

    // Compare each Venus record
    const results = [];
    let synced = 0, mismatch = 0;

    console.log(`[Compare] Processing ${venusData.length} employees, date range: ${startDate} to ${endDate}`);

    let processedRecords = 0;
    let skippedAlfa = 0;
    let skippedOutOfRange = 0;

    venusData.forEach(emp => {
        const ptrjId = emp.ptrjEmployeeID;
        if (!ptrjId || ptrjId === 'N/A') {
            console.log(`[Compare] Skipping employee with no PTRJ ID: ${emp.name}`);
            return;
        }

        // Get attendance dates
        const attendance = emp.attendance || {};
        const attendanceDates = Object.keys(attendance);
        console.log(`[Compare] Employee ${emp.name} has ${attendanceDates.length} attendance records`);

        Object.values(attendance).forEach(day => {
            // Skip ALFA / N/A - these shouldn't be synced
            if (day.status === 'ALFA' || day.status === 'N/A') {
                skippedAlfa++;
                return;
            }

            // Standardize date format to YYYY-MM-DD
            const dateStr = formatDateSQL(day.date);
            if (!dateStr || dateStr < startDate || dateStr > endDate) {
                skippedOutOfRange++;
                return;
            }

            processedRecords++;
            const key = `${ptrjId}_${dateStr}`;

            let status = 'not_synced';
            let details = null;

            // Default values if no record found
            let millwareRecords = millwareMap[key] || [];

            // Record found in Millware (or defaulted to empty array)
            // Handle BIT/Boolean type from SQL: Use loose equality or Number()
            const normalHours = millwareRecords.filter(r => r.OT == 0).reduce((sum, r) => sum + (parseFloat(r.Hours) || 0), 0);
            const otHours = millwareRecords.filter(r => r.OT == 1).reduce((sum, r) => sum + (parseFloat(r.Hours) || 0), 0);
            const totalHours = normalHours + otHours;

            const venusRegular = (day.regularHours || 0);
            const venusOt = (day.overtimeHours || 0);
            const venusTotal = venusRegular + venusOt;

            // Sync logic
            let isSynced = false;
            let regularMatch = false;
            let otMatch = false;

            // --- STRICT HOURS CHECK & EXISTENCE MANDATE ---
            // CRITICAL: Data MUST exist in Millware to be considered synced.
            // Even if Venus has 0 hours (Sunday/holiday), we need a record in Millware to mark as synced.

            // 1. Check if data EXISTS in Millware
            const hasRegularRecord = millwareRecords.some(r => r.OT == 0 || r.OT == false);
            const hasOTRecord = millwareRecords.some(r => r.OT == 1 || r.OT == true);
            const hasAnyRecord = millwareRecords.length > 0;

            // 2. Determine Sync Status
            // VERY STRICT: Millware MUST have corresponding records to be considered synced.
            // No data in Millware = NOT SYNCED, regardless of Venus hours value.
            let regularSynced = false;
            let otSynced = false;

            // --- REGULAR HOURS CHECK (OT = 0) ---
            // RULE: All Venus "Hadir" statuses MUST have corresponding record in Millware
            // This includes: Normal work days, Sunday (OFF), Holiday (LBR), Sick, Annual Leave
            // All of these are PAID and must be input to Millware with proper TaskCode

            // ALFA and N/A are the only statuses that don't need input
            const needsRegularRecord = day.status !== 'ALFA' && day.status !== 'N/A';

            if (needsRegularRecord) {
                // Must have OT=0 record in Millware
                if (hasRegularRecord) {
                    // Record exists in Millware. 
                    // Per user request: "kalo yan beda jam gappa, intinya datanya hrus ada... (ingta yang sakit dan cuti dinaggpa ada datanya)"
                    // So we do not strictly check hours (Math.abs(normalHours - venusRegular) < 0.1). 
                    // The mere existence of a regular record is sufficient to be considered "synced".
                    regularSynced = true;
                } else {
                    // No OT=0 record in Millware → NOT SYNCED
                    regularSynced = false;
                }
            } else {
                // ALFA/N/A - no input needed, consider synced
                regularSynced = true;
            }

            // --- OVERTIME HOURS CHECK (OT = 1) ---
            // RULE: If Venus has OT hours > 0, Millware MUST have OT=1 record with matching hours
            // If Venus has OT = 0, no OT record needed (unless there's a mismatch to detect)
            if (venusOt > 0) {
                // Venus expects OT hours → Millware MUST have OT=1 record
                if (hasOTRecord) {
                    // Record exists. Following the same logic: "kalo yan beda jam gappa"
                    // Existence of OT record is enough.
                    otSynced = true;
                } else {
                    // No OT=1 record in Millware but Venus has OT hours → NOT SYNCED
                    otSynced = false;
                }
            } else {
                // Venus OT = 0 (no overtime)
                // If Millware has an OT record but Venus 0, we can also consider it synced
                // because we only care about missing data from Millware.
                otSynced = true;
            }

            // --- MODE FILTERING ---
            if (options.onlyOvertime) {
                // In OT-only mode, we only care about OT synchronization
                regularSynced = true; // Ignore regular
            }
            if (options.onlyRegular) {
                // In Regular-only mode, we only care about regular synchronization
                otSynced = true; // Ignore OT
            }
            if (options.syncRegularOnly) {
                // When syncing regular only, ignore OT status
                otSynced = true;
            }

            // Final sync decision - both regular and OT must be synced (unless filtered by mode)
            isSynced = regularSynced && otSynced;

            // Log mismatches for debugging
            if (!isSynced) {
                console.log(`[Compare] ❌ MISS: ${key} | Regular: ${regularSynced ? '✓' : '✗'}, OT: ${otSynced ? '✓' : '✗'} | Venus: ${venusRegular}h+${venusOt}h | Millware: ${normalHours}h+${otHours}h | Records=${millwareRecords.length}`);
            }

            // Set match flags for UI feedback (green checkmarks)
            // Note: We keep the TRUE match status for UI visualization even if filtered out
            regularMatch = regularSynced;
            otMatch = otSynced;

            // (Legacy Strict Logic commented out for reference)
            /*
            if (onlyOvertime) {
                // In Overtime Only mode, if Millware already has OT, we consider it synced (skip).
                // We only want to input if Millware has NO OT (0) but Venus HAS OT.
                isSynced = otHours > 0.01;
                otMatch = isSynced;
                regularMatch = true; // Ignore regular match in OT mode
                if (isSynced) {
                regularMatch = hasNormalRecord && Math.abs(normalHours - venusRegular) < 0.1;

                // DEBUG: Explicitly log why we matched or missed
                // DEBUG: Explicitly log why we matched or missed
                const cleanStatus = day.status || '';
                if (dateStr === '2026-01-11' || cleanStatus.includes('Partial')) {
                    console.log(`[Compare DEBUG] ${ptrjId} @ ${dateStr} [${cleanStatus}] Decision:`);
                    console.log(`   - Normal Record Exists? ${hasNormalRecord}`);
                    console.log(`   - Hours Match? ${Math.abs(normalHours - venusRegular) < 0.1} (DB: ${normalHours}, Venus: ${venusRegular})`);
                    console.log(`   - REGULAR MATCH RESULT: ${regularMatch}`);
                }

                // Overtime match check

                // Overtime match check
                // If Venus has OT, we need OT record. If Venus 0 OT, we match if 0 OT in DB (or no record).
                // But to be safe, if we have 0 OT in Venus and NO record in DB, that's a match/ok.
                // If we have 0 OT in Venus and Record exists with 0 OT, also match.
                // The only case to FLAG is if Venus > 0 and NO record or Diff value.
                otMatch = (venusOt > 0.01)
                    ? (hasOtRecord && Math.abs(otHours - venusOt) < 0.1)
                    : (Math.abs(otHours - venusOt) < 0.1); // If 0 target, 0 found (even if no record) is OK.

                // Task Code Check for Leaves
                let taskCodeMatch = true;
                if (day.isSickLeave) {
                     // Check for GA9127 (Sick)
                     taskCodeMatch = millwareRecords.some(r => r.TaskCode && (r.TaskCode.includes('GA9127') || r.TaskCode.includes('SICK')));
                     if (!taskCodeMatch) console.log(`[Compare] ⚠️ Task Code Mismatch for ${ptrjId} @ ${dateStr}: Expected SICK, found ${millwareRecords.map(r => r.TaskCode).join(', ')}`);
                } else if (day.isAnnualLeave) {
                     // Check for GA9130 (Annual)
                     taskCodeMatch = millwareRecords.some(r => r.TaskCode && (r.TaskCode.includes('GA9130') || r.TaskCode.includes('ANNUAL')));
                     if (!taskCodeMatch) console.log(`[Compare] ⚠️ Task Code Mismatch for ${ptrjId} @ ${dateStr}: Expected ANNUAL, found ${millwareRecords.map(r => r.TaskCode).join(', ')}`);
                }

                // Combined sync status (All must match to be synced/MATCH)
                isSynced = regularMatch && otMatch && taskCodeMatch;
            }
            */

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
                records: millwareRecords.length,
                regularMatched: regularMatch, // Use the computed strict variable
                otMatched: otMatch, // Use the computed strict variable
                hasRegularRecord: hasRegularRecord, // For checking if regular data exists
                hasOTRecord: hasOTRecord // For checking if OT data exists
            };

            // Determine explicit MATCH/MISS status for frontend consistency
            // Default to 'MISS' if not synced, otherwise 'MATCH'
            // If Millware has no record but Venus does (and it's not ALFA), it's a MISS (not_synced)
            // If Millware has record but values differ, it's a MISS (mismatch)
            const matchStatus = (status === 'synced') ? 'MATCH' : 'MISS';

            results.push({
                employeeId: emp.id,
                employeeName: emp.name,
                ptrjId: ptrjId,
                date: dateStr,
                venusStatus: day.status,
                venusRegularHours: day.regularHours || 0,
                venusOvertimeHours: day.overtimeHours || 0,
                syncStatus: status,
                status: matchStatus, // Explicit MATCH/MISS field
                details: details
            });
        });
    });

    // Summary log
    const total = synced + mismatch;
    console.log(`[Compare] ═══════════════════════════════════════════════════`);
    console.log(`[Compare] SUMMARY: Total=${total}, Synced=${synced}, Mismatch=${mismatch}`);
    console.log(`[Compare] Match Rate: ${total > 0 ? ((synced / total) * 100).toFixed(1) : 0}%`);
    console.log(`[Compare] Records skipped - ALFA: ${skippedAlfa}, Out of range: ${skippedOutOfRange}`);
    console.log(`[Compare] Processed records: ${processedRecords}`);
    console.log(`[Compare] Results array length: ${results.length}`);
    console.log(`[Compare] ═══════════════════════════════════════════════════`);

    return {
        results,
        summary: { synced, mismatch, total, notSynced: mismatch } // notSynced alias for backward compatibility
    };
};

/**
 * Get only MISS data (mismatches or missing records)
 */
const getMissData = async (venusData, startDate, endDate, options = {}) => {
    const comparison = await compareWithTaskReg(venusData, startDate, endDate, options);
    // Filter results where status is 'MISS'
    const missResults = comparison.results.filter(item => item.status === 'MISS');

    return {
        results: missResults,
        summary: {
            total_miss: missResults.length,
            total_checked: comparison.results.length
        }
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
        // Already a string, just take first 10 chars (YYYY-MM-DD)
        return date.substring(0, 10);
    }
    return new Date(date).toISOString().split('T')[0];
};

module.exports = {
    queryTaskRegData,
    compareWithTaskReg,
    getMissData,
    getSyncSummaryByEmployee
};
