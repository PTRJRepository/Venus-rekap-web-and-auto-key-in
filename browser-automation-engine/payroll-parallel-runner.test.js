const assert = require('node:assert/strict');
const {
    parseArgs,
    partitionEmployees,
    filterPayload,
    splitPayloadToSingleComponentRecords,
    buildIsolatedRowBatches,
    runPayrollParallel
} = require('./payroll-parallel-runner');

assert.equal(parseArgs(['--tabs', '5', '--no-headless', 'data.json']).workers, 5);
assert.equal(parseArgs(['--tabs=5', '--dry-run']).dryRunOnly, true);
assert.equal(parseArgs(['--component-type=Addition']).componentType, 'Addition');
assert.equal(parseArgs(['payroll-lembur-adjustment-input-with-chargejob', 'data.json']).templateName, 'payroll-lembur-adjustment-input-with-chargejob');
assert.equal(parseArgs(['payroll-lembur-adjustment-input-with-chargejob', 'data.json']).dataFile, 'data.json');
assert.equal(parseArgs(['--template=payroll-beras-input-with-chargejob', 'data.json']).templateName, 'payroll-beras-input-with-chargejob');
assert.equal(parseArgs(['--isolate-rows']).isolateRows, true);

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

const isolatedBatches = buildIsolatedRowBatches(employees, 4);
assert.equal(isolatedBatches.length, 2);
assert.equal(isolatedBatches[0].length, 4);
assert.equal(isolatedBatches[0].every(partition => partition.length <= 1), true);
assert.equal(isolatedBatches.flat(2).length, employees.length);

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

    const isolateResult = await runPayrollParallel({
        dataFile: require('node:path').join(__dirname, 'testing_data', 'current_payroll_data.json'),
        templateName: 'payroll-lembur-adjustment-input-with-chargejob',
        workers: 4,
        isolateRows: true,
        dryRunOnly: true,
        headless: true,
        componentType: '',
        componentKey: '',
        rowLimit: 4,
        excludeRows: []
    });
    assert.equal(isolateResult.success, true);
    assert.equal(isolateResult.phase, 'dry-run');
    assert.equal(isolateResult.batches[0].partitions.length, 4);
    assert.equal(isolateResult.batches[0].partitions.every(partition => partition.employeeCount <= 1), true);
    console.log('payroll-parallel-runner tests passed');
})().catch(error => {
    console.error(error);
    process.exit(1);
});
