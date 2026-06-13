const assert = require('node:assert/strict');
const {
    calculateMillwareRiceAllowance,
    calculateMillwareOvertimeAllowance
} = require('./payrollComparisonService');

{
    const result = calculateMillwareRiceAllowance({
        paidHk: 30,
        riceRation: 5550,
        existingAdTransAmount: 110000,
        topupAdTransAmount: 56500
    });

    assert.equal(result.calculatedAmount, 166500);
    assert.equal(result.baseAmount, 110000);
    assert.equal(result.topupAmount, 56500);
    assert.equal(result.totalAmount, 166500);
    assert.equal(result.source, 'adtrans-plus-topup');
}

{
    const result = calculateMillwareRiceAllowance({
        paidHk: '23',
        riceRation: '5000',
        existingAdTransAmount: 0,
        topupAdTransAmount: 0
    });

    assert.equal(result.baseAmount, 115000);
    assert.equal(result.topupAmount, 0);
    assert.equal(result.totalAmount, 115000);
    assert.equal(result.source, 'calculated');
}

{
    const result = calculateMillwareRiceAllowance({
        paidHk: 0,
        riceRation: 5000,
        existingAdTransAmount: 0,
        topupAdTransAmount: 69750
    });

    assert.equal(result.baseAmount, 0);
    assert.equal(result.topupAmount, 69750);
    assert.equal(result.totalAmount, 69750);
    assert.equal(result.source, 'calculated-plus-topup');
}

{
    const result = calculateMillwareOvertimeAllowance({
        taskRegisterAmount: 100000,
        adTransAmount: 150000
    });

    assert.equal(result.taskRegisterAmount, 100000);
    assert.equal(result.adTransAmount, 150000);
    assert.equal(result.totalAmount, 250000);
}

console.log('payrollComparisonService tests passed');
