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
    assert.equal(context.chargeJobPart2, 'BE001');
    assert.equal(context.chargeJobPart3, '11');
    assert.equal(context.chargeJobPart4, 'X2');
    assert.deepEqual(context.chargeJobPartsArray, ['VEHICLE RUNNING', 'BE001', '11', 'X2']);
})().catch(error => {
    console.error(error);
    process.exit(1);
});
