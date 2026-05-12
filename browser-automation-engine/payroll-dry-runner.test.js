const assert = require('node:assert/strict');
const { validatePayrollPayload } = require('./payroll-dry-runner');

const validPayload = {
    metadata: {
        month: 3,
        year: 2026,
        totalEmployees: 1,
        totalComponents: 2
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
                },
                {
                    componentKey: 'pph21',
                    componentName: 'POTONGAN PPH21',
                    venusCompCode: '#PPH21_DIPTG#',
                    venusAmount: 50000,
                    millwareAmount: 0,
                    diff: 50000,
                    adCode: 'DEPH21',
                    adCodeDesc: '(DE) POTONGAN PPH21',
                    type: 'Deduction'
                }
            ]
        }
    ]
};

const validResult = validatePayrollPayload(validPayload);
assert.equal(validResult.success, true);
assert.equal(validResult.rows.length, 2);

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

const missingPtrjPayload = structuredClone(validPayload);
missingPtrjPayload.employees[0].ptrjId = '-';
const missingPtrj = validatePayrollPayload(missingPtrjPayload);
assert.equal(missingPtrj.success, false);
assert.equal(missingPtrj.errors.some(error => error.includes('ptrjId is required')), true);

console.log('payroll-dry-runner tests passed');
