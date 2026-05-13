const fs = require('fs');
const path = require('path');

const TOLERANCE_RUPIAH = 10;
const DISCOVERED_MAPPING_PATH = path.resolve(__dirname, '..', '..', 'browser-automation-engine', 'testing_data', 'payroll_taskcode_mapping.json');

const normalizeText = (value) => String(value || '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

const compactText = (value) => normalizeText(value).replace(/[^A-Z0-9]/g, '');

const getPayrollComponentKey = (component = {}) => {
    const name = normalizeText(component.name || component.PYCompName || component.docDesc || component.DocDesc);
    const code = normalizeText(component.code || component.PYCompCode || component.taskCode || component.TaskCode);
    const taskDesc = normalizeText(component.taskDesc || component.TaskDesc);
    const text = normalizeText([name, taskDesc, code].filter(Boolean).join(' '));
    const compact = compactText(text);

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
    if (text.includes('BPJS') && (text.includes('KESEHATAN') || text.includes('KES'))) return 'bpjsKes';
    if (
        text.includes('JHT') ||
        text.includes('PENSIUN') ||
        text.includes('JP TK') ||
        compact.includes('JPTK') ||
        code.includes('JP_TK')
    ) return 'bpjsPen';
    if (text.includes('SPSI') || code.includes('POT_SPSI')) return 'spsi';
    if (['PREMI', 'PANEN', 'KINERJA', 'BRONDOL', 'INSENTIF', 'BONUS'].some(token => text.includes(token))) return 'premi';

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
        adCode: 'AL0012',
        adKeywords: ['BERAS', 'RICE'],
        matches: ({ name, code }) => name.includes('BERAS') || code.includes('TJ_BERAS')
    },
    {
        key: 'premi',
        type: 'Addition',
        componentName: 'PREMI/INSENTIF',
        adCode: null,
        adKeywords: ['PREMI', 'INSENTIF', 'BONUS', 'KINERJA', 'PANEN', 'BRONDOL'],
        matches: ({ name }) => ['PREMI', 'PANEN', 'KINERJA', 'BRONDOL', 'INSENTIF', 'BONUS'].some(token => name.includes(token))
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
        bpjsKes: 'KESEHATAN',
        bpjsPen: 'PENSIUN',
        spsi: 'SPSI',
        beras: 'BERAS',
        premi: 'PREMI'
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
    buildPayrollAutomationComponents
};
