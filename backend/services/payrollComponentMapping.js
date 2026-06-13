const fs = require('fs');
const path = require('path');

const TOLERANCE_RUPIAH = 10;
const DISCOVERED_MAPPING_PATH = path.resolve(__dirname, '..', '..', 'browser-automation-engine', 'testing_data', 'payroll_taskcode_mapping.json');
const COMPARISON_CONFIG_PATH = path.resolve(__dirname, '..', 'config', 'payroll-comparison-config.json');

const normalizeText = (value) => String(value || '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

const compactText = (value) => normalizeText(value).replace(/[^A-Z0-9]/g, '');

/**
 * Load payroll comparison config
 * Berisi daftar komponen yang di-include dan di-exclude dari komparasi
 */
const loadComparisonConfig = () => {
    try {
        if (fs.existsSync(COMPARISON_CONFIG_PATH)) {
            return JSON.parse(fs.readFileSync(COMPARISON_CONFIG_PATH, 'utf8'));
        }
    } catch (error) {
        console.warn(`[PayrollMapping] Failed to load comparison config: ${error.message}`);
    }
    return null;
};

/**
 * Get excluded component keywords from config
 * Ini adalah komponen yang TIDAK boleh masuk dalam komparasi
 */
const getExcludedKeywords = () => {
    const config = loadComparisonConfig();
    if (!config) {
        // Default fallback jika config tidak ada
        return {
            addition: ['SALARY BONUS', 'BONUS GAJI', 'GAJI BONUS', 'REMUNERASI', 'GAJI POKOK', '#GP#'],
            deduction: ['BPJS KESEHATAN', 'BPJS KES', 'BPJS TK', 'BPJS PENSIUN', 'JHT', 'JP TK', 'JAMINAN PENSIUN']
        };
    }

    const excludedAddition = (config.excludedComponents?.addition || [])
        .flatMap(c => c.keywords || []);
    const excludedDeduction = (config.excludedComponents?.deduction || [])
        .flatMap(c => c.keywords || []);

    return {
        addition: excludedAddition,
        deduction: excludedDeduction
    };
};

/**
 * Check if component should be excluded from comparison
 * @param {string} text - Normalized text dari component name/code
 * @param {string} type - 'Addition' atau 'Deduction'
 * @returns {boolean} - true jika component harus di-exclude
 */
const isExcludedComponent = (text, type) => {
    const excluded = getExcludedKeywords();
    const keywords = type === 'Deduction' ? excluded.deduction : excluded.addition;

    for (const keyword of keywords) {
        if (text.includes(keyword.toUpperCase())) {
            return true;
        }
    }
    return false;
};

const getPayrollComponentKey = (component = {}) => {
    const name = normalizeText(component.name || component.PYCompName || component.docDesc || component.DocDesc);
    const code = normalizeText(component.code || component.PYCompCode || component.taskCode || component.TaskCode);
    const taskDesc = normalizeText(component.taskDesc || component.TaskDesc);
    const text = normalizeText([name, taskDesc, code].filter(Boolean).join(' '));
    const compact = compactText(text);

    // ============================================================
    // CHECK UNTUK EXCLUDED COMPONENTS (TIDAK DIKOMPARASI)
    // ============================================================

    // Salary/Bonus - BUKAN bagian dari Premi, exclude dari komparasi
    if (text.includes('SALARY BONUS') || text.includes('BONUS GAJI') ||
        text.includes('GAJI BONUS') || text.includes('REMUNERASI')) {
        return 'salaryBonus_excluded'; // Mark sebagai excluded
    }

    // Gaji Pokok - exclude dari komparasi (dihitung dari HK x PayRate)
    if (text.includes('GAJI POKOK') || code.includes('#GP#')) {
        return 'gajiPokok_excluded';
    }

    // BPJS Kesehatan - TIDAK masuk komparasi (beda sistem Venus vs Millware)
    if (text.includes('BPJS') && (text.includes('KESEHATAN') || text.includes('KES'))) {
        return 'bpjsKes_excluded';
    }

    // BPJS Pensiun/TK - TIDAK masuk komparasi (beda sistem)
    if (
        text.includes('BPJS TK') ||
        (text.includes('BPJS') && text.includes('TK')) ||
        compact.includes('BPJSTK') ||
        text.includes('JHT') ||
        text.includes('PENSIUN') ||
        text.includes('JP TK') ||
        compact.includes('JPTK') ||
        code.includes('JP_TK')
    ) {
        return 'bpjsPen_excluded';
    }

    // ============================================================
    // KOMPONEN YANG DIKOMPARASI
    // ============================================================

    if (text.includes('JABATAN') || code.includes('TJ_JABATAN') || code.includes('GA9128')) return 'jabatan';
    if (
        text.includes('MASA KERJA') ||
        (text.includes('MASA') && text.includes('KERJA')) ||
        compact.includes('MASAKERJA') ||
        code.includes('TJ_MASAKERJA') ||
        code.includes('GA9129')
    ) return 'masaKerja';
    if (text.includes('BERAS') || text.includes('RICE') || code.includes('TJ_BERAS') || code.includes('AL0012')) return 'beras';
    if (text.includes('OT JAM') || text.includes('LEMBUR') || text.includes('OVERTIME')) return 'lembur';
    if (compact.includes('PPH21') || text.includes('PPH')) return 'pph21';
    if (text.includes('SPSI') || code.includes('POT_SPSI')) return 'spsi';

    // PREMI components - DIPISAH dari BONUS (karena BONUS sudah di-exclude di atas)
    if (text.includes('PREMI PANEN') || text.includes('PREMI AL')) return 'premiPanen';
    if (text.includes('PREMI KINERJA')) return 'premiKinerja';
    if (text.includes('PREMI BRONDOL')) return 'premiBrondol';
    if (text.includes('PREMI INSENTIF')) return 'premiInsentif';
    if (text.includes('PREMI') && !text.includes('SALARY')) return 'premiLain';

    return null;
};

const toNumber = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
};

const COMPONENT_RULES = [
    {
        key: 'jabatan',
        type: 'Addition',
        componentName: 'TUNJANGAN JABATAN',
        adCode: 'GA9128',
        adKeywords: ['JABATAN'],
        matches: ({ name, code }) => name.includes('JABATAN') || code.includes('TJ_JABATAN')
    },
    {
        key: 'masaKerja',
        type: 'Addition',
        componentName: 'TUNJANGAN MASA KERJA',
        adCode: 'GA9129',
        adKeywords: ['MASA KERJA', 'MASAKERJA', 'MASAKE'],
        matches: ({ name, compactName, code }) => name.includes('MASA KERJA') || compactName.includes('MASAKERJA') || code.includes('TJ_MASAKERJA')
    },
    {
        key: 'beras',
        type: 'Addition',
        componentName: 'TUNJANGAN BERAS',
        adCode: 'AL0011', // AL0011 = TUNJANGAN TRANSPORT (digunakan untuk BERAS)
        adKeywords: ['BERAS', 'RICE'],
        matches: ({ name, code }) => name.includes('BERAS') || code.includes('TJ_BERAS')
    },
    {
        key: 'lembur',
        type: 'Addition',
        componentName: 'TUNJANGAN LEMBUR',
        adCode: 'AL0019',
        adKeywords: ['LEMBUR', 'OVERTIME', 'OT'],
        matches: ({ name, code }) => name.includes('LEMBUR') || name.includes('OVERTIME') || code.includes('OT')
    },
    // PREMI components - DIPISAH untuk komparasi individual
    {
        key: 'premiPanen',
        type: 'Addition',
        componentName: 'PREMI PANEN',
        adCode: null,
        adKeywords: ['PREMI PANEN', 'PREMI AL'],
        matches: ({ name }) => name.includes('PREMI PANEN') || name.includes('PREMI AL'),
        notAutomatable: true
    },
    {
        key: 'premiKinerja',
        type: 'Addition',
        componentName: 'PREMI KINERJA',
        adCode: null,
        adKeywords: ['PREMI KINERJA'],
        matches: ({ name }) => name.includes('PREMI KINERJA'),
        notAutomatable: true
    },
    {
        key: 'premiBrondol',
        type: 'Addition',
        componentName: 'PREMI BRONDOL',
        adCode: null,
        adKeywords: ['PREMI BRONDOL'],
        matches: ({ name }) => name.includes('PREMI BRONDOL'),
        notAutomatable: true
    },
    {
        key: 'premiInsentif',
        type: 'Addition',
        componentName: 'PREMI INSENTIF',
        adCode: null,
        adKeywords: ['PREMI INSENTIF'],
        matches: ({ name }) => name.includes('PREMI INSENTIF'),
        notAutomatable: true
    },
    {
        key: 'premiLain',
        type: 'Addition',
        componentName: 'PREMI LAIN',
        adCode: null,
        adKeywords: ['PREMI'],
        matches: ({ name }) => name.includes('PREMI') && !name.includes('PANEN') && !name.includes('KINERJA') && !name.includes('BRONDOL') && !name.includes('INSENTIF'),
        notAutomatable: true
    },
    {
        key: 'pph21',
        type: 'Deduction',
        componentName: 'POTONGAN PPH21',
        adCode: 'DEPH21',
        adKeywords: ['PPH21', 'PPH 21'],
        matches: ({ name, compactName, code }) => compactName.includes('PPH21') || code.includes('PPH21')
    },
    {
        key: 'spsi',
        type: 'Deduction',
        componentName: 'POTONGAN SPSI',
        adCode: 'DE0003',
        adKeywords: ['SPSI'],
        matches: ({ name, code }) => name.includes('SPSI') || code.includes('POT_SPSI')
    }
];

const findRuleForComponent = (component) => {
    const name = normalizeText(component.name || component.PYCompName);
    const compactName = compactText(name);
    const code = normalizeText(component.code || component.PYCompCode);
    const key = getPayrollComponentKey({ name, code });

    // Skip excluded components (BpjsKes, BpjsPen, SalaryBonus, GajiPokok)
    if (key && key.endsWith('_excluded')) {
        return null;
    }

    return COMPONENT_RULES.find(rule => rule.key === key || rule.matches({ name, compactName, code })) || null;
};

const normalizeTaskCodes = (taskCodes = []) => taskCodes.map(tc => ({
    taskCode: String(tc.taskCode || tc.TaskCode || '').trim(),
    taskDesc: String(tc.taskDesc || tc.TaskDesc || '').trim()
})).filter(tc => tc.taskCode);

const loadDiscoveredTaskCodeMappings = (mappingPath = DISCOVERED_MAPPING_PATH) => {
    try {
        if (!fs.existsSync(mappingPath)) return {};
        const payload = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
        return payload.mappings || {};
    } catch (error) {
        console.warn(`[PayrollMapping] Failed to load discovered taskcode mapping: ${error.message}`);
        return {};
    }
};

const hasDiscoveredMappingFile = (mappingPath = DISCOVERED_MAPPING_PATH) => fs.existsSync(mappingPath);

const findDiscoveredTaskCode = (rule, discoveredMappings = {}) => {
    if (!rule || !discoveredMappings) return null;
    const mapped = discoveredMappings[rule.key];
    if (!mapped || !mapped.taskCode) return null;
    return {
        taskCode: String(mapped.taskCode || '').trim(),
        taskDesc: String(mapped.taskDesc || mapped.selectedText || mapped.optionText || '').trim(),
        source: 'discovered-autocomplete'
    };
};

const findTaskCode = (rule, taskCodes = [], options = {}) => {
    const normalizedTaskCodes = normalizeTaskCodes(taskCodes);
    if (!rule) return null;

    const discovered = findDiscoveredTaskCode(rule, options.discoveredMappings || loadDiscoveredTaskCodeMappings());
    if (discovered) return discovered;

    if (rule.adCode) {
        const explicit = normalizedTaskCodes.find(tc => tc.taskCode.toUpperCase() === rule.adCode.toUpperCase());
        if (explicit) return explicit;
    }

    let best = null;
    let bestScore = 0;
    for (const tc of normalizedTaskCodes) {
        const desc = normalizeText(tc.taskDesc);
        const code = normalizeText(tc.taskCode);
        let score = 0;
        for (const keyword of rule.adKeywords || []) {
            const normalizedKeyword = normalizeText(keyword);
            const compactKeyword = compactText(keyword);
            if (desc.includes(normalizedKeyword) || compactText(desc).includes(compactKeyword) || code.includes(normalizedKeyword)) {
                score += normalizedKeyword.length;
            }
        }
        if (score > bestScore) {
            best = tc;
            bestScore = score;
        }
    }

    return best;
};

const getAutocompleteKeyword = (rule) => {
    if (!rule) return '';

    const preferred = {
        jabatan: 'JABATAN',
        masaKerja: 'MASA',
        pph21: 'PPH',
        spsi: 'SPSI',
        beras: 'BERAS',
        lembur: 'LEMBUR',
        // PREMI components
        premiPanen: 'PREMI',
        premiKinerja: 'KINERJA',
        premiBrondol: 'BRONDOL',
        premiInsentif: 'INSENTIF',
        premiLain: 'PREMI'
    };

    return preferred[rule.key] || rule.adKeywords?.[0] || rule.componentName || '';
};

const collectPayrollComponentGroups = (employee) => {
    const grouped = new Map();
    const unmapped = [];

    const rows = [
        ...(employee.tunjanganDetails || []).map(row => ({ ...row, inferredType: 'Addition' })),
        ...(employee.potonganDetails || []).map(row => ({ ...row, inferredType: 'Deduction' }))
    ];

    for (const row of rows) {
        const amount = row.inferredType === 'Deduction' ? Math.abs(toNumber(row.amount)) : toNumber(row.amount);
        const code = row.code || row.PYCompCode || '';
        const name = row.name || row.PYCompName || '';
        const rule = findRuleForComponent({ name, code });

        if (amount <= 0) {
            if (rule) {
                unmapped.push({
                    status: 'SKIPPED_ZERO',
                    componentKey: rule.key,
                    componentName: name,
                    venusCompCode: code,
                    venusAmount: amount,
                    type: row.inferredType
                });
            }
            continue;
        }

        if (!rule) {
            unmapped.push({
                status: 'UNMAPPED',
                componentKey: null,
                componentName: name,
                venusCompCode: code,
                venusAmount: amount,
                type: row.inferredType
            });
            continue;
        }

        if (!grouped.has(rule.key)) {
            grouped.set(rule.key, {
                rule,
                componentKey: rule.key,
                componentName: rule.componentName,
                venusCompCodes: [],
                sourceNames: [],
                venusAmount: 0,
                type: rule.type
            });
        }

        const group = grouped.get(rule.key);
        group.venusAmount += amount;
        if (code && !group.venusCompCodes.includes(code)) group.venusCompCodes.push(code);
        if (name && !group.sourceNames.includes(name)) group.sourceNames.push(name);
    }

    return {
        groups: [...grouped.values()],
        unmapped
    };
};

const buildPayrollAutomationComponents = (employee, taskCodes = [], tolerance = TOLERANCE_RUPIAH) => {
    const { groups, unmapped } = collectPayrollComponentGroups(employee);
    const components = [];
    const diagnostics = [...unmapped];
    const discoveredMappings = loadDiscoveredTaskCodeMappings();
    const requireDiscoveredMapping = hasDiscoveredMappingFile() && Object.keys(discoveredMappings).length > 0;

    for (const group of groups) {
        const millwareAmount = Math.abs(toNumber(employee.sync?.[group.componentKey]?.millware));
        const diff = Math.abs(group.venusAmount - millwareAmount);
        const status = diff > tolerance ? 'MISS' : 'MATCH';

        if (status === 'MATCH') {
            diagnostics.push({
                status,
                componentKey: group.componentKey,
                componentName: group.componentName,
                venusAmount: group.venusAmount,
                millwareAmount,
                diff,
                type: group.type
            });
            continue;
        }

        const discoveredMapping = discoveredMappings[group.rule.key];
        if (requireDiscoveredMapping && !discoveredMapping) {
            diagnostics.push({
                status: 'UNMAPPED_DISCOVERY',
                componentKey: group.componentKey,
                componentName: group.componentName,
                venusCompCode: group.venusCompCodes.join(','),
                venusAmount: group.venusAmount,
                millwareAmount,
                diff,
                type: group.type,
                reason: 'No autocomplete-discovered TaskCode mapping saved'
            });
            continue;
        }

        const taskCode = findTaskCode(group.rule, taskCodes, { discoveredMappings });
        if (!taskCode) {
            diagnostics.push({
                status: 'UNMAPPED',
                componentKey: group.componentKey,
                componentName: group.componentName,
                venusCompCode: group.venusCompCodes.join(','),
                venusAmount: group.venusAmount,
                millwareAmount,
                diff,
                type: group.type
            });
            continue;
        }

        components.push({
            status,
            componentKey: group.componentKey,
            componentName: group.componentName,
            sourceNames: group.sourceNames,
            venusCompCode: group.venusCompCodes.join(','),
            venusAmount: group.venusAmount,
            millwareAmount,
            diff,
            adCode: taskCode.taskCode,
            adCodeDesc: taskCode.taskDesc,
            adCodeSource: taskCode.source || 'millware-master',
            adSearchKeyword: discoveredMapping?.keyword || getAutocompleteKeyword(group.rule),
            type: group.type
        });
    }

    return { components, diagnostics };
};

module.exports = {
    TOLERANCE_RUPIAH,
    COMPONENT_RULES,
    normalizeText,
    compactText,
    getPayrollComponentKey,
    findRuleForComponent,
    findTaskCode,
    loadDiscoveredTaskCodeMappings,
    hasDiscoveredMappingFile,
    findDiscoveredTaskCode,
    getAutocompleteKeyword,
    collectPayrollComponentGroups,
    buildPayrollAutomationComponents,
    // New exports untuk config-based comparison
    loadComparisonConfig,
    getExcludedKeywords,
    isExcludedComponent
};
