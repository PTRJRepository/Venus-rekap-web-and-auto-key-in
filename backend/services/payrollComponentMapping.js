const TOLERANCE_RUPIAH = 10;

const normalizeText = (value) => String(value || '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

const compactText = (value) => normalizeText(value).replace(/[^A-Z0-9]/g, '');

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
    return COMPONENT_RULES.find(rule => rule.matches({ name, compactName, code })) || null;
};

const normalizeTaskCodes = (taskCodes = []) => taskCodes.map(tc => ({
    taskCode: String(tc.taskCode || tc.TaskCode || '').trim(),
    taskDesc: String(tc.taskDesc || tc.TaskDesc || '').trim()
})).filter(tc => tc.taskCode);

const findTaskCode = (rule, taskCodes = []) => {
    const normalizedTaskCodes = normalizeTaskCodes(taskCodes);
    if (!rule) return null;

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
        masaKerja: 'MASA KERJA',
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

        const taskCode = findTaskCode(group.rule, taskCodes);
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
            adSearchKeyword: getAutocompleteKeyword(group.rule),
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
    findRuleForComponent,
    findTaskCode,
    getAutocompleteKeyword,
    collectPayrollComponentGroups,
    buildPayrollAutomationComponents
};
