const assert = require('node:assert/strict');
const path = require('node:path');

const gatewayPath = path.resolve(__dirname, 'gateway.js');
const payrollServicePath = path.resolve(__dirname, 'payrollService.js');

let queryLog = [];
let payrollPayload = { success: true, data: [] };

require.cache[gatewayPath] = {
    id: gatewayPath,
    filename: gatewayPath,
    loaded: true,
    exports: {
        executeQuery: async (sql) => {
            queryLog.push(sql);
            return [
                { EmpCode: ' pom00181 ', TaskCode: ' ga9129 ', Amount: 80500.25 },
                { EmpCode: 'POM00182', TaskCode: 'DEPH21', Amount: 12000 }
            ];
        }
    }
};

require.cache[payrollServicePath] = {
    id: payrollServicePath,
    filename: payrollServicePath,
    loaded: true,
    exports: {
        fetchPayrollData: async () => payrollPayload
    }
};

const {
    getPayrollDocDate,
    payrollRecordSignature,
    splitAutomationDataToSingleComponentRecords,
    filterDuplicatePayloadRecords,
    filterAlreadyExistingADRecords,
    filterDuplicateAndExistingADRecords,
    prepareLemburAdjustmentData
} = require('./payrollAutomationService');

const records = [
    {
        employeeId: 'E1',
        employeeName: 'A',
        ptrjId: 'POM00181',
        components: [
            {
                componentKey: 'masaKerja',
                componentName: 'Tunjangan Masa Kerja',
                adCode: 'GA9129',
                venusAmount: 80500
            }
        ]
    },
    {
        employeeId: 'E1',
        employeeName: 'A',
        ptrjId: 'POM00181',
        components: [
            {
                componentKey: 'masaKerja',
                componentName: 'Tunjangan Masa Kerja',
                adCode: 'GA9129',
                venusAmount: 80500.49
            }
        ]
    },
    {
        employeeId: 'E2',
        employeeName: 'B',
        ptrjId: 'POM00182',
        components: [
            {
                componentKey: 'spsi',
                componentName: 'SPSI',
                adCode: 'DE0003',
                venusAmount: 12000
            }
        ]
    }
];

assert.deepEqual(getPayrollDocDate(4, 2026), {
    iso: '2026-04-30',
    formatted: '30/04/2026'
});

assert.equal(payrollRecordSignature(' pom00181 ', ' ga9129 ', 80500.25), 'POM00181:GA9129:80500');

const normalizedRecords = splitAutomationDataToSingleComponentRecords([{
    employeeId: 'E3',
    employeeName: 'C',
    ptrjId: 'POM00183',
    components: [{
        componentKey: 'lembur',
        adCode: 'AL0019',
        venusAmount: 12345.67,
        millwareAmount: 10000.12,
        inputAmount: 2345.55,
        shortfallAmount: 2345.55
    }]
}]);
assert.equal(normalizedRecords[0].components[0].venusAmount, 12346);
assert.equal(normalizedRecords[0].components[0].millwareAmount, 10000);
assert.equal(normalizedRecords[0].components[0].inputAmount, 2346);
assert.equal(normalizedRecords[0].components[0].shortfallAmount, 2346);
assert.equal(normalizedRecords[0].recordKey, 'POM00183:lembur:AL0019:12346');

const duplicateFilter = filterDuplicatePayloadRecords(records);
assert.equal(duplicateFilter.records.length, 2);
assert.equal(duplicateFilter.skipped.length, 1);
assert.equal(duplicateFilter.skipped[0].status, 'SKIPPED_DUPLICATE_PAYLOAD');
assert.equal(duplicateFilter.skipped[0].signature, 'POM00181:GA9129:80500');

queryLog = [];
filterAlreadyExistingADRecords(duplicateFilter.records, 4, 2026).then((result) => {
    assert.equal(result.records.length, 1);
    assert.equal(result.skipped.length, 1);
    assert.equal(result.skipped[0].status, 'SKIPPED_ALREADY_EXISTS');
    assert.equal(result.skipped[0].signature, 'POM00181:GA9129:80500');
    assert.equal(queryLog.length, 1);
    assert.match(queryLog[0], /PhyMonth = 4/);
    assert.match(queryLog[0], /PhyYear = 2026/);

    return filterDuplicateAndExistingADRecords(records, 4, 2026);
}).then((result) => {
    assert.equal(result.records.length, 1);
    assert.equal(result.skippedDuplicates, 1);
    assert.equal(result.skippedAlreadyExists, 1);
    assert.deepEqual(
        result.skipped.map(item => item.status),
        ['SKIPPED_DUPLICATE_PAYLOAD', 'SKIPPED_ALREADY_EXISTS']
    );

    queryLog = [];
    payrollPayload = {
        success: true,
        sourceInfo: { source: 'snapshot', snapshotId: 'snap-1' },
        data: [
            {
                id: 'V1',
                name: 'Shortfall',
                ptrjId: 'POM00991',
                chargeJob: '(OC7110) FRUIT / STN-FRC / FRC00000 / L (LABOUR)',
                sync: { lembur: { venus: 250000.75, millware: 100000.25 } }
            },
            {
                id: 'V2',
                name: 'Already Enough',
                ptrjId: 'POM00992',
                chargeJob: '(OC7110) FRUIT / STN-FRC / FRC00000 / L (LABOUR)',
                sync: { lembur: { venus: 100000, millware: 125000 } }
            },
            {
                id: 'V3',
                name: 'No Charge Job',
                ptrjId: 'POM00993',
                chargeJob: '',
                sync: { lembur: { venus: 200000, millware: 0 } }
            }
        ]
    };

    return prepareLemburAdjustmentData(4, 2026, {
        payrollSource: { source: 'snapshot', snapshotId: 'snap-1' }
    });
}).then((result) => {
    assert.equal(result.success, true);
    assert.equal(result.data.employees.length, 1);
    assert.equal(result.data.metadata.isLemburAdjustmentOnly, true);
    assert.equal(result.data.metadata.inputType, 'SELISIH');
    assert.equal(result.data.metadata.requiresChargeJob, true);
    assert.equal(result.data.metadata.payrollSource, 'snapshot');
    assert.equal(result.data.metadata.snapshotId, 'snap-1');

    const employee = result.data.employees[0];
    assert.equal(employee.ptrjId, 'POM00991');
    assert.equal(employee.components.length, 1);
    assert.equal(employee.components[0].componentKey, 'lembur');
    assert.equal(employee.components[0].componentName, 'TUNJANGAN LEMBUR');
    assert.equal(employee.components[0].adCode, 'AL0019');
    assert.equal(employee.components[0].venusAmount, 150001);
    assert.equal(employee.components[0].inputAmount, 150001);
    assert.equal(employee.components[0].shortfallAmount, 150001);
    assert.equal(employee.components[0].diff, 150001);
    assert.equal(employee.components[0].originalVenusAmount, 250001);
    assert.equal(employee.components[0].originalMillwareAmount, 100000);
    assert.equal(
        result.data.diagnostics.some(item => item.status === 'SKIPPED_NO_CHARGE_JOB' && item.ptrjId === 'POM00993'),
        true
    );

    console.log('payrollAutomationService tests passed');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
