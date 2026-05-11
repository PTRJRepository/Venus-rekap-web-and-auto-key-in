const { executeQuery } = require('./gateway');
const { fetchPayrollData } = require('./payrollService');
const { fetchMillwarePayroll } = require('./payrollComparisonService');
const { getAllEmployees } = require('./employeeMillService');
const fs = require('fs');
const path = require('path');

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
    const keywordMap = {
        'LEMBUR': ['LEMBUR', 'OT'],
        'JABATAN': ['JABATAN'],
        'MASA KERJA': ['MASA KERJA', 'MASAKE'],
        'TRANSPORT': ['TRANSPORT'],
        'PPH21': ['PPH21'],
        'SPSI': ['SPSI'],
        'BPJS KESEHATAN': ['KESEHATAN'],
        'BPJS TK': ['TENAGA KERJA', 'JAMINAN', 'JHT'],
        'PREMI': ['PREMI', 'INSENTIF', 'BONUS', 'KINERJA', 'PANEN', 'BRONDOL'],
        'POTONGAN': ['POTONGAN'],
        'BERAS': ['BERAS']
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

        // Deductions - Potongan
        '#PPH21_DIPTG#': ['PPH21'],
        'POTONGAN PPH21': ['PPH21'],
        'PPH 21': ['PPH21'],
        '#POT_SPSI#': ['SPSI'],
        'POTONGAN SPSI': ['SPSI'],
        '#KES_TK#': ['KESEHATAN'],
        'BPJS KESEHATAN DITANGGUNG KARYAWAN': ['KESEHATAN'],
        '#TK_TK#': ['TENAGA KERJA', 'JAMINAN', 'JHT'],
        'BPJS TK DITANGGUNG KARYAWAN': ['TENAGA KERJA', 'JAMINAN', 'JHT'],
        '#JP_TK#': ['PENSIUN', 'JAMINAN'],
        'JAMINAN PENSIUN DITANGGUNG KARYAWAN': ['PENSIUN', 'JAMINAN'],
        '#POT_BPJS#': ['BPJS'],
        'POTONGAN BPJS TAMBAHAN': ['BPJS'],
        '#POT_ABSEN#': ['ABSEN'],
        'POTONGAN ABSEN': ['ABSEN'],
        '#POT_TELAT1#': ['TERLAMBAT', 'TELAT'],
        'POTONGAN TERLAMBAT': ['TERLAMBAT', 'TELAT'],
        '#POT_LAIN#': ['POTONGAN'],
        'POTONGAN LAIN-LAIN': ['POTONGAN'],
        '#LOAN1#': ['PINJAMAN', 'LOAN'],

        // Premium/Bonus
        '#BNS#': ['PREMI', 'INSENTIF', 'BONUS'],
        'BONUS': ['PREMI', 'INSENTIF', 'BONUS']
    };
};

/**
 * Find ADCode using Venus component keywords
 */
const findADCodeByVenusComponent = (venusCompName, taskCodes) => {
    const keywordsMap = getVenusComponentKeywords();
    const upperName = venusCompName.toUpperCase();

    const explicitMap = [
        { match: (name) => name.includes('JABATAN'), taskCode: 'GA9128' },
        { match: (name) => name.includes('MASA KERJA'), taskCode: 'GA9129' },
        { match: (name) => name.includes('LEMBUR') || name.includes('OVERTIME'), taskCode: 'AL0019' },
        { match: (name) => name.includes('BERAS') || name.includes('RICE'), taskCode: 'AL0012' },
        { match: (name) => name.includes('PPH'), taskCode: 'DEPH21' },
        { match: (name) => name.includes('SPSI'), taskCode: 'DE0003' },
        { match: (name) => name.includes('BPJS') && name.includes('KESEHATAN'), taskCode: 'DEBPJS' },
        { match: (name) => name.includes('PENSIUN') || name.includes('JP'), taskCode: 'DEJP' },
        { match: (name) => name.includes('JHT'), taskCode: 'DEJHT' },
        { match: (name) => name.includes('JKK'), taskCode: 'DEJKK' },
        { match: (name) => name.includes('JK'), taskCode: 'DEJK' }
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
const preparePayrollAutomationData = async (month, year) => {
    try {
        console.log(`[PayrollAutomation] Preparing automation data for ${month}/${year}`);

        // 1. Fetch Venus payroll data
        const payrollResult = await fetchPayrollData(month, year);
        if (!payrollResult.success) {
            throw new Error(payrollResult.error);
        }

        // 2. Fetch Millware task codes for mapping
        const taskCodes = await fetchMillwareTaskCodes();
        console.log(`[PayrollAutomation] Found ${taskCodes.length} task codes in Millware`);

        // 3. Build automation data
        const automationData = [];
        const tolerance = 10; // 10 rupiah tolerance

        for (const emp of payrollResult.data) {
            if (!emp.ptrjId || emp.ptrjId === '-') {
                console.log(`[PayrollAutomation] Skip ${emp.name} - no PTRJ ID`);
                continue;
            }

            const sync = emp.sync;
            const missingComponents = [];

            // Check each component for MISS
            const components = [
                { key: 'jabatan', venusKey: 'jabatan', compName: 'TUNJANGAN JABATAN' },
                { key: 'masaKerja', venusKey: 'masaKerja', compName: 'TUNJANGAN MASA KERJA' },
                { key: 'beras', venusKey: 'beras', compName: 'TUNJANGAN BERAS' },
                { key: 'premi', venusKey: 'premi', compName: 'PREMI/INSENTIF' },
                { key: 'pph21', venusKey: 'pph21', compName: 'PPH21' },
                { key: 'bpjsKes', venusKey: 'bpjsKes', compName: 'BPJS KESEHATAN' },
                { key: 'bpjsPen', venusKey: 'bpjsPen', compName: 'BPJS PENSIUN' },
                { key: 'spsi', venusKey: 'spsi', compName: 'SPSI' }
            ];

            for (const comp of components) {
                const vAmount = sync[comp.venusKey]?.venus || 0;
                const mAmount = sync[comp.venusKey]?.millware || 0;

                // Only process if Venus has value > 0
                if (vAmount > 0) {
                    const diff = Math.abs(vAmount - mAmount);
                    const isMiss = diff > tolerance;

                    if (isMiss) {
                        // Find matching ADCode
                        const adCode = findADCodeByVenusComponent(comp.compName, taskCodes);

                        if (adCode) {
                            missingComponents.push({
                                componentName: comp.compName,
                                adCode: adCode,
                                venusAmount: vAmount,
                                millwareAmount: mAmount,
                                diff: diff
                            });
                        } else {
                            console.log(`[PayrollAutomation] WARN: No ADCode found for ${comp.compName}`);
                        }
                    }
                }
            }

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

        console.log(`[PayrollAutomation] Found ${automationData.length} employees with MISS components`);

        // 4. Save to file
        const outputDir = path.resolve(__dirname, '..', '..', 'browser-automation-engine', 'testing_data');
        const outputFile = path.join(outputDir, 'current_payroll_data.json');

        // Ensure directory exists
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const fileData = {
            metadata: {
                month,
                year,
                generatedAt: new Date().toISOString(),
                totalEmployees: automationData.length
            },
            employees: automationData
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
const triggerPayrollAutomation = async (month, year) => {
    try {
        // First prepare the data
        const prepResult = await preparePayrollAutomationData(month, year);
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

module.exports = {
    fetchMillwareTaskCodes,
    findMatchingADCode,
    findADCodeByVenusComponent,
    preparePayrollAutomationData,
    triggerPayrollAutomation
};
