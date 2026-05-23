const assert = require('assert/strict');
const actions = require('./actions');

async function parseChargeJob(value) {
    const context = {};
    await actions.parseChargeJob(null, { chargeJob: value }, context, null);
    return context;
}

(async () => {
    const context = await parseChargeJob('(GA9010) VEHICLE RUNNING / BE001 (BACKHOE) / 11 (AFD 1) / X2 (EXTRA)');

    assert.equal(context.chargeJobPart1Clean, 'VEHICLE RUNNING');
    assert.equal(context.chargeJobPart2, 'BE001 (BACKHOE)');
    assert.equal(context.chargeJobPart3, '11 (AFD 1)');
    assert.equal(context.chargeJobPart4, 'X2 (EXTRA)');
    assert.deepEqual(context.chargeJobPartsArray, ['VEHICLE RUNNING', 'BE001 (BACKHOE)', '11 (AFD 1)', 'X2 (EXTRA)']);

    const labourContext = await parseChargeJob('(PLTU) / (OC7190) BOILER OPERATION / STN-BLR (STATION BOILER) / BLR00000 (LABOUR COST) / L (LABOUR)');

    assert.equal(labourContext.chargeJobPart1Clean, 'BOILER OPERATION');
    assert.equal(labourContext.chargeJobPart2, 'STN-BLR (STATION BOILER)');
    assert.equal(labourContext.chargeJobPart3, 'BLR00000 (LABOUR COST)');
    assert.equal(labourContext.chargeJobPart4, 'LABOUR');
    assert.equal(labourContext.hasChargeJobPart4, true);
    assert.equal(labourContext.expectedFieldCount, 5);
    assert.deepEqual(labourContext.chargeJobPartsArray, ['BOILER OPERATION', 'STN-BLR (STATION BOILER)', 'BLR00000 (LABOUR COST)', 'LABOUR']);

    const fallbackContext = await parseChargeJob('(GA9050) WORKSHOP CONTROL ACCOUNT');

    assert.equal(fallbackContext.chargeJobPart1Clean, 'WORKSHOP CONTROL ACCOUNT');
    assert.equal(fallbackContext.chargeJobPart4, 'LABOUR');
    assert.equal(fallbackContext.hasChargeJobPart4, true);
    assert.equal(fallbackContext.chargeJobExpenseFallbackApplied, true);

    const shortLabourContext = await parseChargeJob('(GA9050) WORKSHOP CONTROL ACCOUNT / L (LABOUR)');

    assert.equal(shortLabourContext.chargeJobPart1Clean, 'WORKSHOP CONTROL ACCOUNT');
    assert.equal(shortLabourContext.hasChargeJobPart2, false);
    assert.equal(shortLabourContext.hasChargeJobPart3, false);
    assert.equal(shortLabourContext.chargeJobPart4, 'LABOUR');
    assert.equal(shortLabourContext.hasChargeJobPart4, true);

    const tractorContext = await parseChargeJob('(PROSES 2) / (GA9010) VEHICLE RUNNING / T001 ((TR001) Tractor) / 11 (DRIVER WAGES)');

    assert.equal(tractorContext.chargeJobPart1Clean, 'VEHICLE RUNNING');
    assert.equal(tractorContext.chargeJobPart2, 'T001 ((TR001) Tractor)');
    assert.equal(tractorContext.chargeJobPart3, '11 (DRIVER WAGES)');
    assert.deepEqual(tractorContext.chargeJobPartsArray, ['VEHICLE RUNNING', 'T001 ((TR001) Tractor)', '11 (DRIVER WAGES)', 'LABOUR']);
})().catch(error => {
    console.error(error);
    process.exit(1);
});
