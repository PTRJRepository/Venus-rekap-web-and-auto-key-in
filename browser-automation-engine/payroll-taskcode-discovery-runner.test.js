const assert = require('node:assert/strict');
const {
    parseArgs,
    parseTaskCodeOption,
    collectDiscoveryTargets
} = require('./payroll-taskcode-discovery-runner');

assert.equal(parseArgs(['--no-headless']).headless, false);
assert.equal(parseArgs(['--headless']).headless, true);
assert.equal(parseArgs(['--mapping-file', 'x.json']).mappingFile, 'x.json');
assert.equal(parseArgs(['data.json']).dataFile, 'data.json');

assert.deepEqual(parseTaskCodeOption('GA9129 - TUNJANGAN MASA KERJA', 'GA9129'), {
    taskCode: 'GA9129',
    taskDesc: 'GA9129 - TUNJANGAN MASA KERJA',
    selectedValue: 'GA9129',
    selectedText: 'GA9129 - TUNJANGAN MASA KERJA'
});

assert.equal(parseTaskCodeOption('(AL) PERSONNEL TUNJANGAN JABATAN GA9128', '').taskCode, 'GA9128');

const targets = collectDiscoveryTargets({
    employees: [
        {
            employeeName: 'A',
            ptrjId: 'P1',
            components: [
                { componentKey: 'jabatan', componentName: 'TUNJANGAN JABATAN', adSearchKeyword: 'JABATAN', adCode: 'GA9128', type: 'Addition' },
                { componentKey: 'jabatan', componentName: 'TUNJANGAN JABATAN', adSearchKeyword: 'JABATAN', adCode: 'GA9128', type: 'Addition' },
                { componentKey: 'masaKerja', componentName: 'TUNJANGAN MASA KERJA', adSearchKeyword: 'MASA', adCode: 'GA9129', type: 'Addition' }
            ]
        }
    ]
});

assert.equal(targets.length, 2);
assert.equal(targets[0].keyword, 'JABATAN');
assert.deepEqual(targets[0].keywords, ['JABATAN', 'TUNJANGAN JABATAN']);
assert.equal(targets[1].keyword, 'MASA');
assert.deepEqual(targets[1].keywords, ['MASA', 'KERJA', 'MASA KERJA', 'TUNJANGAN MASA KERJA']);

console.log('payroll-taskcode-discovery-runner tests passed');
