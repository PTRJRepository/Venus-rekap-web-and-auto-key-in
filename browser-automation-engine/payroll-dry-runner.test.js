const assert = require('node:assert/strict');
const { validatePayrollPayload, metadataMonthMatchesDocDate } = require('./payroll-dry-runner');

const validPayload = {
    metadata: {
        month: 3,
        year: 2026,
        payrollDocDate: '31/03/2026',
        payrollDocDateIso: '2026-03-31',
        totalEmployees: 1,
        totalComponents: 1
    },
    employees: [
        {
            employeeId: 'PTRJ.001',
            employeeName: 'TEST USER',
            ptrjId: 'POM00001',
            chargeJob: 'STAFF',
            components: [
                {
                    componentKey: 'masaKerja',
                    componentName: 'TUNJANGAN MASA KERJA',
                    venusCompCode: '#TJ_MASAKERJA#',
                    venusAmount: 100000,
                    millwareAmount: 0,
                    diff: 100000,
                    adCode: 'GA9129',
                    adCodeDesc: 'TUNJANGAN MASA KERJA',
                    type: 'Addition'
                }
            ]
        }
    ]
};

const validResult = validatePayrollPayload(validPayload);
assert.equal(validResult.success, true);
assert.equal(validResult.rows.length, 1);
assert.equal(metadataMonthMatchesDocDate({ month: 4, payrollDocDate: '30/04/2026' }), true);
assert.equal(metadataMonthMatchesDocDate({ month: 4, payrollDocDate: '31/05/2026' }), false);

const multiComponentPayload = structuredClone(validPayload);
multiComponentPayload.employees[0].components.push({
    componentKey: 'pph21',
    componentName: 'POTONGAN PPH21',
    venusCompCode: '#PPH21_DIPTG#',
    venusAmount: 50000,
    millwareAmount: 0,
    diff: 50000,
    adCode: 'DEPH21',
    adCodeDesc: '(DE) POTONGAN PPH21',
    type: 'Deduction'
});
const multiComponent = validatePayrollPayload(multiComponentPayload);
assert.equal(multiComponent.success, false);
assert.equal(multiComponent.errors.some(error => error.includes('exactly one item for one DocID')), true);

const missingAdCodePayload = structuredClone(validPayload);
missingAdCodePayload.employees[0].components[0].adCode = '';
const missingAdCode = validatePayrollPayload(missingAdCodePayload);
assert.equal(missingAdCode.success, false);
assert.equal(missingAdCode.errors.some(error => error.includes('adCode is required')), true);

const badAmountPayload = structuredClone(validPayload);
badAmountPayload.employees[0].components[0].venusAmount = 0;
const badAmount = validatePayrollPayload(badAmountPayload);
assert.equal(badAmount.success, false);
assert.equal(badAmount.errors.some(error => error.includes('venusAmount must be greater than 0')), true);

const duplicatePayload = structuredClone(validPayload);
duplicatePayload.employees[0].components.push({ ...duplicatePayload.employees[0].components[0] });
const duplicate = validatePayrollPayload(duplicatePayload);
assert.equal(duplicate.success, false);
assert.equal(duplicate.errors.some(error => error.includes('duplicate component')), true);

const wrongDocMonthPayload = structuredClone(validPayload);
wrongDocMonthPayload.metadata.payrollDocDate = '30/04/2026';
const wrongDocMonth = validatePayrollPayload(wrongDocMonthPayload);
assert.equal(wrongDocMonth.success, false);
assert.equal(wrongDocMonth.errors.some(error => error.includes('payrollDocDate month must match')), true);

const missingPtrjPayload = structuredClone(validPayload);
missingPtrjPayload.employees[0].ptrjId = '-';
const missingPtrj = validatePayrollPayload(missingPtrjPayload);
assert.equal(missingPtrj.success, false);
assert.equal(missingPtrj.errors.some(error => error.includes('ptrjId is required')), true);

console.log('payroll-dry-runner tests passed');
