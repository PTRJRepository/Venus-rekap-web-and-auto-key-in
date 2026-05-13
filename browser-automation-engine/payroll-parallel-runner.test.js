const assert = require('node:assert/strict');
const { parseArgs, partitionEmployees, filterPayload, splitPayloadToSingleComponentRecords, runPayrollParallel } = require('./payroll-parallel-runner');

assert.equal(parseArgs(['--tabs', '5', '--no-headless', 'data.json']).workers, 5);
assert.equal(parseArgs(['--tabs=5', '--dry-run']).dryRunOnly, true);
assert.equal(parseArgs(['--component-type=Addition']).componentType, 'Addition');

const employees = [
    { employeeName: 'A', components: [{}, {}, {}, {}] },
    { employeeName: 'B', components: [{}, {}, {}] },
    { employeeName: 'C', components: [{}, {}] },
    { employeeName: 'D', components: [{}] },
    { employeeName: 'E', components: [{}] },
    { employeeName: 'F', components: [{}] }
];

const partitions = partitionEmployees(employees, 5);
assert.equal(partitions.length, 5);
assert.equal(partitions.flat().length, employees.length);
assert.equal(new Set(partitions.flat().map(emp => emp.employeeName)).size, employees.length);

const payload = {
    metadata: {},
    employees: [
        {
            employeeName: 'A',
            ptrjId: 'P1',
            components: [
                { componentKey: 'jabatan', componentName: 'TUNJANGAN JABATAN', type: 'Addition', adCode: 'GA9128', venusAmount: 100 },
                { componentKey: 'pph21', componentName: 'POTONGAN PPH21', type: 'Deduction', adCode: 'DEPH21', venusAmount: 10 }
            ]
        }
    ]
};

const filtered = filterPayload(payload, { componentType: 'Addition', componentKey: '', rowLimit: 1 });
assert.equal(filtered.employees.length, 1);
assert.equal(filtered.employees[0].components.length, 1);
assert.equal(filtered.employees[0].components[0].componentKey, 'jabatan');

const excluded = filterPayload(payload, { componentType: '', componentKey: '', rowLimit: 0, excludeRows: ['P1:GA9128:100'] });
assert.equal(excluded.employees.length, 1);
assert.equal(excluded.employees[0].components.length, 1);
assert.equal(excluded.employees[0].components[0].componentKey, 'pph21');

const singleRecordPayload = splitPayloadToSingleComponentRecords(payload);
assert.equal(singleRecordPayload.metadata.oneDocPerComponent, true);
assert.equal(singleRecordPayload.employees.length, 2);
assert.equal(singleRecordPayload.employees.every(employee => employee.components.length === 1), true);

(async () => {
    const result = await runPayrollParallel({
        dataFile: require('node:path').join(__dirname, 'testing_data', 'current_payroll_data.json'),
        workers: 5,
        dryRunOnly: true,
        headless: true,
        componentType: '',
        componentKey: '',
        rowLimit: 10
    });
    assert.equal(result.success, true);
    assert.equal(result.phase, 'dry-run');
    assert.equal(result.partitions.length, 5);
    console.log('payroll-parallel-runner tests passed');
})().catch(error => {
    console.error(error);
    process.exit(1);
});
