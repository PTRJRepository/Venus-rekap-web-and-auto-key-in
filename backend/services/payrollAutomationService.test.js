const assert = require('node:assert/strict');
const path = require('node:path');

const gatewayPath = path.resolve(__dirname, 'gateway.js');
const payrollServicePath = path.resolve(__dirname, 'payrollService.js');

let queryLog = [];

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
        fetchPayrollData: async () => ({ success: true, data: [] })
    }
};

const {
    getPayrollDocDate,
    payrollRecordSignature,
    filterDuplicatePayloadRecords,
    filterAlreadyExistingADRecords,
    filterDuplicateAndExistingADRecords
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
    console.log('payrollAutomationService tests passed');
}).catch((error) => {
    console.error(error);
    process.exit(1);
});
