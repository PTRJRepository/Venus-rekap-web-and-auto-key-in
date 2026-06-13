const { executeQuery } = require('./gateway');
const { fetchPayrollData } = require('./payrollService');
const { buildPayrollAutomationComponents } = require('./payrollComponentMapping');
const fs = require('fs');
const path = require('path');

const pad2 = (value) => String(value).padStart(2, '0');

const getPayrollDocDate = (month, year) => {
    const numericMonth = Number(month);
    const numericYear = Number(year);
    const lastDay = new Date(numericYear, numericMonth, 0).getDate();
    const monthText = pad2(numericMonth);
    const dayText = pad2(lastDay);
    return {
        iso: `${numericYear}-${monthText}-${dayText}`,
        formatted: `${dayText}/${monthText}/${numericYear}`
    };
};

const toRoundedAmount = (value) => Math.round(Number(value) || 0);

/**
 * Detect lembur type based on chargeJob pattern
 * Returns: 'workshop_control_account' | 'vehicle_running' | 'standard'
 */
const detectLemburType = (chargeJob) => {
    if (!chargeJob) return 'standard';
    const upperChargeJob = String(chargeJob).toUpperCase();

    // Workshop Control Account patterns
    if (upperChargeJob.includes('WORKSHOP') && upperChargeJob.includes('CONTROL ACCOUNT')) {
        return 'workshop_control_account';
    }

    // Vehicle Running patterns
    if (upperChargeJob.includes('VEHICLE') && upperChargeJob.includes('RUNNING')) {
        return 'vehicle_running';
    }

    return 'standard';
};

/**
 * Get AD code and search keyword based on lembur type
 */
const getLemburAdCode = (lemburType) => {
    switch (lemburType) {
        case 'workshop_control_account':
            return {
                adCode: 'AL0021',
                adCodeDesc: '(AL) LEMBUR WORKSHOP CONTROL ACCOUNT',
                adSearchKeyword: 'WORKSHOP'
            };
        case 'vehicle_running':
            return {
                adCode: 'AL0022',
                adCodeDesc: '(AL) LEMBUR VEHICLE RUNNING',
                adSearchKeyword: 'VEHICLE'
            };
        default:
            return {
                adCode: 'AL0019',
                adCodeDesc: '(AL) TUNJANGAN LEMBUR',
                adSearchKeyword: 'LEMBUR'
            };
    }
};

const ROUNDABLE_AMOUNT_FIELDS = [
    'venusAmount',
    'millwareAmount',
    'diff',
    'inputAmount',
    'shortfallAmount',
    'originalVenusAmount',
    'originalMillwareAmount'
];

const normalizeAutomationComponentAmounts = (component = {}) => {
    const rounded = { ...component };

    for (const field of ROUNDABLE_AMOUNT_FIELDS) {
        if (rounded[field] !== undefined && rounded[field] !== null && rounded[field] !== '') {
            rounded[field] = toRoundedAmount(rounded[field]);
        }
    }

    return rounded;
};

const normalizeComponentKeys = (componentKeys = []) => {
    // Daftar komponen yang SEHARUSNYA di-otomasi
    // NOTE: BPJS Kesehatan dan BPJS Pensiun TIDAK termasuk karena beda sistem Venus vs Millware
    // NOTE: Salary/Bonus TIDAK termasuk karena BUKAN bagian dari Premi
    const allowed = new Set([
        'jabatan',      // Tunjangan Jabatan
        'masaKerja',    // Tunjangan Masa Kerja
        'beras',        // Tunjangan Beras
        'lembur',       // Tunjangan Lembur
        'pph21',        // Potongan PPH21
        'spsi'          // Potongan SPSI
        // Premi components (premiPanen, premiKinerja, dll) tidak punya ADCode fixed
        // sehingga tidak bisa di-automasi dengan cara yang sama
    ]);
    const keys = Array.isArray(componentKeys) ? componentKeys : [componentKeys];
    return keys
        .map(key => String(key || '').trim())
        .filter(key => allowed.has(key));
};

const filterAutomationDataByComponentKeys = (automationData = [], componentKeys = []) => {
    const keys = normalizeComponentKeys(componentKeys);
    if (keys.length === 0) return automationData;
    const allowed = new Set(keys);

    return automationData
        .map(employee => ({
            ...employee,
            components: (employee.components || []).filter(component => allowed.has(component.componentKey))
        }))
        .filter(employee => employee.components.length > 0);
};

const splitAutomationDataToSingleComponentRecords = (automationData = []) => {
    const records = [];

    for (const employee of automationData) {
        for (const component of employee.components || []) {
            const normalizedComponent = normalizeAutomationComponentAmounts(component);
            records.push({
                ...employee,
                recordKey: [
                    employee.ptrjId || employee.employeeId || employee.employeeName || '',
                    normalizedComponent.componentKey || '',
                    normalizedComponent.adCode || '',
                    normalizedComponent.venusAmount || ''
                ].join(':'),
                components: [normalizedComponent]
            });
        }
    }

    return records;
};

const quoteSql = (value) => `'${String(value).replace(/'/g, "''")}'`;

const payrollRecordSignature = (ptrjId, taskCode, amount) => [
    String(ptrjId || '').trim().toUpperCase(),
    String(taskCode || '').trim().toUpperCase(),
    String(toRoundedAmount(amount))
].join(':');

const fetchExistingADRecordSignatures = async (records = [], month, year) => {
    const ptrjIds = [...new Set(records.map(record => record.ptrjId).filter(Boolean))];
    if (ptrjIds.length === 0) return new Set();

    const empList = ptrjIds.map(quoteSql).join(',');
    const sql = `
        SELECT
            RTRIM(t.EmpCode) AS EmpCode,
            RTRIM(ln.TaskCode) AS TaskCode,
            CAST(ROUND(ln.Amount, 0) AS INT) AS Amount
        FROM (
            SELECT ID, EmpCode, PhyMonth, PhyYear
            FROM [db_ptrj_mill].[dbo].PR_ADTRANS
            WHERE RTRIM(EmpCode) IN (${empList})
              AND PhyMonth = ${Number(month)}
              AND PhyYear = ${Number(year)}

            UNION ALL

            SELECT ID, EmpCode, PhyMonth, PhyYear
            FROM [db_ptrj_mill].[dbo].PR_ADTRANS_ARC
            WHERE RTRIM(EmpCode) IN (${empList})
              AND PhyMonth = ${Number(month)}
              AND PhyYear = ${Number(year)}
        ) t
        JOIN (
            SELECT MasterID, TaskCode, Amount
            FROM [db_ptrj_mill].[dbo].PR_ADTRANSLN
            UNION ALL
            SELECT MasterID, TaskCode, Amount
            FROM [db_ptrj_mill].[dbo].PR_ADTRANSLN_ARC
        ) ln ON t.ID = ln.MasterID
    `;

    const rows = await executeQuery(sql);
    return new Set(rows.map(row => payrollRecordSignature(row.EmpCode, row.TaskCode, row.Amount)));
};

const filterAlreadyExistingADRecords = async (records = [], month, year) => {
    const existing = await fetchExistingADRecordSignatures(records, month, year);
    const filtered = [];
    const skipped = [];

    for (const record of records) {
        const component = record.components?.[0] || {};
        const signature = payrollRecordSignature(record.ptrjId, component.adCode, component.venusAmount);
        if (existing.has(signature)) {
            skipped.push({
                status: 'SKIPPED_ALREADY_EXISTS',
                employeeId: record.employeeId,
                employeeName: record.employeeName,
                ptrjId: record.ptrjId,
                componentKey: component.componentKey,
                componentName: component.componentName,
                adCode: component.adCode,
                venusAmount: component.venusAmount,
                signature
            });
            continue;
        }
        filtered.push(record);
    }

    return { records: filtered, skipped, existingCount: existing.size };
};

const filterDuplicatePayloadRecords = (records = []) => {
    const seen = new Set();
    const filtered = [];
    const skipped = [];

    for (const record of records) {
        const component = record.components?.[0] || {};
        const signature = payrollRecordSignature(record.ptrjId, component.adCode, component.venusAmount);

        if (seen.has(signature)) {
            skipped.push({
                status: 'SKIPPED_DUPLICATE_PAYLOAD',
                employeeId: record.employeeId,
                employeeName: record.employeeName,
                ptrjId: record.ptrjId,
                componentKey: component.componentKey,
                componentName: component.componentName,
                adCode: component.adCode,
                venusAmount: component.venusAmount,
                signature
            });
            continue;
        }

        seen.add(signature);
        filtered.push(record);
    }

    return { records: filtered, skipped };
};

const filterDuplicateAndExistingADRecords = async (records = [], month, year) => {
    const duplicateFilter = filterDuplicatePayloadRecords(records);
    const existingFilter = await filterAlreadyExistingADRecords(duplicateFilter.records, month, year);

    return {
        records: existingFilter.records,
        skipped: [...duplicateFilter.skipped, ...existingFilter.skipped],
        skippedDuplicates: duplicateFilter.skipped.length,
        skippedAlreadyExists: existingFilter.skipped.length,
        existingCount: existingFilter.existingCount
    };
};

/**
 * Fetch all Task Codes (ADCode) from Millware PR_TASKCODE master table
 */
const fetchMillwareTaskCodes = async () => {
    try {
        const sql = `
            SELECT TaskCode, TaskDesc
            FROM [db_ptrj_mill].[dbo].PR_TASKCODE
            WHERE LTRIM(RTRIM(TaskCode)) != ''
            ORDER BY TaskCode
        `;
        const data = await executeQuery(sql);
        return data.map(row => ({
            taskCode: row.TaskCode ? row.TaskCode.trim() : '',
            taskDesc: row.TaskDesc ? row.TaskDesc.trim() : ''
        }));
    } catch (error) {
        console.error("[PayrollAutomation] Error fetching task codes:", error);
        throw error;
    }
};

/**
 * Find matching ADCode based on Venus component name using TaskDesc matching
 * @param {string} venusComponentName - Name from Venus (e.g., "TUNJANGAN LEMBUR", "PPH21 DIPOTONG")
 * @param {Array} taskCodes - Array of {taskCode, taskDesc} from Millware
 * @returns {string|null} - Matched ADCode or null
 */
const findMatchingADCode = (venusComponentName, taskCodes) => {
    const searchTerm = venusComponentName.toUpperCase();

    // Define priority keywords for each component type
    // NOTE: BONUS dan SALARY BONUS TIDAK termasuk dalam PREMI search
    // NOTE: BPJS KESEHATAN TIDAK diikutsertakan karena beda sistem
    const keywordMap = {
        'LEMBUR': ['LEMBUR', 'OT'],
        'JABATAN': ['JABATAN'],
        'MASA KERJA': ['MASA KERJA', 'MASAKE'],
        'TRANSPORT': ['TRANSPORT'],
        'PPH21': ['PPH21'],
        'SPSI': ['SPSI'],
        'BERAS': ['BERAS'],
        // PREMI - DIPISAH dari BONUS (BONUS adalah Salary Bonus, BUKAN Premi)
        'PREMI PANEN': ['PREMI PANEN', 'PREMI AL'],
        'PREMI KINERJA': ['PREMI KINERJA'],
        'PREMI BRONDOL': ['PREMI BRONDOL'],
        'PREMI INSENTIF': ['PREMI INSENTIF'],
        'PREMI': ['PREMI'] // Fallback untuk premi lain
 };

    // Try to find matching keyword category
    let keywords = null;
    for (const [category, kws] of Object.entries(keywordMap)) {
        if (searchTerm.includes(category) || kws.some(kw => searchTerm.includes(kw))) {
            keywords = kws;
            break;
        }
    }

    if (!keywords) {
        // Fallback: search for any task desc containing the component name words
        keywords = searchTerm.split(' ').filter(w => w.length > 3);
    }

    // Find best match
    let bestMatch = null;
    let bestScore = 0;

    for (const tc of taskCodes) {
        const taskDesc = tc.taskDesc.toUpperCase();
        let score = 0;

        for (const kw of keywords) {
            if (taskDesc.includes(kw.toUpperCase())) {
                score += kw.length;
            }
        }

        if (score > bestScore) {
            bestScore = score;
            bestMatch = tc.taskCode;
        }
    }

    return bestMatch;
};

/**
 * Get Venus component mapping to search keywords
 * NOTE: BONUS/SALARY BONUS TIDAK diikutsertakan karena BUKAN bagian dari Premi
 * NOTE: BPJS KESEHATAN TIDAK diikutsertakan karena beda sistem Venus vs Millware
 */
const getVenusComponentKeywords = () => {
    return {
        // Additions - Tunjangan
        '#OT1#': ['LEMBUR', 'OT'],
        '#OT2#': ['LEMBUR', 'OT'],
        '#OT3#': ['LEMBUR', 'OT'],
        '#OT4#': ['LEMBUR', 'OT'],
        'TUNJANGAN LEMBUR': ['LEMBUR', 'OT'],
        '#TJ_JABATAN#': ['JABATAN'],
        'TUNJANGAN JABATAN': ['JABATAN'],
        '#TJ_MASAKERJA#': ['MASA KERJA', 'MASAKE'],
        'TUNJANGAN MASA KERJA': ['MASA KERJA', 'MASAKE'],
        '#TJ_TRANSPORT#': ['TRANSPORT'],
        'TUNJANGAN TRANSPORT': ['TRANSPORT'],
        'TUNGJANGAN TRANSPORT HARIAN': ['TRANSPORT'],
        '#TJ_BERAS#': ['BERAS'],
        'TUNJANGAN BERAS': ['BERAS'],
        '#TJ_LAIN#': ['TUNJANGAN'],
        'TUNJANGAN LAIN-LAIN': ['TUNJANGAN'],
        '#TPRF#': ['PREMI', 'RIT'],
        'TUNJANGAN PREMI RIT': ['PREMI', 'RIT'],

        // Deductions - Potongan (BPJS TIDAK termasuk)
        '#PPH21_DIPTG#': ['PPH21'],
        'POTONGAN PPH21': ['PPH21'],
        'PPH 21': ['PPH21'],
        '#POT_SPSI#': ['SPSI'],
        'POTONGAN SPSI': ['SPSI'],

        // PREMI components (DIPISAH dari BONUS)
        'PREMI PANEN': ['PREMI PANEN', 'PREMI AL'],
        'PREMI KINERJA': ['PREMI KINERJA'],
        'PREMI BRONDOL': ['PREMI BRONDOL'],
        'PREMI INSENTIF': ['PREMI INSENTIF'],
        // NOTE: BONUS GAJI/SALARY BONUS TIDAK ada di sini karena BUKAN Premi
    };
};

/**
 * Find ADCode using Venus component keywords
 * NOTE: BPJS mappings REMOVED karena tidak masuk dalam komparasi
 */
const findADCodeByVenusComponent = (venusCompName, taskCodes) => {
    const keywordsMap = getVenusComponentKeywords();
    const upperName = venusCompName.toUpperCase();

    const explicitMap = [
        { match: (name) => name.includes('JABATAN'), taskCode: 'GA9128' },
        { match: (name) => name.includes('MASA KERJA'), taskCode: 'GA9129' },
        { match: (name) => name.includes('LEMBUR') || name.includes('OVERTIME'), taskCode: 'AL0019' },
        { match: (name) => name.includes('BERAS') || name.includes('RICE'), taskCode: 'AL0011' }, // AL0011 = TUNJANGAN TRANSPORT (digunakan untuk BERAS)
        { match: (name) => name.includes('PPH'), taskCode: 'DEPH21' },
        { match: (name) => name.includes('SPSI'), taskCode: 'DE0003' }
        // NOTE: BPJS KESEHATAN, PENSIUN, JHT, JKK, JK REMOVED - tidak masuk komparasi
    ];

    const explicit = explicitMap.find(item => item.match(upperName));
    if (explicit && taskCodes.some(tc => tc.taskCode.toUpperCase() === explicit.taskCode)) {
        return explicit.taskCode;
    }

    // Direct lookup by component code/name
    let keywords = keywordsMap[venusCompName];

    if (!keywords) {
        // Try to find partial match
        for (const [comp, kws] of Object.entries(keywordsMap)) {
            if (upperName.includes(comp.toUpperCase()) || comp.toUpperCase().includes(upperName)) {
                keywords = kws;
                break;
            }
        }
    }

    if (!keywords) {
        // Fallback to word-based search
        keywords = upperName.split(' ').filter(w => w.length > 3);
    }

    // Find best match
    let bestMatch = null;
    let bestScore = 0;

    for (const tc of taskCodes) {
        const taskDesc = tc.taskDesc.toUpperCase();
        let score = 0;

        for (const kw of keywords) {
            if (taskDesc.includes(kw.toUpperCase())) {
                score += kw.length;
            }
        }

        if (score > bestScore) {
            bestScore = score;
            bestMatch = tc.taskCode;
        }
    }

    return bestMatch;
};

/**
 * Prepare payroll automation data - finds MISS components between Venus and Millware
 * @param {number} month
 * @param {number} year
 */
const preparePayrollAutomationData = async (month, year, options = {}) => {
    try {
        console.log(`[PayrollAutomation] Preparing automation data for ${month}/${year}`);

        // 1. Fetch Venus payroll data
        const payrollResult = await fetchPayrollData(month, year, options.payrollSource || {});
        if (!payrollResult.success) {
            throw new Error(payrollResult.error);
        }

        // 2. Fetch Millware task codes for mapping
        const taskCodes = await fetchMillwareTaskCodes();
        console.log(`[PayrollAutomation] Found ${taskCodes.length} task codes in Millware`);

        // 3. Build automation data
        const automationData = [];
        const diagnostics = [];
        const tolerance = 10; // 10 rupiah tolerance

        for (const emp of payrollResult.data) {
            if (!emp.ptrjId || emp.ptrjId === '-') {
                console.log(`[PayrollAutomation] Skip ${emp.name} - no PTRJ ID`);
                diagnostics.push({
                    status: 'SKIPPED_NO_PTRJ_ID',
                    employeeId: emp.id,
                    employeeName: emp.name
                });
                continue;
            }

            const { components: missingComponents, diagnostics: empDiagnostics } = buildPayrollAutomationComponents(emp, taskCodes, tolerance);
            empDiagnostics.forEach(item => diagnostics.push({
                ...item,
                employeeId: emp.id,
                employeeName: emp.name,
                ptrjId: emp.ptrjId
            }));

            if (missingComponents.length > 0) {
                automationData.push({
                    employeeId: emp.id,
                    employeeName: emp.name,
                    ptrjId: emp.ptrjId,
                    chargeJob: emp.chargeJob,
                    components: missingComponents
                });
            }
        }

        const filteredAutomationData = filterAutomationDataByComponentKeys(automationData, options.componentKeys);
        const singleRecordAutomationData = splitAutomationDataToSingleComponentRecords(filteredAutomationData);
        const existingFilter = await filterDuplicateAndExistingADRecords(singleRecordAutomationData, month, year);
        existingFilter.skipped.forEach(item => diagnostics.push(item));

        const finalAutomationData = existingFilter.records;
        const totalComponents = finalAutomationData.reduce((sum, emp) => sum + emp.components.length, 0);
        const unmappedCount = diagnostics.filter(item => item.status === 'UNMAPPED').length;
        console.log(`[PayrollAutomation] Existing AD signatures: ${existingFilter.existingCount}`);
        console.log(`[PayrollAutomation] Skipped duplicate payload records: ${existingFilter.skippedDuplicates}`);
        console.log(`[PayrollAutomation] Skipped already existing AD records: ${existingFilter.skippedAlreadyExists}`);
        console.log(`[PayrollAutomation] Found ${finalAutomationData.length} AD record(s) with ${totalComponents} MISS components`);
        if (unmappedCount > 0) {
            console.log(`[PayrollAutomation] WARN: ${unmappedCount} component(s) need mapping review`);
        }

        // 4. Save to file
        const outputDir = path.resolve(__dirname, '..', '..', 'browser-automation-engine', 'testing_data');
        const outputFile = path.join(outputDir, 'current_payroll_data.json');

        // Ensure directory exists
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const payrollDocDate = getPayrollDocDate(month, year);
        const fileData = {
            metadata: {
                month,
                year,
                payrollSource: payrollResult.sourceInfo?.source || options.payrollSource?.source || 'live',
                snapshotId: payrollResult.sourceInfo?.snapshotId || options.payrollSource?.snapshotId || null,
                payrollDocDateIso: payrollDocDate.iso,
                payrollDocDate: payrollDocDate.formatted,
                generatedAt: new Date().toISOString(),
                totalEmployees: finalAutomationData.length,
                totalRecords: finalAutomationData.length,
                totalComponents,
                skippedDuplicates: existingFilter.skippedDuplicates,
                skippedAlreadyExists: existingFilter.skippedAlreadyExists,
                unmappedComponents: unmappedCount,
                tolerance,
                componentKeys: normalizeComponentKeys(options.componentKeys),
                oneDocPerComponent: true
            },
            employees: finalAutomationData,
            diagnostics
        };

        fs.writeFileSync(outputFile, JSON.stringify(fileData, null, 2), 'utf8');
        console.log(`[PayrollAutomation] Data saved to ${outputFile}`);

        return {
            success: true,
            data: fileData
        };

    } catch (error) {
        console.error("[PayrollAutomation] Error preparing automation data:", error);
        return {
            success: false,
            error: error.message
        };
    }
};

/**
 * Trigger payroll automation - runs the browser automation for payroll
 */
const triggerPayrollAutomation = async (month, year, options = {}) => {
    try {
        // First prepare the data
        const prepResult = await preparePayrollAutomationData(month, year, options);
        if (!prepResult.success) {
            throw new Error(prepResult.error);
        }

        if (prepResult.data.employees.length === 0) {
            return {
                success: true,
                message: 'Tidak ada data payroll yang perlu diinputkan',
                employeesProcessed: 0
            };
        }

        // Return the prepared data for frontend to use
        return {
            success: true,
            data: prepResult.data,
            message: `Data payroll siap untuk ${prepResult.data.employees.length} karyawan`
        };

    } catch (error) {
        console.error("[PayrollAutomation] Error triggering automation:", error);
        return {
            success: false,
            error: error.message
        };
    }
};

/**
 * Prepare beras automation data - input only the DIFFERENCE (selisih) amount
 * If Venus = 69,750 and Millware = 0 → input 69,750 (the shortfall)
 * If Venus = 100,000 and Millware = 50,000 → input 50,000 (the difference)
 *
 * @param {number} month
 * @param {number} year
 */
const prepareBerasAutomationData = async (month, year, options = {}) => {
    try {
        console.log(`[PayrollAutomation] Preparing BERAS automation data for ${month}/${year}`);

        // 1. Fetch Venus payroll data
        const payrollResult = await fetchPayrollData(month, year, options.payrollSource || {});
        if (!payrollResult.success) {
            throw new Error(payrollResult.error);
        }

        // 2. Fetch Millware task codes for mapping
        const taskCodes = await fetchMillwareTaskCodes();
        console.log(`[PayrollAutomation] Found ${taskCodes.length} task codes in Millware`);

        // 3. Build automation data - BERAS ONLY with SELISIH amount
        const automationData = [];
        const diagnostics = [];
        const tolerance = 10; // 10 rupiah tolerance

        for (const emp of payrollResult.data) {
            if (!emp.ptrjId || emp.ptrjId === '-') {
                continue;
            }

            const { components: missingComponents, diagnostics: empDiagnostics } = buildPayrollAutomationComponents(emp, taskCodes, tolerance);
            empDiagnostics.forEach(item => diagnostics.push({
                ...item,
                employeeId: emp.id,
                employeeName: emp.name,
                ptrjId: emp.ptrjId
            }));

            // Filter only beras components
            const berasComponents = missingComponents.filter(c => c.componentKey === 'beras');

            if (berasComponents.length > 0) {
                // Calculate shortfall amount for each beras component
                const berasWithShortfall = berasComponents.map(component => {
                    const rawVenusAmount = Number(component.venusAmount) || 0;
                    const rawMillwareAmount = Number(component.millwareAmount) || 0;
                    const venusAmount = toRoundedAmount(rawVenusAmount);
                    const millwareAmount = toRoundedAmount(rawMillwareAmount);
                    // Shortfall = Venus - Millware (always positive, the amount to add)
                    const shortfallAmount = toRoundedAmount(Math.max(0, rawVenusAmount - rawMillwareAmount));

                    return {
                        ...component,
                        venusAmount: shortfallAmount, // OVERRIDE: template uses venusAmount to input
                        millwareAmount,
                        diff: shortfallAmount,
                        adSearchKeyword: 'TRANSPORT', // OVERRIDE: Millware TaskDesc is TUNJANGAN TRANSPORT
                        inputAmount: shortfallAmount,
                        shortfallAmount,
                        originalVenusAmount: venusAmount, // Keep original for display
                        originalMillwareAmount: millwareAmount, // Keep original for display
                        note: millwareAmount === 0
                            ? `Full amount (Millware=0)`
                            : `Partial (Venus - MW = ${shortfallAmount})`
                    };
                }).filter(c => c.venusAmount > 0); // Only include if there's something to input

                if (berasWithShortfall.length > 0) {
                    automationData.push({
                        employeeId: emp.id,
                        employeeName: emp.name,
                        ptrjId: emp.ptrjId,
                        chargeJob: emp.chargeJob,
                        components: berasWithShortfall
                    });

                    console.log(`[PayrollBeras] ${emp.name} (${emp.ptrjId}): Venus=${berasWithShortfall[0].venusAmount}, MW=${berasWithShortfall[0].millwareAmount}, Input=${berasWithShortfall[0].inputAmount}`);
                }
            }
        }

        // 4. Prepare single-record format (one DocID per component)
        const singleRecordAutomationData = splitAutomationDataToSingleComponentRecords(automationData);

        // 5. Filter duplicates in payload
        const duplicateFilter = filterDuplicatePayloadRecords(singleRecordAutomationData);
        duplicateFilter.skipped.forEach(item => {
            item.status = 'SKIPPED_DUPLICATE_BERAS';
            diagnostics.push(item);
        });

        // 6. Check existing AD records in Millware
        const existingFilter = await filterAlreadyExistingADRecords(duplicateFilter.records, month, year);
        existingFilter.skipped.forEach(item => diagnostics.push(item));

        const finalAutomationData = existingFilter.records;
        const totalComponents = finalAutomationData.reduce((sum, emp) => sum + emp.components.length, 0);

        console.log(`[PayrollAutomation] Skipped duplicate beras records: ${duplicateFilter.skipped.length}`);
        console.log(`[PayrollAutomation] Skipped already existing AD records: ${existingFilter.skippedAlreadyExists}`);
        console.log(`[PayrollAutomation] Found ${finalAutomationData.length} beras record(s) with ${totalComponents} shortfall components`);

        // 7. Save to file
        const outputDir = path.resolve(__dirname, '..', '..', 'browser-automation-engine', 'testing_data');
        const outputFile = path.join(outputDir, 'current_payroll_beras_data.json');

        // Ensure directory exists
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const payrollDocDate = getPayrollDocDate(month, year);
        const fileData = {
            metadata: {
                month,
                year,
                payrollSource: payrollResult.sourceInfo?.source || options.payrollSource?.source || 'live',
                snapshotId: payrollResult.sourceInfo?.snapshotId || options.payrollSource?.snapshotId || null,
                payrollDocDateIso: payrollDocDate.iso,
                payrollDocDate: payrollDocDate.formatted,
                generatedAt: new Date().toISOString(),
                totalEmployees: finalAutomationData.length,
                totalRecords: finalAutomationData.length,
                totalComponents,
                skippedDuplicates: duplicateFilter.skipped.length,
                skippedAlreadyExists: existingFilter.skippedAlreadyExists,
                tolerance,
                oneDocPerComponent: true,
                isBerasOnly: true,
                inputType: 'SELISIH' // IMPORTANT: This runner inputs the DIFFERENCE amount, not full Venus amount
            },
            employees: finalAutomationData,
            diagnostics
        };

        fs.writeFileSync(outputFile, JSON.stringify(fileData, null, 2), 'utf8');
        console.log(`[PayrollAutomation] BERAS data saved to ${outputFile}`);

        return {
            success: true,
            data: fileData
        };

    } catch (error) {
        console.error("[PayrollAutomation] Error preparing beras automation data:", error);
        return {
            success: false,
            error: error.message
        };
    }
};

/**
 * Prepare lembur adjustment data - input only the DIFFERENCE (selisih) amount.
 * Only employees where Venus overtime allowance is greater than Millware are included.
 *
 * NOTE: Selalu gunakan data LIVE untuk calculation ini.
 * MINUS_OVT sudah dieksklusi dari total Venus lembur di payrollService.js
 * (hanya OT1 + OT2 + OT3 yang dihitung, MINUS_OVT dilacak terpisah)
 *
 * @param {number} month
 * @param {number} year
 */
const prepareLemburAdjustmentData = async (month, year, options = {}) => {
    try {
        console.log(`[PayrollAutomation] Preparing LEMBUR adjustment data for ${month}/${year}`);

        // Force LIVE data untuk lembur adjustment - MINUS_OVT sudah dieksklusi di payrollService
        const lemburOptions = {
            ...options.payrollSource,
            source: 'live'  // Selalu gunakan data live untuk perhitungan lembur
        };
        console.log(`[PayrollAutomation] Lembur adjustment: MEMAKSAKAN data LIVE (exclude snapshot)`);

        const payrollResult = await fetchPayrollData(month, year, lemburOptions);
        if (!payrollResult.success) {
            throw new Error(payrollResult.error);
        }

        console.log(`[PayrollAutomation] Lembur adjustment: Data source = ${payrollResult.sourceInfo?.source || 'live'}`);

        const automationData = [];
        const diagnostics = [];
        const tolerance = Math.max(0, parseInt(options.tolerance || 50, 10) || 50);

        for (const emp of payrollResult.data) {
            if (!emp.ptrjId || emp.ptrjId === '-') {
                diagnostics.push({
                    status: 'SKIPPED_NO_PTRJ_ID',
                    employeeId: emp.id,
                    employeeName: emp.name
                });
                continue;
            }

            if (!String(emp.chargeJob || '').trim()) {
                diagnostics.push({
                    status: 'SKIPPED_NO_CHARGE_JOB',
                    employeeId: emp.id,
                    employeeName: emp.name,
                    ptrjId: emp.ptrjId
                });
                continue;
            }

            // NOTE: emp.sync.lembur.venus SUDAH exclude MINUS_OVT (hanya OT1+OT2+OT3)
            // Detail breakdown ada di emp.sync.lembur.venusDetail
            const rawVenusAmount = Math.abs(Number(emp.sync?.lembur?.venus) || 0);
            const rawMillwareAmount = Math.abs(Number(emp.sync?.lembur?.millware) || 0);
            const venusAmount = toRoundedAmount(rawVenusAmount);
            const millwareAmount = toRoundedAmount(rawMillwareAmount);
            const shortfallAmount = toRoundedAmount(Math.max(0, rawVenusAmount - rawMillwareAmount));

            // Log breakdown untuk verification
            const venusDetail = emp.sync?.lembur?.venusDetail || {};
            console.log(`[PayrollLemburAdjustment] ${emp.name}: Venus=${venusAmount} (OT1=${venusDetail.ot1 || 0}, OT2=${venusDetail.ot2 || 0}, OT3=${venusDetail.ot3 || 0}, MinusOvt=${venusDetail.minusOvt || 0} EXCLUDED), MW=${millwareAmount}, Input=${shortfallAmount}`);

            if (shortfallAmount <= tolerance) {
                diagnostics.push({
                    status: 'MATCH_OR_NOT_SHORTFALL',
                    employeeId: emp.id,
                    employeeName: emp.name,
                    ptrjId: emp.ptrjId,
                    componentKey: 'lembur',
                    componentName: 'TUNJANGAN LEMBUR',
                    venusAmount,
                    millwareAmount,
                    shortfallAmount,
                    tolerance
                });
                continue;
            }

            // Detect lembur type based on chargeJob
            const lemburType = detectLemburType(emp.chargeJob);
            const lemburAdCode = getLemburAdCode(lemburType);

            automationData.push({
                employeeId: emp.id,
                employeeName: emp.name,
                ptrjId: emp.ptrjId,
                chargeJob: emp.chargeJob,
                lemburType,  // 'standard' | 'workshop_control_account' | 'vehicle_running'
                components: [{
                    status: 'MISS',
                    componentKey: 'lembur',
                    componentName: lemburAdCode.adCodeDesc,
                    sourceNames: [lemburAdCode.adSearchKeyword],
                    venusCompCode: 'LEMBUR',
                    venusAmount: shortfallAmount,
                    millwareAmount,
                    diff: shortfallAmount,
                    adCode: lemburAdCode.adCode,
                    adCodeDesc: lemburAdCode.adCodeDesc,
                    adCodeSource: 'detected-type',
                    adSearchKeyword: lemburAdCode.adSearchKeyword,
                    type: 'Addition',
                    inputAmount: shortfallAmount,
                    shortfallAmount,
                    originalVenusAmount: venusAmount,
                    originalMillwareAmount: millwareAmount,
                    note: millwareAmount === 0
                        ? `Full ${lemburType} lembur adjustment (Millware=0)`
                        : `Partial ${lemburType} lembur adjustment (Venus - MW = ${shortfallAmount})`
                }]
            });

            console.log(`[PayrollLemburAdjustment] ${emp.name} (${emp.ptrjId}): Type=${lemburType}, ADCode=${lemburAdCode.adCode}, Venus=${venusAmount}, MW=${millwareAmount}, Input=${shortfallAmount}`);
        }

        const singleRecordAutomationData = splitAutomationDataToSingleComponentRecords(automationData);
        const duplicateFilter = filterDuplicatePayloadRecords(singleRecordAutomationData);
        duplicateFilter.skipped.forEach(item => {
            item.status = 'SKIPPED_DUPLICATE_LEMBUR_ADJUSTMENT';
            diagnostics.push(item);
        });

        const existingFilter = await filterAlreadyExistingADRecords(duplicateFilter.records, month, year);
        existingFilter.skipped.forEach(item => diagnostics.push(item));

        const finalAutomationData = existingFilter.records;
        const totalComponents = finalAutomationData.reduce((sum, emp) => sum + emp.components.length, 0);

        console.log(`[PayrollAutomation] Skipped duplicate lembur adjustment records: ${duplicateFilter.skipped.length}`);
        console.log(`[PayrollAutomation] Skipped already existing AD records: ${existingFilter.skipped.length}`);
        console.log(`[PayrollAutomation] Found ${finalAutomationData.length} lembur adjustment record(s) with ${totalComponents} shortfall components`);

        const outputDir = path.resolve(__dirname, '..', '..', 'browser-automation-engine', 'testing_data');
        const outputFile = path.join(outputDir, 'current_payroll_lembur_adjustment_data.json');

        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const payrollDocDate = getPayrollDocDate(month, year);
        const fileData = {
            metadata: {
                month,
                year,
                payrollSource: payrollResult.sourceInfo?.source || options.payrollSource?.source || 'live',
                snapshotId: payrollResult.sourceInfo?.snapshotId || options.payrollSource?.snapshotId || null,
                payrollDocDateIso: payrollDocDate.iso,
                payrollDocDate: payrollDocDate.formatted,
                generatedAt: new Date().toISOString(),
                totalEmployees: finalAutomationData.length,
                totalRecords: finalAutomationData.length,
                totalComponents,
                skippedDuplicates: duplicateFilter.skipped.length,
                skippedAlreadyExists: existingFilter.skipped.length,
                tolerance,
                oneDocPerComponent: true,
                isLemburAdjustmentOnly: true,
                inputType: 'SELISIH',
                requiresChargeJob: true
            },
            employees: finalAutomationData,
            diagnostics
        };

        fs.writeFileSync(outputFile, JSON.stringify(fileData, null, 2), 'utf8');
        console.log(`[PayrollAutomation] LEMBUR adjustment data saved to ${outputFile}`);

        return {
            success: true,
            data: fileData
        };
    } catch (error) {
        console.error("[PayrollAutomation] Error preparing lembur adjustment data:", error);
        return {
            success: false,
            error: error.message
        };
    }
};

module.exports = {
    fetchMillwareTaskCodes,
    findMatchingADCode,
    findADCodeByVenusComponent,
    getPayrollDocDate,
    normalizeComponentKeys,
    filterAutomationDataByComponentKeys,
    splitAutomationDataToSingleComponentRecords,
    payrollRecordSignature,
    fetchExistingADRecordSignatures,
    filterAlreadyExistingADRecords,
    filterDuplicatePayloadRecords,
    filterDuplicateAndExistingADRecords,
    preparePayrollAutomationData,
    prepareBerasAutomationData,
    prepareLemburAdjustmentData,
    triggerPayrollAutomation
};
